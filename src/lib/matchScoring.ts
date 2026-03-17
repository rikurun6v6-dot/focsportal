/**
 * matchScoring.ts
 * dispatcher.ts と eta.ts で共通する「試合優先スコア計算」ロジック。
 * フェーズ（予選第1巡目 / 予選中盤 / 決勝T）を自動判定し、最適な優先順位を返す。
 */

import type { Match, Player, Config } from '@/types';

/** ラウンド係数（ラウンドが若いほど優先）デフォルト値 */
export const ROUND_COEFFICIENT = 100;

/** スコア計算フェーズ */
export type ScorePhase = 'preliminary_first' | 'preliminary_mid' | 'knockout';

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
  /** キー: `${tournament_type}_${division}_${group}` → グループの総試合数 */
  groupTotalMatchesMap: Map<string, number>;
  /** キー: `${tournament_type}_${division}` → 全グループの平均消化数 */
  groupAvgProgressByTypeDiv: Map<string, number>;
  temporaryBoost?: Record<string, number>;
  /**
   * 隣接コートの部門リスト（court-specific。ETA計算時は省略可）
   * 含まれる部門にペナルティ -30 を適用
   */
  adjacentCourtDivisions?: number[];
  /** ラウンド優先度係数（config.round_weight、デフォルト100） */
  roundWeight: number;
  /** グループ平準化係数（config.group_penalty、デフォルト100） */
  groupPenalty: number;
  /** 待機時間係数（config.wait_factor、デフォルト1.0） */
  waitFactor: number;
  /**
   * 連戦判定の閾値（分）: この時間以内に試合を終えた選手がいる場合、Phase B で -200点。
   * デフォルト = defaultRestMinutes * 2。
   */
  recentMatchMinutes: number;
}

/**
 * 合宿の全試合と選手リストからスコアコンテキストを構築する。
 * dispatcher.ts・eta.ts 双方から呼ばれる。
 */
