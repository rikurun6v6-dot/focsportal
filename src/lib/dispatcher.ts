import type { Match, Court, Config, Camp, Player, TournamentType, Division,
  PendingDispatchCandidate } from '@/types';
import { getAllDocuments, getDocument, updateDocument, claimCourtForMatch, claimExtraCourt } from './firestore-helpers';
import { toastInfo } from './toast';
import { Timestamp } from 'firebase/firestore';
import { buildScoreContext, calcMatchScore, getGroupKey, detectPhase, hasRecentPlayer, ScorePhase,
  filterByGroupBalance, filterByDivisionBalance, filterByCompletedRound,
  computeDivisionProgress, computeGroupBalance, computeMinUnfinishedRound,
  BALANCE_TOLERANCE, isFinalsRound } from './matchScoring';
import { getDivisionsInUse } from './divisions';

export async function autoDispatchAll(campId?: string, defaultRestMinutes: number = 10): Promise<number> {
  const allCourts = await getAllDocuments<Court>('courts');
  const courts = campId ? allCourts.filter(c => c.campId === campId) : allCourts;
  // 手動でフリーに設定されたコート（manually_freed=true）は自動割り当て対象外
  const emptyCourts = courts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);

  // 手動割り当てなどで埋まったコートに承認待ちが残っていたら消す
  await Promise.all(
    courts
      .filter(c => c.current_match_id && (c.pending_dispatch || c.stuck_since))
      .map(c => updateDocument('courts', c.id, { pending_dispatch: null, stuck_since: null }).catch(() => {}))
  );

  if (emptyCourts.length === 0) return 0;

  const allMatches = await getAllDocuments<Match>('matches');
  const matches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;

  // ── コートから外れた「進行中」を待機に戻す ──
  //
  // status が calling / playing なのに、どのコートもその試合を持っていないことがある。
  // こうなるとその選手はずっと「試合中」の扱いになり、同じ選手が出る残りの試合が
  // 二度と入らない。コート状況にもカードが出ないので、そこからは終わらせられない。
  // リハーサルでは、これで男子1部B組の残り4試合が完全に止まった。
  //
  // 割り当て自体は claimCourtForMatch が1つの取引でコートと試合の両方を書くので、
  // 正常な経路ではこの状態にならない。ここに引っかかるのは、通信断や手動操作で
  // 片方だけ残ったものだけ。休憩の予約は status:waiting のままなので対象外。
  const heldMatchIds = new Set(
    courts.map(c => c.current_match_id).filter((id): id is string => !!id)
  );
  const orphaned = matches.filter(
    m => (m.status === 'calling' || m.status === 'playing') && !heldMatchIds.has(m.id)
  );
  if (orphaned.length > 0) {
    console.warn(
      '[autoDispatchAll] コートから外れた進行中の試合を待機に戻します:',
      orphaned.map(m => m.id)
    );
    await Promise.all(
      orphaned.map(m =>
        updateDocument('matches', m.id, { status: 'waiting', court_id: null }).catch(() => {})
      )
    );
    for (const m of orphaned) {
      m.status = 'waiting';
      m.court_id = null;
    }
  }

  const allWaitingMatches = matches.filter(m => m.status === 'waiting');

  // ── 進行制御: 最上流で enabled_tournaments フィルタを適用（絶対ブロック） ──
  const topConfig = await getDocument<Config>('config', campId || 'system');
  const topEnabledTypes = topConfig?.enabled_tournaments;
  const waitingMatches = (topEnabledTypes && topEnabledTypes.length > 0)
    ? allWaitingMatches.filter(m => topEnabledTypes.includes(m.tournament_type as TournamentType))
    : allWaitingMatches;

  if (waitingMatches.length === 0) return 0;

  let dispatchedCount = 0;
  // 同一ループ内で確定した割り当て済み試合IDを記録（Firestore 反映前の二重割り当て防止）
  const assignedMatchIds = new Set<string>();
  // 団体戦マルチコート: このループで既に確保済みのコートIDを追跡
  const claimedCourtIds = new Set<string>();

  // 待機試合が多い部の順に並べる（同数なら部の番号順）
  // 以前は1部/2部の2択で、先頭コート=1部・末尾コート=2部・中間=多い部としていたため、
  // 3部以上の大会では3部がどのコートの優先にもならなかった。
  const waitingCountByDivision = new Map<Division, number>();
  for (const m of waitingMatches) {
    if (m.division === undefined) continue;
    waitingCountByDivision.set(m.division, (waitingCountByDivision.get(m.division) ?? 0) + 1);
  }
  const orderedDivisions = getDivisionsInUse(waitingMatches, []).sort((a, b) => {
    const diff = (waitingCountByDivision.get(b) ?? 0) - (waitingCountByDivision.get(a) ?? 0);
    return diff !== 0 ? diff : a - b;
  });

  // コートに部優先を割り当て: 並べた部をコート番号順に総当たりで配る（隣接コートが別の部になる）
  const courtDivisionPreference = new Map<string, Division>();
  if (orderedDivisions.length > 0) {
    for (const gender of ['male', 'female', null] as const) {
      const group = emptyCourts
        .filter(c => (gender === null ? !c.preferred_gender : c.preferred_gender === gender))
        .sort((a, b) => a.number - b.number);
      if (group.length === 0) continue;
      for (let i = 0; i < group.length; i++) {
        courtDivisionPreference.set(group[i].id, orderedDivisions[i % orderedDivisions.length]);
      }
    }
  }

  // 例外承認の設定（既定: 90秒で聞く / 3分無応答で自動投入）
  const stuckSeconds = topConfig?.approval_stuck_seconds ?? 90;
  const autoMinutes = topConfig?.approval_auto_minutes ?? 3;
  const nowMs = Date.now();

  // 1巡ぶんの共有データ。以前はコート1面ごとに全件読み直していて、
  // 8面だと全件読みが32回走っていた。ここで1回だけ読んで使い回す。
  const shared = {
    config: topConfig,
    allMatches,
    allPlayers: await getAllDocuments<Player>('players'),
    allCourts,
  };

  for (const court of emptyCourts) {
    // 団体戦マルチコートとして既に確保済みのコートはスキップ
    if (claimedCourtIds.has(court.id)) continue;

    const divPref = courtDivisionPreference.get(court.id);
    const blockInfo: DispatchBlockInfo = { overridable: [] };
    const assigned = await dispatchToEmptyCourt(court, waitingMatches, defaultRestMinutes, assignedMatchIds, divPref, blockInfo, shared);

    if (!assigned) {
      await handleStuckCourt(court, blockInfo, nowMs, stuckSeconds, autoMinutes);
      continue;
    }

    // 入ったので詰まりの記録を消す
    if (court.stuck_since || court.pending_dispatch) {
      await updateDocument('courts', court.id, {
        stuck_since: null, pending_dispatch: null,
      }).catch(() => {});
    }

    if (assigned) {
      dispatchedCount++;
      assignedMatchIds.add(assigned.id);
      claimedCourtIds.add(court.id);
      const idx = waitingMatches.findIndex(m => m.id === assigned.id);
      if (idx >= 0) waitingMatches.splice(idx, 1);

      // 共有データを手で進める。ここを忘れると、次のコートは
      // 「この試合はまだ待機中・この選手は空いている」と誤認して二重に出してしまう。
      const shm = shared.allMatches.find(m => m.id === assigned.id);
      if (shm) { shm.status = 'calling'; shm.court_id = court.id; }
      const shc = shared.allCourts.find(c => c.id === court.id);
      if (shc) shc.current_match_id = assigned.id;

      // 団体戦: 同一試合を最大3面に同時割り当て（追加2面分）
      if (assigned.tournament_type === 'team_battle') {
        let extraCount = 0;
        for (const extraCourt of emptyCourts) {
          if (extraCount >= 2) break; // 合計3面まで（最初の1面 + 追加2面）
          if (claimedCourtIds.has(extraCourt.id)) continue;
          if (!extraCourt.is_active || extraCourt.manually_freed) continue;
          try {
            const ok = await claimExtraCourt(extraCourt.id, assigned.id);
            if (!ok) continue; // 他の端末が先に取っていた
            claimedCourtIds.add(extraCourt.id);
            const shec = shared.allCourts.find(c => c.id === extraCourt.id);
            if (shec) shec.current_match_id = assigned.id;
            dispatchedCount++;
            extraCount++;
          } catch {
            // 割り当て失敗は無視して次のコートを試みる
          }
        }
      }
    }
  }

  return dispatchedCount;
}

