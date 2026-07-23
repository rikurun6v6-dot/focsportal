/**
 * score-validation.ts
 * 試合スコア確定前の入力検証。
 *
 * 従来は `p1 === 0 && p2 === 0` だけを弾き、勝者を
 * `p1 > p2 ? player1 : player2` で決めていた。
 * この式は同点（例 15-15）のとき無条件で player2 側を勝者にしてしまい、
 * 打ち間違いがそのままトーナメント表・次ラウンドの進出者まで伝播する。
 * 確定・修正のすべての入口をここに通して、同点と負値を確定前に止める。
 */

export type ScoreValidationResult =
    | { ok: true; winnerId: string }
    | { ok: false; error: string };

/**
 * スコアを検証し、問題なければ勝者の選手IDを返す。
 *
 * @param scoreP1 player1 側の得点
 * @param scoreP2 player2 側の得点
 * @param player1Id player1 の選手ID
 * @param player2Id player2 の選手ID
 */
export function validateMatchScore(
    scoreP1: number | undefined,
    scoreP2: number | undefined,
    player1Id: string | undefined,
    player2Id: string | undefined,
): ScoreValidationResult {
    const p1 = scoreP1 ?? 0;
    const p2 = scoreP2 ?? 0;

    if (!Number.isFinite(p1) || !Number.isFinite(p2)) {
        return { ok: false, error: 'スコアは数字で入力してください' };
    }
    if (p1 < 0 || p2 < 0) {
        return { ok: false, error: 'スコアに負の数は入力できません' };
    }
    if (p1 === 0 && p2 === 0) {
        return { ok: false, error: 'スコアを入力してください' };
    }
    if (p1 === p2) {
        return {
            ok: false,
            error: `スコアが同点（${p1}-${p2}）です。勝者を判定できないため確定できません`,
        };
    }

    const winnerId = p1 > p2 ? player1Id : player2Id;
    if (!winnerId) {
        return { ok: false, error: '勝者側の選手が登録されていません' };
    }

    return { ok: true, winnerId };
}
