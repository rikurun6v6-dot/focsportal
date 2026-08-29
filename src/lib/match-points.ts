// src/lib/match-points.ts
//
// 試合の点数（11点 / 15点 / 21点）を、大会の構造から自動で決める。
//
// 以前は「基本点数」「ラウンド別点数」を運営が画面から登録していたが、
// ブロックの人数によって点数を変える運用（4人ブロックだけ11点）が表現できず、
// 登録の手間も大きかったため、構造から導出する方式に変更した。
//
//   4人ブロックの総当り        → 11点
//   3人ブロックの総当り        → 15点
//   決勝T 準々決勝より前       → 15点
//   準決勝・決勝・3位決定戦    → 21点

/** 4ペア以上のブロックの総当り戦 */
export const POINTS_BLOCK_LARGE = 11;
/** 3ペアのブロックの総当り戦・決勝トーナメントの準々決勝より前 */
export const POINTS_STANDARD = 15;
/** 準決勝・決勝・3位決定戦 */
export const POINTS_FINALS = 21;

/** ブロックが4ペア以上なら11点、それ未満なら15点 */
export function pointsForGroupMatch(groupSize: number): number {
  return groupSize >= 4 ? POINTS_BLOCK_LARGE : POINTS_STANDARD;
}

/**
 * 決勝トーナメントの点数。
 * 準決勝（totalRounds - 1）以降は21点、それより前は15点。
 * 3位決定戦は決勝と同じラウンド番号で作られるため、同じく21点になる。
 */
export function pointsForKnockoutMatch(round: number, totalRounds: number): number {
  return round >= totalRounds - 1 ? POINTS_FINALS : POINTS_STANDARD;
}