/**
 * 均等化ルールだけで弾かれた候補。承認して例外投入できるもの。
 * 選手が試合中・休息中・コートの性別違いのものは含まない（例外にしても入らないため）。
 */
export interface DispatchBlockInfo {
  overridable: { match: Match; reason: string; kind: 'round' | 'division' | 'group' }[];
}

export async function dispatchToEmptyCourt(
  court: Court,
  waitingMatches: Match[],
  defaultRestMinutes: number = 10,
  assignedMatchIds: Set<string> = new Set(),
  divisionPreference?: Division,
  blockInfo?: DispatchBlockInfo,
  /**
   * 1巡ぶんの共有データ。autoDispatchAll が最初に1回だけ読んで渡す。
   *
   * 以前はコート1面ごとに matches / players / courts / config を全件読み直していた。
   * 8面だと1巡で全件読みが32回走り、空の8面が埋まるまで37秒かかっていた。
   *
   * 渡されないときは従来どおり自前で読む（単発の呼び出し用）。
   * 呼び出し元は、割り当てが決まった試合の status を配列の中で 'calling' に
   * 書き換えること。そうしないと次のコートがその選手を空いていると誤認する。
   */
  shared?: {
    config: Config | null;
    allMatches: Match[];
    allPlayers: Player[];
    allCourts: Court[];
  }
): Promise<Match | null> {
  const now = Date.now();
  // 同一ループ内で既に割り当て済みの試合を除外（二重割り当て防止の第二防衛線）
  if (assignedMatchIds.size > 0) {
    waitingMatches = waitingMatches.filter(m => !assignedMatchIds.has(m.id));
  }

  // ── 進行制御フィルタを最初に適用（予約パス含む全パスで有効） ──
  // config を先に読み込み、enabled_tournaments に含まれない種目を完全排除する
  const config = shared ? shared.config : await getDocument<Config>('config', court.campId || 'system');
  const enabledTypesEarly = config?.enabled_tournaments;
  if (enabledTypesEarly && enabledTypesEarly.length > 0) {
    waitingMatches = waitingMatches.filter(m =>
      enabledTypesEarly.includes(m.tournament_type as TournamentType)
    );
  }
  if (waitingMatches.length === 0) return null;

  const finalsWaitMode = config?.finals_wait_mode || {};
  const finalsApprovalRequired = config?.finals_approval_required || {};
  const finalsApprovedIds = new Set(config?.finals_approved_match_ids || []);

  // ✅ 予約優先: このコートに予約されている試合があるかチェック
  const reservedMatch = waitingMatches.find(m =>
    m.reserved_court_id === court.id &&
    m.available_at &&
    now >= m.available_at.toMillis()
  );

  if (reservedMatch) {
    // 予約試合を最優先でアサイン（enabled_tournaments フィルタ済みの waitingMatches から取得）
    try {
      // コートと試合を同時に確保する。他の端末が先に取っていたら諦める。
      const claimed = await claimCourtForMatch(court.id, reservedMatch.id, {
        status: 'calling',
        court_id: court.id,
        reserved_court_id: null, // 予約解除
        available_at: null // 休憩時間クリア
      });
      if (!claimed) return null;

      // Web Push 通知（fire-and-forget）
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: reservedMatch.id }),
      }).catch(() => {});

      return reservedMatch;
    } catch (error) {
      console.error('Error dispatching reserved match:', error);
      // エラー時は通常のロジックにフォールバック
    }
  }

  const allMatches = shared ? shared.allMatches : await getAllDocuments<Match>('matches');
  const activeMatches = allMatches.filter(m =>
    (court.campId ? m.campId === court.campId : true) &&
    (m.status === 'calling' || m.status === 'playing')
  );
  const busyPlayerIds = new Set<string>();
  activeMatches.forEach(m => {
    if (m.player1_id) busyPlayerIds.add(m.player1_id);
    if (m.player2_id) busyPlayerIds.add(m.player2_id);
    if (m.player3_id) busyPlayerIds.add(m.player3_id);
    if (m.player4_id) busyPlayerIds.add(m.player4_id);
    if ((m as any).player5_id) busyPlayerIds.add((m as any).player5_id);
    if ((m as any).player6_id) busyPlayerIds.add((m as any).player6_id);
  });

  // 休息時間チェック用の設定を取得
  // Use the defaultRestMinutes parameter passed from admin page
  const allPlayers = shared ? shared.allPlayers : await getAllDocuments<Player>('players');

  // 合宿の全試合（スコアコンテキスト構築用）
  const campMatches = court.campId ? allMatches.filter(m => m.campId === court.campId) : allMatches;

  // 共通スコアコンテキストを構築（matchScoring.ts）
  // sequential awaitによりFirestore読み取りは常に最新値を反映するため、
  // Fairness Bonusだけでグループラウンドロビンが自然に実現できる
  const scoreCtx = buildScoreContext(campMatches, allPlayers, config, undefined, defaultRestMinutes);

  // 団体戦用: アクティブな team_battle 試合から「対戦中のチームID」を収集（チーム単位ロック）
  const busyTeamIds = new Set<string>();
  activeMatches
    .filter(m => m.tournament_type === 'team_battle')
    .forEach(m => {
      const rep1 = allPlayers.find(p => p.id === m.player1_id);
      const rep2 = allPlayers.find(p => p.id === m.player2_id);
      if (rep1?.team_id) busyTeamIds.add(rep1.team_id);
      if (rep2?.team_id) busyTeamIds.add(rep2.team_id);
    });

  // 団体戦グループ排他制御: アクティブな団体戦の予選グループを収集
  // 同一グループに進行中の対戦がある場合、そのグループの他の対戦は待機させる
  const activeTeamBattleGroupKeys = new Set<string>();
  // dedupe: 同じ matchId が複数コートに割り当てられていても1回だけカウント
  const seenActiveMatchIds = new Set<string>();
  activeMatches
    .filter(m => m.tournament_type === 'team_battle' && m.group && !seenActiveMatchIds.has(m.id))
    .forEach(m => {
      seenActiveMatchIds.add(m.id);
      activeTeamBattleGroupKeys.add(`${m.campId ?? ''}_${m.division ?? ''}_${m.group}`);
    });

  // ✅ 空き時間の有効活用: このコートに予約がある場合、復帰までの時間を確認
  const AVERAGE_MATCH_DURATION = 20; // 平均試合時間（分）
  const nextReservedMatch = waitingMatches.find(m =>
    m.reserved_court_id === court.id &&
    m.available_at &&
    now < m.available_at.toMillis()
  );

  const timeUntilReservation = nextReservedMatch
    ? (nextReservedMatch.available_at!.toMillis() - now) / (1000 * 60) // 分単位
    : Infinity;

  const canUseForShortMatch = timeUntilReservation > AVERAGE_MATCH_DURATION;

  // waitingMatches は冒頭の enabled_tournaments フィルタ適用済み
  const validMatches = waitingMatches.filter(match => {
    if (!match.player1_id || !match.player2_id) return false;

    if (match.tournament_type === 'team_battle') {
      // 団体戦: チームID単位で重複チェック（同一チームが複数コートに同時出場しないようロック）
      const rep1 = allPlayers.find(p => p.id === match.player1_id);
      const rep2 = allPlayers.find(p => p.id === match.player2_id);
      if (rep1?.team_id && busyTeamIds.has(rep1.team_id)) return false;
      if (rep2?.team_id && busyTeamIds.has(rep2.team_id)) return false;
      // グループ排他制御: 同一グループに進行中の対戦があれば待機
      if (match.group) {
        const gKey = `${match.campId ?? ''}_${match.division ?? ''}_${match.group}`;
        if (activeTeamBattleGroupKeys.has(gKey)) return false;
      }
    } else {
      // 通常試合: 個人選手ID単位で重複チェック
      if (busyPlayerIds.has(match.player1_id) || busyPlayerIds.has(match.player2_id)) return false;
      if (match.player3_id && match.player3_id !== '' && busyPlayerIds.has(match.player3_id)) return false;
      if (match.player4_id && match.player4_id !== '' && busyPlayerIds.has(match.player4_id)) return false;
      if ((match as any).player5_id && busyPlayerIds.has((match as any).player5_id)) return false;
      if ((match as any).player6_id && busyPlayerIds.has((match as any).player6_id)) return false;
    }

    // available_at チェック: 試合が休息時間を完了しているか確認
    if (match.available_at && now < match.available_at.toMillis()) {
      return false; // Skip this match, rest time not complete
    }

    // ✅ 予約があるコートで時間が限られている場合、予約試合以外は除外
    if (nextReservedMatch && !canUseForShortMatch && match.id !== nextReservedMatch.id) {
      return false;
    }
    // 決勝の許可制: 運営が「いま入れる」を押した決勝だけを出す。
    // finals_wait_mode と違い、条件が揃っても勝手には解放しない。
    const apprKey = `${match.tournament_type}_${match.division}`;
    if (finalsApprovalRequired[apprKey] && isFinalsRound(match, campMatches)
        && !finalsApprovedIds.has(match.id)) {
      return false;
    }

    // Finals wait mode check（1部・2部の準決勝以下が両方揃ったら同時解放）
    const key = `${match.tournament_type}_${match.division}`;
    if (finalsWaitMode[key]) {
      // 同種目の全部門の試合を取得（3位決定戦除く）
      const allMatchesInType = allMatches.filter(m =>
        m.campId === match.campId &&
        m.tournament_type === match.tournament_type &&
        m.subtitle !== "3位決定戦"
      );

      if (allMatchesInType.length > 0) {
        // 各部の最終ラウンド（決勝ラウンド）を取得
        const maxRoundByDiv = new Map<number, number>();
        allMatchesInType.forEach(m => {
          if (!m.division) return;
          const cur = maxRoundByDiv.get(m.division) ?? 0;
          if (m.round > cur) maxRoundByDiv.set(m.division, m.round);
        });

        const myMaxRound = maxRoundByDiv.get(match.division ?? 0) ?? 0;
        const isFinals = match.round === myMaxRound && myMaxRound > 0;

        if (isFinals) {
          // 全部門の決勝以外（準決勝以下）が完了しているか確認
          const nonFinalMatches = allMatchesInType.filter(m => {
            if (!m.division) return false;
            const divMax = maxRoundByDiv.get(m.division) ?? 0;
            return m.round < divMax;
          });
          if (!nonFinalMatches.every(m => m.status === 'completed')) {
            return false; // どこかの部の準決勝以下が未完了 → 待機
          }
        }
      }
    }

    return true;
  });

  if (validMatches.length === 0) return null;

  // ── 「次に優先して割り当て」: priority_dispatch 付きの試合を最優先で割り当てる ──
  // 管理者がトーナメント表から明示指定したものなので、ラウンド順・性別・部の制約を無視して
  // この空きコートに即割り当てる（選手が出場中でない＝validMatches に残っている前提）。
  // 複数ある場合はスコア最大を選ぶ。割り当て後にフラグをクリア。
  const priorityCandidates = validMatches.filter(m => (m as Match & { priority_dispatch?: boolean }).priority_dispatch);
  if (priorityCandidates.length > 0) {
    const chosen = priorityCandidates
      .map(m => ({ m, score: calcMatchScore(m, scoreCtx) }))
      .sort((a, b) => b.score - a.score)[0].m;
    try {
      const claimed = await claimCourtForMatch(court.id, chosen.id, {
        status: 'calling',
        court_id: court.id,
        available_at: null,
        reserved_court_id: null,
        priority_dispatch: false,
      });
      if (!claimed) return null;
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: chosen.id }),
      }).catch(() => {});
      return chosen;
    } catch (error) {
      console.error('Error dispatching priority match:', error);
      // 失敗時は通常ロジックにフォールバック
    }
  }

  // ── 休息モデル（2概念）───────────────────────────────────────────────
  //  (1) match.available_at … 試合単位の明示スケジュール（手動休憩 setMatchBreak / 予約）。
  //       上の validMatches で「now < available_at なら除外」のハードゲートとして既に適用済み。
  //  (2) player.last_match_finished_at … 試合完了時に自動記録される選手の休息（updatePlayersRestTime）。
  //       これを2段階で使う:
  //        - Tier1 (< defaultRestMinutes): 下記 isPlayerResting で除外（ソフト。全員休息中ならフォールバックで使う）
  //        - Tier2 (< defaultRestMinutes*2): matchScoring 側で -200点（連戦回避。除外はしない）
  //  ※ available_at（明示）と last_match_finished_at（自動）は別物。重複ではなく役割分担。
  const isPlayerResting = (match: Match): boolean => {
    const playerIds = [
      match.player1_id, match.player2_id, match.player3_id, match.player4_id,
      (match as any).player5_id, (match as any).player6_id
    ].filter(Boolean);
    return playerIds.some(pid => {
      const player = allPlayers.find(p => p.id === pid);
      if (!player?.last_match_finished_at) return false;
      const elapsed = (now - player.last_match_finished_at.toMillis()) / 60000;
      return elapsed < defaultRestMinutes;
    });
  };
  const restedMatches = validMatches.filter(m => !isPlayerResting(m));
  // 全員休息済みのカードがあればそれだけ使う。なければ全validMatchesで（連続試合フォールバック）
  const restFilteredMatches = restedMatches.length > 0 ? restedMatches : validMatches;

  // ── 進行の均等化（ハード制約） ──────────────────────────────────────────
  // ここは加減点ではなく候補そのものを絞る。スコアだけだと待機時間（1分1点）が
  // 伸び続けて均等化のペナルティを押し切ってしまい、偏りが起きるため。
  //
  // ① ラウンド規制（厳しめ）: そのグループの前のラウンドが全部 completed に
  //    なるまで次のラウンドを出さない。以前は待機中の最小ラウンドを見ていたので、
  //    前のラウンドがコート上で進行中でも次が始まってしまっていた。
  const roundFilteredMatches = filterByCompletedRound(restFilteredMatches, campMatches);

  // ② 部門均等: 同じ種目の中で、進捗率がいちばん低い部だけを残す。
  //    「1部は終わったのに3部が進んでいない」を防ぐ。部で総試合数が違うので率で比べる。
  const divisionBalancedMatches = filterByDivisionBalance(roundFilteredMatches, campMatches);

  // ③ グループ均等: 同じ種目・部の中で、消化数がいちばん少ないグループだけを残す。
  //    「Aが2試合目に入る前に、まだ0試合のCを先に出す」を強制する。
  //    ②③とも「まだ試合が残っている部・グループ」全部を基準に最下位を決める。
  //    候補の中だけで決めると、遅れている側が全員試合中・休息中のあいだに
  //    進んでいる側が追い越してしまうため。
  const balancedMatches = filterByGroupBalance(divisionBalancedMatches, scoreCtx, campMatches);

  // 性別ガード: manual_gender_unlock が設定されていない限り、
  // コートの preferred_gender と異なる試合を候補から完全除外する
  const genderOk = (match: Match): boolean => {
    if (!court.preferred_gender || court.manual_gender_unlock) return true;
    const mg = getPreferredGender(match);
    // neutral (mixed_doubles, team_battle) は OK。同性別も OK。逆性別は除外。
    return mg === null || mg === court.preferred_gender;
  };
  const genderPreFilteredMatches = balancedMatches.filter(genderOk);

  // ── 例外投入の候補を拾う ────────────────────────────────────────────────
  // 均等化・ラウンド規制「だけ」で弾かれた試合を、理由つきで呼び出し元に返す。
  // 選手が試合中・休息中やコートの性別違いは含めない。例外にしても入らないため。
  if (blockInfo && genderPreFilteredMatches.length === 0) {
    const nearMiss = restFilteredMatches.filter(genderOk);
    if (nearMiss.length > 0) {
      const minRoundByGroup = computeMinUnfinishedRound(campMatches);
      const { ratioByTypeDiv, minRatioByType } = computeDivisionProgress(campMatches);
      const minGroupDone = computeGroupBalance(campMatches, scoreCtx);

      const reasonFor = (m: Match): { kind: 'round' | 'division' | 'group'; reason: string } => {
        const parts: string[] = [];
        let kind: 'round' | 'division' | 'group' | null = null;

        const minRound = minRoundByGroup.get(getGroupKey(m));
        if (minRound !== undefined && m.round > minRound) {
          const grpLabel = (m as any).group ? `${(m as any).group}組の` : '';
          parts.push(`${grpLabel}${minRound}回戦がまだ全部終わっていません`);
          kind = 'round';
        }

        if (m.division !== undefined) {
          const min = minRatioByType.get(m.tournament_type);
          const mine = ratioByTypeDiv.get(`${m.tournament_type}_${m.division}`);
          if (min !== undefined && mine !== undefined && mine > min + BALANCE_TOLERANCE) {
            parts.push(`${m.division}部だけ進みすぎます（${Math.round(mine * 100)}% / いちばん遅い部 ${Math.round(min * 100)}%）`);
            if (kind === null) kind = 'division';
          }
        }

        const grp = (m as any).group;
        if ((m as any).phase === 'preliminary' && grp) {
          const tdKey = `${m.tournament_type}_${m.division}`;
          const minDone = minGroupDone.get(tdKey);
          const mineDone = scoreCtx.groupProgressMap.get(`${tdKey}_${grp}`) ?? 0;
          if (minDone !== undefined && mineDone > minDone) {
            parts.push(`${grp}組だけ進みすぎます（${mineDone}試合 / いちばん遅い組 ${minDone}試合）`);
            if (kind === null) kind = 'group';
          }
        }

        return {
          kind: kind ?? 'division',
          reason: parts.join(' / ') || 'ルール上の理由は特定できませんでした',
        };
      };

      blockInfo.overridable = nearMiss
        .map(m => ({ match: m, score: (() => { try { return calcMatchScore(m, scoreCtx); } catch { return 0; } })() }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ match }) => ({ match, ...reasonFor(match) }));
    }
  }

  // 使用中コートの部門を取得（部門バランス制御用）。
  // Firestore 再取得（awaited write 反映済み）が唯一の真実なので、これだけを使う。
  // ※ 以前は batchAssignedDivisions をマージしていたが、バッチで割り当て済みのコートが
  //   「再取得分」と「batch分」で二重計上され、ペナルティが過剰に効くバグがあったため撤去。
  const allCourts = shared ? shared.allCourts : await getAllDocuments<Court>('courts');
  const campCourts = court.campId ? allCourts.filter(c => c.campId === court.campId) : allCourts;
  const adjacentCourtDivisions = getActiveCourtDivisions(campCourts, allMatches);

  // 混合ダブルスのコート制限チェック
  const mixedDoublesActive = waitingMatches.some(m => m.tournament_type === 'mixed_doubles');
  const mixedCourtRestriction = mixedDoublesActive ? getMixedDoublesCourtRestriction(
    court.number,
    campCourts.length,
    allMatches,
    waitingMatches
  ) : null;

  // 部門バランスの制御方式は2系統あり「綱引き」を避けるため排他にする:
  //  (1) コート別の部優先 divisionPreference（先頭=1部/末尾=2部/中間=多い部）が指定されている場合
  //      → その部を +150 で優先するのみ。隣接ペナルティ(adjacentCourtDivisions)は適用しない。
  //      （コート割りで既に部を散らしているため、ペナルティを重ねると相殺し合って予測不能になる）
  //  (2) divisionPreference がない場合（単発割り当て・部優先なしコート）
  //      → 隣接ペナルティで部の偏りを抑える。
  const scoreCtxForCourt = divisionPreference
    ? { ...scoreCtx, preferredDivision: divisionPreference, divisionBonusBase: 150 }
    : { ...scoreCtx, adjacentCourtDivisions };

  // [遊休回避] 決勝センターコート制御:
  // finalsWaitMode 有効時、決勝戦は優先(センター)コートが空いている間は非優先コートでは取らない。
  // ただし以前は return null でコートを遊ばせていた。ここでは「候補から除外」するだけにして、
  // 非優先コートは別の試合を取れるようにする（＝コートを遊ばせない）。
  const finalsActive = Object.keys(finalsWaitMode).length > 0;
  const finalsCourtCount = finalsActive
    ? ((await getDocument<Camp>('camps', court.campId || ''))?.court_count || 6)
    : 6;
  const finalsMaxRoundCache = new Map<string, Map<number, number>>();
  const getFinalsMaxRoundByDiv = (m: Match): Map<number, number> => {
    const tKey = `${m.campId}_${m.tournament_type}`;
    let cached = finalsMaxRoundCache.get(tKey);
    if (!cached) {
      cached = new Map<number, number>();
      allMatches
        .filter(x => x.campId === m.campId && x.tournament_type === m.tournament_type && x.subtitle !== '3位決定戦')
        .forEach(x => { if (x.division) { const c = cached!.get(x.division) ?? 0; if (x.round > c) cached!.set(x.division, x.round); } });
      finalsMaxRoundCache.set(tKey, cached);
    }
    return cached;
  };
  const isFinalsMatch = (m: Match): boolean => {
    const myMax = getFinalsMaxRoundByDiv(m).get(m.division ?? 0) ?? 0;
    return myMax > 0 && m.round === myMax;
  };
  const mustDeferFinalsToCenter = (m: Match): boolean => {
    if (!finalsWaitMode[`${m.tournament_type}_${m.division}`]) return false;
    if (!isFinalsMatch(m)) return false;
    const prefNums = getFinalsPreferredCourts(m.tournament_type, m.division ?? 0, finalsCourtCount);
    if (prefNums.length === 0 || prefNums.includes(court.number)) return false; // このコートが優先 → 出してOK
    // 優先コートが空いているなら、このコートでは決勝を取らない（センターを待つ）
    return campCourts.some(c => prefNums.includes(c.number) && c.is_active && !c.current_match_id && !c.manually_freed);
  };
  const selectableMatches = finalsActive
    ? genderPreFilteredMatches.filter(m => !mustDeferFinalsToCenter(m))
    : genderPreFilteredMatches;

  const candidatesWithScore = selectableMatches.map(match => {
    // 共通スコア関数（matchScoring.ts）でスコアを計算
    const baseScore = calcMatchScore(match, scoreCtxForCourt);

    // 混合ダブルスのコート制限ペナルティ（court-specific なので個別適用）
    let courtPenalty = 0;
    if (mixedCourtRestriction && match.tournament_type === 'mixed_doubles') {
      if (match.division !== mixedCourtRestriction.allowedDivision) {
        courtPenalty = -1000; // 事実上除外
      }
    }

    const priorityScore = baseScore + courtPenalty;

    const preferredGender = getPreferredGender(match);
    const matchesCourt = preferredGender ? preferredGender === court.preferred_gender : true;

    return {
      match,
      priorityScore,
      matchesCourt,
      isNeutral: !preferredGender
    };
  });

  // 優先度1: コートの性別に完全一致する試合（男子コート→男子試合、女子コート→女子試合）
  const preferred = candidatesWithScore
    .filter(c => c.matchesCourt && !c.isNeutral)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // 優先度2: 混合ダブルスなど性別制約のない試合
  const neutral = candidatesWithScore
    .filter(c => c.isNeutral)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // コートが空になった時刻を推定（最後にこのコートで完了した試合の end_time）
  const lastCompletedForCourt = allMatches
    .filter(m => m.court_id === court.id && m.status === 'completed' && m.end_time)
    .sort((a, b) => b.end_time!.toMillis() - a.end_time!.toMillis())[0];
  const minutesCourtEmpty = lastCompletedForCourt?.end_time
    ? (now - lastCompletedForCourt.end_time.toMillis()) / (1000 * 60)
    : Infinity;

  // コートに性別制約がある場合は制約を厳守
  // 逆性別の割り当ては管理者が manual_gender_unlock=true を設定した場合のみ許可
  let candidate;
  if (court.preferred_gender === 'male' || court.preferred_gender === 'female') {
    candidate = preferred.length > 0 ? preferred[0] : (neutral.length > 0 ? neutral[0] : null);

    if (!candidate && court.manual_gender_unlock) {
      const opposite = candidatesWithScore
        .filter(c => !c.isNeutral && !c.matchesCourt)
        .sort((a, b) => b.priorityScore - a.priorityScore);
      if (opposite.length > 0) {
        candidate = opposite[0];
      }
    }
  } else {
    // 性別制約のないコート（あれば）: すべての試合を候補にする
    const fallback = candidatesWithScore
      .sort((a, b) => b.priorityScore - a.priorityScore);
    candidate = preferred.length > 0 ? preferred[0] :
      (neutral.length > 0 ? neutral[0] : (fallback.length > 0 ? fallback[0] : null));
  }

  if (!candidate) return null;

  // 決勝戦がセンター(優先)コートで始まる場合の通知（遊休回避は上の selectableMatches 除外で実施済み）
  if (finalsActive && finalsWaitMode[`${candidate.match.tournament_type}_${candidate.match.division}`] && isFinalsMatch(candidate.match)) {
    const prefNums = getFinalsPreferredCourts(candidate.match.tournament_type, candidate.match.division ?? 0, finalsCourtCount);
    if (prefNums.includes(court.number)) {
      toastInfo(`決勝戦がセンターコートで始まります！第${court.number}コート`);
    }
  }

  try {
    const claimed = await claimCourtForMatch(court.id, candidate.match.id, {
      status: 'calling',
      court_id: court.id
    });
    if (!claimed) return null;

    // manual_gender_unlock は割り当て成功後に自動リセット
    if (court.manual_gender_unlock) {
      await updateDocument('courts', court.id, { manual_gender_unlock: false });
    }

    // Web Push 通知（fire-and-forget）
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: candidate.match.id }),
    }).catch(() => {});
  } catch (error) {
    return null;
  }

  return candidate.match;
}

