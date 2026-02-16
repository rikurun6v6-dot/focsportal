import type { Match, Player } from '@/types';

export interface GroupStanding {
  playerId: string;
  partnerId?: string;
  playerName: string;
  partnerName?: string;
  wins: number;
  losses: number;
  gameDiff: number; // 得失ゲーム差
  pointDiff: number; // 得失点差
  rank?: number; // 確定順位（手動設定可能）
}

/**
 * グループ内の成績を集計
 */
export function calculateGroupStandings(
  matches: Match[],
  players: Player[],
  group: string
): GroupStanding[] {
  const groupMatches = matches.filter(m => m.group === group && m.status === 'completed');

  // プレイヤーIDごとの成績を集計
  const standingsMap = new Map<string, GroupStanding>();

  groupMatches.forEach(match => {
    // プレイヤー1（上側）
    const p1Id = match.player1_id;
    const p3Id = match.player3_id;
    const p1Key = p3Id ? `${p1Id}-${p3Id}` : p1Id;

    if (!standingsMap.has(p1Key)) {
      const p1 = players.find(p => p.id === p1Id);
      const p3 = p3Id ? players.find(p => p.id === p3Id) : undefined;
      standingsMap.set(p1Key, {
        playerId: p1Id,
        partnerId: p3Id,
        playerName: p1?.name || '不明',
        partnerName: p3?.name,
        wins: 0,
        losses: 0,
        gameDiff: 0,
        pointDiff: 0,
      });
    }

    // プレイヤー2（下側）
    const p2Id = match.player2_id;
    const p4Id = match.player4_id;
    const p2Key = p4Id ? `${p2Id}-${p4Id}` : p2Id;

    if (!standingsMap.has(p2Key)) {
      const p2 = players.find(p => p.id === p2Id);
      const p4 = p4Id ? players.find(p => p.id === p4Id) : undefined;
      standingsMap.set(p2Key, {
        playerId: p2Id,
        partnerId: p4Id,
        playerName: p2?.name || '不明',
        partnerName: p4?.name,
        wins: 0,
        losses: 0,
        gameDiff: 0,
        pointDiff: 0,
      });
    }

    // 勝敗を記録
    const p1Standing = standingsMap.get(p1Key)!;
    const p2Standing = standingsMap.get(p2Key)!;

    if (match.winner_id === p1Id) {
      p1Standing.wins++;
      p2Standing.losses++;
    } else if (match.winner_id === p2Id) {
      p2Standing.wins++;
      p1Standing.losses++;
    }

    // 得失ゲーム差・得失点差
    if (!match.is_walkover) {
      p1Standing.gameDiff += match.score_p1 - match.score_p2;
      p1Standing.pointDiff += match.score_p1 - match.score_p2;

      p2Standing.gameDiff += match.score_p2 - match.score_p1;
      p2Standing.pointDiff += match.score_p2 - match.score_p1;
    }
  });

  return Array.from(standingsMap.values());
}

/**
 * 直接対決の結果を取得
 * 2チーム間の対戦で勝った方を返す（勝者がいない場合はnull）
 */
function getHeadToHeadWinner(
  standing1: GroupStanding,
  standing2: GroupStanding,
  matches: Match[]
): GroupStanding | null {
  // 2チーム間の対戦を探す
  const headToHead = matches.find(m => {
    const p1Key = m.player3_id ? `${m.player1_id}-${m.player3_id}` : m.player1_id;
    const p2Key = m.player4_id ? `${m.player2_id}-${m.player4_id}` : m.player2_id;

    const s1Key = standing1.partnerId ? `${standing1.playerId}-${standing1.partnerId}` : standing1.playerId;
    const s2Key = standing2.partnerId ? `${standing2.playerId}-${standing2.partnerId}` : standing2.playerId;

    return (
      (p1Key === s1Key && p2Key === s2Key) ||
      (p1Key === s2Key && p2Key === s1Key)
    ) && m.status === 'completed';
  });

  if (!headToHead) return null;

  // 勝者を判定
  const p1Key = headToHead.player3_id ? `${headToHead.player1_id}-${headToHead.player3_id}` : headToHead.player1_id;
  const s1Key = standing1.partnerId ? `${standing1.playerId}-${standing1.partnerId}` : standing1.playerId;

  if (headToHead.winner_id === headToHead.player1_id) {
    return p1Key === s1Key ? standing1 : standing2;
  } else if (headToHead.winner_id === headToHead.player2_id) {
    return p1Key === s1Key ? standing2 : standing1;
  }

  return null;
}

/**
 * 順位決定ロジック
 * 優先順位: 勝敗数 > 直接対決 > 得失ゲーム差 > 得失点差
 */
export function rankStandings(standings: GroupStanding[], matches?: Match[], group?: string): GroupStanding[] {
  const sorted = [...standings].sort((a, b) => {
    // 手動で順位が設定されている場合はそれを優先
    if (a.rank !== undefined && b.rank !== undefined) {
      return a.rank - b.rank;
    }
    if (a.rank !== undefined) return -1;
    if (b.rank !== undefined) return 1;

    // 1. 勝敗数
    if (b.wins !== a.wins) return b.wins - a.wins;

    // 2. 直接対決（Head-to-Head）- 勝敗数が同じ場合のみ
    if (b.wins === a.wins && matches && group) {
      const groupMatches = matches.filter(m => m.group === group && m.status === 'completed');
      const h2hWinner = getHeadToHeadWinner(a, b, groupMatches);

      if (h2hWinner === a) return -1; // aが直接対決で勝っている
      if (h2hWinner === b) return 1;  // bが直接対決で勝っている
      // 直接対決がない、または引き分けの場合は次の基準へ
    }

    // 3. 得失ゲーム差
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;

    // 4. 得失点差
    return b.pointDiff - a.pointDiff;
  });

  // 自動で順位を付与（手動設定がない場合のみ）
  sorted.forEach((standing, index) => {
    if (standing.rank === undefined) {
      standing.rank = index + 1;
    }
  });

  return sorted;
}

/**
 * 同率判定（手動介入が必要か）
 */
export function needsManualIntervention(standings: GroupStanding[]): boolean {
  const ranked = rankStandings(standings);

  // 上位2位の成績が同じ場合、手動介入が必要
  if (ranked.length < 2) return false;

  const first = ranked[0];
  const second = ranked[1];

  return (
    first.wins === second.wins &&
    first.gameDiff === second.gameDiff &&
    first.pointDiff === second.pointDiff
  );
}
