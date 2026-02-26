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
  const rounds = Math.log2(bracketSize);
  let order = [1, 2];
  for (let i = 1; i < rounds; i++) {
    const newOrder: number[] = [];
    const size = order.length * 2 + 1;
    for (const seed of order) { newOrder.push(seed); newOrder.push(size - seed); }
    order = newOrder;
  }
  return order;
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

export function computeEncounterWinner(games: TeamGame[], total: number): 1 | 2 | null {
  const majority = Math.floor(total / 2) + 1;
  const t1 = games.filter(g => g.winner === 1).length;
  const t2 = games.filter(g => g.winner === 2).length;
  if (t1 >= majority) return 1;
  if (t2 >= majority) return 2;
  return null;
}

export function recordTeamGameResult(enc: TeamEncounter, slotId: string, winner: 1 | 2): TeamEncounter {
  const games = enc.games.map(g => g.id === slotId ? { ...g, winner } : g);
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

export function rankTeamGroup(encounters: TeamEncounter[]): TeamRankEntry[] {
  const completed = encounters.filter(e => e.completed && e.phase === 'preliminary');
  const map = new Map<string, TeamRankEntry>();
  const getOrCreate = (id: string): TeamRankEntry => {
    if (!map.has(id)) map.set(id, { teamId: id, wins: 0, losses: 0, gameDiff: 0 });
    return map.get(id)!;
  };
  for (const enc of completed) {
    const e1 = getOrCreate(enc.team1_id);
    const e2 = getOrCreate(enc.team2_id);
    if (enc.winner_id === enc.team1_id) { e1.wins++; e2.losses++; }
    else if (enc.winner_id === enc.team2_id) { e2.wins++; e1.losses++; }
    e1.gameDiff += enc.team1_wins - enc.team2_wins;
    e2.gameDiff += enc.team2_wins - enc.team1_wins;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.gameDiff - a.gameDiff;
  });
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
