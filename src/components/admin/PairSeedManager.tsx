"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMatchesByTournament, getAllPlayers, updateDocument, propagateByePlayerChange } from "@/lib/firestore-helpers";
import { writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCamp } from "@/context/CampContext";
import type { Match, Player, TournamentType } from "@/types";
import { Users, Award, Save } from "lucide-react";

// 部ごとの配色。Tailwind はクラス名を静的に拾うので、テンプレート文字列で
// 組み立てず、完成したクラス名をここに書いておく。
import { getDivisionsInUse } from '@/lib/divisions';

const DIVISION_COLOR: Record<number, {
  head: string; card: string; label: string;
}> = {
  1: { head: 'text-sky-700 border-sky-200',       card: 'border-sky-200 bg-sky-50/30',       label: 'text-sky-700' },
  2: { head: 'text-purple-700 border-purple-200', card: 'border-purple-200 bg-purple-50/30', label: 'text-purple-700' },
  3: { head: 'text-amber-700 border-amber-200',   card: 'border-amber-200 bg-amber-50/30',   label: 'text-amber-700' },
};

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
            const allMatches = await getMatchesByTournament(tournamentType, camp!.id);
            const batch = writeBatch(db);

            for (const match of matches) {
                if (!match.id) {
                    console.warn('[PairSeedManager] match.id が空のためスキップ:', match);
                    continue;
                }
                const hasP1 = !!match.player1_id;
                const hasP2 = !!match.player2_id;

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

                if (match.is_walkover && hasP1 && hasP2) {
                    payload.is_walkover = false;
                    payload.walkover_winner = null;
                    payload.status = 'waiting';
                    payload.winner_id = null;
                    payload.end_time = null;
                    payload.court_id = null;

                    const nextPos = match.next_match_position ?? 1;
                    let nextMatch: Match | undefined;
                    if (match.next_match_id) {
                        nextMatch = allMatches.find(m => m.id === match.next_match_id);
                    } else if (match.next_match_number != null) {
                        nextMatch = allMatches.find(m =>
                            m.match_number === match.next_match_number &&
                            m.division === match.division
                        );
                    }
                    if (nextMatch && nextMatch.status !== 'completed') {
                        const clearUpdate: Record<string, unknown> =
                            nextPos === 1
                                ? { player1_id: '', player3_id: null, player5_id: null }
                                : { player2_id: '', player4_id: null, player6_id: null };
                        batch.update(doc(db, 'matches', nextMatch.id), clearUpdate);
                    }
                }

                batch.update(doc(db, 'matches', match.id), payload);
                savedCount++;
            }

            await batch.commit();
            setMessage(`✓ ${savedCount}試合のペア・シード設定を保存しました`);

            // BYE伝播（バッチ後に実行）
            for (const match of matches) {
                const hasP1 = !!match.player1_id;
                const hasP2 = !!match.player2_id;
                if ((hasP1 !== hasP2) && (match.next_match_id || match.next_match_number != null)) {
                    const payload = {
                        player1_id: match.player1_id,
                        player2_id: match.player2_id,
                        player3_id: match.player3_id ?? null,
                        player4_id: match.player4_id ?? null,
                        player5_id: match.player5_id ?? null,
                        player6_id: match.player6_id ?? null,
                    };
                    const updatedMatch = { ...match, ...payload } as Match;
                    await propagateByePlayerChange(updatedMatch, allMatches);
                }
            }
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

    // 実際に試合がある部だけを出す（無ければ既定の1〜3部）

    const divisionsInUse = getDivisionsInUse(matches);


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
                            一括確定保存
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

                            {/* 部ごとの試合。以前は1部・2部を別々にベタ書きしていて3部が画面に出なかった */}
                            {divisionsInUse.map(div => {
                                const divMatches = matches.filter(m =>
                                    m.division === div || (!m.division && div === divisionsInUse[0])
                                );
                                if (divMatches.length === 0) return null;
                                const c = DIVISION_COLOR[div] ?? DIVISION_COLOR[1];
                                return (
                                    <div className="space-y-4">
                                        <h3 className={`text-base font-bold flex items-center gap-2 border-b-2 pb-2 ${c.head}`}>
                                            <Users className="w-5 h-5" />
                                            {div}部（{divMatches.length}試合）
                                        </h3>
                                        {divMatches.map((match, idx) => {
                                            const matchIndex = matches.indexOf(match);
                                            return (
                                            <Card key={match.id} className={`border-2 ${c.card}`}>
                                                <CardContent className="p-4 space-y-4">
                                                    <div className={`flex items-center gap-2 text-sm font-bold ${c.label}`}>
                                                        <Users className="w-4 h-4" />
                                                        {div}部 試合 {idx + 1}
                                                    </div>

                                        {/* ペア1 */}
                                        <div className="bg-slate-50 p-3 rounded space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold w-16 ${c.label}`}>ペア1</span>
                                                <Input
                                                    type="number"
                                                    placeholder="シード"
                                                    value={match.seed_p1 || ''}
                                                    onChange={(e) => handleSeedChange(matchIndex, 'seed_p1', e.target.value)}
                                                    disabled={readOnly}
                                                    className="w-20 h-8 text-sm bg-white"
                                                />
                                                {match.seed_p1 && (
                                                    <span className="text-xs text-amber-600 font-medium">第{match.seed_p1}シード</span>
                                                )}
                                                {match.player5_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Select value={match.player1_id} onValueChange={(v) => handlePlayerChange(matchIndex, 'player1_id', v)} disabled={readOnly}>
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
                                                    <Select value={match.player3_id || ''} onValueChange={(v) => handlePlayerChange(matchIndex, 'player3_id', v)} disabled={readOnly}>
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
                                                    <Select value={match.player5_id || '__none__'} onValueChange={(v) => handlePlayerChange(matchIndex, 'player5_id', v === '__none__' ? '' : v)} disabled={readOnly}>
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
                                                    onChange={(e) => handleSeedChange(matchIndex, 'seed_p2', e.target.value)}
                                                    disabled={readOnly}
                                                    className="w-20 h-8 text-sm bg-white"
                                                />
                                                {match.seed_p2 && (
                                                    <span className="text-xs text-amber-600 font-medium">第{match.seed_p2}シード</span>
                                                )}
                                                {match.player6_id && <span className="text-xs text-amber-600 font-bold ml-1">3人組</span>}
                                            </div>
                                            <div className="flex gap-2 flex-wrap">
                                                <Select value={match.player2_id} onValueChange={(v) => handlePlayerChange(matchIndex, 'player2_id', v)} disabled={readOnly}>
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
                                                    <Select value={match.player4_id || ''} onValueChange={(v) => handlePlayerChange(matchIndex, 'player4_id', v)} disabled={readOnly}>
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
                                                    <Select value={match.player6_id || '__none__'} onValueChange={(v) => handlePlayerChange(matchIndex, 'player6_id', v === '__none__' ? '' : v)} disabled={readOnly}>
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
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
