import { Trophy, ArrowLeftRight } from "lucide-react";
import type { Match } from "@/types";
import { pairSideLabel } from "@/lib/pair-label";

// 予選リーグのブロック表（総当たり表）。
//
// 以前は1試合＝1カードを縦に並べていたが、紙のブロック表と形が違うので
// 当日の照合がしづらかった。縦横にペアを並べ、交差するマスに結果を書く形にする。
//
//            ①    ②    ③    勝  順
//   ① A/B    ／  15-9   −    1   1
//   ② C/D   9-15   ／  15-11 1   2
//   ③ E/F     −  11-15  ／   0   3
//
// マスのスコアは「行のペアから見た点数」。当日くじ前は氏名の代わりに
// 「1番ペア」のような番号が入る。

interface PreliminaryGroupProps {
  groups: string[];
  groupMatches: { [group: string]: Match[] };
  getPlayerName: (playerId?: string) => string;
  /** trueのとき、ペア名をタップすると入れ替えモードになる */
  editMode?: boolean;
  /** 現在選択中のペアキー */
  selectedPairKey?: string | null;
  onPairTap?: (pairKey: string, group: string) => void;
  /** 完了済み試合タップ時のコールバック（結果編集用） */
  onMatchTap?: (match: Match) => void;
}

/** ペアの見分け方。選手が入っていればID、まだならくじ番号で見分ける */
function sideKey(m: Match, side: 1 | 2): string {
  const ids = side === 1
    ? [m.player1_id, m.player3_id, m.player5_id]
    : [m.player2_id, m.player4_id, m.player6_id];
  const joined = ids.filter(Boolean).join("-");
  if (joined) return joined;
  const no = side === 1 ? m.pair_no_p1 : m.pair_no_p2;
  return no ? `#${no}` : "";
}

interface Row {
  key: string;
  label: string;
  no?: number;
  wins: number;
  losses: number;
  pointDiff: number;
  rank: number;
}

/** グループの1ブロックぶんを組み立てる */
function buildBlock(matches: Match[], getPlayerName: (id?: string) => string) {
  const rowMap = new Map<string, Row>();
  const cell = new Map<string, Match>(); // `${rowKey}|${colKey}` → 試合

  const touch = (m: Match, side: 1 | 2) => {
    const k = sideKey(m, side);
    if (!k) return null;
    if (!rowMap.has(k)) {
      rowMap.set(k, {
        key: k,
        label: pairSideLabel(m, side, getPlayerName),
        no: side === 1 ? m.pair_no_p1 : m.pair_no_p2,
        wins: 0, losses: 0, pointDiff: 0, rank: 0,
      });
    } else {
      // 選手が後から入ったときに表示名を更新する
      rowMap.get(k)!.label = pairSideLabel(m, side, getPlayerName);
    }
    return k;
  };

  for (const m of matches) {
    const a = touch(m, 1);
    const b = touch(m, 2);
    if (!a || !b) continue;
    cell.set(`${a}|${b}`, m);
    cell.set(`${b}|${a}`, m);

    if (m.status !== "completed") continue;
    const ra = rowMap.get(a)!;
    const rb = rowMap.get(b)!;
    ra.pointDiff += (m.score_p1 ?? 0) - (m.score_p2 ?? 0);
    rb.pointDiff += (m.score_p2 ?? 0) - (m.score_p1 ?? 0);
    const p1Won = (m.score_p1 ?? 0) > (m.score_p2 ?? 0);
    if (p1Won) { ra.wins++; rb.losses++; } else { rb.wins++; ra.losses++; }
  }

  const rows = [...rowMap.values()].sort((x, y) => {
    if (x.no != null && y.no != null) return x.no - y.no;
    if (x.no != null) return -1;
    if (y.no != null) return 1;
    return x.label.localeCompare(y.label, "ja");
  });

  // 順位（大会要項）: ①勝利数 ②直接対決 ③ゲーム得失点差
  const ranked = [...rows].sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const h2h = cell.get(`${x.key}|${y.key}`);
    if (h2h && h2h.status === "completed") {
      const xIsP1 = sideKey(h2h, 1) === x.key;
      const xs = xIsP1 ? h2h.score_p1 : h2h.score_p2;
      const ys = xIsP1 ? h2h.score_p2 : h2h.score_p1;
      if ((xs ?? 0) !== (ys ?? 0)) return (ys ?? 0) - (xs ?? 0);
    }
    return y.pointDiff - x.pointDiff;
  });
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const anyDone = matches.some(m => m.status === "completed");
  return { rows, cell, anyDone };
}

