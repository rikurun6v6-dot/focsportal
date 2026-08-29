// src/lib/kana.ts
//
// 当日のペア割り当てを「ひらがなを打って選ぶ」だけで済ませるための検索ヘルパー。
// 漢字の氏名は変換が面倒なので、選手にフリガナ（name_kana）を持たせ、
// ひらがな・カタカナのどちらで打っても引けるようにする。

/** カタカナをひらがなに寄せ、全角スペース・記号を落として比較用の文字列にする */
export function toSearchKey(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[　\s・,，、.．]/g, '')
    .toLowerCase();
}

/**
 * 検索語が選手に一致するか。氏名とフリガナの両方を見る。
 * 前方一致を優先し、なければ部分一致で拾う。
 */
export function matchesQuery(query: string, name: string, nameKana?: string): boolean {
  const q = toSearchKey(query);
  if (!q) return true;
  return candidateKeys(name, nameKana).some((k) => k.includes(q));
}

/** 並べ替え用のスコア。小さいほど上に出す（0=前方一致, 1=部分一致, 2=不一致） */
export function matchRank(query: string, name: string, nameKana?: string): number {
  const q = toSearchKey(query);
  if (!q) return 1;
  const keys = candidateKeys(name, nameKana);
  if (keys.some((k) => k.startsWith(q))) return 0;
  if (keys.some((k) => k.includes(q))) return 1;
  return 2;
}

/** 氏名・フリガナから比較対象の文字列を作る（姓名を分けた形も含める） */
function candidateKeys(name: string, nameKana?: string): string[] {
  const keys: string[] = [];
  for (const raw of [name, nameKana]) {
    if (!raw) continue;
    keys.push(toSearchKey(raw));
    // 「山田 太郎」のように区切られている場合、姓・名それぞれでも引けるようにする
    for (const part of raw.split(/[\s　]+/)) {
      if (part) keys.push(toSearchKey(part));
    }
  }
  return keys.filter(Boolean);
}
