"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeGetDocs } from "@/lib/firestore-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, RefreshCw, TrendingUp, BarChart2, AlertTriangle, CheckCircle2, Sparkles, Bot } from "lucide-react";
import type { AIDiagnosePayload } from "@/app/api/ai-diagnose/route";
import type { Match, Court, Player } from "@/types";

interface Props {
  campId: string;
}

const ROUND_COEFFICIENT = 100;
const PASSWORD = "1203";

function getMatchGender(m: Match): "male" | "female" | null {
  if (m.tournament_type === "mens_singles" || m.tournament_type === "mens_doubles") return "male";
  if (m.tournament_type === "womens_singles" || m.tournament_type === "womens_doubles") return "female";
  return null;
}

function getTournamentLabel(type: string, division: number): string {
  const gender =
    type.includes("mens") && !type.includes("wo") ? "男子"
      : type.includes("womens") ? "女子"
        : type.includes("mixed") ? "混合"
          : "";
  const event =
    type.includes("doubles") ? "D"
      : type.includes("singles") ? "S"
        : type.includes("team_battle") ? "団"
          : "";
  const div = division > 0 ? `${division}部` : "";
  return [gender, event, div].filter(Boolean).join("");
}

interface ScoredMatch {
  match: Match;
  waitTime: number;
  roundScore: number;
  divBonus: number;
  totalScore: number;
  isBlocked: boolean;
  blockReason: string;
  blockDetail: string; // 詳細説明
}

interface DiagnosisItem {
  severity: "error" | "warn" | "info";
  title: string;
  detail: string;
}

interface DivisionData {
  div1Total: number;
  div2Total: number;
  div1Comp: number;
  div2Comp: number;
  div1Progress: number;
  div2Progress: number;
  preferredDivision: number;
  progressGap: number;
  divisionBonusBase: number;
}