export function buildScoreContext(
  campMatches: Match[],
  allPlayers: Player[],
  config?: Config | null,
  now?: number,
  defaultRestMinutes?: number,
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

  // 予選グループ進行度マップ（消化済み試合数）と総試合数マップ
  const groupProgressMap = new Map<string, number>();
  const groupTotalMatchesMap = new Map<string, number>();
  // type_div → グループラベルの集合（平均計算用）
  const typeDivGroupsMap = new Map<string, Set<string>>();

  campMatches.forEach(m => {
    const grp = (m as any).group;
    if (!grp) return;
    const gKey = `${m.tournament_type}_${m.division}_${grp}`;
    const tdKey = `${m.tournament_type}_${m.division}`;

    // 総試合数
    groupTotalMatchesMap.set(gKey, (groupTotalMatchesMap.get(gKey) || 0) + 1);

    // type_div → グループ集合
    if (!typeDivGroupsMap.has(tdKey)) typeDivGroupsMap.set(tdKey, new Set());
    typeDivGroupsMap.get(tdKey)!.add(grp);

    // 消化済み試合数（calling/playing/completed）
    if (m.status === 'calling' || m.status === 'playing' || m.status === 'completed') {
      groupProgressMap.set(gKey, (groupProgressMap.get(gKey) || 0) + 1);
    }
  });

  // type_divごとの全グループ平均消化数
  const groupAvgProgressByTypeDiv = new Map<string, number>();
  typeDivGroupsMap.forEach((groups, tdKey) => {
    if (groups.size === 0) return;
    let totalDone = 0;
    groups.forEach(grp => {
      const gKey = `${tdKey}_${grp}`;
      totalDone += groupProgressMap.get(gKey) || 0;
    });
    groupAvgProgressByTypeDiv.set(tdKey, totalDone / groups.size);
  });

  const temporaryBoost = config?.temporary_category_boost as Record<string, number> | undefined;
  const roundWeight = config?.round_weight ?? ROUND_COEFFICIENT;
  const groupPenalty = config?.group_penalty ?? 100;
  const waitFactor = config?.wait_factor ?? 1.0;
  // 連戦判定: defaultRestMinutes の2倍以内に試合を終えた選手を「連戦」扱い
  const recentMatchMinutes = (defaultRestMinutes ?? 10) * 2;

  return {
    now: _now,
    allPlayers,
    preferredDivision,
    divisionBonusBase,
    maxRoundByTypeDiv,
    groupProgressMap,
    groupTotalMatchesMap,
    groupAvgProgressByTypeDiv,
    temporaryBoost,
    roundWeight,
    groupPenalty,
    waitFactor,
    recentMatchMinutes,
  };
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

/** 試合の選手IDを配列で返す（null/undefined を除外） */
export function getMatchPlayerIds(match: Match): string[] {
  return [
    match.player1_id, match.player2_id, match.player3_id, match.player4_id,
    (match as any).player5_id, (match as any).player6_id,
  ].filter((id): id is string => !!id);
}

/**
 * いずれかの選手が `recentMinutes` 以内に試合を終えているか判定する。
 * Phase B の連戦回避 (-200点) 判定に使用。
 */
export function hasRecentPlayer(
  match: Match,
  allPlayers: Player[],
  now: number,
  recentMinutes: number,
): boolean {
  return getMatchPlayerIds(match).some(pid => {
    const player = allPlayers.find(p => p.id === pid);
    if (!player?.last_match_finished_at) return false;
    const elapsed = (now - player.last_match_finished_at.toMillis()) / 60000;
    return elapsed < recentMinutes;
  });
}

/**
 * 試合のスコアフェーズを判定する。
 *
 * - preliminary_first: 予選グループ第1巡目（round===1 かつグループ消化0）
 * - preliminary_mid:   予選グループ中盤以降
 * - knockout:          決勝トーナメント（またはグループなし種目）
 */
export function detectPhase(match: Match, ctx: ScoreContext): ScorePhase {
  const group = (match as any).group as string | undefined;
  const phase = (match as any).phase as string | undefined;

  // グループなし・knockout フェーズ → 決勝T
  if (!group && phase !== 'preliminary') return 'knockout';

  // 予選グループ第1巡目: round === 1 かつそのグループの消化数が 0
  if (match.round === 1 && group) {
    const gKey = `${match.tournament_type}_${match.division}_${group}`;
    const groupDone = ctx.groupProgressMap.get(gKey) ?? 0;
    if (groupDone === 0) return 'preliminary_first';
  }

  return 'preliminary_mid';
}

// ── フェーズ別スコア計算 ──────────────────────────────────────────────────────

/** Phase B: 予選中盤スコア */
function calcPreliminaryMidScore(match: Match, ctx: ScoreContext): number {
  const {
    now, allPlayers, preferredDivision, divisionBonusBase,
    groupProgressMap, groupAvgProgressByTypeDiv, groupPenalty,
    adjacentCourtDivisions, waitFactor, temporaryBoost, recentMatchMinutes,
  } = ctx;

  // 1. 待機時間: 1分 = 1点
  const effectiveAvailableMs = getMatchPlayerIds(match).reduce((maxMs, pid) => {
    const player = allPlayers.find(p => p.id === pid);
    return player?.last_match_finished_at
      ? Math.max(maxMs, player.last_match_finished_at.toMillis()) : maxMs;
  }, 0);
  const waitStartMs = effectiveAvailableMs > 0 ? effectiveAvailableMs : match.created_at.toMillis();
  const waitTime = Math.max(0, (now - waitStartMs) / 60000) * (waitFactor ?? 1.0);

  // 2. 部門バランス: 最大 divisionBonusBase 点
  let divisionBonus = match.division === preferredDivision ? divisionBonusBase : 0;
  if (adjacentCourtDivisions && match.division && adjacentCourtDivisions.includes(match.division)) {
    divisionBonus -= 30;
  }

  // 3. グループ平準化: 消化数が多いグループに -groupPenalty 点/試合
  let groupScore = 0;
  const group = (match as any).group as string | undefined;
  if (group) {
    const gKey = `${match.tournament_type}_${match.division}_${group}`;
    const tdKey = `${match.tournament_type}_${match.division}`;
    const groupDone = groupProgressMap.get(gKey) ?? 0;
    const avgProgress = groupAvgProgressByTypeDiv.get(tdKey) ?? 0;
    groupScore = (avgProgress - groupDone) * (groupPenalty ?? 100);
  }

  // 4. 連戦回避: 直前まで試合をしていた選手がいれば -200点
  const consecutivePenalty = hasRecentPlayer(match, allPlayers, now, recentMatchMinutes) ? -200 : 0;

  // AIブースト
  let categoryBoost = 0;
  if (temporaryBoost && match.tournament_type) {
    const boostValue = temporaryBoost[match.tournament_type] as number | undefined;
    const expiresAt = temporaryBoost[`${match.tournament_type}_expires_at`] as number | undefined;
    if (boostValue && expiresAt && now < expiresAt) categoryBoost = boostValue;
  }

  return waitTime + divisionBonus + groupScore + consecutivePenalty + categoryBoost;
}

/** Phase C: 決勝トーナメントスコア */
function calcKnockoutScore(match: Match, ctx: ScoreContext): number {
  const {
    now, allPlayers, preferredDivision, divisionBonusBase,
    maxRoundByTypeDiv, adjacentCourtDivisions, roundWeight,
    temporaryBoost, waitFactor,
  } = ctx;

  // ラウンドスコア: (MAX_ROUND - round + 1) * roundWeight — 水平進行（下位ラウンド優先）
  const phaseKey = `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}`;
  const maxRound = maxRoundByTypeDiv.get(phaseKey) ?? 4;
  const roundScore = (roundWeight ?? ROUND_COEFFICIENT) * (maxRound - match.round + 1);

  // 待機時間
  const effectiveAvailableMs = getMatchPlayerIds(match).reduce((maxMs, pid) => {
    const player = allPlayers.find(p => p.id === pid);
    return player?.last_match_finished_at
      ? Math.max(maxMs, player.last_match_finished_at.toMillis()) : maxMs;
  }, 0);
  const waitStartMs = effectiveAvailableMs > 0 ? effectiveAvailableMs : match.created_at.toMillis();
  const waitTime = Math.max(0, (now - waitStartMs) / 60000) * (waitFactor ?? 1.0);

  // 部門バランス
  let divisionBonus = match.division === preferredDivision ? divisionBonusBase : 0;
  if (adjacentCourtDivisions && match.division && adjacentCourtDivisions.includes(match.division)) {
    divisionBonus -= 30;
  }

  // AIブースト
  let categoryBoost = 0;
  if (temporaryBoost && match.tournament_type) {
    const boostValue = temporaryBoost[match.tournament_type] as number | undefined;
    const expiresAt = temporaryBoost[`${match.tournament_type}_expires_at`] as number | undefined;
    if (boostValue && expiresAt && now < expiresAt) categoryBoost = boostValue;
  }

  // 同一ラウンド内の順序タイブレーカー（match_number が小さい方が優先）
  const matchOrderTiebreak = -(match.match_number ?? 0);

  return roundScore + waitTime + divisionBonus + categoryBoost + matchOrderTiebreak;
}

/**
 * 試合の優先スコアを計算する。
 * フェーズに応じて自動的に計算式を切り替える。
 * 高いスコアほど先に割り当てられる。
 *
 * Phase A (予選第1巡目):  (1000 - match_number) * 10  — リスト順絶対優先
 * Phase B (予選中盤以降): waitTime + divisionBonus + groupScore - consecutivePenalty
 * Phase C (決勝T):        (MAX_ROUND - round + 1) * 100  — 水平進行
 */
export function calcMatchScore(match: Match, ctx: ScoreContext): number {
  const phase = detectPhase(match, ctx);

  if (phase === 'preliminary_first') {
    // Phase A: リスト順を絶対優先（match_number が小さいほど高スコア）
    return (1000 - (match.match_number ?? 0)) * 10;
  }

  if (phase === 'preliminary_mid') {
    return calcPreliminaryMidScore(match, ctx);
  }

  // Phase C: knockout
  return calcKnockoutScore(match, ctx);
}

/**
 * minRoundByGroup のグループキーを生成する（dispatcher.ts と同一）。
 * type + division + phase + group を含めることで、
 * 予選グループ A/B/C が互いをブロックしないようにする。
 */
export function getGroupKey(match: Match): string {
  return `${match.tournament_type}_${match.division}_${(match as any).phase ?? 'knockout'}_${(match as any).group ?? ''}`;
}
