/**
 * matchScoring.ts
 * dispatcher.ts と eta.ts で共通する「試合優先スコア計算」ロジック。
 * フェーズ（予選第1巡目 / 予選中盤 / 決勝T）を自動判定し、最適な優先順位を返す。
 */

import type { Match, Player, Config, Division } from '@/types';
import { getDivisionsInUse } from './divisions';

/** ラウンド係数（ラウンドが若いほど優先）デフォルト値 */
export const ROUND_COEFFICIENT = 100;

/**
 * 決勝T 同一ラウンド内の「ブラケット順ボーナス」の最大点。
 * ラウンド境界（roundWeight=100）を超えないよう 60 に固定。
 * トーナメント規模（8/16/32試合）に依らず最大差を一定にするため、
 * bracket_order を「ラウンド内順位（0〜1）」に正規化して 0〜BRACKET_ORDER_BONUS_MAX に写像する。
 */
export const BRACKET_ORDER_BONUS_MAX = 60;

/**
 * 決勝T 同一ラウンド内の自然な出場順（左上→左下→右上→右下）を表すボーナス。
 * - bracket_order（0始まり, 上ほど小）＋ bracket_order_count（そのラウンドの試合数）を使い、
 *   先頭=+BRACKET_ORDER_BONUS_MAX、末尾=+0 に正規化。規模に依らず最大差は常に一定。
 * - bracket_order 未設定（旧データ）は match_number ベースの微小フォールバック（規模差を作らないよう極小）。
 */
export function calcBracketOrderBonus(match: Match): number {
  const order = (match as Match & { bracket_order?: number }).bracket_order;
  const count = (match as Match & { bracket_order_count?: number }).bracket_order_count;
  if (typeof order !== 'number') {
    // 旧データ用フォールバック: match_number 昇順をごく弱く反映（規模差を作らないため極小・上限あり）
    const mn = match.match_number ?? 0;
    return -Math.min(mn, 100) * 0.05;
  }
  if (typeof count !== 'number' || count <= 1) return BRACKET_ORDER_BONUS_MAX;
  const normalized = 1 - order / (count - 1); // 先頭=1, 末尾=0
  return normalized * BRACKET_ORDER_BONUS_MAX;
}

/** スコア計算フェーズ */
export type ScorePhase = 'preliminary_first' | 'preliminary_mid' | 'knockout';

/** スコア計算に必要なコンテキスト */
export interface ScoreContext {
  now: number;
  allPlayers: Player[];
  preferredDivision: Division;
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

  // 部門ごとの進行率を計算（部門数は可変。以前は1部/2部の2つに決め打ちだった）
  const divisionProgress = getDivisionsInUse(campMatches, []).map(division => {
    const ms = campMatches.filter(m => m.division === division);
    return {
      division,
      progress: ms.length > 0
        ? ms.filter(m => m.status === 'completed').length / ms.length
        : 1,
    };
  });

