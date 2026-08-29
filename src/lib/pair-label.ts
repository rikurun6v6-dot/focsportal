// src/lib/pair-label.ts
//
// 選手が未割り当てのスロットを「3番ペア」のように表示するための共通ヘルパー。
// 当日くじでペアを決める運用では、割り当て前でも表を印刷・掲示できる必要がある。

import type { Match } from '@/types';

/**
 * 試合の片側（1組目 or 2組目）の表示名を返す。
 * 選手が入っていれば氏名を「/」で連結し、未割り当てならペア番号を出す。
 */
export function pairSideLabel(
  match: Pick<Match,
    | 'player1_id' | 'player2_id' | 'player3_id' | 'player4_id' | 'player5_id' | 'player6_id'
    | 'pair_no_p1' | 'pair_no_p2' | 'tournament_type'>,
  side: 1 | 2,
  getPlayerName: (id?: string) => string
): string {
  const ids = side === 1
    ? [match.player1_id, match.player3_id, match.player5_id]
    : [match.player2_id, match.player4_id, match.player6_id];

  const present = ids.filter(Boolean) as string[];
  if (present.length > 0) return present.map(getPlayerName).join(' / ');

  const pairNo = side === 1 ? match.pair_no_p1 : match.pair_no_p2;
  if (pairNo) {
    const unit = match.tournament_type?.includes('singles') ? '番' : '番ペア';
    return `${pairNo}${unit}`;
  }
  return '未定';
}
