// ============================================================
// 結果訂正の純粋ロジック（Firebase 非依存・単体テスト対象）
// firestore-helpers.ts の訂正系関数はここを使う薄いラッパー。
// 既存フィールドのみ使用（スキーマ変更なし）。
// ============================================================
import type { Match, MatchStatus } from '@/types';

export type ChainSide = { main: string; partner: string | null; third: string | null };

export function getMatchSides(m: Match): { side1: ChainSide; side2: ChainSide } {
  return {
    side1: { main: m.player1_id, partner: m.player3_id ?? null, third: m.player5_id ?? null },
    side2: { main: m.player2_id, partner: m.player4_id ?? null, third: m.player6_id ?? null },
  };
}

export function nextPositionOf(m: Match): 1 | 2 {
  return (m.next_match_position ?? ((m.match_number ?? 0) % 2 === 1 ? 1 : 2)) as 1 | 2;
}

/**
 * 次の試合を「メモリ上の試合配列」から探す（findNextMatch の純粋版）。
 * next_match_id（シンプルブラケット）と next_match_number（グループ→ノックアウト）の両方に対応。
 */
export function findNextMatchInList(currentMatch: Match, matches: Match[]): Match | null {
  if (currentMatch.next_match_id) {
    return matches.find(m => m.id === currentMatch.next_match_id) ?? null;
  }
  if (currentMatch.next_match_number != null && currentMatch.campId) {
    return matches.find(m =>
      m.campId === currentMatch.campId &&
      m.tournament_type === currentMatch.tournament_type &&
      m.match_number === currentMatch.next_match_number &&
      (currentMatch.division == null || m.division === currentMatch.division)
    ) ?? null;
  }
  return null;
}

/** 現在の勝者側が勝ち上がった下流チェーンを辿る（M0直後の次戦から、勝者が負けた所/未確定で停止） */
export function traceAdvancementChain(m0: Match, matches: Match[]): {
  adv: ChainSide | null;
  other: ChainSide | null;
  items: { match: Match; position: 1 | 2; winnerWasAdv: boolean }[];
} {
  const { side1, side2 } = getMatchSides(m0);
  const advMain = m0.winner_id;
  if (!advMain) return { adv: null, other: null, items: [] };
  const advIsSide1 = advMain === m0.player1_id;
  const adv = advIsSide1 ? side1 : side2;
  const other = advIsSide1 ? side2 : side1;

  const items: { match: Match; position: 1 | 2; winnerWasAdv: boolean }[] = [];
  let cur: Match = m0;
  for (let guard = 0; guard < 64; guard++) {
    const nxt = findNextMatchInList(cur, matches);
    if (!nxt) break;
    const position = nextPositionOf(cur);
    const slotMain = position === 1 ? nxt.player1_id : nxt.player2_id;
    if (slotMain !== adv.main) break; // この枠に勝者が入っていない → 連鎖終了
    const winnerWasAdv = nxt.status === 'completed' && nxt.winner_id === adv.main;
    items.push({ match: nxt, position, winnerWasAdv });
    if (!winnerWasAdv) break; // ここで勝者側が負けた/未確定 → これ以上は進出していない
    cur = nxt;
  }
  return { adv, other, items };
}

export function slotUpdateFor(position: 1 | 2, side: ChainSide): Record<string, unknown> {
  return position === 1
    ? { player1_id: side.main, player3_id: side.partner ?? null, player5_id: side.third ?? null }
    : { player2_id: side.main, player4_id: side.partner ?? null, player6_id: side.third ?? null };
}

export function clearSlotUpdate(position: 1 | 2): Record<string, unknown> {
  return position === 1
    ? { player1_id: '', player3_id: null, player5_id: null }
    : { player2_id: '', player4_id: null, player6_id: null };
}

export const WAITING_RESET: Record<string, unknown> = {
  score_p1: 0,
  score_p2: 0,
  winner_id: null,
  status: 'waiting',
  end_time: null,
  court_id: null,
};

export type CorrectionImpactItem = {
  matchId: string;
  round: number;
  matchNumber?: number;
  status: MatchStatus;
  position: 1 | 2;
  winnerFlips: boolean; // この試合の勝者表示も旧側→新側に変わるか
  oldSide: ChainSide;
  newSide: ChainSide;
};

export type CorrectionImpact = {
  changed: boolean;             // 進出する側が入れ替わるか
  hasPlayedDownstream: boolean; // 完了/進行中の下流があるか（モード選択が必要か）
  blockedByActive: boolean;     // 進行中(calling/playing)の下流があるか（再試合はブロック対象）
  items: CorrectionImpactItem[];
  oldSide: ChainSide | null;
  newSide: ChainSide | null;
};

/** 結果訂正の影響を組み立てる（analyzeCorrectionImpact の純粋版） */
export function buildCorrectionImpact(m0: Match, newWinnerId: string, matches: Match[]): CorrectionImpact {
  const empty: CorrectionImpact = { changed: false, hasPlayedDownstream: false, blockedByActive: false, items: [], oldSide: null, newSide: null };
  if (!m0.winner_id || m0.winner_id === newWinnerId) return empty; // 勝者側が変わらない
  const { adv, other, items } = traceAdvancementChain(m0, matches);
  if (!adv || !other) return empty;
  const mapped: CorrectionImpactItem[] = items.map(it => ({
    matchId: it.match.id,
    round: it.match.round,
    matchNumber: it.match.match_number,
    status: it.match.status,
    position: it.position,
    winnerFlips: it.winnerWasAdv,
    oldSide: adv,
    newSide: other,
  }));
  const hasPlayedDownstream = mapped.some(i => i.status === 'completed' || i.status === 'calling' || i.status === 'playing');
  const blockedByActive = mapped.some(i => i.status === 'calling' || i.status === 'playing');
  return { changed: true, hasPlayedDownstream, blockedByActive, items: mapped, oldSide: adv, newSide: other };
}
