import type { Player, TournamentType, Division, Match, TeamMatchConfig, TeamGame, TeamEncounter, TeamRankEntry } from '@/types';

export interface TournamentSlot {
  slotId: string;
  roundNumber: number;
  matchNumber: number;
  player1?: Player;
  player2?: Player;
  player3?: Player;
  player4?: Player;
  player5?: Player;
  player6?: Player;
  isBye: boolean;
  nextMatchId?: string;
}

export interface TournamentBracket {
  totalSlots: number;
  totalRounds: number;
  slots: TournamentSlot[];
  participantCount: number;
}

export function calculateBracketSize(participantCount: number): number {
  if (participantCount <= 0) return 0;
  if (participantCount === 1) return 1;
  let size = 2;
  while (size < participantCount) size *= 2;
  return size;
}

export function calculateRounds(bracketSize: number): number {
  if (bracketSize <= 1) return 0;
  return Math.ceil(Math.log2(bracketSize));
}

export function generateMatchId(round: number, matchNumber: number): string {
  return `${round}_${matchNumber}`;
}

export function getFinalMatchId(
  campId: string, tournamentType: string, division: number,
  round: number, matchNumber: number
): string {
  return `${campId}_${tournamentType}_${division}_${round}_${matchNumber}`;
}

export function calculateNextMatchId(round: number, matchNumber: number, totalRounds: number): string | undefined {
  if (round >= totalRounds) return undefined;
  return generateMatchId(round + 1, Math.ceil(matchNumber / 2));
}

function generateSeededOrder(bracketSize: number): number[] {
  if (bracketSize <= 1) return [1];
  if (bracketSize === 2) return [1, 2];
  // 標準トーナメント配置: 第1シード最上段、第2シード最下段
  // 再帰的に構築: 上半分の各ペアに対して対側シードを割り当てる
  const half = generateSeededOrder(bracketSize / 2);
  return half.flatMap((seed, i) => {
    const complement = bracketSize + 1 - seed;
    return i % 2 === 0 ? [seed, complement] : [complement, seed];
  });
}

export function generatePowerOf2Bracket(
  participants: (Player | [Player, Player] | [Player, Player, Player])[],
  isDoubles: boolean = false
): TournamentBracket {
  const participantCount = participants.length;
  const bracketSize = calculateBracketSize(participantCount);
  const totalRounds = calculateRounds(bracketSize);
  const seededOrder = generateSeededOrder(bracketSize);
  const participantMap = new Map<number, Player | [Player, Player] | [Player, Player, Player]>();
  for (let i = 0; i < participantCount; i++) participantMap.set(i + 1, participants[i]);
  const slots: TournamentSlot[] = [];
  const round1Matches = bracketSize / 2;
  for (let matchNum = 1; matchNum <= round1Matches; matchNum++) {
    const slot: TournamentSlot = {
      slotId: generateMatchId(1, matchNum),
      roundNumber: 1, matchNumber: matchNum, isBye: false,
      nextMatchId: calculateNextMatchId(1, matchNum, totalRounds),
    };
    const seed1 = seededOrder[(matchNum - 1) * 2];
    const seed2 = seededOrder[(matchNum - 1) * 2 + 1];
    if (seed1 <= participantCount && participantMap.has(seed1)) {
      const p1 = participantMap.get(seed1)!;
      if (isDoubles && Array.isArray(p1)) {
        slot.player1 = p1[0]; slot.player3 = p1[1];
        if (p1.length === 3) slot.player5 = p1[2];
      } else if (!Array.isArray(p1)) slot.player1 = p1;
    }
    if (seed2 <= participantCount && participantMap.has(seed2)) {
      const p2 = participantMap.get(seed2)!;
      if (isDoubles && Array.isArray(p2)) {
        slot.player2 = p2[0]; slot.player4 = p2[1];
        if (p2.length === 3) slot.player6 = p2[2];
      } else if (!Array.isArray(p2)) slot.player2 = p2;
    }
    if (!slot.player1 || !slot.player2) slot.isBye = true;
    slots.push(slot);
  }
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
      slots.push({
        slotId: generateMatchId(round, matchNum),
        roundNumber: round, matchNumber: matchNum, isBye: false,
        nextMatchId: calculateNextMatchId(round, matchNum, totalRounds),
      });
    }
  }
  return { totalSlots: bracketSize, totalRounds, slots, participantCount };
}