/**
 * 決勝戦の優先コート番号を返す（何面でも対応）
 *
 * コートブロック定義（面数に関わらず共通）:
 *   男子ブロック: 1 〜 half (half = floor(N/2))
 *   女子ブロック: half+1 〜 N
 *   混合ダブルス: 1部=前半ブロック、2部=後半ブロック
 *
 * 決勝コート:
 *   1部 → そのブロックのセンター
 *   2部 → そのブロックの先頭（男子=1番、女子=half+1番）
 *   混合は1部・2部ともにブロックのセンター
 */
function getFinalsPreferredCourts(
  tournamentType: string,
  division: number,
  courtCount: number
): number[] {
  const half = Math.floor(courtCount / 2);
  const maleStart = 1, maleEnd = half;
  const femaleStart = half + 1, femaleEnd = courtCount;
  const blockCenter = (start: number, end: number) => Math.ceil((start + end) / 2);

  const isMens = tournamentType === 'mens_singles' || tournamentType === 'mens_doubles';
  const isWomens = tournamentType === 'womens_singles' || tournamentType === 'womens_doubles';
  const isMixed = tournamentType === 'mixed_doubles';

  if (isMens) {
    // 1部→センター、2部→センターの隣（センター-1）
    const center = blockCenter(maleStart, maleEnd);
    return division === 1 ? [center] : [center - 1];
  }
  if (isWomens) {
    // 1部→センター、2部→センターの隣（センター-1）
    const center = blockCenter(femaleStart, femaleEnd);
    return division === 1 ? [center] : [center - 1];
  }
  if (isMixed) {
    // 混合は1部・2部がそれぞれ別ブロックを使うのでどちらもセンター
    return division === 1 ? [blockCenter(maleStart, maleEnd)] : [blockCenter(femaleStart, femaleEnd)];
  }
  // その他種目: 前半ブロックセンター or 先頭
  return division === 1 ? [blockCenter(maleStart, maleEnd)] : [maleStart];
}

