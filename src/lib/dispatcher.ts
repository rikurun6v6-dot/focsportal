import type { Match, Court, Config, Camp, Player, TournamentType } from '@/types';
import { getAllDocuments, getDocument, updateDocument } from './firestore-helpers';
import { toastInfo } from './toast';
import { Timestamp } from 'firebase/firestore';
import { buildScoreContext, calcMatchScore, getGroupKey, detectPhase, hasRecentPlayer, ScorePhase } from './matchScoring';

export async function autoDispatchAll(campId?: string, defaultRestMinutes: number = 10): Promise<number> {
  const allCourts = await getAllDocuments<Court>('courts');
  const courts = campId ? allCourts.filter(c => c.campId === campId) : allCourts;
  // 手動でフリーに設定されたコート（manually_freed=true）は自動割り当て対象外
  const emptyCourts = courts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);

  if (emptyCourts.length === 0) return 0;

  const allMatches = await getAllDocuments<Match>('matches');
  const matches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;
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
  // バッチ内で割り当てた部を追跡（スタート時など全コート空でも部の偏りを防ぐ）
  const batchAssignedDivisions: number[] = [];

  // 全体の待機試合数で「試合数の多い部」を判定（中間コートに割り当てる dominant division）
  const div1Total = waitingMatches.filter(m => m.division === 1).length;
  const div2Total = waitingMatches.filter(m => m.division === 2).length;
  const dominant: 1 | 2 = div2Total > div1Total ? 2 : 1;

  // コートに部優先を割り当て: 先頭=1部、末尾=2部、中間=試合数の多い部（1,x,2）
  const courtDivisionPreference = new Map<string, 1 | 2>();
  for (const gender of ['male', 'female', null] as const) {
    const group = emptyCourts
      .filter(c => (gender === null ? !c.preferred_gender : c.preferred_gender === gender))
      .sort((a, b) => a.number - b.number);
    if (group.length === 0) continue;
    for (let i = 0; i < group.length; i++) {
      if (i === 0)                     courtDivisionPreference.set(group[i].id, 1);
      else if (i === group.length - 1) courtDivisionPreference.set(group[i].id, 2);
      else                             courtDivisionPreference.set(group[i].id, dominant);
    }
  }

  for (const court of emptyCourts) {
    // 団体戦マルチコートとして既に確保済みのコートはスキップ
    if (claimedCourtIds.has(court.id)) continue;

    const divPref = courtDivisionPreference.get(court.id);
    const assigned = await dispatchToEmptyCourt(court, waitingMatches, defaultRestMinutes, assignedMatchIds, batchAssignedDivisions, divPref);
    if (assigned) {
      dispatchedCount++;
      assignedMatchIds.add(assigned.id);
      claimedCourtIds.add(court.id);
      if (assigned.division) batchAssignedDivisions.push(assigned.division);
      const idx = waitingMatches.findIndex(m => m.id === assigned.id);
      if (idx >= 0) waitingMatches.splice(idx, 1);

      // 団体戦: 同一試合を最大3面に同時割り当て（追加2面分）
      if (assigned.tournament_type === 'team_battle') {
        let extraCount = 0;
        for (const extraCourt of emptyCourts) {
          if (extraCount >= 2) break; // 合計3面まで（最初の1面 + 追加2面）
          if (claimedCourtIds.has(extraCourt.id)) continue;
          if (!extraCourt.is_active || extraCourt.manually_freed) continue;
          try {
            await updateDocument('courts', extraCourt.id, { current_match_id: assigned.id });
            claimedCourtIds.add(extraCourt.id);
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

export async function dispatchToEmptyCourt(
  court: Court,
  waitingMatches: Match[],
  defaultRestMinutes: number = 10,
  assignedMatchIds: Set<string> = new Set(),
  batchAssignedDivisions: number[] = [],
  divisionPreference?: 1 | 2
): Promise<Match | null> {
  const now = Date.now();
  // 同一ループ内で既に割り当て済みの試合を除外（二重割り当て防止の第二防衛線）
  if (assignedMatchIds.size > 0) {
    waitingMatches = waitingMatches.filter(m => !assignedMatchIds.has(m.id));
  }

  // ── 進行制御フィルタを最初に適用（予約パス含む全パスで有効） ──
  // config を先に読み込み、enabled_tournaments に含まれない種目を完全排除する
  const config = await getDocument<Config>('config', court.campId || 'system');
  const enabledTypesEarly = config?.enabled_tournaments;
  if (enabledTypesEarly && enabledTypesEarly.length > 0) {
    waitingMatches = waitingMatches.filter(m =>
      enabledTypesEarly.includes(m.tournament_type as TournamentType)
    );
  }
  if (waitingMatches.length === 0) return null;

  const finalsWaitMode = config?.finals_wait_mode || {};

  // ✅ 予約優先: このコートに予約されている試合があるかチェック
  const reservedMatch = waitingMatches.find(m =>
    m.reserved_court_id === court.id &&
    m.available_at &&
    now >= m.available_at.toMillis()
  );

  if (reservedMatch) {
    // 予約試合を最優先でアサイン（enabled_tournaments フィルタ済みの waitingMatches から取得）
    try {
      await updateDocument('matches', reservedMatch.id, {
        status: 'calling',
        court_id: court.id,
        reserved_court_id: null, // 予約解除
        available_at: null // 休憩時間クリア
      });

      await updateDocument('courts', court.id, {
        current_match_id: reservedMatch.id
      });

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

  const allMatches = await getAllDocuments<Match>('matches');
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
  const allPlayers = await getAllDocuments<Player>('players');

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

  // 選手休息チェック: 全員が休息完了しているカードを優先、なければ休息中選手がいるカードも使う
  // （予選リーグなど連続試合が避けられない場合のフォールバック）
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

  // ラウンド順序の厳守: 両選手が揃っている待機試合を基準にラウンド下限を計算
  // validMatches（空き・休息チェック後）ではなく waitingMatches（選手IDあり・enabled済）を使うことで、
  // 下位ラウンドの選手が休息中でも上位ラウンドを先出しさせない
  // グループキーに group フィールドを含める: 予選グループA/B/Cが互いにブロックしないようにする
  const minRoundByGroup = new Map<string, number>();
  for (const match of waitingMatches) {
    if (!match.player1_id || !match.player2_id) continue; // 選手未確定の枠はスキップ
    const groupKey = getGroupKey(match);
    const existing = minRoundByGroup.get(groupKey);
    if (existing === undefined || match.round < existing) {
      minRoundByGroup.set(groupKey, match.round);
    }
  }
  const roundFilteredMatches = restFilteredMatches.filter(match => {
    const groupKey = getGroupKey(match);
    const minRound = minRoundByGroup.get(groupKey);
    return minRound === undefined || match.round === minRound;
  });

  // 性別ガード: manual_gender_unlock が設定されていない限り、
  // コートの preferred_gender と異なる試合を候補から完全除外する
  const genderPreFilteredMatches = (court.preferred_gender && !court.manual_gender_unlock)
    ? roundFilteredMatches.filter(match => {
        const mg = getPreferredGender(match);
        // neutral (mixed_doubles, team_battle) は OK。同性別も OK。逆性別は除外。
        return mg === null || mg === court.preferred_gender;
      })
    : roundFilteredMatches;

  // 隣接コートの部門を取得（既存コート + 今回のバッチ割り当て分を合算）
  const allCourts = await getAllDocuments<Court>('courts');
  const campCourts = court.campId ? allCourts.filter(c => c.campId === court.campId) : allCourts;
  const existingCourtDivisions = getAdjacentCourtDivisions(court.number, campCourts, allMatches);
  // バッチ内で既に割り当てた部をマージ（スタート時など全コート空でも偏り防止が効く）
  const adjacentCourtDivisions = [...existingCourtDivisions, ...batchAssignedDivisions];

  // 混合ダブルスのコート制限チェック
  const mixedDoublesActive = waitingMatches.some(m => m.tournament_type === 'mixed_doubles');
  const mixedCourtRestriction = mixedDoublesActive ? getMixedDoublesCourtRestriction(
    court.number,
    campCourts.length,
    allMatches,
    waitingMatches
  ) : null;

  // divisionPreference が指定されている場合、その部を強制的に優先（+150）
  const scoreCtxForCourt = divisionPreference
    ? { ...scoreCtx, preferredDivision: divisionPreference, divisionBonusBase: 150, adjacentCourtDivisions }
    : { ...scoreCtx, adjacentCourtDivisions };

  const candidatesWithScore = genderPreFilteredMatches.map(match => {
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

  // Check if this is finals and apply center court priority
  const key = `${candidate.match.tournament_type}_${candidate.match.division}`;
  if (finalsWaitMode[key]) {
    const allMatchesInType = allMatches.filter(m =>
      m.campId === candidate.match.campId &&
      m.tournament_type === candidate.match.tournament_type &&
      m.subtitle !== "3位決定戦"
    );

    if (allMatchesInType.length > 0) {
      const maxRoundByDiv = new Map<number, number>();
      allMatchesInType.forEach(m => {
        if (!m.division) return;
        const cur = maxRoundByDiv.get(m.division) ?? 0;
        if (m.round > cur) maxRoundByDiv.set(m.division, m.round);
      });
      const myMaxRound = maxRoundByDiv.get(candidate.match.division ?? 0) ?? 0;
      const isFinals = candidate.match.round === myMaxRound && myMaxRound > 0;

      if (isFinals) {
        const campDoc = await getDocument<Camp>('camps', court.campId || '');
        const courtCount = campDoc?.court_count || 6;

        const preferredCourtNumbers = getFinalsPreferredCourts(
          candidate.match.tournament_type,
          candidate.match.division ?? 0,
          courtCount
        );

        if (preferredCourtNumbers.length > 0 && !preferredCourtNumbers.includes(court.number)) {
          const allCourts = await getAllDocuments<Court>('courts', []);
          const campCourts = court.campId ? allCourts.filter(c => c.campId === court.campId) : allCourts;
          const preferredAvailable = campCourts.some(c =>
            preferredCourtNumbers.includes(c.number) &&
            c.is_active &&
            !c.current_match_id &&
            !c.manually_freed
          );
          if (preferredAvailable) return null; // 優先コートが空くまで待機
        }

        toastInfo(`決勝戦がセンターコートで始まります！第${court.number}コート`);
      }
    }
  }

  try {
    await updateDocument('matches', candidate.match.id, {
      status: 'calling',
      court_id: court.id
    });

    // manual_gender_unlock は割り当て成功後に自動リセット
    const courtUpdate: Record<string, unknown> = { current_match_id: candidate.match.id };
    if (court.manual_gender_unlock) courtUpdate.manual_gender_unlock = false;
    await updateDocument('courts', court.id, courtUpdate);

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
 * 現在使用中の全コートの部門を取得（部門バランス制御用）
 * 同じ部門のコートが多いほどペナルティが累積し、部の偏りを防ぐ
 */
function getAdjacentCourtDivisions(
  _courtNumber: number,
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

export type SkipReason = 'disabled' | 'busy' | 'resting' | 'round_locked' | 'gender_mismatch' | 'scoring_note';

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

  // minRoundByGroup（filteredWaitingMatches ベース）
  const filteredWaiting = (enabledTypes && enabledTypes.length > 0)
    ? waitingMatches.filter(m => enabledTypes.includes(m.tournament_type as TournamentType))
    : waitingMatches;

  const minRoundByGroup = new Map<string, number>();
  for (const m of filteredWaiting) {
    const gk = getGroupKey(m);
    const existing = minRoundByGroup.get(gk);
    if (existing === undefined || m.round < existing) minRoundByGroup.set(gk, m.round);
  }

  // スコアコンテキスト（defaultRestMinutes を渡して連戦判定閾値を設定）
  const scoreCtx = buildScoreContext(campMatches, allPlayers, config ?? undefined, undefined, defaultRestMinutes);

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

    // (4) round_locked — disabled な種目は除外済みなのでここでは filteredWaiting に含まれる試合のみ対象
    if (!reasons.some(r => r.reason === 'disabled')) {
      const gk = getGroupKey(match);
      const minRound = minRoundByGroup.get(gk);
      if (minRound !== undefined && match.round > minRound) {
        reasons.push({
          reason: 'round_locked',
          label: `下位ラウンド待ち（${minRound}回戦が先）`,
        });
      }
    }

    // (5) gender_mismatch — 利用可能な空きコートが性別的に合わない
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
