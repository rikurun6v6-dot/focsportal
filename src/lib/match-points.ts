// src/lib/match-points.ts
//
// 試合の点数（15点 / 21点）を、大会の構造から自動で決める。
// 2026 Foc's 夏合宿 大会要項に合わせている。
//
//   男女別ダブルス（女子1部を含む）
//     予選ブロックの総当り        → 15点
//     決勝トーナメント（全ラウンド）→ 21点
//     ※女子1部はトーナメント方式のみなので、全試合21点になる
//
//   男女混合ダブルス / シングルス
//     準決勝より前                → 15点
//     準決勝・決勝・3位決定戦     → 21点
//
// 以前は「4人ブロックだけ11点」という案Bの試算値を使っていたが、
// 要項では予選は人数によらず15点に統一されたため、11点は使わない。

import type { TournamentType } from '@/types';

/** 予選ブロックの総当り・決勝Tの準決勝より前 */
export const POINTS_STANDARD = 15;
/** 決勝トーナメント（男女別ダブルス）／準決勝以降（混合・シングルス） */
export const POINTS_FINALS = 21;

/**
 * 男女別ダブルスか。
 * この2種目だけ「予選15点・決勝T全部21点」という別ルールになる。
 */
function isGenderedDoubles(tournamentType?: TournamentType): boolean {
  return tournamentType === 'mens_doubles' || tournamentType === 'womens_doubles';
}

/**
 * 予選ブロックの点数。要項では人数によらず15点。
 * （引数の groupSize は呼び出し側の意図を残すために受け取るが、点数には影響しない）
 */
export function pointsForGroupMatch(_groupSize?: number): number {
  return POINTS_STANDARD;
}

/**
 * 運営が点数を明示指定した場合はそれを、「自動」の場合は null を返すための型。
 * null = 大会の形から自動で決める。
 */
export type PointsOverride = number | null;

/**
 * 決勝トーナメントの点数。
 *
 * - 男女別ダブルス: 1回戦から決勝まで全部21点
 * - 混合・シングルス: 準決勝（totalRounds - 1）以降が21点、それより前は15点
 *
 * 3位決定戦は決勝と同じラウンド番号で作られるため、どちらの種目でも21点になる。
 */
export function pointsForKnockoutMatch(
  round: number,
  totalRounds: number,
  tournamentType?: TournamentType
): number {
  if (isGenderedDoubles(tournamentType)) return POINTS_FINALS;
  return round >= totalRounds - 1 ? POINTS_FINALS : POINTS_STANDARD;
}

/** 予選ブロック: 明示指定があればそれを、なければ要項どおり15点 */
export function resolveGroupPoints(override: PointsOverride, groupSize?: number): number {
  return override ?? pointsForGroupMatch(groupSize);
}

/** 決勝T: 明示指定があればそれを、なければ種目とラウンドから決める */
export function resolveKnockoutPoints(
  override: PointsOverride,
  round: number,
  totalRounds: number,
  tournamentType?: TournamentType
): number {
  return override ?? pointsForKnockoutMatch(round, totalRounds, tournamentType);
}
