"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { safeGetDocs } from "@/lib/firestore-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, RefreshCw, TrendingUp, BarChart2 } from "lucide-react";
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

      const busyPlayerIds = new Set<string>();
      activeMatches
        .filter(m => m.status === "calling" || m.status === "playing")
        .forEach(m => {
          if (m.player1_id) busyPlayerIds.add(m.player1_id);
          if (m.player2_id) busyPlayerIds.add(m.player2_id);
          if (m.player3_id) busyPlayerIds.add(m.player3_id);
          if (m.player4_id) busyPlayerIds.add(m.player4_id);
        });

      const minRoundByGroup = new Map<string, number>();
      for (const m of waitingMatches) {
        const key = `${m.tournament_type}_${m.division}`;
        const cur = minRoundByGroup.get(key);
        if (cur === undefined || m.round < cur) minRoundByGroup.set(key, m.round);
      }

      const scored: ScoredMatch[] = waitingMatches.map(m => {
        const key = `${m.tournament_type}_${m.division}`;
        const isRoundEligible = m.round === minRoundByGroup.get(key);
        const isRestBlocked = !!(m.available_at && now < m.available_at.toMillis());
        const playerIds = [m.player1_id, m.player2_id, m.player3_id, m.player4_id].filter(Boolean) as string[];
        const isBusyBlocked = playerIds.some(id => busyPlayerIds.has(id));

        const waitTime = Math.round((now - m.created_at.toMillis()) / 60000);
        const roundScore = ROUND_COEFFICIENT * (4 - m.round + 1);
        const divBonus = m.division === preferredDivision ? divisionBonusBase : 0;
        const isBlocked = !isRoundEligible || isRestBlocked || isBusyBlocked;
        const totalScore = isBlocked ? -1 : waitTime + roundScore + divBonus;

        let blockReason = "";
        if (!isRoundEligible) blockReason = "前ラウンド待ち";
        else if (isBusyBlocked) blockReason = "選手が試合中";
        else if (isRestBlocked) {
          const restLeft = Math.ceil((m.available_at!.toMillis() - now) / 60000);
          blockReason = `休憩中（あと${restLeft}分）`;
        }

        return { match: m, waitTime, roundScore, divBonus, totalScore, isBlocked, blockReason };
      }).sort((a, b) => {
        if (a.isBlocked && !b.isBlocked) return 1;
        if (!a.isBlocked && b.isBlocked) return -1;
        return b.totalScore - a.totalScore;
      });

      setDivisionData({ div1Total, div2Total, div1Comp, div2Comp, div1Progress, div2Progress, preferredDivision, progressGap, divisionBonusBase });
      setScoredQueue(scored);
      setCourts(courtsData);
      setPlayers(playersData);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [campId]);

  useEffect(() => {
    if (isUnlocked) fetchData();
  }, [isUnlocked, fetchData]);

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
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </div>

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
              const comp  = div === 1 ? divisionData.div1Comp  : divisionData.div2Comp;
              const prog  = div === 1 ? divisionData.div1Progress : divisionData.div2Progress;
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
                        className={`border-b border-slate-100 ${
                          item.isBlocked ? "bg-slate-50 opacity-60"
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
                        <td className="px-3 py-2">
                          {item.isBlocked ? (
                            <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {item.blockReason}
                            </span>
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
            ※ 前ラウンド待ち / 選手試合中 / 休憩中 の試合はブロック扱いでキューに入らない
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