export default function PreliminaryGroup({
  groups,
  groupMatches,
  getPlayerName,
  editMode = false,
  selectedPairKey = null,
  onPairTap,
  onMatchTap,
}: PreliminaryGroupProps) {
  return (
    <div>
      <h2 className="text-lg font-bold text-violet-700 mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5" />
        予選リーグ
        {editMode && (
          <span className="text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3" />ペア名タップで入れ替え
          </span>
        )}
      </h2>

      <div className="flex flex-col gap-6 px-4 pb-4">
        {groups.map(group => {
          const { rows, cell, anyDone } = buildBlock(groupMatches[group] || [], getPlayerName);
          if (rows.length === 0) return null;

          return (
            <div key={group}>
              <h3 className="font-bold text-violet-700 text-sm bg-violet-100 rounded-md py-1.5 px-3 shadow-sm inline-block mb-2">
                グループ {group}
              </h3>

              <div className="overflow-x-auto">
                <table className="border-collapse text-xs bg-white">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 bg-slate-50 px-2 py-1.5 text-left font-semibold text-slate-600 min-w-[150px]">
                        ペア
                      </th>
                      {rows.map((c, i) => (
                        <th key={c.key}
                          className="border border-slate-300 bg-slate-50 px-1 py-1.5 text-center font-semibold text-slate-600 w-[68px]">
                          {i + 1}
                        </th>
                      ))}
                      <th className="border border-slate-300 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-600 w-[44px]">勝</th>
                      <th className="border border-slate-300 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-600 w-[44px]">順位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, ri) => (
                      <tr key={r.key}>
                        <th
                          onClick={() => editMode && onPairTap?.(r.key, group)}
                          className={`border border-slate-300 px-2 py-1.5 text-left font-medium text-slate-900 select-none ${
                            editMode
                              ? r.key === selectedPairKey
                                ? "bg-sky-100 ring-2 ring-inset ring-sky-400 cursor-pointer"
                                : selectedPairKey
                                ? "bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
                                : "bg-white hover:bg-slate-50 cursor-pointer"
                              : "bg-white"
                          }`}
                        >
                          <span className="text-slate-400 mr-1">{ri + 1}</span>
                          {r.label}
                        </th>

                        {rows.map((c, ci) => {
                          if (ri === ci) {
                            return (
                              <td key={c.key}
                                className="border border-slate-300 bg-slate-200 text-center text-slate-400">
                                ／
                              </td>
                            );
                          }
                          const m = cell.get(`${r.key}|${c.key}`);
                          if (!m) {
                            return (
                              <td key={c.key} className="border border-slate-300 bg-white text-center text-slate-300">
                                −
                              </td>
                            );
                          }
                          if (m.status === "playing" || m.status === "calling") {
                            return (
                              <td key={c.key} className="border border-slate-300 bg-blue-50 text-center text-[10px] text-blue-700 font-medium">
                                試合中
                              </td>
                            );
                          }
                          if (m.status !== "completed") {
                            return (
                              <td key={c.key} className="border border-slate-300 bg-white text-center text-slate-300">
                                −
                              </td>
                            );
                          }
                          const rIsP1 = sideKey(m, 1) === r.key;
                          const mine = (rIsP1 ? m.score_p1 : m.score_p2) ?? 0;
                          const theirs = (rIsP1 ? m.score_p2 : m.score_p1) ?? 0;
                          const won = mine > theirs;
                          return (
                            <td
                              key={c.key}
                              onClick={() => !editMode && onMatchTap?.(m)}
                              className={`border border-slate-300 text-center tabular-nums font-bold ${
                                won ? "bg-amber-50 text-amber-900" : "bg-white text-slate-500"
                              } ${!editMode && onMatchTap ? "cursor-pointer hover:bg-slate-100" : ""}`}
                            >
                              {mine}-{theirs}
                            </td>
                          );
                        })}

                        <td className="border border-slate-300 bg-slate-50 text-center font-bold text-slate-900 tabular-nums">
                          {r.wins}
                        </td>
                        <td className="border border-slate-300 bg-slate-50 text-center font-bold text-violet-700 tabular-nums">
                          {anyDone ? r.rank : "−"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-slate-500 mt-1">
                マスの数字は左のペアから見た得点。順位は 勝利数 → 直接対決 → 得失点差
                {!editMode && onMatchTap && "／終わったマスをタップで結果を直せます"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
