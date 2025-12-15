import type { Player, TournamentType, Division, Gender } from '@/types';

/**
 * ダブルス用のペアをランダムに生成
 */
export function generateRandomPairs(
  players: Player[],
  tournamentType: TournamentType,
  division: Division
): { pairs: [Player, Player][]; errors: string[] } {
  const errors: string[] = [];
  const pairs: [Player, Player][] = [];

  // フィルタリング: レベルとアクティブ状態
  let filteredPlayers = players.filter(p => p.division === division && p.is_active);

  // 性別フィルタリング
  if (tournamentType === 'mens_doubles') {
    filteredPlayers = filteredPlayers.filter(p => p.gender === 'male');
  } else if (tournamentType === 'womens_doubles') {
    filteredPlayers = filteredPlayers.filter(p => p.gender === 'female');
  }

  if (filteredPlayers.length < 2) {
    errors.push('参加者が不足しています（最低2名必要）');
    return { pairs, errors };
  }

  if (filteredPlayers.length % 2 !== 0) {
    errors.push(`参加者数が奇数です（${filteredPlayers.length}名）。1名を除外します。`);
  }

  // シャッフル
  const shuffled = [...filteredPlayers].sort(() => Math.random() - 0.5);

  // ペアを作成
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  return { pairs, errors };
}

/**
 * 混合ダブルス用のペアを生成（男女1名ずつ）
 */
export function generateMixedPairs(
  players: Player[],
  division: Division
): { pairs: [Player, Player][]; errors: string[] } {
  const errors: string[] = [];
  const pairs: [Player, Player][] = [];

  // 男女別にフィルタリング
  const males = players.filter(p => p.division === division && p.is_active && p.gender === 'male');
  const females = players.filter(p => p.division === division && p.is_active && p.gender === 'female');

  if (males.length < 1 || females.length < 1) {
    errors.push('男女それぞれ最低1名必要です');
    return { pairs, errors };
  }

  const minCount = Math.min(males.length, females.length);
  
  if (males.length !== females.length) {
    errors.push(`男女の人数が異なります（男性${males.length}名、女性${females.length}名）。${minCount}組のみ作成します。`);
  }

  // シャッフル
  const shuffledMales = [...males].sort(() => Math.random() - 0.5);
  const shuffledFemales = [...females].sort(() => Math.random() - 0.5);

  // ペアを作成
  for (let i = 0; i < minCount; i++) {
    pairs.push([shuffledMales[i], shuffledFemales[i]]);
  }

  return { pairs, errors };
}

/**
 * トーナメント形式のブラケットを生成
 * 参加ペア数に応じて適切なラウンド数を決定
 */
export function generateTournamentBracket(pairCount: number): {
  rounds: number;
  matchesPerRound: number[];
  totalMatches: number;
} {
  // 2のべき乗に近い数を計算
  const rounds = Math.ceil(Math.log2(pairCount));
  const bracketSize = Math.pow(2, rounds);
  
  const matchesPerRound: number[] = [];
  let remainingPairs = pairCount;
  
  // 各ラウンドの試合数を計算
  for (let r = 0; r < rounds; r++) {
    const matchesInRound = Math.ceil(remainingPairs / 2);
    matchesPerRound.push(matchesInRound);
    remainingPairs = matchesInRound;
  }

  const totalMatches = matchesPerRound.reduce((sum, count) => sum + count, 0);

  return { rounds, matchesPerRound, totalMatches };
}

/**
 * シングルス参加者リストを取得
 */
export function getEligiblePlayersForSingles(
  players: Player[],
  gender: Gender,
  division: Division
): Player[] {
  return players.filter(p => 
    p.gender === gender && 
    p.division === division && 
    p.is_active
  );
}

/**
 * ラウンド名を取得
 */
export function getRoundName(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  
  return `${round}回戦`;
}

/**
 * 試合のポイント数を取得（仕様書に基づく）
 */
export function getMatchPoints(round: number, totalRounds: number): 15 | 21 {
  const fromFinal = totalRounds - round;
  
  // 準決勝と決勝は21点、それ以外は15点
  if (fromFinal <= 1) {
    return 21;
  }
  return 15;
}