function getPreferredGender(match: Match): 'male' | 'female' | null {
  if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') return 'male';
  if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') return 'female';
  return null;
}

/**
 * 現在「使用中（current_match_id あり）の全コート」の部門リストを返す（部門バランス制御用）。
 * ※ 名称は以前 getAdjacentCourtDivisions だったが、実態は「隣接」ではなく全コート対象のため
 *   getActiveCourtDivisions に改名（コート番号は使わない）。
 * 同じ部門のコートが多いほどペナルティが累積し、部の偏りを防ぐ。
 */
function getActiveCourtDivisions(
  courts: Court[],
  matches: Match[]
): number[] {
  const divisions: number[] = [];

  for (const c of courts) {
    if (!c.current_match_id) continue;
    const m = matches.find(match => match.id === c.current_match_id);
    if (m?.division) {
      divisions.push(m.division);
    }
  }

  return divisions;
}

// ===== アサイン診断 =====

export type SkipReason = 'disabled' | 'busy' | 'resting' | 'round_locked'
  | 'division_balance' | 'group_balance' | 'gender_mismatch' | 'finals_hold' | 'scoring_note';

export interface SkipReasonDetail {
  reason: SkipReason;
  /** 管理者向け日本語説明 */
  label: string;
  /** 追加詳細（例: 休息残り時間、ブロックしている選手名） */
  detail?: string;
}