export function getRoundNameByNumber(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return '決勝';
  if (fromFinal === 1) return '準決勝';
  if (fromFinal === 2) return '準々決勝';
  return `${round}回戦`;
}

export function getUnifiedRoundName(
  match: { round: number; phase?: string; tournament_type?: string; group?: string; match_number?: number },
  totalRounds?: number
): string {
  if (match.phase === 'preliminary') {
    const groupPart = match.group ? ` Group ${match.group}` : '';
    const matchPart = match.match_number ? ` 第${match.match_number}試合` : '';
    return `予選リーグ${groupPart}${matchPart}`;
  }
  if (match.tournament_type === 'team_battle' && match.match_number) {
    return `団体戦 第${match.match_number}試合`;
  }
  if (totalRounds !== undefined) return getRoundNameByNumber(match.round, totalRounds);
  return `第${match.round}ラウンド`;
}

export function getTournamentTypeName(type: string): string {
  const names: Record<string, string> = {
    mens_singles: '男子シングルス',
    womens_singles: '女子シングルス',
    mens_doubles: '男子ダブルス',
    womens_doubles: '女子ダブルス',
    mixed_doubles: '混合ダブルス',
    team_battle: '団体戦',
    MD: '男子ダブルス',
    WD: '女子ダブルス',
    XD: '混合ダブルス',
    MS: '男子シングルス',
    WS: '女子シングルス',
  };
  return names[type] || type;
}

export function groupSlotsByRound(slots: TournamentSlot[]): Record<number, TournamentSlot[]> {
  const groups: Record<number, TournamentSlot[]> = {};
  slots.forEach(slot => {
    if (!groups[slot.roundNumber]) groups[slot.roundNumber] = [];
    groups[slot.roundNumber].push(slot);
  });
  return groups;
}

// ============================================================
// 混合ダブルス自動ペアリング
// ============================================================

export function pairPlayersForDoubles(
  players: Player[],
  preferMixed: boolean = true
): ([Player, Player] | [Player, Player, Player])[] {
  if (!preferMixed) {
    const pairs: ([Player, Player] | [Player, Player, Player])[] = [];
    for (let i = 0; i + 1 < players.length; i += 2) pairs.push([players[i], players[i + 1]]);
    // 1名余り → 最後のペアに3人目として追加
    if (players.length % 2 === 1 && pairs.length > 0) {
      const target = pairs[pairs.length - 1] as [Player, Player];
      pairs[pairs.length - 1] = [target[0], target[1], players[players.length - 1]];
    }
    return pairs;
  }
  const males: Player[] = players.filter(p => p.gender === 'male');
  const females: Player[] = players.filter(p => p.gender === 'female');
  const unknowns: Player[] = players.filter(p => p.gender !== 'male' && p.gender !== 'female');
  unknowns.forEach(p => males.length <= females.length ? males.push(p) : females.push(p));
  const pairs: ([Player, Player] | [Player, Player, Player])[] = [];
  const minCount = Math.min(males.length, females.length);
  for (let i = 0; i < minCount; i++) pairs.push([males[i], females[i]]);
  const lm = males.slice(minCount);
  const lf = females.slice(minCount);
  for (let i = 0; i + 1 < lm.length; i += 2) pairs.push([lm[i], lm[i + 1]]);
  for (let i = 0; i + 1 < lf.length; i += 2) pairs.push([lf[i], lf[i + 1]]);
  // 1名余り（奇数の余り）→ 最後のペアに3人目として追加
  const soloM = lm.length % 2 === 1 ? lm[lm.length - 1] : null;
  const soloF = lf.length % 2 === 1 ? lf[lf.length - 1] : null;
  const solo = soloM || soloF;
  if (solo && pairs.length > 0) {
    const target = pairs[pairs.length - 1] as [Player, Player];
    pairs[pairs.length - 1] = [target[0], target[1], solo];
  }
  return pairs;
}

// ============================================================
// 予選グループ順位自動集計
// ============================================================

export interface RankEntry {
  teamId: string;
  wins: number;
  losses: number;
  scoreDiff: number;
}

