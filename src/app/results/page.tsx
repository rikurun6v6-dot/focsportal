"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCamp } from "@/context/CampContext";
import { getAllMatches, getAllPlayers, getAllDocuments, subscribeToTeamTournamentState } from "@/lib/firestore-helpers";
import { where } from "firebase/firestore";
import { computeAllPodiums, getCategoryLabel, getDivisionLabel, type CategoryPodium } from "@/lib/awards";
import { computeTeamResults, type TeamResults } from "@/lib/team-results";
import TeamStandingsTable from "@/components/TeamStandingsTable";
import type { Match, Player, Team } from "@/types";
import { Home, RefreshCw, Trophy } from "lucide-react";

export default function ResultsPage() {
    const { camp, loading: campLoading } = useCamp();
    const [podiums, setPodiums] = useState<CategoryPodium[]>([]);
    const [teamResults, setTeamResults] = useState<TeamResults | null>(null);
    const [loading, setLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState<string>("");

    const loadPodiums = useCallback(async () => {
        if (!camp) return;
        try {
            const [matches, players, teams] = await Promise.all([
                getAllMatches(camp.id),
                getAllPlayers(camp.id),
                getAllDocuments<Team>("teams", [where("campId", "==", camp.id)]),
            ]);
            const playersMap = new Map<string, Player>(players.map(p => [p.id, p]));
            const teamsMap = new Map<string, string>(teams.map(t => [t.id, t.name]));
            setPodiums(computeAllPodiums(matches as Match[], playersMap, teamsMap));
            const now = new Date();
            setUpdatedAt(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
        } catch (e) {
            console.error("結果の取得に失敗", e);
        } finally {
            setLoading(false);
        }
    }, [camp]);

    useEffect(() => {
        if (!camp) return;
        loadPodiums();
        // 発表中に最後の種目が終わることがあるので、定期的に取り直す
        const t = setInterval(loadPodiums, 30000);
        return () => clearInterval(t);
    }, [camp, loadPodiums]);

    // 団体戦は運営の入力がそのまま反映されるよう購読する
    useEffect(() => {
        if (!camp?.id) return;
        const unsubscribe = subscribeToTeamTournamentState(camp.id, state => {
            setTeamResults(computeTeamResults(state));
        });
        return () => unsubscribe();
    }, [camp?.id]);

    if (campLoading || (loading && !camp)) {
        return <div className="min-h-screen flex items-center justify-center text-slate-500 bg-slate-50">読み込み中...</div>;
    }

    if (!camp) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 gap-4">
                <p className="text-slate-600">大会が選ばれていません</p>
                <Link href="/user"><Button variant="outline">参加者画面へ</Button></Link>
            </div>
        );
    }

    const decided = podiums.filter(p => p.finalized);
    const pending = podiums.filter(p => !p.finalized);
    const hasTeam = !!teamResults && (teamResults.standings.length > 0 || teamResults.groupStandings.length > 0);

    return (
        <div className="min-h-screen bg-slate-50 pb-16">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="container mx-auto px-4 py-3 max-w-4xl flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-slate-800 truncate">結果発表</h1>
                        <p className="text-xs text-slate-500 truncate">{camp.title}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={loadPodiums}
                            className="w-11 h-11 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 gap-0.5"
                            aria-label="最新の結果に更新"
                        >
                            <RefreshCw className="w-4 h-4 text-slate-600" />
                            <span className="text-[11px] text-slate-500 leading-none">更新</span>
                        </button>
                        <Link href="/user">
                            <button className="w-11 h-11 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 gap-0.5" aria-label="参加者画面に戻る">
                                <Home className="w-4 h-4 text-slate-600" />
                                <span className="text-[11px] text-slate-500 leading-none">戻る</span>
                            </button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-4 max-w-4xl space-y-6">
                {updatedAt && <p className="text-xs text-slate-400 text-right">{updatedAt} 時点</p>}

                {/* 個人種目の1〜3位 */}
                <section className="space-y-3">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-500" />
                        各種目の順位
                    </h2>

                    {decided.length === 0 && pending.length === 0 && (
                        <Card><CardContent className="py-8 text-center text-sm text-slate-500">まだ確定した種目はありません</CardContent></Card>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {decided.map(p => (
                            <Card key={`${p.tournamentType}_${p.division}`} className="border-t-4 border-t-amber-400">
                                <CardContent className="p-4 space-y-2">
                                    <h3 className="font-bold text-slate-800">
                                        {getCategoryLabel(p.tournamentType)}
                                        <span className="ml-2 text-xs font-medium text-slate-500">{getDivisionLabel(p.division)}</span>
                                    </h3>
                                    <dl className="space-y-1.5">
                                        <div className="flex items-baseline gap-3">
                                            <dt className="w-14 shrink-0 text-xs font-bold text-amber-700">優勝</dt>
                                            <dd className="text-sm font-bold text-slate-900">{p.champion?.label ?? "—"}</dd>
                                        </div>
                                        <div className="flex items-baseline gap-3">
                                            <dt className="w-14 shrink-0 text-xs font-bold text-slate-600">準優勝</dt>
                                            <dd className="text-sm text-slate-800">{p.runnerUp?.label ?? "—"}</dd>
                                        </div>
                                        <div className="flex items-baseline gap-3">
                                            <dt className="w-14 shrink-0 text-xs font-bold text-orange-700">
                                                3位{p.thirdShared && p.third.length > 1 ? "（同）" : ""}
                                            </dt>
                                            <dd className="text-sm text-slate-800">
                                                {p.third.length > 0 ? p.third.map(t => t.label).join(" ／ ") : "—"}
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {pending.length > 0 && (
                        <p className="text-xs text-slate-500">
                            進行中: {pending.map(p => `${getCategoryLabel(p.tournamentType)}${getDivisionLabel(p.division)}`).join(" / ")}
                        </p>
                    )}
                </section>

                {/* 団体戦 */}
                {hasTeam && teamResults && (
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-violet-500" />
                            団体戦
                        </h2>

                        {teamResults.standings.length > 0 ? (
                            <Card className="border-t-4 border-t-violet-400">
                                <CardContent className="p-0">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {teamResults.standings.map(s => (
                                                <tr key={s.rank} className={`border-b border-slate-100 last:border-0 ${s.rank === 1 ? "bg-amber-50" : ""}`}>
                                                    <td className="py-2.5 px-4 w-16 font-bold text-slate-700 tabular-nums">{s.rank}位</td>
                                                    <td className="py-2.5 px-4 font-medium text-slate-900">{s.teamName}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </CardContent>
                            </Card>
                        ) : (
                            <p className="text-sm text-slate-500">最終順位はまだ確定していません</p>
                        )}

                        {!teamResults.complete && teamResults.standings.length > 0 && (
                            <p className="text-xs text-amber-700">まだ全順位が確定していません（進行中の順位決定戦があります）</p>
                        )}

                        {/* 予選のグループ順位も併せて出す */}
                        {teamResults.groupStandings.length > 0 && (
                            <div className="space-y-3 pt-1">
                                <h3 className="text-sm font-bold text-slate-700">予選グループ順位</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {teamResults.groupStandings.map(({ group, rankings }) => (
                                        <div key={group} className="space-y-2">
                                            <p className="text-center font-bold text-violet-700 text-sm bg-violet-100 rounded-md py-1.5">
                                                グループ {group}
                                            </p>
                                            <TeamStandingsTable
                                                rankings={rankings}
                                                getTeamName={id => teamResults.teamNames[id] ?? id}
                                                rankOrder={teamResults.rankOrder}
                                                showLegend={false}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}
