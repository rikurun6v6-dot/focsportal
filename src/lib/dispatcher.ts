import type { Match, Court, Config, Camp, Player, TournamentType } from '@/types';
import { getAllDocuments, getDocument, updateDocument } from './firestore-helpers';
import { toastInfo } from './toast';
import { Timestamp } from 'firebase/firestore';
import { buildScoreContext, calcMatchScore, getGroupKey } from './matchScoring';

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

  // 休息時間チェック用の設定を取得
  // Use the defaultRestMinutes parameter passed from admin page
  const allPlayers = await getAllDocuments<Player>('players');

  // 合宿の全試合（スコアコンテキスト構築用）
  const campMatches = court.campId ? allMatches.filter(m => m.campId === court.campId) : allMatches;

  // 共通スコアコンテキストを構築（matchScoring.ts）
  const scoreCtx = buildScoreContext(campMatches, allPlayers, config);

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
  const roundFilteredMatches = validMatches.filter(match => {
    const groupKey = getGroupKey(match);
    const minRound = minRoundByGroup.get(groupKey);
    return minRound === undefined || match.round === minRound;
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
    // 共通スコア関数（matchScoring.ts）でスコアを計算
    // court-specificな調整（adjacentCourtDivisions）を注入
    const baseScore = calcMatchScore(match, { ...scoreCtx, adjacentCourtDivisions });

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

export type SkipReason = 'disabled' | 'busy' | 'resting' | 'round_locked' | 'gender_mismatch';

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
  const activeMatches = allMatches.filter(m => m.status === 'calling' || m.status === 'playing');

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

  // スコアコンテキスト
  const scoreCtx = buildScoreContext(campMatches, allPlayers, config ?? undefined);

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

    // 少なくとも1つ理由がある場合のみ診断リストへ
    if (reasons.length > 0) {
      let score: number | undefined;
      try { score = calcMatchScore(match, scoreCtx); } catch { /* ignore */ }
      diagnostics.push({ match, reasons, score });
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