export function rankGroup(matches: Match[]): RankEntry[] {
  const completed = matches.filter(
    m => m.status === 'completed' && m.player1_id !== 'BYE' && m.player2_id !== 'BYE'
  );
  const map = new Map<string, RankEntry>();
  const getOrCreate = (id: string): RankEntry => {
    if (!map.has(id)) map.set(id, { teamId: id, wins: 0, losses: 0, scoreDiff: 0 });
    return map.get(id)!;
  };
  for (const m of completed) {
    const e1 = getOrCreate(m.player1_id);
    const e2 = getOrCreate(m.player2_id);
    if (m.winner_id === m.player1_id) { e1.wins++; e2.losses++; }
    else if (m.winner_id === m.player2_id) { e2.wins++; e1.losses++; }
    const s1 = typeof m.score_p1 === 'number' ? m.score_p1 : 0;
    const s2 = typeof m.score_p2 === 'number' ? m.score_p2 : 0;
    e1.scoreDiff += s1 - s2;
    e2.scoreDiff += s2 - s1;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.scoreDiff - a.scoreDiff;
  });
}

// ============================================================
// 決勝トーナメント 試合進行管理
// ============================================================

export function advanceWinnerToNextRound(matches: Match[], completedMatchId: string): Match[] {
  const completed = matches.find(m => m.id === completedMatchId);
  if (!completed || !completed.winner_id) return matches;
  const winnerId = completed.winner_id;
  const isWinner1 = winnerId === completed.player1_id;
  const placeholder = `winner-of-${completedMatchId}`;
  return matches.map(m => {
    const updated = { ...m };
    let changed = false;
    if (m.player1_id === placeholder) {
      updated.player1_id = winnerId;
      updated.player3_id = isWinner1 ? completed.player3_id : completed.player4_id;
      updated.player5_id = isWinner1 ? completed.player5_id : completed.player6_id;
      changed = true;
    }
    if (m.player2_id === placeholder) {
      updated.player2_id = winnerId;
      updated.player4_id = isWinner1 ? completed.player3_id : completed.player4_id;
      updated.player6_id = isWinner1 ? completed.player5_id : completed.player6_id;
      changed = true;
    }
    return changed ? updated : m;
  });
}

// ============================================================
// 第3位決定戦自動生成
// ============================================================

export function generateBronzeMatch(bracketMatches: Match[]): Match | null {
  const maxRound = Math.max(...bracketMatches.map(m => m.round));
  if (maxRound < 2) return null;
  const semis = bracketMatches.filter(m => m.round === maxRound - 1);
  if (semis.length < 2) return null;
  const base = semis[0];
  return {
    ...base,
    id: `bronze_${semis[0].id}_${semis[1].id}`,
    round: maxRound, match_number: 2,
    player1_id: `loser-of-${semis[0].id}`,
    player2_id: `loser-of-${semis[1].id}`,
    player3_id: undefined, player4_id: undefined,
    player5_id: undefined, player6_id: undefined,
    status: 'waiting' as const,
    score_p1: 0, score_p2: 0,
    winner_id: null, start_time: null, end_time: null, court_id: null,
    subtitle: '第3位決定戦',
  };
}

export function resolveBronzeMatch(bronzeMatch: Match, completedSemis: Match[]): Match {
  const updated = { ...bronzeMatch };
  for (const semi of completedSemis) {
    if (!semi.winner_id) continue;
    const isWinner1 = semi.winner_id === semi.player1_id;
    const loserId = isWinner1 ? semi.player2_id : semi.player1_id;
    const placeholder = `loser-of-${semi.id}`;
    if (updated.player1_id === placeholder) {
      updated.player1_id = loserId;
      updated.player3_id = isWinner1 ? semi.player4_id : semi.player3_id;
      updated.player5_id = isWinner1 ? semi.player6_id : semi.player5_id;
    }
    if (updated.player2_id === placeholder) {
      updated.player2_id = loserId;
      updated.player4_id = isWinner1 ? semi.player4_id : semi.player3_id;
      updated.player6_id = isWinner1 ? semi.player6_id : semi.player5_id;
    }
  }
  return updated;
}

// ============================================================
// 団体戦モード (TeamEncounter System)
// ============================================================

