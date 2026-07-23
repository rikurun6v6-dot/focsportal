/**
 * team-results.ts
 * 団体戦の最終順位を、保存されている状態（team_tournament_states/{campId}）から組み立てる。
 *
 * 運営画面の順位決定戦ビューが内部で持っていた計算をここに出して、
 * 結果発表ページと運営画面の両方から同じ結果が出るようにしている。
 */

import type { TeamEncounter, TeamRankEntry } from '@/types';
import { rankTeamGroup, normalizeTeamRankOrder, type TeamRankCriterion } from './tournament-logic';

export interface TeamFinalStanding {
  rank: number;
  teamId: string;
  teamName: string;
}

export interface TeamResults {
  /** 何をもとに順位を出したか */
  mode: 'placement' | 'knockout' | 'preliminary' | 'none';
  /** 全体順位。placement が終わっていれば 1..N が埋まる */
  standings: TeamFinalStanding[];
  /** 全順位が確定しているか */
  complete: boolean;
  /** 予選のグループ順位（参考表示用） */
  groupStandings: { group: string; rankings: TeamRankEntry[] }[];
  teamNames: Record<string, string>;
  rankOrder: TeamRankCriterion[];
}

/** 保存データからチーム名の対応表を作る */
function readTeamNames(state: Record<string, unknown>): Record<string, string> {
  const teams = (state.teams as { id: string; name: string }[] | undefined) ?? [];
  return Object.fromEntries(teams.map(t => [t.id, t.name]));
}

/** 予選のグループ順位を計算する（運営画面と同じ手順。手動並べ替えも反映） */
function readGroupStandings(
  state: Record<string, unknown>,
  rankOrder: TeamRankCriterion[],
): { group: string; rankings: TeamRankEntry[] }[] {
  const encounters = (state.prelimEncounters as TeamEncounter[] | undefined) ?? [];
  const janken = (state.jankenWinners as Record<string, string> | undefined) ?? {};
  const manual = (state.manualRanksByGroup as Record<string, string[]> | undefined) ?? {};

  const groups = [...new Set(encounters.map(e => e.group ?? ''))].sort();
  return groups.map(g => {
    const inGroup = encounters.filter(e => (e.group ?? '') === g);
    const auto = rankTeamGroup(inGroup, janken, rankOrder);
    const manualOrder = manual[g] ?? [];
    if (manualOrder.length === 0) return { group: g, rankings: auto };
    const map = new Map(auto.map(r => [r.teamId, r]));
    const ordered = manualOrder.map(id => map.get(id)).filter(Boolean) as TeamRankEntry[];
    auto.forEach(r => { if (!manualOrder.includes(r.teamId)) ordered.push(r); });
    return { group: g, rankings: ordered };
  });
}

/**
 * 順位決定戦から全体順位を作る。
 * placement_rank が 1 の対戦が 1位決定戦、2 が 3位決定戦…なので、
 * 勝者が (rank-1)*2+1 位、敗者がその次の順位になる。
 */
function standingsFromPlacement(
  encounters: TeamEncounter[],
  teamNames: Record<string, string>,
): { standings: TeamFinalStanding[]; complete: boolean } {
  const withRank = encounters
    .filter(e => e.placement_rank !== undefined)
    .sort((a, b) => (a.placement_rank ?? 0) - (b.placement_rank ?? 0));

  const standings: TeamFinalStanding[] = [];
  for (const enc of withRank) {
    if (!enc.completed || !enc.winner_id) continue;
    const winnerRank = (enc.placement_rank! - 1) * 2 + 1;
    const loserId = enc.winner_id === enc.team1_id ? enc.team2_id : enc.team1_id;
    standings.push({ rank: winnerRank, teamId: enc.winner_id, teamName: teamNames[enc.winner_id] ?? enc.winner_id });
    standings.push({ rank: winnerRank + 1, teamId: loserId, teamName: teamNames[loserId] ?? loserId });
  }
  standings.sort((a, b) => a.rank - b.rank);

  const complete = withRank.length > 0 && withRank.every(e => e.completed);
  return { standings, complete };
}

/**
 * 決勝トーナメントから上位の順位を作る。
 * 決勝の勝者=1位・敗者=2位、3位決定戦があれば 3位・4位まで。
 * それ以降は決勝Tでは決まらないので埋めない。
 */
function standingsFromKnockout(
  encounters: TeamEncounter[],
  bronze: TeamEncounter | null,
  teamNames: Record<string, string>,
): { standings: TeamFinalStanding[]; complete: boolean } {
  const knockout = encounters.filter(e => e.phase === 'knockout');
  if (knockout.length === 0) return { standings: [], complete: false };

  const maxRound = Math.max(...knockout.map(e => e.round ?? 0));
  const final = knockout.find(e => (e.round ?? 0) === maxRound);
  const standings: TeamFinalStanding[] = [];

  const push = (rank: number, teamId: string) =>
    standings.push({ rank, teamId, teamName: teamNames[teamId] ?? teamId });

  if (final?.completed && final.winner_id) {
    const loserId = final.winner_id === final.team1_id ? final.team2_id : final.team1_id;
    push(1, final.winner_id);
    push(2, loserId);
  }
  if (bronze?.completed && bronze.winner_id) {
    const loserId = bronze.winner_id === bronze.team1_id ? bronze.team2_id : bronze.team1_id;
    push(3, bronze.winner_id);
    push(4, loserId);
  }
  standings.sort((a, b) => a.rank - b.rank);
  return { standings, complete: !!final?.completed };
}

/** 保存状態から団体戦の結果をまとめる */
export function computeTeamResults(state: Record<string, unknown> | null): TeamResults {
  const empty: TeamResults = {
    mode: 'none', standings: [], complete: false,
    groupStandings: [], teamNames: {}, rankOrder: normalizeTeamRankOrder(undefined),
  };
  if (!state) return empty;

  const teamNames = readTeamNames(state);
  const rankOrder = normalizeTeamRankOrder(state.rankOrder as TeamRankCriterion[] | undefined);
  const groupStandings = readGroupStandings(state, rankOrder);

  const placement = (state.placementEncounters as TeamEncounter[] | undefined) ?? [];
  if (placement.length > 0) {
    const { standings, complete } = standingsFromPlacement(placement, teamNames);
    if (standings.length > 0) return { mode: 'placement', standings, complete, groupStandings, teamNames, rankOrder };
  }

  const knockout = (state.knockoutEncounters as TeamEncounter[] | undefined) ?? [];
  const bronze = (state.bronzeEncounter as TeamEncounter | null | undefined) ?? null;
  if (knockout.length > 0) {
    const { standings, complete } = standingsFromKnockout(knockout, bronze, teamNames);
    if (standings.length > 0) return { mode: 'knockout', standings, complete, groupStandings, teamNames, rankOrder };
  }

  // 最終フェーズがまだなら、予選のグループ順位だけ返す
  if (groupStandings.length > 0) {
    return { mode: 'preliminary', standings: [], complete: false, groupStandings, teamNames, rankOrder };
  }
  return empty;
}