export default function AdvancedAnalytics({ campId }: Props) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [divisionData, setDivisionData] = useState<DivisionData | null>(null);
  const [scoredQueue, setScoredQueue] = useState<ScoredMatch[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisItem[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTriggeredKey, setAiTriggeredKey] = useState<string>(""); // 同じ状態で重複実行しない

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("adv_analytics_unlocked") === "1") {
      setIsUnlocked(true);
    }
  }, []);

  const handleUnlock = () => {
    if (passwordInput === PASSWORD) {
      setIsUnlocked(true);
      if (typeof window !== "undefined") sessionStorage.setItem("adv_analytics_unlocked", "1");
      setError("");
    } else {
      setError("パスワードが違います");
      setPasswordInput("");
    }
  };

  const fetchData = useCallback(async () => {
    if (!campId) return;
    setLoading(true);
    try {
      const matchesRef = collection(db, "matches");
      const [activeSnap, completedSnap, courtsSnap, playersSnap] = await Promise.all([
        safeGetDocs(query(matchesRef, where("campId", "==", campId), where("status", "!=", "completed"))),
        safeGetDocs(query(matchesRef, where("campId", "==", campId), where("status", "==", "completed"))),
        safeGetDocs(query(collection(db, "courts"), where("campId", "==", campId))),
        safeGetDocs(query(collection(db, "players"), where("campId", "==", campId))),
      ]);

      const activeMatches = activeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      const completedMatches = completedSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      const allTotal = [...activeMatches, ...completedMatches];
      const courtsData = courtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
      const playersData = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Player));

      // Division progress
      const div1Total = allTotal.filter(m => m.division === 1).length;
      const div2Total = allTotal.filter(m => m.division === 2).length;
      const div1Comp = completedMatches.filter(m => m.division === 1).length;
      const div2Comp = completedMatches.filter(m => m.division === 2).length;
      const div1Progress = div1Total > 0 ? div1Comp / div1Total : 1;
      const div2Progress = div2Total > 0 ? div2Comp / div2Total : 1;
      const preferredDivision = div1Progress < div2Progress ? 1 : 2;
      const progressGap = Math.abs(div1Progress - div2Progress);
      const divisionBonusBase = Math.round(Math.min(600, progressGap * 2000));

      // Queue scoring
      const waitingMatches = activeMatches.filter(m => m.status === "waiting");
      const now = Date.now();

      // ── 試合中の選手セット（player5/6含む）──────────────────────────────────
      const busyPlayerIds = new Set<string>();
      // playerId → コート番号
      const playerCourtMap = new Map<string, number>();
      activeMatches
        .filter(m => m.status === "calling" || m.status === "playing")
        .forEach(m => {
          const court = courtsData.find(c => c.current_match_id === m.id);
          const courtNum = court?.number ?? 0;
          for (const id of [m.player1_id, m.player2_id, m.player3_id, m.player4_id,
                            (m as any).player5_id, (m as any).player6_id]) {
            if (id) { busyPlayerIds.add(id); playerCourtMap.set(id, courtNum); }
          }
        });

      // ── ラウンド順序（dispatcher.ts と同一ロジック: phase込み、全waitingから計算）──
      const minRoundByGroup = new Map<string, number>();
      for (const m of waitingMatches) {
        const key = `${m.tournament_type}_${m.division}_${(m as any).phase ?? "knockout"}`;
        const cur = minRoundByGroup.get(key);
        if (cur === undefined || m.round < cur) minRoundByGroup.set(key, m.round);
      }

      // groupKey → そのグループで最小Rを持つ待機試合リスト（「前ラウンド待ち」の原因特定用）
      const blockingRoundMatches = new Map<string, Match[]>();
      for (const m of waitingMatches) {
        const key = `${m.tournament_type}_${m.division}_${(m as any).phase ?? "knockout"}`;
        const minR = minRoundByGroup.get(key);
        if (minR !== undefined && m.round === minR) {
          const arr = blockingRoundMatches.get(key) ?? [];
          arr.push(m);
          blockingRoundMatches.set(key, arr);
        }
      }

      const pName = (id: string | null | undefined) =>
        !id ? "?" : (playersData.find(p => p.id === id)?.name ?? id.slice(0, 5));

      const scored: ScoredMatch[] = waitingMatches.map(m => {
        const key = `${m.tournament_type}_${m.division}_${(m as any).phase ?? "knockout"}`;
        const minR = minRoundByGroup.get(key);
        const isRoundEligible = m.round === minR;
        const isRestBlocked = !!(m.available_at && now < m.available_at.toMillis());
        const allPlayerIds = [m.player1_id, m.player2_id, m.player3_id, m.player4_id,
                              (m as any).player5_id, (m as any).player6_id].filter(Boolean) as string[];
        const busyPlayers = allPlayerIds.filter(id => busyPlayerIds.has(id));
        const isBusyBlocked = busyPlayers.length > 0;
        const hasNoPlayers = !m.player1_id || !m.player2_id;

        const waitTime = Math.round((now - m.created_at.toMillis()) / 60000);
        const roundScore = ROUND_COEFFICIENT * (4 - m.round + 1);
        const divBonus = m.division === preferredDivision ? divisionBonusBase : 0;
        const isBlocked = hasNoPlayers || !isRoundEligible || isRestBlocked || isBusyBlocked;
        const totalScore = isBlocked ? -1 : waitTime + roundScore + divBonus;

        let blockReason = "";
        let blockDetail = "";

        if (hasNoPlayers) {
          blockReason = "選手未確定";
          blockDetail = "前ラウンドの結果待ちで対戦相手が決まっていません。";
        } else if (!isRoundEligible) {
          const blocking = blockingRoundMatches.get(key) ?? [];
          const names = blocking.slice(0, 2).map(bm =>
            `#${bm.match_number}（${pName(bm.player1_id)} vs ${pName(bm.player2_id)}）`
          ).join("、");
          blockReason = `${minR}回戦が未完了`;
          blockDetail = `同種目の${minR}回戦が先に終わる必要があります。待機中: ${names}${blocking.length > 2 ? `他${blocking.length - 2}試合` : ""}`;
        } else if (isBusyBlocked) {
          const detail = busyPlayers.map(id => {
            const courtNum = playerCourtMap.get(id);
            return `${pName(id)}（第${courtNum}コート試合中）`;
          }).join("、");
          blockReason = "選手が試合中";
          blockDetail = detail;
        } else if (isRestBlocked) {
          const restLeft = Math.ceil((m.available_at!.toMillis() - now) / 60000);
          blockReason = `休憩中（あと${restLeft}分）`;
          blockDetail = `available_at が設定されており、まだ休憩時間が残っています（残り約${restLeft}分）。`;
        }

        return { match: m, waitTime, roundScore, divBonus, totalScore, isBlocked, blockReason, blockDetail };
      }).sort((a, b) => {
        if (a.isBlocked && !b.isBlocked) return 1;
        if (!a.isBlocked && b.isBlocked) return -1;
        return b.totalScore - a.totalScore;
      });

      // ── AI診断 ─────────────────────────────────────────────────────────────
      const freeCourts = courtsData.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);
      const diagItems: DiagnosisItem[] = [];

      const assignable = scored.filter(s => !s.isBlocked);
      const roundBlocked = scored.filter(s => s.isBlocked && s.blockReason.includes("回戦"));
      const busyBlocked = scored.filter(s => s.isBlocked && s.blockReason === "選手が試合中");
      const restBlocked = scored.filter(s => s.isBlocked && s.blockReason.includes("休憩"));
      const noPlayerBlocked = scored.filter(s => s.isBlocked && s.blockReason === "選手未確定");

      if (freeCourts.length > 0 && assignable.length === 0 && scored.length > 0) {
        diagItems.push({
          severity: "error",
          title: `空きコート${freeCourts.length}面があるのに割り当て可能な試合がありません`,
          detail: [
            roundBlocked.length > 0 ? `前ラウンド待ち: ${roundBlocked.length}試合` : "",
            busyBlocked.length > 0 ? `選手試合中: ${busyBlocked.length}試合` : "",
            restBlocked.length > 0 ? `休憩中: ${restBlocked.length}試合` : "",
            noPlayerBlocked.length > 0 ? `選手未確定: ${noPlayerBlocked.length}試合` : "",
          ].filter(Boolean).join(" / "),
        });
      } else if (freeCourts.length > assignable.length && assignable.length < scored.length) {
        diagItems.push({
          severity: "warn",
          title: `割り当て可能: ${assignable.length}試合、空きコート: ${freeCourts.length}面（コートが余っています）`,
          detail: "ブロック中の試合が解除されると自動的に割り当てられます。",
        });
      } else if (assignable.length > 0) {
        diagItems.push({
          severity: "info",
          title: `割り当て可能: ${assignable.length}試合 → 自動割り当てボタンで即時実行できます`,
          detail: `優先度トップ: ${assignable[0] ? getTournamentLabel(assignable[0].match.tournament_type ?? "", assignable[0].match.division ?? 0) + ` ${assignable[0].match.round}回戦 #${assignable[0].match.match_number}` : "-"}`,
        });
      }

      // ラウンドスキップ問題の警告
      const roundIssueGroups = new Set<string>();
      for (const s of scored) {
        if (!s.isBlocked) continue;
        if (!s.blockReason.includes("回戦")) continue;
        const key = `${s.match.tournament_type}_${s.match.division}_${(s.match as any).phase ?? "knockout"}`;
        const blocking = blockingRoundMatches.get(key) ?? [];
        // 前ラウンドの試合が全てbusyBlocked → 「待てば解消」
        const allBusy = blocking.every(bm => {
          const ids = [bm.player1_id, bm.player2_id].filter(Boolean) as string[];
          return ids.some(id => busyPlayerIds.has(id));
        });
        if (!allBusy) roundIssueGroups.add(key);
      }
      if (roundIssueGroups.size > 0) {
        diagItems.push({
          severity: "warn",
          title: `${roundIssueGroups.size}グループで前ラウンドの試合が選手未確定のまま停止しています`,
          detail: "前ラウンドの試合に選手が設定されていないか、ウォークオーバー処理が必要な可能性があります。安全タブの欠場処理をご確認ください。",
        });
      }

      setDivisionData({ div1Total, div2Total, div1Comp, div2Comp, div1Progress, div2Progress, preferredDivision, progressGap, divisionBonusBase });
      setScoredQueue(scored);
      setCourts(courtsData);
      setPlayers(playersData);
      setDiagnosis(diagItems);
      setLastUpdated(new Date());

      // エラーまたは警告がある場合のみAI診断ペイロードを返す
      const hasIssue = diagItems.some(d => d.severity === "error" || d.severity === "warn");
      if (hasIssue) {
        const payload: AIDiagnosePayload = {
          freeCourts: freeCourts.length,
          totalCourts: courtsData.filter(c => c.is_active).length,
          waitingTotal: waitingMatches.length,
          assignable: scored.filter(s => !s.isBlocked).length,
          div1Progress, div2Progress,
          div1Comp, div1Total, div2Comp, div2Total,
          blockedMatches: scored.filter(s => s.isBlocked).map(s => ({
            matchNumber: s.match.match_number ?? 0,
            label: getTournamentLabel(s.match.tournament_type ?? "", s.match.division ?? 0),
            round: s.match.round,
            blockReason: s.blockReason,
            blockDetail: s.blockDetail,
          })),
          diagnosisItems: diagItems,
        };
        return payload;
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [campId]);

  const runAIDiagnosis = useCallback(async (payload: AIDiagnosePayload, triggerKey: string) => {
    if (aiTriggeredKey === triggerKey) return; // 同一状態で重複実行しない
    setAiTriggeredKey(triggerKey);
    setAiAnalysis("");
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai-diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        setAiAnalysis(`エラー: ${text}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setAiAnalysis(accumulated);
      }
    } catch (e: any) {
      setAiAnalysis(`通信エラー: ${e?.message ?? e}`);
    } finally {
      setAiLoading(false);
    }
  }, [aiTriggeredKey]);

  const fetchAndMaybeDiagnose = useCallback(async () => {
    const payload = await fetchData();
    if (payload) {
      // ブロック数とタイムスタンプをキーにして、同じ状態で重複しない
      const key = `${payload.freeCourts}-${payload.assignable}-${payload.waitingTotal}-${Date.now().toString().slice(0, -4)}`;
      runAIDiagnosis(payload, key);
    }
  }, [fetchData, runAIDiagnosis]);

  useEffect(() => {
    if (isUnlocked) fetchAndMaybeDiagnose();
  }, [isUnlocked, fetchAndMaybeDiagnose]);

  const getPlayerName = (id: string | null | undefined) => {
    if (!id) return "-";
    return players.find(p => p.id === id)?.name ?? id.slice(0, 6);
  };

  const freeCourtsCount = courts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed).length;

  if (!isUnlocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-sm border-t-4 border-t-violet-500">
          <CardHeader className="text-center pb-2">
            <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-violet-600" />
            </div>
            <CardTitle className="text-lg">応用機能</CardTitle>
            <p className="text-xs text-slate-500 mt-1">パスワードを入力してください</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              placeholder="パスワード"
              className="w-full border rounded-lg px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-violet-400"
              autoFocus
            />
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <button
              onClick={handleUnlock}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              ロック解除
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">応用機能ダッシュボード</h2>
          <p className="text-xs text-slate-400">
            {lastUpdated ? `最終更新: ${lastUpdated.toLocaleTimeString("ja-JP")}` : "読み込み中..."}
          </p>
        </div>
        <button
          onClick={fetchAndMaybeDiagnose}
          disabled={loading || aiLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

      {/* AI診断カード */}
      {diagnosis.length > 0 && (
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              AI診断 — 割り当てブロック分析
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            {diagnosis.map((d, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2.5 border text-sm ${
                  d.severity === "error"
                    ? "bg-red-50 border-red-200 text-red-800"
                    : d.severity === "warn"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-sky-50 border-sky-200 text-sky-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  {d.severity === "error" ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                  ) : d.severity === "warn" ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-sky-500" />
                  )}
                  <div>
                    <p className="font-semibold leading-snug">{d.title}</p>
                    {d.detail && <p className="text-xs mt-0.5 opacity-80 leading-snug">{d.detail}</p>}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Claude AI 詳細分析カード */}
      {(aiLoading || aiAnalysis) && (
        <Card className="border-t-4 border-t-violet-600">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-600" />
                Claude AI による詳細分析
                {aiLoading && (
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded animate-pulse font-medium">
                    分析中...
                  </span>
                )}
              </CardTitle>
              {!aiLoading && aiAnalysis && (
                <button
                  onClick={() => {
                    // 強制再診断
                    const d = diagnosis;
                    const scored = scoredQueue;
                    const freeCourts = courts.filter(c => c.is_active && !c.current_match_id && !c.manually_freed);
                    const payload: AIDiagnosePayload = {
                      freeCourts: freeCourts.length,
                      totalCourts: courts.filter(c => c.is_active).length,
                      waitingTotal: scored.length,
                      assignable: scored.filter(s => !s.isBlocked).length,
                      div1Progress: divisionData?.div1Progress ?? 0,
                      div2Progress: divisionData?.div2Progress ?? 0,
                      div1Comp: divisionData?.div1Comp ?? 0,
                      div1Total: divisionData?.div1Total ?? 0,
                      div2Comp: divisionData?.div2Comp ?? 0,
                      div2Total: divisionData?.div2Total ?? 0,
                      blockedMatches: scored.filter(s => s.isBlocked).map(s => ({
                        matchNumber: s.match.match_number ?? 0,
                        label: getTournamentLabel(s.match.tournament_type ?? "", s.match.division ?? 0),
                        round: s.match.round,
                        blockReason: s.blockReason,
                        blockDetail: s.blockDetail,
                      })),
                      diagnosisItems: d,
                    };
                    runAIDiagnosis(payload, `force-${Date.now()}`);
                  }}
                  className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  再診断
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-1">
            {aiLoading && !aiAnalysis ? (
              <div className="flex items-center gap-3 py-6 text-slate-400">
                <Sparkles className="w-5 h-5 animate-pulse text-violet-400" />
                <span className="text-sm">Claude が状況を分析しています...</span>
              </div>
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-violet-50 rounded-lg px-4 py-3 border border-violet-100">
                {aiAnalysis}
                {aiLoading && (
                  <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 1部 / 2部 進行バランス */}
      {divisionData && (
        <Card className="border-t-4 border-t-violet-500">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-violet-600" />
              1部 / 2部 進行バランス
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2].map(div => {
              const total = div === 1 ? divisionData.div1Total : divisionData.div2Total;
              const comp = div === 1 ? divisionData.div1Comp : divisionData.div2Comp;
              const prog = div === 1 ? divisionData.div1Progress : divisionData.div2Progress;
              const isPref = divisionData.preferredDivision === div && divisionData.progressGap > 0.005;
              return (
                <div key={div}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">
                      {div}部
                      {isPref && (
                        <span className="ml-2 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-bold">優先中</span>
                      )}
                    </span>
                    <span className="text-sm text-slate-500">
                      {comp} / {total} 完了（{Math.round(prog * 100)}%）
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isPref ? "bg-violet-500" : "bg-slate-400"}`}
                      style={{ width: `${Math.round(prog * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              <div className="text-center">
                <p className="text-[10px] text-slate-400 mb-1">進行差</p>
                <p className={`text-xl font-bold ${divisionData.progressGap > 0.1 ? "text-orange-500" : "text-slate-700"}`}>
                  {Math.round(divisionData.progressGap * 100)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 mb-1">部ボーナス</p>
                <p className={`text-xl font-bold ${divisionData.divisionBonusBase > 0 ? "text-violet-600" : "text-slate-400"}`}>
                  +{divisionData.divisionBonusBase}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-400 mb-1">優先部</p>
                <p className="text-xl font-bold text-violet-700">
                  {divisionData.progressGap < 0.005 ? "同率" : `${divisionData.preferredDivision}部`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 優先キュー */}
      <Card className="border-t-4 border-t-sky-500">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600" />
            優先キュー（待機 {scoredQueue.length} 試合 / 空きコート {freeCourtsCount} 面）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {scoredQueue.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">待機中の試合はありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <th className="px-3 py-2 text-left">順位</th>
                    <th className="px-3 py-2 text-left">試合#</th>
                    <th className="px-3 py-2 text-left">種目</th>
                    <th className="px-3 py-2 text-left">対戦</th>
                    <th className="px-3 py-2 text-right">待機(m)</th>
                    <th className="px-3 py-2 text-right">Rスコア</th>
                    <th className="px-3 py-2 text-right">部B</th>
                    <th className="px-3 py-2 text-right">合計</th>
                    <th className="px-3 py-2 text-left">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {scoredQueue.map((item, idx) => {
                    const isNext = !item.isBlocked && idx < freeCourtsCount;
                    return (
                      <tr
                        key={item.match.id}
                        className={`border-b border-slate-100 ${item.isBlocked ? "bg-slate-50 opacity-60"
                          : isNext ? "bg-sky-50"
                            : ""
                          }`}
                      >
                        <td className="px-3 py-2 font-bold text-slate-500">
                          {item.isBlocked ? "—" : idx + 1}
                        </td>
                        <td className="px-3 py-2 text-slate-700">#{item.match.match_number}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {getTournamentLabel(item.match.tournament_type || "", item.match.division || 0)}
                          <span className="ml-1 text-slate-400">{item.match.round}R</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">
                          {getPlayerName(item.match.player1_id)}
                          {item.match.player3_id ? `/${getPlayerName(item.match.player3_id)}` : ""}
                          <span className="text-slate-400 mx-1">vs</span>
                          {getPlayerName(item.match.player2_id)}
                          {item.match.player4_id ? `/${getPlayerName(item.match.player4_id)}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">{item.waitTime}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{item.roundScore}</td>
                        <td className="px-3 py-2 text-right font-medium text-violet-600">
                          {item.divBonus > 0 ? `+${item.divBonus}` : "0"}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-sky-700">
                          {item.isBlocked ? "—" : Math.round(item.totalScore)}
                        </td>
                        <td className="px-3 py-2 max-w-[220px]">
                          {item.isBlocked ? (
                            <div>
                              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded whitespace-nowrap font-medium">
                                {item.blockReason}
                              </span>
                              {item.blockDetail && (
                                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight break-words">
                                  {item.blockDetail}
                                </p>
                              )}
                            </div>
                          ) : isNext ? (
                            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-bold">次</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* スコア計算式 */}
      <Card className="border border-slate-200 bg-slate-50">
        <CardContent className="pt-4 pb-3">
          <p className="text-[11px] font-medium text-slate-600 mb-1">スコア計算式（高いほど優先）</p>
          <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
            合計 = 待機時間(分) + ラウンドスコア(100×(4-R+1)) + 部ボーナス(gap×2000, 上限600)
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            ※ ブロック条件（優先順位）: ①選手未確定（前ラウンド結果待ち） → ②同種目・同部の前ラウンドが待機中 → ③選手が他試合中 → ④休憩中（available_at）<br/>
            ※ ラウンド順序は <strong>phase（予選/本戦）を分けて</strong> 計算。全waitingから最小Rを特定するため、選手が別試合中でも前ラウンドが残っていれば後ラウンドはブロックされます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