export function buildGameSlots(config: TeamMatchConfig): TeamGame[] {
  const slots: TeamGame[] = [];
  for (const item of config.games) {
    for (let i = 1; i <= item.count; i++) {
      slots.push({ id: `${item.type}_${i}`, type: item.type, winner: null });
    }
  }
  return slots;
}

/**
 * 対戦の勝者を返す。決まっていなければ null。
 *
 * 先取制ではなく、**全試合を消化してから勝ち数の多い方**を勝ちとする運用に合わせている。
 * 3-0 になっても残りを必ず消化するため、途中で決着扱いにすると
 * 残りの入力欄が畳まれてしまい、得ゲーム数（順位の判定に使う）も取りこぼす。
 *
 * 試合数が偶数で同数になった場合は決着しない（null）。順位表の手動並べ替えで対応する。
 */
export function computeEncounterWinner(games: TeamGame[], total: number): 1 | 2 | null {
  const entered = games.filter(g => g.winner !== null).length;
  if (entered < total) return null;
  const t1 = games.filter(g => g.winner === 1).length;
  const t2 = games.filter(g => g.winner === 2).length;
  if (t1 > t2) return 1;
  if (t2 > t1) return 2;
  return null;
}

/**
 * 対戦の結果を「勝者と本数」だけで記録する。
 *
 * 運営は 5-0 / 4-1 / 3-2 のどれかと勝ったチームを選ぶだけで、
 * どの試合を誰が取ったかは追わない（種目を固定していないため）。
 * 内部の games 配列は本数に合わせて機械的に埋める。順位判定は本数しか見ないので
 * これで足りるが、「第N試合を誰が取ったか」は意味を持たない点に注意。
 *
 * @param winnerSide 1 = team1 の勝ち, 2 = team2 の勝ち
 * @param winnerGames 勝った側が取った本数（5試合なら 3〜5）
 */
export function recordTeamEncounterScore(
  enc: TeamEncounter,
  winnerSide: 1 | 2,
  winnerGames: number,
): TeamEncounter {
  const total = enc.games.length;
  const loserGames = Math.max(0, total - winnerGames);
  const loserSide: 1 | 2 = winnerSide === 1 ? 2 : 1;

  const games = enc.games.map((g, i) => ({
    ...g,
    winner: (i < winnerGames ? winnerSide : i < winnerGames + loserGames ? loserSide : null) as 1 | 2 | null,
  }));

  const team1Wins = games.filter(g => g.winner === 1).length;
  const team2Wins = games.filter(g => g.winner === 2).length;

  return {
    ...enc,
    games,
    team1_wins: team1Wins,
    team2_wins: team2Wins,
    winner_id: winnerSide === 1 ? enc.team1_id : enc.team2_id,
    completed: true,
  };
}

/** 対戦の結果を未入力に戻す */
export function clearTeamEncounterScore(enc: TeamEncounter): TeamEncounter {
  return {
    ...enc,
    games: enc.games.map(g => ({ ...g, winner: null })),
    team1_wins: 0,
    team2_wins: 0,
    winner_id: null,
    completed: false,
  };
}

/**
 * 勝者側が取りうる本数の一覧を返す（5試合なら [5, 4, 3]）。
 * 過半数を取らないと勝ちにならないので、下限は floor(total/2)+1。
 */
export function listWinnerGameCounts(total: number): number[] {
  const min = Math.floor(total / 2) + 1;
  const counts: number[] = [];
  for (let n = total; n >= min; n--) counts.push(n);
  return counts;
}

/**
 * 1試合の勝者を記録する。
 * winner に null を渡すと未入力に戻す（押し間違いの取り消し）。
 */
export function recordTeamGameResult(
  enc: TeamEncounter,
  slotId: string,
  winner: 1 | 2 | null
): TeamEncounter {
  const games = enc.games.map(g =>
    g.id === slotId ? { ...g, winner } : g
  );
  const total = games.length;
  const team1Wins = games.filter(g => g.winner === 1).length;
  const team2Wins = games.filter(g => g.winner === 2).length;
  const winnerSide = computeEncounterWinner(games, total);
  return {
    ...enc, games, team1_wins: team1Wins, team2_wins: team2Wins,
    winner_id: winnerSide === 1 ? enc.team1_id : winnerSide === 2 ? enc.team2_id : null,
    completed: winnerSide !== null,
  };
}

