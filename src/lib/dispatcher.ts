import type { Match, Court, Config, Camp, Player } from '@/types';
import { getAllDocuments, getDocument, updateDocument } from './firestore-helpers';
import { toastInfo } from './toast';
import { Timestamp } from 'firebase/firestore';

const ROUND_COEFFICIENT = 100;

export async function autoDispatchAll(campId?: string, defaultRestMinutes: number = 10): Promise<number> {
  const allCourts = await getAllDocuments<Court>('courts');
  const courts = campId ? allCourts.filter(c => c.campId === campId) : allCourts;
  // 手動でフリーに設定されたコート（manually_freed=true）は自動割り当て対象外
  const emptyCourts = courts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);

  if (emptyCourts.length === 0) return 0;

  const allMatches = await getAllDocuments<Match>('matches');
  const matches = campId ? allMatches.filter(m => m.campId === campId) : allMatches;
  const waitingMatches = matches.filter(m => m.status === 'waiting');

  if (waitingMatches.length === 0) return 0;

  let dispatchedCount = 0;
  // 同一ループ内で確定した割り当て済み試合IDを記録（Firestore 反映前の二重割り当て防止）
  const assignedMatchIds = new Set<string>();
  // 団体戦マルチコート: このループで既に確保済みのコートIDを追跡
  const claimedCourtIds = new Set<string>();

  for (const court of emptyCourts) {
    // 団体戦マルチコートとして既に確保済みのコートはスキップ
    if (claimedCourtIds.has(court.id)) continue;

    const assigned = await dispatchToEmptyCourt(court, waitingMatches, defaultRestMinutes, assignedMatchIds);
    if (assigned) {
      dispatchedCount++;
      assignedMatchIds.add(assigned.id);
      claimedCourtIds.add(court.id);
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
  assignedMatchIds: Set<string> = new Set()
): Promise<Match | null> {
  const now = Date.now();
  // 同一ループ内で既に割り当て済みの試合を除外（二重割り当て防止の第二防衛線）
  if (assignedMatchIds.size > 0) {
    waitingMatches = waitingMatches.filter(m => !assignedMatchIds.has(m.id));
  }

  // ✅ 予約優先: このコートに予約されている試合があるかチェック
  const reservedMatch = waitingMatches.find(m =>
    m.reserved_court_id === court.id &&
    m.available_at &&
    now >= m.available_at.toMillis()
  );

  if (reservedMatch) {
    // 予約試合を最優先でアサイン
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
    m.status === 'calling' || m.status === 'playing'
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

  // 1部と2部の進行状況を計算（campIdでフィルタして他合宿の試合を混入させない）
  const campMatches = court.campId ? allMatches.filter(m => m.campId === court.campId) : allMatches;
  const division1Matches = campMatches.filter(m => m.division === 1);
  const division2Matches = campMatches.filter(m => m.division === 2);

  const division1Completed = division1Matches.filter(m => m.status === 'completed').length;
  const division2Completed = division2Matches.filter(m => m.status === 'completed').length;

  const division1Total = division1Matches.length;
  const division2Total = division2Matches.length;

  // 進行率を計算（完了試合数 / 総試合数）
  const division1Progress = division1Total > 0 ? division1Completed / division1Total : 1;
  const division2Progress = division2Total > 0 ? division2Completed / division2Total : 1;

  // 進行が遅れている方（進行率が低い方）を優先
  // 同率の場合は2部をデフォルト優先（ただしgap=0のためボーナス0なので実質差なし）
  const preferredDivision = division1Progress < division2Progress ? 1 : 2;
  // ギャップに比例したボーナス（弱体化: 最大50点に抑制して平準化より投入優先）
  // gap 0% → 0, gap 10% → 17, gap 30%+ → 50（上限）
  const progressGap = Math.abs(division1Progress - division2Progress);
  const divisionBonusBase = Math.round(Math.min(50, progressGap * 167));

  // 種目・部・フェーズごとの最大ラウンド数を動的計算（固定値 4 を廃止）
  const maxRoundByTypeDiv = new Map<string, number>();
  campMatches.forEach(m => {
    const k = `${m.tournament_type}_${m.division}_${(m as any).phase ?? 'knockout'}`;
    const cur = maxRoundByTypeDiv.get(k) ?? 0;
    if (m.round > cur) maxRoundByTypeDiv.set(k, m.round);
  });

  // グループ進行度マップを計算（予選グループ間の平準化用）
  // キー: `${tournament_type}_${division}_${group}`, 値: calling+playing+completed の試合数
  const groupProgressMap = new Map<string, number>();
  campMatches.forEach(m => {
    if (!m.group) return;
    const gKey = `${m.tournament_type}_${m.division}_${m.group}`;
    if (m.status === 'calling' || m.status === 'playing' || m.status === 'completed') {
      groupProgressMap.set(gKey, (groupProgressMap.get(gKey) || 0) + 1);
    }
  });

  // Load config for finals wait mode
  const config = await getDocument<Config>('config', 'system');
  const finalsWaitMode = config?.finals_wait_mode || {};

  // 休息時間チェック用の設定を取得
  // Use the defaultRestMinutes parameter passed from admin page
  const allPlayers = await getAllDocuments<Player>('players');

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

  // 種目フィルタの厳格化: enabled_tournamentsが指定されている場合、完全一致のみ許可
  const enabledTypes = config?.enabled_tournaments;
  const filteredWaitingMatches = (enabledTypes && enabledTypes.length > 0)
    ? waitingMatches.filter(m => enabledTypes.includes(m.tournament_type as any))
    : waitingMatches;

  const validMatches = filteredWaitingMatches.filter(match => {
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
    // 休息時間チェック（player5/6も含む）
    // ただし available_at が null（管理者が手動クリア済み）の場合はプレイヤーレベルの休息チェックをスキップ
    // これにより「休憩解除操作 → 即座に自動割当」が機能する
    const manuallyReleased = !match.available_at;
    if (!manuallyReleased) {
      const playerIds = [
        match.player1_id, match.player2_id, match.player3_id, match.player4_id,
        (match as any).player5_id, (match as any).player6_id
      ].filter(id => id);
      for (const playerId of playerIds) {
        const player = allPlayers.find(p => p.id === playerId);
        if (player?.last_match_finished_at) {
          const lastFinished = player.last_match_finished_at.toMillis();
          const timeSinceLastMatch = (now - lastFinished) / (1000 * 60); // 分単位
          if (timeSinceLastMatch < defaultRestMinutes) {
            return false; // 休息時間が不足している選手がいる
          }
        }
      }
    }

    // Finals wait mode check
    const key = `${match.tournament_type}_${match.division}`;
    if (finalsWaitMode[key]) {
      // Get all matches in this tournament (exclude 3rd place)
      const allMatchesInTournament = allMatches.filter(m =>
        m.campId === match.campId &&
        m.tournament_type === match.tournament_type &&
        m.division === match.division &&
        m.subtitle !== "3位決定戦"
      );

      if (allMatchesInTournament.length > 0) {
        const maxRound = Math.max(...allMatchesInTournament.map(m => m.round));
        const isFinals = match.round === maxRound;

        if (isFinals) {
          // Check if all other matches are completed
          const otherMatches = allMatchesInTournament.filter(m => m.id !== match.id);
          const allOthersCompleted = otherMatches.every(m => m.status === 'completed');

          if (!allOthersCompleted) {
            return false; // Exclude finals from dispatch until others complete
          }
          // If all others complete, finals is ready - continue to dispatch
        }
      }
    }

    return true;
  });

  if (validMatches.length === 0) return null;

  // ✅ ラウンド順序の緩やか維持: 実際に割り当て可能な試合 (validMatches) の中で最小ラウンドを計算
  // 休息中・players忙しいなどブロックされた試合は除外して計算することで、
  // 全ての下位ラウンドがブロックされている場合でも上位ラウンドを割り当て可能にする
  // グループキーに group フィールドを含める: 予選グループA/B/Cが互いにブロックしないようにする
  const minRoundByGroup = new Map<string, number>();
  for (const match of validMatches) {
    const groupKey = `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}_${(match as any).group ?? ''}`;
    const existing = minRoundByGroup.get(groupKey);
    if (existing === undefined || match.round < existing) {
      minRoundByGroup.set(groupKey, match.round);
    }
  }
  const roundFilteredMatches = validMatches.filter(match => {
    const groupKey = `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}_${(match as any).group ?? ''}`;
    return match.round === minRoundByGroup.get(groupKey);
  });

  // 隣接コートの部門を取得（3面連続で同じ部にならないように）
  const allCourts = await getAllDocuments<Court>('courts');
  const campCourts = court.campId ? allCourts.filter(c => c.campId === court.campId) : allCourts;
  const adjacentCourtDivisions = getAdjacentCourtDivisions(court.number, campCourts, allMatches);

  // 混合ダブルスのコート制限チェック
  const mixedDoublesActive = waitingMatches.some(m => m.tournament_type === 'mixed_doubles');
  const mixedCourtRestriction = mixedDoublesActive ? getMixedDoublesCourtRestriction(
    court.number,
    campCourts.length,
    allMatches,
    waitingMatches
  ) : null;

  const candidatesWithScore = roundFilteredMatches.map(match => {
    // 待機時間: 関与する全選手の最終試合終了時刻の最大値を基準（なければ created_at）
    // これにより「試合が実際に割り当て可能になった時刻」から計算する
    const playerIdsForWait = [
      match.player1_id, match.player2_id, match.player3_id, match.player4_id,
      (match as any).player5_id, (match as any).player6_id
    ].filter((id): id is string => !!id);
    const effectiveAvailableMs = playerIdsForWait.reduce((maxMs, pid) => {
      const player = allPlayers.find(p => p.id === pid);
      return player?.last_match_finished_at
        ? Math.max(maxMs, player.last_match_finished_at.toMillis())
        : maxMs;
    }, 0);
    const waitStartMs = effectiveAvailableMs > 0 ? effectiveAvailableMs : match.created_at.toMillis();
    const waitTime = Math.max(0, (now - waitStartMs) / (1000 * 60));

    // 動的最大ラウンド: 固定値 4 ではなく実際の試合データから計算
    const phaseKey = `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}`;
    const maxRound = maxRoundByTypeDiv.get(phaseKey) ?? 4;
    const roundScore = ROUND_COEFFICIENT * (maxRound - match.round + 1);

    // 部のバランスボーナス（進行差に比例。差が大きいほど優先度を上げ、均等進行を促す）
    let divisionBonus = match.division === preferredDivision ? divisionBonusBase : 0;

    // 隣接コートチェック: 前後2コートが同じ部なら優先度を下げる
    if (match.division && adjacentCourtDivisions.includes(match.division)) {
      divisionBonus -= 30; // ペナルティ
    }

    // 混合ダブルスのコート制限チェック
    if (mixedCourtRestriction && match.tournament_type === 'mixed_doubles') {
      // このコートが制限対象外の部の場合、大幅にペナルティ
      if (match.division !== mixedCourtRestriction.allowedDivision) {
        divisionBonus -= 1000; // 事実上除外
      }
    }

    // AI アドバイザーによる一時的な優先度ブースト
    let categoryBoost = 0;
    const temporaryBoost = config?.temporary_category_boost as Record<string, number> | undefined;
    if (temporaryBoost && match.tournament_type) {
      const boostValue = temporaryBoost[match.tournament_type];
      const expiresAt = temporaryBoost[`${match.tournament_type}_expires_at`];

      // 期限切れチェック（30分で期限切れ）
      if (boostValue && expiresAt && now < expiresAt) {
        categoryBoost = boostValue;
      }
    }

    // 予選グループ進行度ペナルティ（弱体化: -100/試合 に抑制して空きコートへの投入を優先）
    let groupBalancePenalty = 0;
    if (match.group) {
      const gKey = `${match.tournament_type}_${match.division}_${match.group}`;
      const groupDone = groupProgressMap.get(gKey) || 0;
      groupBalancePenalty = -100 * groupDone;
    }

    const priorityScore = waitTime + roundScore + divisionBonus + categoryBoost + groupBalancePenalty;

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
  // ソフトフォールバック: 5分以上空き かつ 同性別・混合の割り当て可能試合がゼロ → 逆性別を許容して管理者に通知
  let candidate;
  if (court.preferred_gender === 'male' || court.preferred_gender === 'female') {
    candidate = preferred.length > 0 ? preferred[0] : (neutral.length > 0 ? neutral[0] : null);

    if (!candidate && minutesCourtEmpty >= 5) {
      const opposite = candidatesWithScore
        .filter(c => !c.isNeutral && !c.matchesCourt)
        .sort((a, b) => b.priorityScore - a.priorityScore);
      if (opposite.length > 0) {
        const genderLabel = court.preferred_gender === 'male' ? '男子' : '女子';
        toastInfo(`${court.number}番コートが${Math.floor(minutesCourtEmpty)}分以上空いているため、${genderLabel}専用制約を緩和して割り当てます`);
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
    const allMatchesInTournament = allMatches.filter(m =>
      m.campId === candidate.match.campId &&
      m.tournament_type === candidate.match.tournament_type &&
      m.division === candidate.match.division &&
      m.subtitle !== "3位決定戦"
    );

    if (allMatchesInTournament.length > 0) {
      const maxRound = Math.max(...allMatchesInTournament.map(m => m.round));
      const isFinals = candidate.match.round === maxRound;

      if (isFinals) {
        // Get camp court count
        const campDoc = await getDocument<Camp>('camps', court.campId || '');
        const courtCount = campDoc?.court_count || 6;

        // Determine preferred court numbers (center courts)
        let preferredCourtNumbers: number[] = [];

        if (courtCount === 6) {
          // 6面: 1部決勝=3番または4番、2部決勝=その隣
          if (candidate.match.division === 1) {
            preferredCourtNumbers = [3, 4];
          } else if (candidate.match.division === 2) {
            preferredCourtNumbers = [2, 5]; // 1部の隣
          }
        } else if (courtCount === 8) {
          // 8面: 1部決勝=4番または5番、2部決勝=その隣
          if (candidate.match.division === 1) {
            preferredCourtNumbers = [4, 5];
          } else if (candidate.match.division === 2) {
            preferredCourtNumbers = [3, 6]; // 1部の隣
          }
        } else {
          // その他のコート数: 中央付近
          const center = Math.ceil(courtCount / 2);
          if (candidate.match.division === 1) {
            preferredCourtNumbers = [center, center + 1];
          } else if (candidate.match.division === 2) {
            preferredCourtNumbers = [center - 1, center + 2];
          }
        }

        // Check if current court is NOT a preferred court
        if (preferredCourtNumbers.length > 0 && !preferredCourtNumbers.includes(court.number)) {
          // Get all courts to check if preferred is available
          const allCourts = await getAllDocuments<Court>('courts', []);
          const campCourts = court.campId ? allCourts.filter(c => c.campId === court.campId) : allCourts;

          const preferredAvailable = campCourts.some(c =>
            preferredCourtNumbers.includes(c.number) &&
            c.is_active &&
            !c.current_match_id &&
            !c.manually_freed
          );

          if (preferredAvailable) {
            // Skip this court, wait for preferred court
            return null;
          }
        }

        // Finals is being assigned - show notification
        toastInfo(`決勝戦がセンターコートで始まります！第${court.number}コート`);
      }
    }
  }

  try {
    await updateDocument('matches', candidate.match.id, {
      status: 'calling',
      court_id: court.id
    });

    await updateDocument('courts', court.id, {
      current_match_id: candidate.match.id
    });

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

function getPreferredGender(match: Match): 'male' | 'female' | null {
  if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') return 'male';
  if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') return 'female';
  return null;
}

/**
 * 隣接コート（前後各1コート）の部門を取得
 */
function getAdjacentCourtDivisions(
  courtNumber: number,
  courts: Court[],
  matches: Match[]
): number[] {
  const divisions: number[] = [];
  const adjacentNumbers = [courtNumber - 1, courtNumber + 1];

  for (const num of adjacentNumbers) {
    const adjacentCourt = courts.find(c => c.number === num);
    if (adjacentCourt?.current_match_id) {
      const adjacentMatch = matches.find(m => m.id === adjacentCourt.current_match_id);
      if (adjacentMatch?.division) {
        divisions.push(adjacentMatch.division);
      }
    }
  }

  return divisions;
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
