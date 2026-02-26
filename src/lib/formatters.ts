/**
 * ラウンド名称を動的に変換
 * @param currentRound 現在のラウンド番号
 * @param totalRounds トーナメント全体のラウンド数
 * @returns 日本語のラウンド名（「決勝」「準決勝」等）
 */
export function getRoundName(currentRound: number, totalRounds: number): string {
  if (currentRound === totalRounds) {
    return '決勝';
  }
  if (currentRound === totalRounds - 1) {
    return '準決勝';
  }
  if (currentRound === totalRounds - 2) {
    return '準々決勝';
  }
  return `${currentRound}回戦`;
}

/**
 * 試合から最大ラウンド数を計算（既存ロジックを移植）
 */
export function getMaxRound(tournamentType: string): number {
  // 種目ごとのデフォルト値（実際はFirestoreから取得すべき）
  const defaults: Record<string, number> = {
    mens_singles: 5,
    womens_singles: 5,
    mens_doubles: 5,
    womens_doubles: 5,
    mixed_doubles: 5,
    team_battle: 3
  };
  return defaults[tournamentType] || 5;
}