export interface MatchDiagnostic {
  match: Match;
  reasons: SkipReasonDetail[];
  score?: number;
  /** スコアフェーズ（Phase A/B/C） */
  scorePhase?: ScorePhase;
}

/**
 * 待機中の試合がアサインされない理由を診断して返す。
 * 空きコートが1面以上あるにも関わらずアサインされなかった試合に対して、
 * 各除外理由を列挙する。
 */
export async function diagnoseWaitingMatches(
  campId?: string,
  defaultRestMinutes: number = 10
): Promise<MatchDiagnostic[]> {
  const now = Date.now();

  // ── データ取得 ──────────────────────────────────────────────
  const [allCourts, allMatches, allPlayers, config] = await Promise.all([
    getAllDocuments<Court>('courts'),
    getAllDocuments<Match>('matches'),
    getAllDocuments<Player>('players'),
    getDocument<Config>('config', campId || 'system'),
  ]);

  const campCourts = campId ? allCourts.filter(c => c.campId === campId) : allCourts;
  const campMatches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;

  // 空きコート（自動割り当て対象）
  const emptyCourts = campCourts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);
  if (emptyCourts.length === 0) return []; // 空きコートなし → 診断不要

  const waitingMatches = campMatches.filter(
    m => m.status === 'waiting' && m.player1_id && m.player2_id
  );
  if (waitingMatches.length === 0) return [];

  // ── 前提データ計算 ──────────────────────────────────────────
  // activeMatches は同合宿のみ（他合宿の選手を誤ってbusyにしない）
  const activeMatches = campMatches.filter(m => m.status === 'calling' || m.status === 'playing');

  const busyPlayerIds = new Set<string>();
  activeMatches.forEach(m => {
    [m.player1_id, m.player2_id, m.player3_id, m.player4_id,
      (m as any).player5_id, (m as any).player6_id].filter(Boolean).forEach(id => busyPlayerIds.add(id));
  });

  const busyTeamIds = new Set<string>();
  activeMatches.filter(m => m.tournament_type === 'team_battle').forEach(m => {
    const rep1 = allPlayers.find(p => p.id === m.player1_id);
    const rep2 = allPlayers.find(p => p.id === m.player2_id);
    if (rep1?.team_id) busyTeamIds.add(rep1.team_id);
    if (rep2?.team_id) busyTeamIds.add(rep2.team_id);
  });

  const activeTeamBattleGroupKeys = new Set<string>();
  const seenActiveIds = new Set<string>();
  activeMatches
    .filter(m => m.tournament_type === 'team_battle' && m.group && !seenActiveIds.has(m.id))
    .forEach(m => {
      seenActiveIds.add(m.id);
      activeTeamBattleGroupKeys.add(`${m.campId ?? ''}_${m.division ?? ''}_${m.group}`);
    });

  const enabledTypes = config?.enabled_tournaments;

  // ラウンド規制・部門均等・グループ均等は、割り当て本体とまったく同じ基準を使う。
  // ここで独自計算をすると「本体は止めているのに画面には理由が出ない」状態になる。
  const minRoundByGroup = computeMinUnfinishedRound(campMatches);
  const { ratioByTypeDiv, minRatioByType } = computeDivisionProgress(campMatches);

  // スコアコンテキスト（defaultRestMinutes を渡して連戦判定閾値を設定）
  const scoreCtx = buildScoreContext(campMatches, allPlayers, config ?? undefined, undefined, defaultRestMinutes);
  const minGroupDoneByTypeDiv = computeGroupBalance(campMatches, scoreCtx);

  // 空きコートの性別セット（gender_mismatch 判定用）
  const emptyCourtGenders = new Set(emptyCourts.map(c => c.preferred_gender).filter(Boolean));
  const hasUngenderedCourt = emptyCourts.some(c => !c.preferred_gender);
  const hasGenderUnlockedCourt = emptyCourts.some(c => c.manual_gender_unlock);

  // ── 各試合の診断 ─────────────────────────────────────────────
  const diagnostics: MatchDiagnostic[] = [];

  for (const match of waitingMatches) {
    const reasons: SkipReasonDetail[] = [];

    // (1) disabled
    if (enabledTypes && enabledTypes.length > 0 && !enabledTypes.includes(match.tournament_type as TournamentType)) {
      reasons.push({ reason: 'disabled', label: '種目が停止中' });
    }

    // (2) busy
    if (match.tournament_type === 'team_battle') {
      const rep1 = allPlayers.find(p => p.id === match.player1_id);
      const rep2 = allPlayers.find(p => p.id === match.player2_id);
      const busyNames: string[] = [];
      if (rep1?.team_id && busyTeamIds.has(rep1.team_id)) busyNames.push(rep1.name);
      if (rep2?.team_id && busyTeamIds.has(rep2.team_id)) busyNames.push(rep2.name);
      if (busyNames.length > 0) {
        reasons.push({ reason: 'busy', label: '選手が試合中', detail: busyNames.join('、') });
      }
      if (match.group) {
        const gKey = `${match.campId ?? ''}_${match.division ?? ''}_${match.group}`;
        if (activeTeamBattleGroupKeys.has(gKey)) {
          reasons.push({ reason: 'busy', label: '同グループの対戦が進行中', detail: `G${match.group}` });
        }
      }
    } else {
      const playerIds = [
        match.player1_id, match.player2_id, match.player3_id, match.player4_id,
        (match as any).player5_id, (match as any).player6_id
      ].filter(Boolean) as string[];
      const busyPlayerNames = playerIds
        .filter(id => busyPlayerIds.has(id))
        .map(id => allPlayers.find(p => p.id === id)?.name ?? id);
      if (busyPlayerNames.length > 0) {
        reasons.push({ reason: 'busy', label: '選手が試合中', detail: busyPlayerNames.join('、') });
      }
    }

    // (3) resting — available_at
    if (match.available_at && now < match.available_at.toMillis()) {
      const remainMins = Math.ceil((match.available_at.toMillis() - now) / 60000);
      reasons.push({ reason: 'resting', label: `休憩中（あと${remainMins}分）` });
    } else {
      // available_at が過ぎている（または null）場合は個人休息チェック
      const manuallyReleased = !match.available_at;
      if (!manuallyReleased) {
        const playerIds = [
          match.player1_id, match.player2_id, match.player3_id, match.player4_id,
          (match as any).player5_id, (match as any).player6_id
        ].filter(Boolean) as string[];
        for (const playerId of playerIds) {
          const player = allPlayers.find(p => p.id === playerId);
          if (player?.last_match_finished_at) {
            const lastFinished = player.last_match_finished_at.toMillis();
            const elapsed = (now - lastFinished) / 60000;
            if (elapsed < defaultRestMinutes) {
              const remainMins = Math.ceil(defaultRestMinutes - elapsed);
              reasons.push({
                reason: 'resting',
                label: `選手休憩中（あと${remainMins}分）`,
                detail: player.name,
              });
            }
          }
        }
      }
    }

    // (4) round_locked / 均等化 — disabled な種目は判定しない
    if (!reasons.some(r => r.reason === 'disabled')) {
      const minRound = minRoundByGroup.get(getGroupKey(match));
      if (minRound !== undefined && match.round > minRound) {
        reasons.push({
          reason: 'round_locked',
          label: `下位ラウンド待ち（${minRound}回戦の完了待ち）`,
          detail: `${minRound}回戦が全部終わるまで出しません`,
        });
      }

      // 部門均等: 同じ種目の中で、いちばん遅れている部より進んでいる
      if (match.division !== undefined) {
        const min = minRatioByType.get(match.tournament_type);
        const mine = ratioByTypeDiv.get(`${match.tournament_type}_${match.division}`);
        if (min !== undefined && mine !== undefined && mine > min + BALANCE_TOLERANCE) {
          reasons.push({
            reason: 'division_balance',
            label: '部門均等で待機',
            detail: `この部 ${Math.round(mine * 100)}% / いちばん遅い部 ${Math.round(min * 100)}%`,
          });
        }
      }

      // グループ均等: 同じ種目・部の中で、いちばん消化が少ない組より進んでいる
      const grp = (match as any).group;
      if ((match as any).phase === 'preliminary' && grp) {
        const tdKey = `${match.tournament_type}_${match.division}`;
        const minDone = minGroupDoneByTypeDiv.get(tdKey);
        const mineDone = scoreCtx.groupProgressMap.get(`${tdKey}_${grp}`) ?? 0;
        if (minDone !== undefined && mineDone > minDone) {
          reasons.push({
            reason: 'group_balance',
            label: 'グループ均等で待機',
            detail: `${grp}組 ${mineDone}試合 / いちばん遅い組 ${minDone}試合`,
          });
        }
      }
    }

    // (5) 決勝の許可待ち
    {
      const apprKey = `${match.tournament_type}_${match.division}`;
      const required = config?.finals_approval_required?.[apprKey];
      const approved = new Set(config?.finals_approved_match_ids || []);
      if (required && isFinalsRound(match, campMatches) && !approved.has(match.id)) {
        reasons.push({
          reason: 'finals_hold',
          label: '決勝の許可待ち',
          detail: '「決勝の許可」で運営が入れるまで出しません',
        });
      }
    }

    // (6) gender_mismatch — 利用可能な空きコートが性別的に合わない
    const matchGender = getPreferredGender(match); // null = neutral
    if (matchGender && !hasUngenderedCourt) {
      const hasMatchingCourt = emptyCourtGenders.has(matchGender);
      const canUseUnlocked = hasGenderUnlockedCourt;
      if (!hasMatchingCourt && !canUseUnlocked) {
        const oppLabel = matchGender === 'male' ? '男子' : '女子';
        const courtLabels = emptyCourts.map(c => `${c.number}番`).join('・');
        reasons.push({
          reason: 'gender_mismatch',
          label: `${oppLabel}専用コートなし`,
          detail: `空き: ${courtLabels}`,
        });
      }
    }

    // フェーズ判定とスコア計算
    let score: number | undefined;
    let scorePhase: ScorePhase | undefined;
    try {
      scorePhase = detectPhase(match, scoreCtx);
      score = calcMatchScore(match, scoreCtx);
    } catch { /* ignore */ }

    // スコアフェーズに応じた診断ノートを追加
    if (scorePhase === 'preliminary_first') {
      reasons.push({
        reason: 'scoring_note',
        label: '✅ 第1巡目：リスト順優先',
        detail: `match_number ${match.match_number ?? '-'} の順にアサイン予定`,
      });
    } else if (scorePhase === 'preliminary_mid') {
      // 連戦回避ペナルティが適用されているか判定
      if (hasRecentPlayer(match, allPlayers, scoreCtx.now, scoreCtx.recentMatchMinutes)) {
        reasons.push({
          reason: 'scoring_note',
          label: '⚠️ 連戦回避ペナルティ適用中（-200点）',
          detail: `直近${scoreCtx.recentMatchMinutes}分以内に試合を終えた選手あり`,
        });
      }
    } else if (scorePhase === 'knockout') {
      reasons.push({
        reason: 'scoring_note',
        label: '✅ 決勝T：下位ラウンド優先',
        detail: `round ${match.round} / score ${score ?? '-'}`,
      });
    }

    // 少なくとも1つ理由がある場合のみ診断リストへ
    if (reasons.length > 0) {
      diagnostics.push({ match, reasons, score, scorePhase });
    }
  }

  // スコア降順でソート（本来割り当てられるべき試合を上に）
  diagnostics.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return diagnostics;
}

