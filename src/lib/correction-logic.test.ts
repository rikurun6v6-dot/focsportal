import { describe, it, expect } from 'vitest';
import {
  findNextMatchInList,
  traceAdvancementChain,
  buildCorrectionImpact,
  slotUpdateFor,
  clearSlotUpdate,
  nextPositionOf,
} from './correction-logic';
import type { Match } from '@/types';

// テスト用に Match を最小構成で作るヘルパー（必須フィールドはダミーで埋める）
function m(partial: Partial<Match>): Match {
  return {
    id: 'x',
    campId: 'camp1',
    tournament_type: 'mens_doubles',
    round: 1,
    player1_id: '',
    player2_id: '',
    status: 'waiting',
    court_id: null,
    score_p1: 0,
    score_p2: 0,
    winner_id: null,
    start_time: null,
    end_time: null,
    created_at: null as unknown as Match['created_at'],
    updated_at: null as unknown as Match['updated_at'],
    ...partial,
  } as Match;
}

describe('findNextMatchInList', () => {
  it('next_match_id で次戦を引く', () => {
    const cur = m({ id: 'r1', next_match_id: 'r2' });
    const r2 = m({ id: 'r2' });
    expect(findNextMatchInList(cur, [m({ id: 'other' }), r2])).toBe(r2);
  });

  it('next_match_number + campId/種目/部 で次戦を引く', () => {
    const cur = m({ id: 'r1', next_match_number: 5, division: 1, campId: 'c1' });
    const target = m({ id: 'r2', match_number: 5, division: 1, campId: 'c1' });
    const wrongDiv = m({ id: 'rx', match_number: 5, division: 2, campId: 'c1' });
    expect(findNextMatchInList(cur, [wrongDiv, target])).toBe(target);
  });

  it('次戦が無ければ null', () => {
    expect(findNextMatchInList(m({ id: 'r1' }), [])).toBeNull();
  });
});

describe('nextPositionOf', () => {
  it('next_match_position があればそれを使う', () => {
    expect(nextPositionOf(m({ next_match_position: 2 }))).toBe(2);
  });
  it('無ければ match_number の奇偶で決める（奇=1, 偶=2）', () => {
    expect(nextPositionOf(m({ match_number: 3 }))).toBe(1);
    expect(nextPositionOf(m({ match_number: 4 }))).toBe(2);
  });
});

describe('traceAdvancementChain — ユーザーのバグ事例（誤って B を勝者にし、2回戦は B が負け）', () => {
  // R1: A vs B、誤って winner=B。次戦 r2 の position1 へ進出。
  const m0 = m({ id: 'r1', player1_id: 'A', player2_id: 'B', winner_id: 'B', status: 'completed', next_match_id: 'r2', next_match_position: 1 });
  // R2: B vs C、完了で C 勝ち（B は負け）
  const r2 = m({ id: 'r2', player1_id: 'B', player2_id: 'C', winner_id: 'C', status: 'completed' });

  it('進出側(adv)=B、正しい側(other)=A を特定する', () => {
    const { adv, other } = traceAdvancementChain(m0, [r2]);
    expect(adv?.main).toBe('B');
    expect(other?.main).toBe('A');
  });

  it('B が負けた r2 で連鎖が止まり、winnerWasAdv=false', () => {
    const { items } = traceAdvancementChain(m0, [r2]);
    expect(items).toHaveLength(1);
    expect(items[0].match.id).toBe('r2');
    expect(items[0].position).toBe(1);
    expect(items[0].winnerWasAdv).toBe(false);
  });
});

describe('traceAdvancementChain — 勝ち上がりが続く（B が R2 も勝ち R3 へ）', () => {
  const m0 = m({ id: 'r1', player1_id: 'A', player2_id: 'B', winner_id: 'B', status: 'completed', next_match_id: 'r2', next_match_position: 1 });
  const r2 = m({ id: 'r2', player1_id: 'B', player2_id: 'C', winner_id: 'B', status: 'completed', next_match_id: 'r3', next_match_position: 2 });
  const r3 = m({ id: 'r3', player1_id: 'D', player2_id: 'B', status: 'waiting' });

  it('r2(勝ち=継続) → r3(未確定=停止) の2件を辿る', () => {
    const { items } = traceAdvancementChain(m0, [r2, r3]);
    expect(items.map(i => i.match.id)).toEqual(['r2', 'r3']);
    expect(items[0].winnerWasAdv).toBe(true);
    expect(items[1].position).toBe(2);
    expect(items[1].winnerWasAdv).toBe(false);
  });
});

describe('buildCorrectionImpact', () => {
  const m0 = m({ id: 'r1', player1_id: 'A', player2_id: 'B', winner_id: 'B', status: 'completed', next_match_id: 'r2', next_match_position: 1 });
  const r2done = m({ id: 'r2', player1_id: 'B', player2_id: 'C', winner_id: 'C', status: 'completed' });

  it('勝者側が入れ替わる訂正は changed=true・影響一覧つき', () => {
    const impact = buildCorrectionImpact(m0, 'A', [r2done]);
    expect(impact.changed).toBe(true);
    expect(impact.oldSide?.main).toBe('B');
    expect(impact.newSide?.main).toBe('A');
    expect(impact.items).toHaveLength(1);
    expect(impact.items[0].winnerFlips).toBe(false);
    expect(impact.hasPlayedDownstream).toBe(true);
    expect(impact.blockedByActive).toBe(false);
  });

  it('勝者が変わらない訂正（同じ勝者）は changed=false', () => {
    const impact = buildCorrectionImpact(m0, 'B', [r2done]);
    expect(impact.changed).toBe(false);
    expect(impact.items).toHaveLength(0);
  });

  it('下流が進行中(playing)なら blockedByActive=true（再試合ブロック対象）', () => {
    const r2playing = m({ id: 'r2', player1_id: 'B', player2_id: 'C', status: 'playing' });
    const impact = buildCorrectionImpact(m0, 'A', [r2playing]);
    expect(impact.hasPlayedDownstream).toBe(true);
    expect(impact.blockedByActive).toBe(true);
  });

  it('B が勝ち上がった先は winnerFlips=true（勝者表示も修正対象）', () => {
    const m0b = m({ id: 'r1', player1_id: 'A', player2_id: 'B', winner_id: 'B', status: 'completed', next_match_id: 'r2', next_match_position: 1 });
    const r2won = m({ id: 'r2', player1_id: 'B', player2_id: 'C', winner_id: 'B', status: 'completed' });
    const impact = buildCorrectionImpact(m0b, 'A', [r2won]);
    expect(impact.items[0].winnerFlips).toBe(true);
  });
});

describe('slotUpdateFor / clearSlotUpdate（ダブルス/3人ペア対応）', () => {
  it('position1 はメイン/パートナー/3人目を player1/3/5 に置く', () => {
    expect(slotUpdateFor(1, { main: 'A', partner: 'A2', third: 'A3' })).toEqual({
      player1_id: 'A', player3_id: 'A2', player5_id: 'A3',
    });
  });
  it('position2 は player2/4/6 に置く', () => {
    expect(slotUpdateFor(2, { main: 'B', partner: null, third: null })).toEqual({
      player2_id: 'B', player4_id: null, player6_id: null,
    });
  });
  it('clearSlotUpdate は該当枠を空にする', () => {
    expect(clearSlotUpdate(1)).toEqual({ player1_id: '', player3_id: null, player5_id: null });
    expect(clearSlotUpdate(2)).toEqual({ player2_id: '', player4_id: null, player6_id: null });
  });
});
