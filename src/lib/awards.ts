// src/lib/awards.ts
// 順位確定後の表彰台（優勝/準優勝/3位）を算出するヘルパー
import type { Match, Player, Team, TournamentType, Division } from '@/types';

export interface PodiumEntry {
  label: string;        // 表示名（ペア名 "山田 / 佐藤" / チーム名 / 個人名）
  playerIds: string[];  // 構成メンバーのID（参照用）
}

export interface CategoryPodium {
  tournamentType: TournamentType;
  division: Division;
  champion: PodiumEntry | null;   // 優勝
  runnerUp: PodiumEntry | null;   // 準優勝
  third: PodiumEntry[];           // 3位（3位決定戦があれば1名、なければ準決勝敗者で共同3位）
  thirdShared: boolean;           // 共同3位かどうか
  finalized: boolean;             // 優勝が確定しているか
}

const CATEGORY_LABELS: Record<TournamentType, string> = {
  mens_singles: '男子シングルス',
  womens_singles: '女子シングルス',
  mens_doubles: '男子ダブルス',
  womens_doubles: '女子ダブルス',
  mixed_doubles: '混合ダブルス',
  team_battle: '団体戦',
};

export function getCategoryLabel(type: TournamentType): string {
  return CATEGORY_LABELS[type] ?? type;
}

export function getDivisionLabel(division: Division): string {
  return `${division}部`;
}

// 3位決定戦（bronze）かどうかの判定
function isBronzeMatch(m: Match): boolean {
  return m.id.startsWith('bronze_') || m.subtitle === '第3位決定戦';
}

// winner_id がどちらのサイドかを返す（1 = player1側, 2 = player2側）
function winnerSide(m: Match): 1 | 2 | null {
  if (!m.winner_id) return null;
  if (m.winner_id === m.player1_id) return 1;
  if (m.winner_id === m.player2_id) return 2;
  return null;
}

// 指定サイドの表示エントリを作る（preview の sideName と同じ規約）
function sideEntry(
  m: Match,
  side: 1 | 2,
  players: Map<string, Player>,
  teams: Map<string, string>
): PodiumEntry | null {
  const ids = side === 1
    ? [m.player1_id, m.player3_id, m.player5_id]
    : [m.player2_id, m.player4_id, m.player6_id];
  const memberIds = ids.filter((x): x is string => !!x);
  if (memberIds.length === 0) return null;

  // 団体戦はチーム名
  if (m.tournament_type === 'team_battle') {
    const captain = players.get(memberIds[0]);
    const teamName = captain?.team_id ? (teams.get(captain.team_id) || 'チーム') : 'チーム';
    return { label: teamName, playerIds: memberIds };
  }

  const names = memberIds.map((id) => players.get(id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return null;
  return { label: names.join(' / '), playerIds: memberIds };
}

// 部門の緩い比較（number/string/undefined を吸収）
function sameDivision(a: Division | undefined, b: Division): boolean {
  if (a === undefined || a === null) return String(b) === '1'; // 部門未設定は1部扱い
  return String(a) === String(b);
}

/**
 * 1つの種目・部門の表彰台を算出する。
 * matches は当該種目の全試合（campフィルタ済みを推奨）。
 */
export function computeCategoryPodium(
  type: TournamentType,
  division: Division,
  matches: Match[],
  players: Map<string, Player>,
  teams: Map<string, string>
): CategoryPodium {
  const empty: CategoryPodium = {
    tournamentType: type, division,
    champion: null, runnerUp: null, third: [], thirdShared: false, finalized: false,
  };

  // 当該種目・部門の決勝トーナメント試合（phase未設定の単純ブラケットも対象）
  const ko = matches.filter(
    (m) =>
      m.tournament_type === type &&
      sameDivision(m.division, division) &&
      (m.phase ? m.phase === 'knockout' : true)
  );
  if (ko.length === 0) return empty;

  const maxRound = Math.max(...ko.map((m) => m.round));
  const lastRound = ko.filter((m) => m.round === maxRound);

  const finalMatch = lastRound.find((m) => !isBronzeMatch(m)) ?? null;
  const bronzeMatch = lastRound.find((m) => isBronzeMatch(m)) ?? null;

  let champion: PodiumEntry | null = null;
  let runnerUp: PodiumEntry | null = null;
  if (finalMatch) {
    const ws = winnerSide(finalMatch);
    if (ws) {
      champion = sideEntry(finalMatch, ws, players, teams);
      runnerUp = sideEntry(finalMatch, ws === 1 ? 2 : 1, players, teams);
    }
  }

  // 3位
  const third: PodiumEntry[] = [];
  let thirdShared = false;
  if (bronzeMatch && winnerSide(bronzeMatch)) {
    const ws = winnerSide(bronzeMatch)!;
    const e = sideEntry(bronzeMatch, ws, players, teams);
    if (e) third.push(e);
  } else {
    // 3位決定戦がない → 準決勝の敗者2組が共同3位
    const semis = ko.filter((m) => m.round === maxRound - 1);
    for (const s of semis) {
      const ws = winnerSide(s);
      if (ws) {
        const e = sideEntry(s, ws === 1 ? 2 : 1, players, teams);
        if (e) third.push(e);
      }
    }
    thirdShared = third.length > 1;
  }

  return {
    tournamentType: type, division,
    champion, runnerUp, third, thirdShared,
    finalized: !!champion,
  };
}

/**
 * 全試合から、存在する (種目, 部門) の組み合わせをすべて算出して表彰台一覧を返す。
 * 決勝が確定している種目のみ finalized=true になる。
 */
export function computeAllPodiums(
  matches: Match[],
  players: Map<string, Player>,
  teams: Map<string, string>
): CategoryPodium[] {
  // 決勝トーナメント試合が存在する (type, division) の組み合わせを収集
  const combos = new Map<string, { type: TournamentType; division: Division }>();
  for (const m of matches) {
    if (m.phase && m.phase !== 'knockout') continue;
    const division: Division = (m.division ?? 1) as Division;
    const key = `${m.tournament_type}__${division}`;
    if (!combos.has(key)) combos.set(key, { type: m.tournament_type, division });
  }

  const result: CategoryPodium[] = [];
  for (const { type, division } of combos.values()) {
    result.push(computeCategoryPodium(type, division, matches, players, teams));
  }

  // 種目→部門の順で安定ソート
  const order: TournamentType[] = [
    'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles', 'team_battle',
  ];
  result.sort((a, b) => {
    const d = order.indexOf(a.tournamentType) - order.indexOf(b.tournamentType);
    if (d !== 0) return d;
    return Number(a.division) - Number(b.division);
  });
  return result;
}

export type { Team };
