"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMatchesByTournament, getAllPlayers, updateDocument } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Match, Player, TournamentType } from "@/types";
import { Users, Award, Save } from "lucide-react";

export default function PairSeedManager({ readOnly = false }: { readOnly?: boolean }) {
    const { camp } = useCamp();
    const [tournamentType, setTournamentType] = useState<TournamentType>("mens_doubles");
    const [matches, setMatches] = useState<Match[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!camp) return;
        const fetchData = async () => {
            setLoading(true);
            const [matchList, playerList] = await Promise.all([
                getMatchesByTournament(tournamentType, camp.id),
                getAllPlayers(camp.id)
            ]);
            // 1回戦のみ表示
            const firstRoundMatches = matchList.filter(m => m.round === 1);
            setMatches(firstRoundMatches);
            setPlayers(playerList);
            setLoading(false);
        };
        fetchData();
    }, [tournamentType, camp]);

    const handlePlayerChange = (matchIndex: number, playerKey: 'player1_id' | 'player2_id' | 'player3_id' | 'player4_id' | 'player5_id' | 'player6_id', newPlayerId: string) => {
        const updated = [...matches];
        updated[matchIndex] = { ...updated[matchIndex], [playerKey]: newPlayerId || undefined };
        setMatches(updated);
    };

    const handleSeedChange = (matchIndex: number, seedKey: 'seed_p1' | 'seed_p2', value: string) => {
        const updated = [...matches];
        const seedValue = value === '' ? undefined : parseInt(value);
        updated[matchIndex] = { ...updated[matchIndex], [seedKey]: seedValue };
        setMatches(updated);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage("");
        let savedCount = 0;
        try {
            for (const match of matches) {
                if (!match.id) {
                    console.warn('[PairSeedManager] match.id が空のためスキップ:', match);
                    continue;
                }
                const payload: Record<string, unknown> = {
                    player1_id: match.player1_id,
                    player2_id: match.player2_id,
                    player3_id: match.player3_id ?? null,
                    player4_id: match.player4_id ?? null,
                    player5_id: match.player5_id ?? null,
                    player6_id: match.player6_id ?? null,
                    seed_p1: match.seed_p1 ?? null,
                    seed_p2: match.seed_p2 ?? null,
                };
                console.log(`[PairSeedManager] 保存: matches/${match.id}`, payload);
                await updateDocument('matches', match.id, payload);
                savedCount++;
            }
            setMessage(`✓ ${savedCount}試合のペア・シード設定を保存しました`);
        } catch (error: any) {
            const detail = error?.code ? `(${error.code})` : error?.message ? `(${error.message})` : '';
            setMessage(`✗ 保存に失敗しました ${detail}`);
            console.error('[PairSeedManager] 保存エラー:', error);
        }
        setSaving(false);
    };

    const getPlayerName = (playerId?: string) => {
        if (!playerId) return "未選択";
        const player = players.find(p => p.id === playerId);
        return player ? player.name : "不明";
    };

    const isDoubles = tournamentType.includes('doubles');

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-amber-500" />
                        ペア・シード管理
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-sm font-bold text-slate-600 mb-2 block">種目選択</label>
                            <Select value={tournamentType} onValueChange={(v) => setTournamentType(v as TournamentType)}>
                                <SelectTrigger className="bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white text-slate-900">
                                    <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
                                    <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
                                    <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
                                    <SelectItem value="mens_singles">男子シングルス</SelectItem>
                                    <SelectItem value="womens_singles">女子シングルス</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleSave} disabled={saving || matches.length === 0 || readOnly} className="bg-sky-500 hover:bg-sky-600">
                            <Save className="w-4 h-4 mr-2" />
                            保存
                        </Button>
                    </div>

                    {message && (
                        <p className={`text-sm font-medium ${message.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                            {message}
                        </p>
                    )}

                    {loading && <p className="text-slate-500 text-center py-8">読み込み中...</p>}

                    {!loading && matches.length === 0 && (
                        <p className="text-slate-400 text-center py-8">1回戦の試合がまだ作成されていません</p>
                    )}

                    {!loading && matches.length > 0 && (
                        <div className="space-y-6">
                            <p className="text-sm text-slate-600">
                                1回戦の試合一覧（{matches.length}試合）
                            </p>

                            {/* 1部の試合 */}
                            {(() => {
                                const division1Matches = matches.filter(m => m.division === 1 || !m.division);
                                if (division1Matches.length === 0) return null;
                                return (
                                    <div className="space-y-4">
                                        <h3 className="text-base font-bold text-sky-700 flex items-center gap-2 border-b-2 border-sky-200 pb-2">
                                            <Users className="w-5 h-5" />
                                            1部（{division1Matches.length}試合）
                                        </h3>
                                        {division1Matches.map((match, idx) => (
                                            <Card key={match.id} className="border-2 border-sky-200 bg-sky-50/30">
                                                <CardContent className="p-4 space-y-4">
                                                    <div className="flex items-center gap-2 text-sm font-bold text-sky-700">
                                                        <Users className="w-4 h-4" />
                                                        1部 試合 {idx + 1}
                                                    </div>

                                        {/* ペア1 */}
                                        <div className="bg-sky-50 p-3 rounded space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-sky-700 w-16">ペア1</span>
                                                <Input
                                                    type="number"
                                                    placeholder="シード"
                                                    value={match.seed_p1 || ''}
                                                    onChange={(e) => handleSeedChange(idx, 'seed_p1', e.target.value)}
                                                    disabled={readOnly}
                                                    className="w-20 h-8 text-sm bg-white"
                                                />
                                                {match.seed_p1 && (
                                                    <span className="text-xs text-amber-600 font-medium">第{match.seed_p1}シード</span>
                                                )}
                                                {match.player5_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Select value={match.player1_id} onValueChange={(v) => handlePlayerChange(idx, 'player1_id', v)} disabled={readOnly}>
                                                    <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                        <SelectValue placeholder="選手1" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white max-h-[200px]">
                                                        {players.map(p => (
                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {isDoubles && (
                                                    <Select value={match.player3_id || ''} onValueChange={(v) => handlePlayerChange(idx, 'player3_id', v)} disabled={readOnly}>
                                                        <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                            <SelectValue placeholder="選手2" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-white max-h-[200px]">
                                                            {players.map(p => (
                                                                <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                {isDoubles && (
                                                    <Select value={match.player5_id || '__none__'} onValueChange={(v) => handlePlayerChange(idx, 'player5_id', v === '__none__' ? '' : v)} disabled={readOnly}>
                                                        <SelectTrigger className="flex-1 h-9 bg-amber-50 text-sm min-w-[100px] border-amber-300">
                                                            <SelectValue placeholder="3人目（任意）" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-white max-h-[200px]">
                                                            <SelectItem value="__none__">— 3人目なし —</SelectItem>
                                                            {players.map(p => (
                                                                <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        </div>

                                        {/* VS */}
                                        <div className="text-center text-xs font-bold text-slate-400">VS</div>

                                        {/* ペア2 */}
                                        <div className="bg-slate-50 p-3 rounded space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-slate-700 w-16">ペア2</span>
                                                <Input
                                                    type="number"
                                                    placeholder="シード"
                                                    value={match.seed_p2 || ''}
                                                    onChange={(e) => handleSeedChange(idx, 'seed_p2', e.target.value)}
                                                    disabled={readOnly}
                                                    className="w-20 h-8 text-sm bg-white"
                                                />
                                                {match.seed_p2 && (
                                                    <span className="text-xs text-amber-600 font-medium">第{match.seed_p2}シード</span>
                                                )}
                                                {match.player6_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Select value={match.player2_id} onValueChange={(v) => handlePlayerChange(idx, 'player2_id', v)} disabled={readOnly}>
                                                    <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                        <SelectValue placeholder="選手1" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-white max-h-[200px]">
                                                        {players.map(p => (
                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {isDoubles && (
                                                    <Select value={match.player4_id || ''} onValueChange={(v) => handlePlayerChange(idx, 'player4_id', v)} disabled={readOnly}>
                                                        <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                            <SelectValue placeholder="選手2" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-white max-h-[200px]">
                                                            {players.map(p => (
                                                                <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                {isDoubles && (
                                                    <Select value={match.player6_id || '__none__'} onValueChange={(v) => handlePlayerChange(idx, 'player6_id', v === '__none__' ? '' : v)} disabled={readOnly}>
                                                        <SelectTrigger className="flex-1 h-9 bg-amber-50 text-sm min-w-[100px] border-amber-300">
                                                            <SelectValue placeholder="3人目（任意）" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-white max-h-[200px]">
                                                            <SelectItem value="__none__">— 3人目なし —</SelectItem>
                                                            {players.map(p => (
                                                                <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* 2部の試合 */}
                            {(() => {
                                const division2Matches = matches.filter(m => m.division === 2);
                                if (division2Matches.length === 0) return null;
                                return (
                                    <div className="space-y-4">
                                        <h3 className="text-base font-bold text-purple-700 flex items-center gap-2 border-b-2 border-purple-200 pb-2">
                                            <Users className="w-5 h-5" />
                                            2部（{division2Matches.length}試合）
                                        </h3>
                                        {division2Matches.map((match, idx) => (
                                            <Card key={match.id} className="border-2 border-purple-200 bg-purple-50/30">
                                                <CardContent className="p-4 space-y-4">
                                                    <div className="flex items-center gap-2 text-sm font-bold text-purple-700">
                                                        <Users className="w-4 h-4" />
                                                        2部 試合 {idx + 1}
                                                    </div>

                                                    {/* ペア1 */}
                                                    <div className="bg-sky-50 p-3 rounded space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-sky-700 w-16">ペア1</span>
                                                            <Input
                                                                type="number"
                                                                placeholder="シード"
                                                                value={match.seed_p1 || ''}
                                                                onChange={(e) => handleSeedChange(matches.indexOf(match), 'seed_p1', e.target.value)}
                                                                disabled={readOnly}
                                                                className="w-20 h-8 text-sm bg-white"
                                                            />
                                                            {match.seed_p1 && (
                                                                <span className="text-xs text-amber-600 font-medium">第{match.seed_p1}シード</span>
                                                            )}
                                                            {match.player5_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap">
                                                            <Select value={match.player1_id} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player1_id', v)} disabled={readOnly}>
                                                                <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                                    <SelectValue placeholder="選手1" />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white max-h-[200px]">
                                                                    {players.map(p => (
                                                                        <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {isDoubles && (
                                                                <Select value={match.player3_id || ''} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player3_id', v)} disabled={readOnly}>
                                                                    <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                                        <SelectValue placeholder="選手2" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white max-h-[200px]">
                                                                        {players.map(p => (
                                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                            {isDoubles && (
                                                                <Select value={match.player5_id || '__none__'} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player5_id', v === '__none__' ? '' : v)} disabled={readOnly}>
                                                                    <SelectTrigger className="flex-1 h-9 bg-amber-50 text-sm min-w-[100px] border-amber-300">
                                                                        <SelectValue placeholder="3人目（任意）" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white max-h-[200px]">
                                                                        <SelectItem value="__none__">— 3人目なし —</SelectItem>
                                                                        {players.map(p => (
                                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* VS */}
                                                    <div className="text-center text-xs font-bold text-slate-400">VS</div>

                                                    {/* ペア2 */}
                                                    <div className="bg-slate-50 p-3 rounded space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-bold text-slate-700 w-16">ペア2</span>
                                                            <Input
                                                                type="number"
                                                                placeholder="シード"
                                                                value={match.seed_p2 || ''}
                                                                onChange={(e) => handleSeedChange(matches.indexOf(match), 'seed_p2', e.target.value)}
                                                                disabled={readOnly}
                                                                className="w-20 h-8 text-sm bg-white"
                                                            />
                                                            {match.seed_p2 && (
                                                                <span className="text-xs text-amber-600 font-medium">第{match.seed_p2}シード</span>
                                                            )}
                                                            {match.player6_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                                        </div>
                                                        <div className="flex gap-2 flex-wrap">
                                                            <Select value={match.player2_id} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player2_id', v)} disabled={readOnly}>
                                                                <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                                    <SelectValue placeholder="選手1" />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-white max-h-[200px]">
                                                                    {players.map(p => (
                                                                        <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            {isDoubles && (
                                                                <Select value={match.player4_id || ''} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player4_id', v)} disabled={readOnly}>
                                                                    <SelectTrigger className="flex-1 h-9 bg-white text-sm min-w-[100px]">
                                                                        <SelectValue placeholder="選手2" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white max-h-[200px]">
                                                                        {players.map(p => (
                                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                            {isDoubles && (
                                                                <Select value={match.player6_id || '__none__'} onValueChange={(v) => handlePlayerChange(matches.indexOf(match), 'player6_id', v === '__none__' ? '' : v)} disabled={readOnly}>
                                                                    <SelectTrigger className="flex-1 h-9 bg-amber-50 text-sm min-w-[100px] border-amber-300">
                                                                        <SelectValue placeholder="3人目（任意）" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="bg-white max-h-[200px]">
                                                                        <SelectItem value="__none__">— 3人目なし —</SelectItem>
                                                                        {players.map(p => (
                                                                            <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                            )}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
