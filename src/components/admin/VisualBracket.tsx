"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { subscribeToMatchesByTournament, subscribeToPlayers } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Match, Player, TournamentType, Division } from "@/types";
import { Trophy, Users, Search, X, Camera, Download } from "lucide-react";
import PreliminaryGroup from "./PreliminaryGroup";
import KnockoutTree from "./KnockoutTree";
import { getUnifiedRoundName, getTournamentTypeName } from "@/lib/tournament-logic";
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import { toastSuccess, toastError } from "@/lib/toast";

export default function VisualBracket({ readOnly = false }: { readOnly?: boolean }) {
    const { camp } = useCamp();
    const [tournamentType, setTournamentType] = useState<TournamentType>("mens_doubles");
    const [division, setDivision] = useState<Division>(1);
    const [matches, setMatches] = useState<Match[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [exporting, setExporting] = useState(false);
    const bracketRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!camp) return;

        setLoading(true);

        // リアルタイム購読
        const unsubscribeMatches = subscribeToMatchesByTournament(
            tournamentType,
            (matchList) => {
                console.log(`🔍 [VisualBracket] Firestore取得完了: ${matchList.length}件`);
                matchList.forEach(match => {
                    console.log(`🔍 [VisualBracket] matches/${match.id} (round=${match.round}, match_number=${match.match_number})`);
                });
                setMatches(matchList);
                setLoading(false);
            },
            camp.id
        );

        const unsubscribePlayers = subscribeToPlayers(
            (playerList) => {
                setPlayers(playerList);
            },
            camp.id
        );

        return () => {
            unsubscribeMatches();
            unsubscribePlayers();
        };
    }, [tournamentType, camp]);

    const getPlayerName = (playerId?: string) => {
        if (!playerId) return "未定";
        const player = players.find(p => p.id === playerId);
        return player ? player.name : "不明";
    };

    /**
     * トーナメント表を画像として保存
     */
    const handleSaveAsImage = async () => {
        if (!bracketRef.current) return;

        setExporting(true);
        try {
            // 画像生成（高解像度）
            const dataUrl = await toPng(bracketRef.current, {
                quality: 1.0,
                pixelRatio: 2, // 2倍の解像度で生成
                cacheBust: true,
                backgroundColor: '#ffffff'
            });

            // ファイル名を生成
            const tournamentName = getTournamentTypeName(tournamentType);
            const divisionText = `${division}部`;
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const fileName = `${tournamentName}_${divisionText}_トーナメント表_${timestamp}.png`;

            // ダウンロード
            saveAs(dataUrl, fileName);
            toastSuccess('画像を保存しました');
        } catch (error) {
            console.error('Image export error:', error);
            toastError('画像の保存に失敗しました');
        } finally {
            setExporting(false);
        }
    };

    /**
     * 試合がBye（片方が空）かどうかを判定
     */
    const isByeMatch = (match: Match): boolean => {
        const hasPlayer1 = !!match.player1_id;
        const hasPlayer2 = !!match.player2_id;
        return hasPlayer1 !== hasPlayer2; // 片方だけが存在する場合はBye
    };

    /**
     * 各ラウンドの実戦試合のみをフィルタリング
     */
    const getActualMatchesInRound = (round: number): Match[] => {
        const matchesInRound = knockoutMatches.filter(m => m.round === round);
        // 1回戦のみByeを除外
        if (round === 1) {
            return matchesInRound.filter(m => !isByeMatch(m));
        }
        return matchesInRound;
    };

    /**
     * 実戦試合の採番（各ラウンドで1から開始）
     */
    const getActualMatchNumber = (match: Match): number => {
        const actualMatches = getActualMatchesInRound(match.round);
        const index = actualMatches.findIndex(m => m.id === match.id);
        return index >= 0 ? index + 1 : match.match_number || 0;
    };

    const getPlayerDisplay = (playerId: string | undefined, match: Match, position: 1 | 2) => {
        if (playerId && playerId !== '') {
            const mainPlayerName = getPlayerName(playerId);

            // シングルス・ダブルスの自動判定
            const isSingles = tournamentType.includes('singles');
            const isDoubles = !isSingles && (!!match.player3_id || !!match.player4_id);

            // ダブルスの場合のみ、ペア選手の名前も含める
            if (isDoubles) {
                const pairPlayerId = position === 1 ? match.player3_id : match.player4_id;
                if (pairPlayerId) {
                    const pairPlayerName = getPlayerName(pairPlayerId);
                    return `${mainPlayerName} / ${pairPlayerName}`;
                }
            }

            // シングルスの場合は1人の名前のみ返す
            return mainPlayerName;
        }

        // 空の場合、前の試合から来ることを表示
        if (match.phase === 'knockout' && match.round > 1) {
            // 前ラウンドの試合を探す
            const prevRoundMatches = knockoutMatches.filter(m => m.round === match.round - 1);
            const sourceMatch = prevRoundMatches.find(m =>
                m.next_match_number === match.match_number && m.next_match_position === position
            );

            if (sourceMatch) {
                // 前の試合がBye（シード）の場合、選手名を直接表示
                if (isByeMatch(sourceMatch)) {
                    // Bye試合の選手を特定（player1_id または player2_id のどちらかが存在）
                    const byePlayerId = sourceMatch.player1_id || sourceMatch.player2_id;
                    if (byePlayerId) {
                        const mainPlayerName = getPlayerName(byePlayerId);
                        // ダブルスの場合はペア選手も表示
                        const isSingles = tournamentType.includes('singles');
                        const isDoubles = !isSingles && (!!sourceMatch.player3_id || !!sourceMatch.player4_id);

                        if (isDoubles) {
                            const pairPlayerId = sourceMatch.player1_id ? sourceMatch.player3_id : sourceMatch.player4_id;
                            if (pairPlayerId) {
                                const pairPlayerName = getPlayerName(pairPlayerId);
                                return `${mainPlayerName} / ${pairPlayerName}`;
                            }
                        }
                        return mainPlayerName;
                    }
                }

                // Byeでない場合は従来通り「第○試合の勝者」と表示
                const actualMatchNum = getActualMatchNumber(sourceMatch);
                return `${getUnifiedRoundName(sourceMatch, maxRound)} 第${actualMatchNum}試合の勝者`;
            }
        }

        // 予選リーグからの勝ち上がりの場合
        if (match.phase === 'knockout' && match.round === 1 && match.group) {
            return `予選 [${match.group}] ${position}位`;
        }

        return "未定";
    };

    // 選択した部門の試合のみをフィルタリング
    const divisionMatches = matches.filter(m => m.division === division || !m.division);

    // 予選リーグと決勝トーナメントに分類
    const preliminaryMatches = divisionMatches.filter(m => m.phase === 'preliminary');
    const knockoutMatches = divisionMatches
        .filter(m => m.phase === 'knockout' || !m.phase)
        .filter(m => m.subtitle !== "3位決定戦"); // Exclude 3rd place playoff from bracket

    // 予選リーグをグループごとに分類
    const groupMatches: { [group: string]: Match[] } = {};
    preliminaryMatches.forEach(m => {
        const group = m.group || 'A';
        if (!groupMatches[group]) groupMatches[group] = [];
        groupMatches[group].push(m);
    });
    const groups = Object.keys(groupMatches).sort();

    // 決勝トーナメントをラウンドごとに分類
    const roundGroups: { [round: number]: Match[] } = {};
    knockoutMatches.forEach(m => {
        if (!roundGroups[m.round]) roundGroups[m.round] = [];
        roundGroups[m.round].push(m);
    });
    // ブラケット接続線を正しくするためにラウンド内をmatch_number順にソート
    Object.keys(roundGroups).forEach(r => {
        roundGroups[Number(r)].sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
    });

    const maxRound = Math.max(...Object.keys(roundGroups).map(Number), 0);
    const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

    const getNextRoundInfo = (round: number) => {
        if (round >= maxRound) return null; // 決勝戦
        const nextRound = round + 1;
        return getUnifiedRoundName({ round: nextRound, phase: 'knockout' }, maxRound);
    };

    const hasPreliminary = preliminaryMatches.length > 0;
    const hasKnockout = knockoutMatches.length > 0;

    // 検索機能: 選手名で試合をフィルタリング
    const isMatchingSearch = (match: Match) => {
        if (!searchQuery.trim()) return false;
        const query = searchQuery.toLowerCase();
        const p1Name = getPlayerName(match.player1_id).toLowerCase();
        const p2Name = getPlayerName(match.player2_id).toLowerCase();
        const p3Name = match.player3_id ? getPlayerName(match.player3_id).toLowerCase() : '';
        const p4Name = match.player4_id ? getPlayerName(match.player4_id).toLowerCase() : '';
        return p1Name.includes(query) || p2Name.includes(query) || p3Name.includes(query) || p4Name.includes(query);
    };

    const searchResults = searchQuery.trim() ? divisionMatches.filter(isMatchingSearch) : [];

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center space-y-3">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="text-slate-600">読み込み中...</p>
                </div>
            </div>
        );
    }

    if (matches.length === 0) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center space-y-3">
                    <Trophy className="w-16 h-16 text-slate-300 mx-auto" />
                    <p className="text-slate-600 font-medium">まだ試合がありません</p>
                    <p className="text-sm text-slate-400">トーナメントを生成してください</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            トーナメント表
                        </CardTitle>
                        <Button
                            onClick={handleSaveAsImage}
                            disabled={exporting || matches.length === 0}
                            variant="outline"
                            size="sm"
                            className="border-amber-200 text-amber-700 hover:bg-amber-50"
                        >
                            {exporting ? (
                                <>
                                    <Download className="w-4 h-4 mr-1 animate-pulse" />
                                    保存中...
                                </>
                            ) : (
                                <>
                                    <Camera className="w-4 h-4 mr-1" />
                                    画像として保存
                                </>
                            )}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4" ref={bracketRef}>
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
                            <SelectItem value="team_battle">団体戦</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* 検索フィールド */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            type="text"
                            placeholder="選手名で検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-10"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* 検索結果 */}
                    {searchQuery.trim() && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg p-4">
                            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2">
                                <Search className="w-4 h-4" />
                                検索結果 ({searchResults.length}件)
                            </h3>
                            {searchResults.length === 0 ? (
                                <p className="text-sm text-blue-700 dark:text-blue-400">「{searchQuery}」に一致する試合がありません</p>
                            ) : (
                                <div className="space-y-2">
                                    {searchResults.map(match => (
                                        <div key={match.id} className="bg-white dark:bg-slate-800 rounded-md p-3 border border-blue-200 dark:border-blue-700 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <Badge variant="outline" className="text-xs">
                                                    試合 #{match.match_number}
                                                </Badge>
                                                <div className="flex items-center gap-2">
                                                    {match.phase === 'preliminary' && match.group && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Group {match.group}
                                                        </Badge>
                                                    )}
                                                    {match.phase === 'knockout' && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {getUnifiedRoundName(match, maxRound)}
                                                        </Badge>
                                                    )}
                                                    {match.status === 'completed' && (
                                                        <Badge variant="default" className="text-xs bg-green-500">
                                                            完了
                                                        </Badge>
                                                    )}
                                                    {match.status === 'playing' && (
                                                        <Badge variant="default" className="text-xs bg-blue-500">
                                                            試合中
                                                        </Badge>
                                                    )}
                                                    {match.status === 'calling' && (
                                                        <Badge variant="default" className="text-xs bg-orange-500">
                                                            試合中
                                                        </Badge>
                                                    )}
                                                    {match.status === 'waiting' && (
                                                        <Badge variant="outline" className="text-xs">
                                                            待機中
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-sm">
                                                <p className="font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                                                    {getPlayerName(match.player1_id)}
                                                    {match.player3_id && ` / ${getPlayerName(match.player3_id)}`}
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 my-1">vs</p>
                                                <p className="font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                                                    {getPlayerName(match.player2_id)}
                                                    {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                                                </p>
                                                {match.status === 'completed' && (
                                                    <div className="mt-2 flex items-center gap-2 text-xs font-bold">
                                                        <span className={match.winner_id === match.player1_id ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}>
                                                            {match.score_p1}
                                                        </span>
                                                        <span className="text-slate-400 dark:text-slate-500">-</span>
                                                        <span className={match.winner_id === match.player2_id ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}>
                                                            {match.score_p2}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 1部/2部切り替えタブ */}
                    <Tabs value={String(division)} onValueChange={(v) => setDivision(Number(v) as Division)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="1" className="data-[state=active]:bg-sky-500 data-[state=active]:text-white">
                                1部
                            </TabsTrigger>
                            <TabsTrigger value="2" className="data-[state=active]:bg-violet-500 data-[state=active]:text-white">
                                2部
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {loading && <p className="text-slate-500 text-center">読み込み中...</p>}

                    {!loading && divisionMatches.length === 0 && (
                        <p className="text-slate-400 text-center py-8">この部門の試合はまだ作成されていません</p>
                    )}

                    {!loading && divisionMatches.length > 0 && (
                        <div className="space-y-8">
                            {/* 予選リーグ */}
                            {hasPreliminary && (
                                <PreliminaryGroup
                                    groups={groups}
                                    groupMatches={groupMatches}
                                    getPlayerName={getPlayerName}
                                />
                            )}

                            {/* 決勝トーナメント */}
                            {hasKnockout && (
                                <KnockoutTree
                                    rounds={rounds}
                                    roundGroups={roundGroups}
                                    hasPreliminary={hasPreliminary}
                                    maxRound={maxRound}
                                    getNextRoundInfo={getNextRoundInfo}
                                    getPlayerDisplay={getPlayerDisplay}
                                    getPlayerName={getPlayerName}
                                />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}