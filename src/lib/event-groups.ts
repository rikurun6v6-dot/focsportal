// src/lib/event-groups.ts
//
// 大会要項の並びに合わせて、種目を2つのくくりで扱う。
//
//   個人戦①  男女別ダブルス          … 男子ダブルス / 女子ダブルス（各1〜3部）
//   個人戦②  混合ダブルス・シングルス … 1部 男子シングルス / 2部 混合ダブルス / 3部 混合ダブルス
//
// 運営はこの2つを「前半・後半」として動かすので、画面もこの単位で切り替えたい。
// 個人戦②は種目と部の組み合わせがバラバラ（シングルスと混合が混在する）なので、
// 「種目」と「部」を別々に選ばせるのではなく、組み合わせを1つの部門として並べる。

import type { Match, TournamentType, Division } from '@/types';

export type EventGroupId = 'individual1' | 'individual2';

export interface EventGroup {
  id: EventGroupId;
  label: string;
  note: string;
  types: TournamentType[];
}

export const EVENT_GROUPS: EventGroup[] = [
  {
    id: 'individual1',
    label: '個人戦①',
    note: '男女別ダブルス',
    types: ['mens_doubles', 'womens_doubles'],
  },
  {
    id: 'individual2',
    label: '個人戦②',
    note: '混合ダブルス・シングルス',
    types: ['mixed_doubles', 'mens_singles', 'womens_singles'],
  },
];

/** 種目がどのくくりに入るか。団体戦は個人戦のタブには出さない */
export function groupOfType(type: TournamentType): EventGroupId | 'team' {
  if (type === 'team_battle') return 'team';
  return EVENT_GROUPS[0].types.includes(type) ? 'individual1' : 'individual2';
}

/** 種目の短い名前 */
export function shortTypeName(type: TournamentType): string {
  switch (type) {
    case 'mens_doubles': return '男子ダブルス';
    case 'womens_doubles': return '女子ダブルス';
    case 'mixed_doubles': return '混合ダブルス';
    case 'mens_singles': return '男子シングルス';
    case 'womens_singles': return '女子シングルス';
    case 'team_battle': return '団体戦';
    default: return String(type);
  }
}

/** 「2部 混合ダブルス」のような部門名 */
export function eventEntryLabel(type: TournamentType, division: Division): string {
  return `${division}部 ${shortTypeName(type)}`;
}

/** 種目 × 部 の組み合わせ1つ */
export interface EventEntry {
  key: string;
  tournament_type: TournamentType;
  division: Division;
  label: string;
  matchCount: number;
}

export function entryKey(type: TournamentType, division: Division): string {
  return `${type}_${division}`;
}

/**
 * 実際に試合がある「種目 × 部」だけを、くくりごとに並べて返す。
 * 並び順は EVENT_GROUPS の種目順 → 部の昇順。
 */
export function entriesInGroup(matches: Match[], groupId: EventGroupId): EventEntry[] {
  const group = EVENT_GROUPS.find(g => g.id === groupId);
  if (!group) return [];

  const counts = new Map<string, number>();
  for (const m of matches) {
    if (!group.types.includes(m.tournament_type)) continue;
    if (m.division === undefined) continue;
    const k = entryKey(m.tournament_type, m.division);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const entries: EventEntry[] = [];
  for (const type of group.types) {
    const divs = new Set<Division>();
    counts.forEach((_, k) => {
      const [t, d] = [k.slice(0, k.lastIndexOf('_')), k.slice(k.lastIndexOf('_') + 1)];
      if (t === type) divs.add(Number(d) as Division);
    });
    [...divs].sort((a, b) => a - b).forEach(d => {
      const k = entryKey(type, d);
      entries.push({
        key: k,
        tournament_type: type,
        division: d,
        label: eventEntryLabel(type, d),
        matchCount: counts.get(k) ?? 0,
      });
    });
  }
  return entries;
}

/** 個人戦①②それぞれの部門一覧をまとめて返す（空のくくりは落とす） */
export function buildEventGroups(matches: Match[]): { group: EventGroup; entries: EventEntry[] }[] {
  return EVENT_GROUPS
    .map(group => ({ group, entries: entriesInGroup(matches, group.id) }))
    .filter(g => g.entries.length > 0);
}
