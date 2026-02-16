import type { Player, TournamentType, Division, Gender } from '@/types';

/**
 * ダブルス用のペアをランダムに生成
 */
export function generateRandomPairs(
  players: Player[],
  tournamentType: TournamentType,
  division: Division
): { pairs: ([Player, Player] | [Player, Player, Player])[]; errors: string[] } {
  const errors: string[] = [];
  const pairs: ([Player, Player] | [Player, Player, Player])[] = [];

  // playersは既にフィルタ済みと想定（呼び出し元でフィルタリング済み）
  if (players.length < 2) {
    errors.push(`参加者が不足しています（最低2名必要、現在${players.length}名）`);
    return { pairs, errors };
  }

  // シャッフル
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // 奇数の場合、最後の3人で1組のペアを作成
  const isOdd = shuffled.length % 2 !== 0;
  const pairCount = isOdd ? Math.floor(shuffled.length / 2) - 1 : Math.floor(shuffled.length / 2);

  // 通常のペアを作成
  for (let i = 0; i < pairCount * 2; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }

  // 奇数の場合、最後の3人を1組にする
  if (isOdd && shuffled.length >= 3) {
    const lastThree: [Player, Player, Player] = [
      shuffled[shuffled.length - 3],
      shuffled[shuffled.length - 2],
      shuffled[shuffled.length - 1]
    ];
    pairs.push(lastThree);
    errors.push(`参加者数が奇数（${shuffled.length}名）のため、最後の3名で1組のペアを作成しました。`);
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

  // 男女別にフィルタリング（playersは既にdivisionとis_activeでフィルタ済み）
  const males = players.filter(p => p.gender?.toString().toLowerCase().trim() === 'male');
  const females = players.filter(p => p.gender?.toString().toLowerCase().trim() === 'female');

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
 * 2回戦以降を2のべき乗にするため、シード配置を計算
 */
export function generateTournamentBracket(pairCount: number): {
  rounds: number;
  matchesPerRound: number[];
  totalMatches: number;
  round1Matches: number;
  seedCount: number;
  round2Size: number;
} {
  if (pairCount === 1) {
    return { rounds: 0, matchesPerRound: [], totalMatches: 0, round1Matches: 0, seedCount: 1, round2Size: 0 };
  }

  // M = 2^k where M < pairCount (2回戦のサイズ)
  const round2Size = Math.pow(2, Math.floor(Math.log2(pairCount)));

  // 1回戦の試合数 = N - M
  const round1Matches = pairCount - round2Size;

  // シード数 = 2M - N
  const seedCount = 2 * round2Size - pairCount;

  // 2回戦以降のラウンド数
  const rounds = round1Matches > 0 ? Math.ceil(Math.log2(round2Size)) + 1 : Math.ceil(Math.log2(round2Size));

  const matchesPerRound: number[] = [];

  if (round1Matches > 0) {
    matchesPerRound.push(round1Matches);
  }

  let remainingPairs = round2Size;
  for (let r = 0; r < Math.ceil(Math.log2(round2Size)); r++) {
    matchesPerRound.push(Math.floor(remainingPairs / 2));
    remainingPairs = Math.floor(remainingPairs / 2);
  }

  const totalMatches = matchesPerRound.reduce((sum, count) => sum + count, 0);

  return { rounds, matchesPerRound, totalMatches, round1Matches, seedCount, round2Size };
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
    p.gender?.toString().toLowerCase().trim() === gender &&
    p.division === division &&
    p.is_active
  );
}

/**
 * シングルス用の対戦カードを生成（1対1）
 */
export function generateSinglesMatches(
  players: Player[],
  tournamentType: TournamentType,
  division: Division
): { players: Player[]; errors: string[] } {
  const errors: string[] = [];

  if (players.length < 2) {
    errors.push(`参加者が不足しています（最低2名必要、現在${players.length}名）`);
    return { players: [], errors };
  }

  // シャッフル
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  return { players: shuffled, errors };
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
