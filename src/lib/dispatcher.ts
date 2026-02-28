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
  
  for (const court of emptyCourts) {
    const assigned = await dispatchToEmptyCourt(court, waitingMatches, defaultRestMinutes);
    if (assigned) {
      dispatchedCount++;
      const idx = waitingMatches.findIndex(m => m.id === assigned.id);
      if (idx >= 0) waitingMatches.splice(idx, 1);
    }
  }
  
  return dispatchedCount;
}

export async function dispatchToEmptyCourt(
  court: Court,
  waitingMatches: Match[],
  defaultRestMinutes: number = 10
): Promise<Match | null> {
  const now = Date.now();

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
  });

  // 1部と2部の進行状況を計算
  const division1Matches = allMatches.filter(m => m.division === 1);
  const division2Matches = allMatches.filter(m => m.division === 2);

  const division1Completed = division1Matches.filter(m => m.status === 'completed').length;
  const division2Completed = division2Matches.filter(m => m.status === 'completed').length;

  const division1Total = division1Matches.length;
  const division2Total = division2Matches.length;

  // 進行率を計算（完了試合数 / 総試合数）
  const division1Progress = division1Total > 0 ? division1Completed / division1Total : 1;
  const division2Progress = division2Total > 0 ? division2Completed / division2Total : 1;

  // 進行が遅れている方（進行率が低い方）を優先
  // ⚠️ IMPORTANT: 同率の場合は2部を優先（1部優先バイアスを防止し、完全並列化を実現）
  const preferredDivision = division1Progress < division2Progress ? 1 : 2;

  // Load config for finals wait mode
  const config = await getDocument<Config>('config', 'system');
  const finalsWaitMode = config?.finals_wait_mode || {};

  // 休息時間チェック用の設定を取得
  // Use the defaultRestMinutes parameter passed from admin page
  const allPlayers = await getAllDocuments<Player>('players');

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
    if (busyPlayerIds.has(match.player1_id) || busyPlayerIds.has(match.player2_id)) return false;
    if (match.player3_id && match.player3_id !== '' && busyPlayerIds.has(match.player3_id)) return false;
    if (match.player4_id && match.player4_id !== '' && busyPlayerIds.has(match.player4_id)) return false;

    // available_at チェック: 試合が休息時間を完了しているか確認
    if (match.available_at && now < match.available_at.toMillis()) {
      return false; // Skip this match, rest time not complete
    }

    // ✅ 予約があるコートで時間が限られている場合、予約試合以外は除外
    if (nextReservedMatch && !canUseForShortMatch && match.id !== nextReservedMatch.id) {
      return false;
    }
    // 休息時間チェック
    const playerIds = [match.player1_id, match.player2_id, match.player3_id, match.player4_id].filter(id => id);
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

  // ✅ ラウンド順序の厳守: 同じtournament_type+divisionの中で最小ラウンドの試合のみを対象にする
  // これにより、n回戦の試合があるのにn+1回戦が割り当てられる問題を防ぐ
  const minRoundByGroup = new Map<string, number>();
  for (const match of validMatches) {
    const groupKey = `${match.tournament_type}_${match.division}`;
    const existing = minRoundByGroup.get(groupKey);
    if (existing === undefined || match.round < existing) {
      minRoundByGroup.set(groupKey, match.round);
    }
  }
  const roundFilteredMatches = validMatches.filter(match => {
    const groupKey = `${match.tournament_type}_${match.division}`;
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
    const waitTime = (now - match.created_at.toMillis()) / (1000 * 60);
    const roundScore = ROUND_COEFFICIENT * (getMaxRound(match.tournament_type) - match.round + 1);

    // 部のバランスボーナス（少ない方の部に+150分相当の優先度）
    // ⚠️ 大きな値（150）により、進行の遅い部が確実に優先され、1部・2部が公平に並列進行する
    let divisionBonus = match.division === preferredDivision ? 150 : 0;

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

    const priorityScore = waitTime + roundScore + divisionBonus + categoryBoost;

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

  // コートに性別制約がある場合は、フォールバックを使用しない（性別制約を厳守）
  let candidate;
  if (court.preferred_gender === 'male' || court.preferred_gender === 'female') {
    // 男子/女子専用コート: 対応する性別の試合または混合のみ
    candidate = preferred.length > 0 ? preferred[0] : (neutral.length > 0 ? neutral[0] : null);
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

function getMaxRound(tournamentType: string): number {
  return 4;
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
