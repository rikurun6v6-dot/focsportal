// src/lib/divisions.ts
//
// 部門（1部・2部・3部…）の扱いを一箇所にまとめる。
// 以前は UI 側が 1部・2部の2択を決め打ちしていたため、3部以上の大会が組めなかった。

import type { Division } from '@/types';

/** 部門の既定の選択肢 */
export const DEFAULT_DIVISIONS: Division[] = [1, 2, 3];

/** 部門として妥当な値か（1〜99 の整数） */
export function isValidDivision(v: unknown): v is Division {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99;
}

/**
 * 実データに存在する部門を昇順で返す。
 * 選手・試合のどちらのリストからでも拾える。
 * 1件も無いときは fallback（既定は 1〜3部）を返す。
 */
export function getDivisionsInUse(
  items: { division?: Division }[],
  fallback: Division[] = DEFAULT_DIVISIONS
): Division[] {
  const found = [...new Set(items.map((i) => i.division).filter(isValidDivision))].sort((a, b) => a - b);
  return found.length > 0 ? found : fallback;
}

/**
 * 既定の選択肢に、実データにある部門を足した一覧。
 * 登録・生成のように「まだ存在しない部門」も選べる必要がある画面で使う。
 */
export function getDivisionOptions(items: { division?: Division }[]): Division[] {
  const found = items.map((i) => i.division).filter(isValidDivision);
  return [...new Set([...DEFAULT_DIVISIONS, ...found])].sort((a, b) => a - b);
}
