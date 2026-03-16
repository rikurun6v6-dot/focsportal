/**
 * matchScoring.ts
 * dispatcher.ts と eta.ts で共通する「試合優先スコア計算」ロジック。
 * 両ファイルはこのモジュールをインポートして使用することで、定数・計算式の乖離をゼロにする。
 */

import type { Match, Player, Config } from '@/types';

/** ラウンド係数（ラウンドが若いほど優先）デフォルト値 */
export const ROUND_COEFFICIENT = 100;

/** スコア計算に必要なコンテキスト */
export interface ScoreContext {
  now: number;
  allPlayers: Player[];
  preferredDivision: 1 | 2;
  divisionBonusBase: number;
  /** キー: `${tournament_type}_${division}_${phase}` → その種目の最大ラウンド数 */
  maxRoundByTypeDiv: Map<string, number>;
  /** キー: `${tournament_type}_${division}_${group}` → 消化済み試合数 */
  groupProgressMap: Map<string, number>;
  temporaryBoost?: Record<string, number>;
  /**
   * 隣接コートの部門リスト（court-specific。ETA計算時は省略可）
   * 含まれる部門にペナルティ -30 を適用
   */
  adjacentCourtDivisions?: number[];
  /** ラウンド優先度係数（config.round_weight、デフォルト100） */
  roundWeight: number;
  /** グループ平準化ペナルティ（config.group_penalty、デフォルト100） */
  groupPenalty: number;
  /** 待機時間係数（config.wait_factor、デフォルト1.0） */
  waitFactor: number;
}

/**
 * 合宿の全試合と選手リストからスコアコンテキストを構築する。
 * dispatcher.ts・eta.ts 双方から呼ばれる。
 */
export function buildScoreContext(
  campMatches: Match[],
  allPlayers: Player[],
  config?: Config | null,
  now?: number
): ScoreContext {
  const _now = now ?? Date.now();

  // 1部/2部の進行率を計算
  const division1Matches = campMatches.filter(m => m.division === 1);
  const division2Matches = campMatches.filter(m => m.division === 2);
  const div1Progress = division1Matches.length > 0
    ? division1Matches.filter(m => m.status === 'completed').length / division1Matches.length : 1;
  const div2Progress = division2Matches.length > 0
    ? division2Matches.filter(m => m.status === 'completed').length / division2Matches.length : 1;

  const preferredDivision: 1 | 2 = div1Progress < div2Progress ? 1 : 2;
  const progressGap = Math.abs(div1Progress - div2Progress);
  const divisionBonusMax = config?.division_bonus_max ?? 50;
  // ギャップに比例したボーナス（最大 division_bonus_max 点）
  const divisionBonusBase = Math.round(divisionBonusMax * Math.min(1, progressGap * (1 / 0.3)));

  // 種目・部・フェーズごとの動的maxRound
  const maxRoundByTypeDiv = new Map<string, number>();
  campMatches.forEach(m => {
    const k = `${m.tournament_type}_${m.division}_${(m as any).phase ?? 'knockout'}`;
    const cur = maxRoundByTypeDiv.get(k) ?? 0;
    if (m.round > cur) maxRoundByTypeDiv.set(k, m.round);
  });

  // 予選グループ進行度マップ（消化済み試合数）
  const groupProgressMap = new Map<string, number>();
  campMatches.forEach(m => {
    if (!(m as any).group) return;
    const gKey = `${m.tournament_type}_${m.division}_${(m as any).group}`;
    if (m.status === 'calling' || m.status === 'playing' || m.status === 'completed') {
      groupProgressMap.set(gKey, (groupProgressMap.get(gKey) || 0) + 1);
    }
  });

  const temporaryBoost = config?.temporary_category_boost as Record<string, number> | undefined;
  const roundWeight = config?.round_weight ?? ROUND_COEFFICIENT;
  const groupPenalty = config?.group_penalty ?? 100;
  const waitFactor = config?.wait_factor ?? 1.0;

  return {
    now: _now,
    allPlayers,
    preferredDivision,
    divisionBonusBase,
    maxRoundByTypeDiv,
    groupProgressMap,
    temporaryBoost,
    roundWeight,
    groupPenalty,
    waitFactor,
  };
}

/**
 * 試合の優先スコアを計算する。
 * dispatcher.ts の candidatesWithScore 計算と完全に同一のロジック。
 * 高いスコアほど先に割り当てられる。
 */
export function calcMatchScore(match: Match, ctx: ScoreContext): number {
  const {
    now, allPlayers, preferredDivision, divisionBonusBase,
    maxRoundByTypeDiv, groupProgressMap, temporaryBoost, adjacentCourtDivisions,
    roundWeight, groupPenalty, waitFactor,
  } = ctx;

  // 待機時間: 選手の last_match_finished_at の最大値、なければ created_at
  const playerIds = [
    match.player1_id, match.player2_id, match.player3_id, match.player4_id,
    (match as any).player5_id, (match as any).player6_id,
  ].filter((id): id is string => !!id);
  const effectiveAvailableMs = playerIds.reduce((maxMs, pid) => {
    const player = allPlayers.find(p => p.id === pid);
    return player?.last_match_finished_at
      ? Math.max(maxMs, player.last_match_finished_at.toMillis()) : maxMs;
  }, 0);
  const waitStartMs = effectiveAvailableMs > 0 ? effectiveAvailableMs : match.created_at.toMillis();
  const rawWaitTime = Math.max(0, (now - waitStartMs) / 60000);
  const waitTime = rawWaitTime * (waitFactor ?? 1.0);

  // ラウンドスコア（動的maxRound・動的係数）
  const phaseKey = `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}`;
  const maxRound = maxRoundByTypeDiv.get(phaseKey) ?? 4;
  const roundScore = (roundWeight ?? ROUND_COEFFICIENT) * (maxRound - match.round + 1);

  // 部のバランスボーナス
  let divisionBonus = match.division === preferredDivision ? divisionBonusBase : 0;
  // 隣接コートに同じ部の試合がある場合ペナルティ（court-specific、ETA時は省略）
  if (adjacentCourtDivisions && match.division && adjacentCourtDivisions.includes(match.division)) {
    divisionBonus -= 30;
  }

  // AIアドバイザーによる一時的なブースト
  let categoryBoost = 0;
  if (temporaryBoost && match.tournament_type) {
    const boostValue = temporaryBoost[match.tournament_type] as number | undefined;
    const expiresAt = temporaryBoost[`${match.tournament_type}_expires_at`] as number | undefined;
    if (boostValue && expiresAt && now < expiresAt) {
      categoryBoost = boostValue;
    }
  }

  // 予選グループ進行度ペナルティ（進んでいるグループを後回し・動的係数）
  let groupBalancePenalty = 0;
  if ((match as any).group) {
    const gKey = `${match.tournament_type}_${match.division}_${(match as any).group}`;
    const groupDone = groupProgressMap.get(gKey) || 0;
    groupBalancePenalty = -(groupPenalty ?? 100) * groupDone;
  }

  // ブラケット順序（match_number が小さい方が優先、係数2 ≒ 2分待機相当）
  const matchOrderScore = -(match.match_number ?? 0) * 2;

  return waitTime + roundScore + divisionBonus + categoryBoost + groupBalancePenalty + matchOrderScore;
}

/**
 * minRoundByGroup のグループキーを生成する（dispatcher.ts と同一）。
 * type + division + phase + group を含めることで、
 * 予選グループ A/B/C が互いをブロックしないようにする。
 */
export function getGroupKey(match: Match): string {
  return `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}_${(match as any).group ?? ''}`;
}