export function generateTeamPreliminaryEncounters(
  teams: { id: string; name: string }[],
  groupCount: number,
  config: TeamMatchConfig
): TeamEncounter[] {
  const groups: { id: string; name: string }[][] = Array.from({ length: groupCount }, () => []);
  teams.forEach((team, i) => groups[i % groupCount].push(team));
  const encounters: TeamEncounter[] = [];
  for (let g = 0; g < groupCount; g++) {
    const group = groups[g];
    const groupLabel = String.fromCharCode(65 + g);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        encounters.push({
          id: `pre_${groupLabel}_${group[i].id}_${group[j].id}`,
          team1_id: group[i].id, team2_id: group[j].id,
          games: buildGameSlots(config),
          team1_wins: 0, team2_wins: 0, winner_id: null,
          phase: 'preliminary', group: groupLabel, round: 0, completed: false,
        });
      }
    }
  }
  return encounters;
}

function getHeadToHead(
  team1Id: string,
  team2Id: string,
  completedEncounters: TeamEncounter[]
): string | null {
  const enc = completedEncounters.find(
    e => (e.team1_id === team1Id && e.team2_id === team2Id) ||
         (e.team1_id === team2Id && e.team2_id === team1Id)
  );
  return enc?.winner_id ?? null;
}

/** 総当たりの1巡ぶん。同じラウンドの対戦は同時に進められる（同じチームが重複しない） */
export interface RoundRobinRound {
  round: number;                 // 1始まり
  pairs: [string, string][];     // 同時に成立する対戦（チームID）
  byeTeamId: string | null;      // 奇数チームのとき、この巡で休むチーム
}

/**
 * 総当たりの組み合わせを「同時に進められるラウンド」に分けて返す（サーキット法）。
 *
 * 単純な二重ループ（A-B, A-C, A-D, …）だと同じチームが連続で試合に入ってしまい、
 * そのままでは進行表として使えない。サーキット法なら1ラウンド内に同じチームは1回しか出ず、
 * 奇数チームのときは毎ラウンドちょうど1チームが休む（休みの回数も全チーム均等になる）。
 */
export function generateRoundRobinRounds(teamIds: string[]): RoundRobinRound[] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];

  const BYE = '__BYE__';
  if (ids.length % 2 === 1) ids.push(BYE);

  const totalRounds = ids.length - 1;
  const fixed = ids[0];
  let rotating = ids.slice(1);
  const rounds: RoundRobinRound[] = [];

  for (let r = 0; r < totalRounds; r++) {
    const pairs: [string, string][] = [];
    let bye: string | null = null;

    // 固定席 と 回転列の末尾
    const opponent = rotating[rotating.length - 1];
    if (fixed === BYE) bye = opponent;
    else if (opponent === BYE) bye = fixed;
    else pairs.push([fixed, opponent]);

    // 残りは回転列の両端から詰めていく
    for (let i = 0; i < (rotating.length - 1) / 2; i++) {
      const a = rotating[i];
      const b = rotating[rotating.length - 2 - i];
      if (a === BYE) bye = b;
      else if (b === BYE) bye = a;
      else pairs.push([a, b]);
    }

    rounds.push({ round: r + 1, pairs, byeTeamId: bye });
    // 末尾を先頭に回す
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return rounds;
}

/**
 * 予選順位の判定基準。並び順は大会ごとに設定できる（TeamTournamentGenerator の「順位の決め方」）。
 * - wins:        対戦の勝ち数（決着した対戦のみ）
 * - headToHead:  直接対決の勝敗
 * - gameDiff:    得失ゲーム差（取ったゲーム − 取られたゲーム）
 * - gamesWon:    得ゲーム数（取ったゲームの合計）
 * - janken:      じゃんけん（手入力）
 */
export type TeamRankCriterion = 'wins' | 'headToHead' | 'gameDiff' | 'gamesWon' | 'janken';

export const DEFAULT_TEAM_RANK_ORDER: TeamRankCriterion[] = [
  'wins', 'headToHead', 'gameDiff', 'gamesWon', 'janken',
];