  // 最も遅れている部を優先し、最速との差をボーナスの大きさに使う
  const slowest = divisionProgress.reduce<{ division: Division; progress: number } | null>(
    (acc, d) => (acc === null || d.progress < acc.progress ? d : acc), null);
  const fastestProgress = divisionProgress.reduce((max, d) => Math.max(max, d.progress), 0);
  const preferredDivision: Division = slowest?.division ?? 1;
  const progressGap = slowest ? fastestProgress - slowest.progress : 0;
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
  if (adjacentCourtDivisions && match.division && adjacentCourtDivisions.length > 0) {
    const sameCount = adjacentCourtDivisions.filter(d => d === match.division).length;
    // 同一部門コートごとに -50 点（旧: -30）
    divisionBonus -= sameCount * 50;
    // 多様性維持: 同一部門がコート全体の50%超なら追加 -100 ペナルティ
    if (sameCount / adjacentCourtDivisions.length > 0.5) {
      divisionBonus -= 100;
    }
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
  if (adjacentCourtDivisions && match.division && adjacentCourtDivisions.length > 0) {
    const sameCount = adjacentCourtDivisions.filter(d => d === match.division).length;
    divisionBonus -= sameCount * 50;
    if (sameCount / adjacentCourtDivisions.length > 0.5) {
      divisionBonus -= 100;
    }
  }

  // AIブースト
  let categoryBoost = 0;
  if (temporaryBoost && match.tournament_type) {
    const boostValue = temporaryBoost[match.tournament_type] as number | undefined;
    const expiresAt = temporaryBoost[`${match.tournament_type}_expires_at`] as number | undefined;
    if (boostValue && expiresAt && now < expiresAt) categoryBoost = boostValue;
  }

  // 同一ラウンド内の自然な出場順（左上→左下→右上→右下）。
  // bracket_order を「ラウンド内順位 0〜1」に正規化し最大 BRACKET_ORDER_BONUS_MAX(=60) のボーナスに。
  // 規模に依らず最大差は一定で、ラウンド境界(100)は超えない（ラウンド優先は維持）。
  const bracketOrderBonus = calcBracketOrderBonus(match);

  return roundScore + waitTime + divisionBonus + categoryBoost + bracketOrderBonus;
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

// ── 進行の均等化（ハード制約） ────────────────────────────────────────────────
//
// これまでグループ間・部門間の均等はスコアの加減点（軟らかい制御）だけで行っていた。
// 待機時間は1分1点で伸び続けるため、時間が経つとペナルティを押し切ってしまい、
// 「Aグループが2試合終わっているのにCグループが未開始」という偏りが起きうる。
// ここでは候補そのものを絞る（出せないものは出さない）ことで、偏りを起こさせない。

/** その試合の進行単位キー（種目_部） */
function typeDivKey(m: Match): string {
  return `${m.tournament_type}_${m.division}`;
}

/**
 * まだ動かせる余地がある試合か。
 *
 * 「終わっていない」だけでなく「選手が決まっている」ことも見る。
 * 決勝トーナメントの空きスロット（予選の順位待ち）は、いま出しようがないので
 * 均等化の基準からは外す。これを数えてしまうと、順位を確定するまで
 * 他の部・他のグループが永久に出せなくなる。
 */
function isLiveMatch(m: Match): boolean {
  return m.status !== 'completed' && !!m.player1_id && !!m.player2_id;
}

/**
 * 予選リーグのグループ均等（ハード制約）。
 *
 * 同じ種目・部の中で、消化数がいちばん少ないグループの試合だけを残す。
 * 「Aが2試合目に入る前に、まだ0試合のCを先に出す」を強制する。
 *
 * 最小消化数は「まだ試合が残っているグループ全部」を見て決める。
 * 候補（いま出せる試合）の中だけで決めると、遅れているグループが
 * たまたま全員試合中・休息中のときに、進んでいるグループが追い越してしまう。
 */
export function filterByGroupBalance(matches: Match[], ctx: ScoreContext, allMatches: Match[]): Match[] {
  const prelim = matches.filter(m => (m as any).phase === 'preliminary' && (m as any).group);
  if (prelim.length === 0) return matches;

  // 種目・部ごとに、まだ試合が残っているグループの最小消化数を求める
  const minDoneByTypeDiv = new Map<string, number>();
  for (const m of allMatches) {
    if ((m as any).phase !== 'preliminary' || !(m as any).group) continue;
    if (!isLiveMatch(m)) continue;
    const tdKey = typeDivKey(m);
    const gKey = `${tdKey}_${(m as any).group}`;
    const done = ctx.groupProgressMap.get(gKey) ?? 0;
    const cur = minDoneByTypeDiv.get(tdKey);
    if (cur === undefined || done < cur) minDoneByTypeDiv.set(tdKey, done);
  }

  return matches.filter(m => {
    if ((m as any).phase !== 'preliminary' || !(m as any).group) return true; // 決勝Tは対象外
    const tdKey = typeDivKey(m);
    const gKey = `${tdKey}_${(m as any).group}`;
    const done = ctx.groupProgressMap.get(gKey) ?? 0;
    return done === (minDoneByTypeDiv.get(tdKey) ?? done);
  });
}

/**
 * 同じ種目の中での部門均等（ハード制約）。
 *
 * 1部だけ終わって3部がほとんど進んでいない、という偏りを防ぐ。
 * 部によって総試合数が違うので、消化「数」ではなく消化「率」で比べる。
 *
 * 最小進捗率は「まだ試合が残っている部全部」を見て決める。
 * 候補の中だけで決めると、遅れている部が全員試合中・休息中のときに
 * 進んでいる部が追い越してしまう。
 */
export function filterByDivisionBalance(matches: Match[], allMatches: Match[]): Match[] {
  // 種目・部ごとの進捗率を出す
  const total = new Map<string, number>();
  const done = new Map<string, number>();
  for (const m of allMatches) {
    if (m.division === undefined) continue;
    const k = typeDivKey(m);
    total.set(k, (total.get(k) ?? 0) + 1);
    if (m.status === 'calling' || m.status === 'playing' || m.status === 'completed') {
      done.set(k, (done.get(k) ?? 0) + 1);
    }
  }
  const ratio = (k: string) => {
    const t = total.get(k) ?? 0;
    return t === 0 ? 1 : (done.get(k) ?? 0) / t;
  };

  // まだ試合が残っている部の中で、種目ごとに最小の進捗率を求める
  const minRatioByType = new Map<string, number>();
  for (const m of allMatches) {
    if (m.division === undefined) continue;
    if (!isLiveMatch(m)) continue;
    const r = ratio(typeDivKey(m));
    const cur = minRatioByType.get(m.tournament_type);
    if (cur === undefined || r < cur) minRatioByType.set(m.tournament_type, r);
  }

  // 率は割り切れないことがあるので、わずかな差は同じとみなす
  const TOLERANCE = 0.001;
  return matches.filter(m => {
    if (m.division === undefined) return true;
    const min = minRatioByType.get(m.tournament_type);
    if (min === undefined) return true;
    return ratio(typeDivKey(m)) <= min + TOLERANCE;
  });
}

/**
 * ラウンド規制（厳しめ）。
 *
 * そのグループの前のラウンドが「全部 completed」になるまで、次のラウンドを出さない。
 * 従来は待機中の試合の最小ラウンドを見ていたため、
 * 前のラウンドがまだコート上で進行中でも次のラウンドが始まってしまっていた。
 */
export function filterByCompletedRound(matches: Match[], allMatches: Match[]): Match[] {
  // グループキーごとに「まだ完了していない最小ラウンド」を求める
  const minUnfinished = new Map<string, number>();
  for (const m of allMatches) {
    if (m.status === 'completed') continue;
    if (!m.player1_id || !m.player2_id) continue; // 選手未確定の枠は数えない
    const key = getGroupKey(m);
    const cur = minUnfinished.get(key);
    if (cur === undefined || m.round < cur) minUnfinished.set(key, m.round);
  }

  return matches.filter(m => {
    const key = getGroupKey(m);
    const limit = minUnfinished.get(key);
    return limit === undefined || m.round <= limit;
  });
}
