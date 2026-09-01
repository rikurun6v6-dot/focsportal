"use client";

// 決勝戦の許可制。
//
// 「決勝戦の開始タイミング（待機モード）」は条件が揃うと自動で解放されるが、
// 運営としては「こちらが許可したタイミングだけ」入れたい。
// そのため、決勝は押すまで絶対に出ない仕組みを別に用意した。
//
//   種目ごとに「許可制にする」を ON
//     → その種目・部の決勝と3位決定戦は、自動割り当ての候補から外れる
//   準備ができたら「いま入れる」
//     → その試合だけが候補に戻り、次の巡回でコートに乗る
//
// 許可は試合単位。決勝と3位決定戦を別々のタイミングで出せる。

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { subscribeToMatches, subscribeToPlayers, getDocument, updateDocument } from "@/lib/firestore-helpers";
import { isFinalsRound } from "@/lib/matchScoring";
import { pairSideLabel } from "@/lib/pair-label";
import { eventEntryLabel } from "@/lib/event-groups";
import { toastSuccess, toastError } from "@/lib/toast";
import type { Config, Match, Player } from "@/types";
import { Trophy, Lock, Check } from "lucide-react";

export default function FinalsApproval({
  readOnly = false,
  campId,
  /**
   * 'full'       … 種目ごとの許可制ON/OFFと、全部の決勝を並べる（種目設定タブ）
   * 'ready-only' … 選手が決まっていて許可待ちの決勝だけを出す（コート状況タブ）
   *                まだ勝ち上がりが決まっていない「未定 vs 未定」は出さない
   */
  mode = "full",
}: {
  readOnly?: boolean;
  campId: string;
  mode?: "full" | "ready-only";
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [required, setRequired] = useState<Record<string, boolean>>({});
  const [approved, setApproved] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => subscribeToMatches(setMatches, campId), [campId]);
  useEffect(() => subscribeToPlayers(setPlayers, campId), [campId]);

  useEffect(() => {
    getDocument<Config>("config", campId).then(c => {
      setRequired(c?.finals_approval_required || {});
      setApproved(c?.finals_approved_match_ids || []);
    });
  }, [campId]);

  const nameOf = (id?: string) => players.find(p => p.id === id)?.name ?? "";

  /** 種目・部ごとの決勝（＝最終ラウンド。3位決定戦を含む） */
  const groups = useMemo(() => {
    const byKey = new Map<string, Match[]>();
    for (const m of matches) {
      if (m.division === undefined) continue;
      if (!isFinalsRound(m, matches)) continue;
      const k = `${m.tournament_type}_${m.division}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(m);
    }
    return [...byKey.entries()]
      .map(([key, list]) => ({
        key,
        label: eventEntryLabel(list[0].tournament_type, list[0].division!),
        matches: list.sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ja"));
  }, [matches]);

  const save = async (
    nextRequired: Record<string, boolean>,
    nextApproved: string[]
  ) => {
    await updateDocument("config", campId, {
      finals_approval_required: nextRequired,
      finals_approved_match_ids: nextApproved,
    });
  };

  const toggleRequired = async (key: string) => {
    const next = { ...required, [key]: !required[key] };
    setRequired(next);
    setBusy(key);
    try {
      await save(next, approved);
      toastSuccess(next[key] ? "許可制にしました" : "許可制を解除しました");
    } catch {
      toastError("設定の保存に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const approve = async (m: Match) => {
    if (approved.includes(m.id)) return;
    const next = [...approved, m.id];
    setApproved(next);
    setBusy(m.id);
    try {
      await save(required, next);
      toastSuccess("決勝を入れます", "次の巡回で空きコートに入ります");
    } catch {
      toastError("許可に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (m: Match) => {
    const next = approved.filter(id => id !== m.id);
    setApproved(next);
    setBusy(m.id);
    try {
      await save(required, next);
      toastSuccess("許可を取り消しました");
    } catch {
      toastError("取り消しに失敗しました");
    } finally {
      setBusy(null);
    }
  };

  // コート状況では「いま押せるもの」だけ出す。
  // 選手が未確定の決勝を並べても操作できず、画面が埋まるだけなので落とす。
  const readyNow = groups.flatMap(g =>
    g.matches
      .filter(m =>
        required[g.key] &&
        !approved.includes(m.id) &&
        m.status === "waiting" &&
        !!m.player1_id && !!m.player2_id
      )
      .map(m => ({ group: g, match: m }))
  );

  if (mode === "ready-only") {
    if (readyNow.length === 0) return null;
    return (
      <div className="space-y-2 mb-4">
        {readyNow.map(({ group, match: m }) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-2 rounded-xl border-2 border-purple-400 bg-purple-50 px-4 py-3 flex-wrap"
          >
            <div className="min-w-0">
              <div className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
                <Trophy className="w-4 h-4" />
                {group.label} {m.subtitle === "3位決定戦" ? "3位決定戦" : "決勝"} が待っています
              </div>
              <div className="text-sm text-slate-800 break-words">
                {pairSideLabel(m, 1, nameOf)} vs {pairSideLabel(m, 2, nameOf)}
              </div>
            </div>
            <Button
              size="sm"
              disabled={readOnly || busy === m.id}
              onClick={() => approve(m)}
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
              <Check className="w-3.5 h-3.5 mr-1" /> いま入れる
            </Button>
          </div>
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">決勝戦がまだ作られていません</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        許可制にした種目の決勝は、<strong>「いま入れる」を押すまで自動割り当てに出ません</strong>。
        3位決定戦も別々に出せます。
      </p>

      {groups.map(g => {
        const on = !!required[g.key];
        return (
          <div
            key={g.key}
            className={`rounded-lg border-2 p-3 space-y-2 ${
              on ? "border-purple-300 bg-purple-50/40" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Trophy className={`w-4 h-4 ${on ? "text-purple-600" : "text-slate-400"}`} />
                {g.label}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly || busy === g.key}
                onClick={() => toggleRequired(g.key)}
                className={on ? "border-purple-400 bg-white text-purple-700" : ""}
              >
                {on ? "許可制 ON" : "許可制 OFF"}
              </Button>
            </div>

            {on && g.matches.map(m => {
              const isApproved = approved.includes(m.id);
              const done = m.status === "completed";
              const running = m.status === "playing" || m.status === "calling";
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-slate-800 break-words">
                      {m.subtitle === "3位決定戦" ? "3位決定戦" : "決勝"}：{" "}
                      {pairSideLabel(m, 1, nameOf)} vs {pairSideLabel(m, 2, nameOf)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {done
                        ? "終了"
                        : running
                        ? "コート上"
                        : !m.player1_id || !m.player2_id
                        ? "勝ち上がり待ち（まだ押せません）"
                        : isApproved
                        ? "許可済み・コート待ち"
                        : "許可待ち"}
                    </div>
                  </div>
                  {!done && !running && !!m.player1_id && !!m.player2_id && (
                    isApproved ? (
                      <Button size="sm" variant="ghost" disabled={readOnly || busy === m.id}
                        onClick={() => revoke(m)} className="text-slate-500">
                        許可を取り消す
                      </Button>
                    ) : (
                      <Button size="sm" disabled={readOnly || busy === m.id}
                        onClick={() => approve(m)}
                        className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Check className="w-3.5 h-3.5 mr-1" /> いま入れる
                      </Button>
                    )
                  )}
                </div>
              );
            })}

            {!on && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> いまは他の試合と同じように自動で入ります
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