export const TEAM_RANK_CRITERION_LABEL: Record<TeamRankCriterion, string> = {
  wins: '勝利数',
  headToHead: '直接対決',
  gameDiff: '得失ゲーム差',
  gamesWon: '得ゲーム数',
  janken: 'じゃんけん',
};

/** 保存データが壊れていても必ず全基準がそろった順序を返す */
export function normalizeTeamRankOrder(order?: TeamRankCriterion[] | null): TeamRankCriterion[] {
  const valid = (order ?? []).filter((c): c is TeamRankCriterion =>
    DEFAULT_TEAM_RANK_ORDER.includes(c as TeamRankCriterion));
  const deduped = [...new Set(valid)];
  // 欠けている基準はデフォルトの並びで末尾に補う
  DEFAULT_TEAM_RANK_ORDER.forEach(c => { if (!deduped.includes(c)) deduped.push(c); });
  return deduped;
}

/** 数値で比べられる基準は、その値を取り出すだけで済む */
const NUMERIC_CRITERION_VALUE: Record<'wins' | 'gameDiff' | 'gamesWon', (e: TeamRankEntry) => number> = {
  wins: e => e.wins,
  gameDiff: e => e.gameDiff,
  gamesWon: e => e.gamesWon,
};

/**
 * 同順位ブロックを、基準を上から順に当てて割っていく。
 *
 * 比較器を並べる方式ではなく段階的にブロックを割るのは、**直接対決を「2チームが並んだときだけ」**
 * 適用するため。3チーム以上が並ぶ（三つ巴以上）と A>B, B>C, C>A が成立しうるので直接対決では
 * 決着しない。その場合はこの基準を飛ばして次の基準（得失ゲーム差など）で決める。
 *
 * @param block      現時点で並んでいるチーム
 * @param order      基準の適用順
 * @param idx        いま見ている基準の位置
 */
function splitIntoRankBlocks(
  block: TeamRankEntry[],
  order: TeamRankCriterion[],
  idx: number,
  completed: TeamEncounter[],
  jankenWinners?: Record<string, string>,
): TeamRankEntry[][] {
  // 基準を使い切っても割れなければ、そのかたまりが「まだ並んでいる」ことを意味する
  if (block.length <= 1 || idx >= order.length) return [block];

  const criterion = order[idx];
  const next = (b: TeamRankEntry[]) => splitIntoRankBlocks(b, order, idx + 1, completed, jankenWinners);

  // 直接対決: 2チームが並んだときだけ有効。三つ巴以上は次の基準に送る
  if (criterion === 'headToHead') {
    if (block.length !== 2) return next(block);
    const [a, b] = block;
    const h2h = getHeadToHead(a.teamId, b.teamId, completed);
    if (h2h === null) return next(block);
    return h2h === a.teamId ? [[a], [b]] : [[b], [a]];
  }

  // じゃんけん: 並んでいる全ペアの結果が入っているときだけ、それで並べ切る
  if (criterion === 'janken') {
    const jankenOf = (a: TeamRankEntry, b: TeamRankEntry) =>
      jankenWinners?.[[a.teamId, b.teamId].sort().join('_')];
    const allPairsDecided = block.every((a, i) =>
      block.every((b, j) => i >= j || !!jankenOf(a, b)));
    if (!allPairsDecided) return next(block);
    return [...block]
      .sort((a, b) => {
        const w = jankenOf(a, b);
        if (!w) return 0;
        return w === a.teamId ? -1 : 1;
      })
      .map(e => [e]);
  }

  // 数値基準: 同じ値ごとにまとめ、値の大きい順に並べてから各かたまりを次の基準へ
  const valueOf = NUMERIC_CRITERION_VALUE[criterion];
  const buckets = new Map<number, TeamRankEntry[]>();
  for (const entry of block) {
    const v = valueOf(entry);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v)!.push(entry);
  }
  return [...buckets.entries()]
    .sort((x, y) => y[0] - x[0])
    .flatMap(([, bucket]) => next(bucket));
}