/**
 * 混合ダブルス進行時のコート制限を取得
 * 前半のコートは1部、後半のコートは2部に割り当て
 */
function getMixedDoublesCourtRestriction(
  courtNumber: number,
  totalCourts: number,
  allMatches: Match[],
  waitingMatches: Match[]
): { allowedDivision: number } | null {
  // 混合ダブルスの待機試合のみを対象
  const mixedWaiting = waitingMatches.filter(m => m.tournament_type === 'mixed_doubles');
  if (mixedWaiting.length === 0) return null;

  // 1部と2部の残り試合数を確認
  const div1Remaining = mixedWaiting.filter(m => m.division === 1).length;
  const div2Remaining = mixedWaiting.filter(m => m.division === 2).length;

  // 片方の部がすべて終了している場合は制限なし
  if (div1Remaining === 0 || div2Remaining === 0) {
    return null;
  }

  // コートの前半（1～半分）は1部、後半（半分+1～最後）は2部
  const halfPoint = Math.ceil(totalCourts / 2);
  const allowedDivision = courtNumber <= halfPoint ? 1 : 2;

  return { allowedDivision };
}


// ── 例外投入の承認 ────────────────────────────────────────────────────────────
// 均等化を厳しくしたぶん、遅れている側が全員ふさがっているとコートが空いたままになる。
// そのときだけ「例外で入れますか」と聞き、承認されたら既存の予約パスに流す。