export function rankTeamGroup(
  encounters: TeamEncounter[],
  jankenWinners?: Record<string, string>,
  rankOrder?: TeamRankCriterion[],
): TeamRankEntry[] {
  const order = normalizeTeamRankOrder(rankOrder);
  const prelim = encounters.filter(e => e.phase === 'preliminary');
  // 直接対決の判定には「決着した対戦」だけを使う
  const completed = prelim.filter(e => e.completed);
  const map = new Map<string, TeamRankEntry>();
  const getOrCreate = (id: string): TeamRankEntry => {
    if (!map.has(id)) map.set(id, { teamId: id, wins: 0, losses: 0, gamesWon: 0, gamesLost: 0, gameDiff: 0 });
    return map.get(id)!;
  };
  for (const enc of prelim) {
    const e1 = getOrCreate(enc.team1_id);
    const e2 = getOrCreate(enc.team2_id);

    // 勝敗は決着した対戦のみ加算する
    if (enc.completed) {
      if (enc.winner_id === enc.team1_id) { e1.wins++; e2.losses++; }
      else if (enc.winner_id === enc.team2_id) { e2.wins++; e1.losses++; }
    }

    // 本数は入力済みの試合をその都度集計する（未決着の対戦も途中経過として反映）
    const t1 = enc.games.filter(g => g.winner === 1).length;
    const t2 = enc.games.filter(g => g.winner === 2).length;
    e1.gamesWon += t1; e1.gamesLost += t2;
    e2.gamesWon += t2; e2.gamesLost += t1;
    e1.gameDiff += t1 - t2;
    e2.gameDiff += t2 - t1;
  }
  // 全チームを1つの同順位ブロックとして、基準を上から当てて割っていく
  return splitIntoRankBlocks(Array.from(map.values()), order, 0, completed, jankenWinners).flat();
}

/**
 * じゃんけんが必要なペアを返す。
 *
 * じゃんけんより前のすべての基準を当てても割り切れずに残ったかたまりが対象。
 * ここでも直接対決は2チームのときだけ効くので、三つ巴が数値基準でも割れなければ
 * そのかたまりの全ペアがじゃんけん対象になる。
 */
export function getNeedJankenPairs(
  entries: TeamRankEntry[],
  encounters: TeamEncounter[],
  jankenWinners?: Record<string, string>,
  rankOrder?: TeamRankCriterion[],
): [string, string][] {
  const order = normalizeTeamRankOrder(rankOrder);
  const completed = encounters.filter(e => e.completed && e.phase === 'preliminary');
  const jankenIdx = order.indexOf('janken');
  // じゃんけんを使わない設定なら、決めようがないので何も要求しない
  if (jankenIdx < 0) return [];

  // じゃんけん直前までの基準で割り、それでも2チーム以上残ったかたまりが対象
  const beforeJanken = order.slice(0, jankenIdx);
  const tiedBlocks = splitIntoRankBlocks(entries, beforeJanken, 0, completed, jankenWinners)
    .filter(block => block.length >= 2);

  const pairs: [string, string][] = [];
  for (const block of tiedBlocks) {
    for (let i = 0; i < block.length; i++) {
      for (let j = i + 1; j < block.length; j++) {
        const key = [block[i].teamId, block[j].teamId].sort().join('_');
        if (jankenWinners?.[key]) continue;
        pairs.push([block[i].teamId, block[j].teamId]);
      }
    }
  }
  return pairs;
}

export function generateTeamFinalBracket(advancerCount: number, config: TeamMatchConfig): TeamEncounter[] {
  const bracketSize = calculateBracketSize(advancerCount);
  const totalRounds = calculateRounds(bracketSize);
  const encounters: TeamEncounter[] = [];
  const round1Matches = bracketSize / 2;
  for (let i = 1; i <= round1Matches; i++) {
    const slot1 = (i - 1) * 2 + 1;
    const slot2 = (i - 1) * 2 + 2;
    encounters.push({
      id: `final_1_${i}`,
      team1_id: `team-slot-${slot1}`,
      team2_id: slot2 <= advancerCount ? `team-slot-${slot2}` : 'BYE',
      games: buildGameSlots(config),
      team1_wins: 0, team2_wins: 0, winner_id: null,
      phase: 'knockout', round: 1, completed: false,
      next_encounter_id: totalRounds > 1 ? `final_2_${Math.ceil(i / 2)}` : undefined,
      next_encounter_position: (i % 2 === 1 ? 1 : 2) as 1 | 2,
    });
  }
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    for (let i = 1; i <= matchesInRound; i++) {
      encounters.push({
        id: `final_${round}_${i}`,
        team1_id: `winner-of-final_${round - 1}_${(i - 1) * 2 + 1}`,
        team2_id: `winner-of-final_${round - 1}_${(i - 1) * 2 + 2}`,
        games: buildGameSlots(config),
        team1_wins: 0, team2_wins: 0, winner_id: null,
        phase: 'knockout', round, completed: false,
        next_encounter_id: round < totalRounds ? `final_${round + 1}_${Math.ceil(i / 2)}` : undefined,
        next_encounter_position: round < totalRounds ? ((i % 2 === 1 ? 1 : 2) as 1 | 2) : undefined,
      });
    }
  }
  return encounters;
}