/** 「1部 A組 2回戦 テスト一部H/A vs テスト一部J/L」のような1行ラベル */
function candidateLabel(match: Match, players: Player[]): string {
  const nameOf = (id?: string | null) => players.find(p => p.id === id)?.name ?? '';
  const side = (a?: string | null, b?: string | null, c?: string | null) =>
    [nameOf(a), nameOf(b), nameOf(c)].filter(Boolean).join('/') || '未定';
  const head = [
    match.division !== undefined ? `${match.division}部` : '',
    (match as any).group ? `${(match as any).group}組` : '',
    `${match.round}回戦`,
  ].filter(Boolean).join(' ');
  const p1 = side(match.player1_id, match.player3_id, (match as any).player5_id);
  const p2 = side(match.player2_id, match.player4_id, (match as any).player6_id);
  return `${head} ${p1} vs ${p2}`;
}

/**
 * 割り当てられなかったコートの後始末。
 *  - 例外候補がない（＝そもそも入れる試合がない）なら、詰まりの記録を消す
 *  - 詰まりが続いていて、しきい値を超えたら承認待ちを作る
 *  - 承認待ちのまま自動投入の時刻を過ぎたら、先頭候補を入れる
 */
async function handleStuckCourt(
  court: Court,
  blockInfo: DispatchBlockInfo,
  nowMs: number,
  stuckSeconds: number,
  autoMinutes: number
): Promise<void> {
  // 例外にしても入る試合がない → 詰まりではない（選手が全員コート上、など）
  if (blockInfo.overridable.length === 0) {
    if (court.stuck_since || court.pending_dispatch) {
      await updateDocument('courts', court.id, { stuck_since: null, pending_dispatch: null }).catch(() => {});
    }
    return;
  }

  // 「空けたままにする」で黙らせている期間
  const mutedUntil = court.dispatch_muted_until?.toMillis?.() ?? 0;
  if (nowMs < mutedUntil) return;

  // 承認待ちがすでにある → 自動投入の時刻だけ見る
  const pending = court.pending_dispatch;
  if (pending) {
    const autoAt = pending.auto_at?.toMillis?.() ?? 0;
    if (autoAt > 0 && nowMs >= autoAt && pending.candidates[0]) {
      await approveDispatch(court.id, pending.candidates[0].match_id);
    }
    return;
  }

  // 詰まり始めの記録
  const stuckSince = court.stuck_since?.toMillis?.() ?? 0;
  if (stuckSince === 0) {
    await updateDocument('courts', court.id, { stuck_since: Timestamp.now() }).catch(() => {});
    return;
  }

  // しきい値を超えたら承認待ちを作る
  if ((nowMs - stuckSince) / 1000 < stuckSeconds) return;

  const players = await getAllDocuments<Player>('players');
  const candidates: PendingDispatchCandidate[] = blockInfo.overridable.map(({ match, reason, kind }) => ({
    match_id: match.id,
    label: candidateLabel(match, players),
    reason,
    kind,
  }));

  // ラウンド規制で止まっているだけのときは、自動では入れない。
  // 前のラウンドがコート上に残っている状況は通常運用で何度も起きるので、
  // ここで自動投入すると「ラウンド規制を厳しめに」が毎回迂回されてしまう。
  // 部門・グループの偏りで止まっているときだけ、無応答なら自動で入れる。
  const isRoundOnly = candidates[0]?.kind === 'round';

  await updateDocument('courts', court.id, {
    pending_dispatch: {
      candidates,
      created_at: Timestamp.now(),
      auto_at: (autoMinutes > 0 && !isRoundOnly)
        ? Timestamp.fromMillis(nowMs + autoMinutes * 60000)
        : null,
    },
  }).catch(() => {});
}

/**
 * 例外投入を承認する。
 * 試合に予約を書くだけ。実際の投入は既存の予約パス（dispatchToEmptyCourt の先頭）が行う。
 * 予約パスは均等化フィルタより前にあるので、そのまま例外として通る。
 */
export async function approveDispatch(
  courtId: string,
  matchId: string
): Promise<void> {
  await updateDocument('matches', matchId, {
    reserved_court_id: courtId,
    available_at: Timestamp.now(),
  });
  await updateDocument('courts', courtId, {
    pending_dispatch: null,
    stuck_since: null,
  });
}

/** 「空けたままにする」。指定分だけ聞き直さない */
export async function dismissDispatch(courtId: string, muteMinutes: number = 10): Promise<void> {
  await updateDocument('courts', courtId, {
    pending_dispatch: null,
    stuck_since: null,
    dispatch_muted_until: Timestamp.fromMillis(Date.now() + muteMinutes * 60000),
  });
}