export function applyTeamAdvancersToFinalBracket(
  encounters: TeamEncounter[], advancers: string[]
): TeamEncounter[] {
  return encounters.map(enc => {
    const updated = { ...enc };
    advancers.forEach((teamId, i) => {
      const slot = `team-slot-${i + 1}`;
      if (updated.team1_id === slot) updated.team1_id = teamId;
      if (updated.team2_id === slot) updated.team2_id = teamId;
    });
    return updated;
  });
}

/** 同順位同士の順位決定戦を生成（2グループ対応） */
export function generateTeamPlacementEncounters(
  groupRankings: { [group: string]: TeamRankEntry[] },
  groups: string[],
  config: TeamMatchConfig
): TeamEncounter[] {
  if (groups.length < 2) return [];
  const [groupA, groupB] = groups;
  const rankingsA = groupRankings[groupA] ?? [];
  const rankingsB = groupRankings[groupB] ?? [];
  const maxRank = Math.max(rankingsA.length, rankingsB.length);
  const encounters: TeamEncounter[] = [];
  for (let rank = 0; rank < maxRank; rank++) {
    const teamA = rankingsA[rank];
    const teamB = rankingsB[rank];
    if (!teamA || !teamB) continue;
    encounters.push({
      id: `placement_${rank + 1}`,
      team1_id: teamA.teamId,
      team2_id: teamB.teamId,
      games: buildGameSlots(config),
      team1_wins: 0, team2_wins: 0, winner_id: null,
      phase: 'placement',
      placement_rank: rank + 1,
      round: 1,
      completed: false,
    });
  }
  return encounters;
}

export function advanceTeamWinnerToNextRound(
  encounters: TeamEncounter[], completedId: string
): TeamEncounter[] {
  const completed = encounters.find(e => e.id === completedId);
  if (!completed || !completed.winner_id) return encounters;
  const placeholder = `winner-of-${completedId}`;
  return encounters.map(enc => {
    const updated = { ...enc };
    if (enc.team1_id === placeholder) updated.team1_id = completed.winner_id!;
    if (enc.team2_id === placeholder) updated.team2_id = completed.winner_id!;
    return updated;
  });
}

export function generateTeamBronzeEncounter(
  encounters: TeamEncounter[], config: TeamMatchConfig
): TeamEncounter | null {
  const kr = encounters.filter(e => e.phase === 'knockout' && e.round !== undefined);
  if (kr.length === 0) return null;
  const maxRound = Math.max(...kr.map(e => e.round!));
  if (maxRound < 2) return null;
  const semis = kr.filter(e => e.round === maxRound - 1);
  if (semis.length < 2) return null;
  return {
    id: `bronze_${semis[0].id}_${semis[1].id}`,
    team1_id: `loser-of-${semis[0].id}`,
    team2_id: `loser-of-${semis[1].id}`,
    games: buildGameSlots(config),
    team1_wins: 0, team2_wins: 0, winner_id: null,
    phase: 'knockout', round: maxRound, completed: false,
  };
}

export function resolveTeamBronzeEncounter(
  bronze: TeamEncounter, completedSemis: TeamEncounter[]
): TeamEncounter {
  const updated = { ...bronze };
  for (const semi of completedSemis) {
    if (!semi.winner_id) continue;
    const loserId = semi.winner_id === semi.team1_id ? semi.team2_id : semi.team1_id;
    const placeholder = `loser-of-${semi.id}`;
    if (updated.team1_id === placeholder) updated.team1_id = loserId;
    if (updated.team2_id === placeholder) updated.team2_id = loserId;
  }
  return updated;
}
