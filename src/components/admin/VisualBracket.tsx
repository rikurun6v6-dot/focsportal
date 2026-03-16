"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { subscribeToMatchesByTournament, subscribeToPlayers, updateDocument } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Match, Player, TournamentType, Division } from "@/types";
import { Trophy, Users, Search, X, Camera, Download, Pencil, Check, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PreliminaryGroup from "./PreliminaryGroup";
import KnockoutTree from "./KnockoutTree";
import { getUnifiedRoundName, getTournamentTypeName } from "@/lib/tournament-logic";
import { toPng } from "html-to-image";
import { saveAs } from "file-saver";
import { toastSuccess, toastError } from "@/lib/toast";

const LS_KEY_TYPE = 'vb_tournamentType';
const LS_KEY_DIV = 'vb_division';

export default function VisualBracket({ readOnly = false }: { readOnly?: boolean }) {
    const { camp } = useCamp();
    const [tournamentType, setTournamentType] = useState<TournamentType>(() => {
        if (typeof window !== 'undefined') {
            return (localStorage.getItem(LS_KEY_TYPE) as TournamentType) || 'mens_doubles';
        }
        return 'mens_doubles';
    });
    const [division, setDivision] = useState<Division>(() => {
        if (typeof window !== 'undefined') {
            return (Number(localStorage.getItem(LS_KEY_DIV)) || 1) as Division;
        }
        return 1;
    });
    const [matches, setMatches] = useState<Match[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [exporting, setExporting] = useState(false);
    const [zoom, setZoom] = useState(1.0);
    const [editMode, setEditMode] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ matchId: string; position: 1 | 2 } | null>(null);
    const [editingSlot, setEditingSlot] = useState<{ matchId: string; position: 1 | 2 } | null>(null);
    const [editMain, setEditMain] = useState('');
    const [editPartner, setEditPartner] = useState('');
    const [editThird, setEditThird] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editSearch, setEditSearch] = useState('');
    const bracketRef = useRef<HTMLDivElement>(null);
    const bracketContentRef = useRef<HTMLDivElement>(null);

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
     * ブラケット編集モード: スロットクリック → 2つ選択で入れ替え
     */
    const handleSlotClick = async (matchId: string, position: 1 | 2) => {
        if (!editMode) return;
        if (!selectedSlot) {
            setSelectedSlot({ matchId, position });
            return;
        }
        if (selectedSlot.matchId === matchId && selectedSlot.position === position) {
            setSelectedSlot(null);
            return;
        }
        // Swap the two slots
        const matchA = matches.find(m => m.id === selectedSlot.matchId);
        const matchB = matches.find(m => m.id === matchId);
        if (!matchA || !matchB) { setSelectedSlot(null); return; }

        const getSlotPlayers = (m: Match, pos: 1 | 2) => pos === 1
            ? { main: m.player1_id, partner: m.player3_id, third: m.player5_id }
            : { main: m.player2_id, partner: m.player4_id, third: m.player6_id };

        const playersA = getSlotPlayers(matchA, selectedSlot.position);
        const playersB = getSlotPlayers(matchB, position);

        const buildUpdate = (pos: 1 | 2, players: { main: string; partner?: string; third?: string }) =>
            pos === 1
                ? { player1_id: players.main || '', player3_id: players.partner || null, player5_id: players.third || null }
                : { player2_id: players.main || '', player4_id: players.partner || null, player6_id: players.third || null };

        try {
            await updateDocument('matches', matchA.id, buildUpdate(selectedSlot.position, playersB));
            await updateDocument('matches', matchB.id, buildUpdate(position, playersA));
            toastSuccess('ペアを入れ替えました');
        } catch {
            toastError('入れ替えに失敗しました');
        }
        setSelectedSlot(null);
    };

    /**
     * メンバー変更ダイアログを開く
     */
    const handleSlotEditOpen = (matchId: string, position: 1 | 2) => {
        const match = matches.find(m => m.id === matchId);
        if (!match) return;
        const isP1 = position === 1;
        setEditMain(isP1 ? (match.player1_id || '') : (match.player2_id || ''));
        setEditPartner(isP1 ? (match.player3_id || '') : (match.player4_id || ''));
        setEditThird(isP1 ? (match.player5_id || '') : (match.player6_id || ''));
        setEditSearch('');
        setEditingSlot({ matchId, position });
    };

    /**
     * メンバー変更を保存
     */
    const handlePlayerSaveEdit = async () => {
        if (!editingSlot) return;
        const { matchId, position } = editingSlot;
        const update = position === 1
            ? { player1_id: editMain || '', player3_id: editPartner || null, player5_id: editThird || null }
            : { player2_id: editMain || '', player4_id: editPartner || null, player6_id: editThird || null };
        setEditSaving(true);
        try {
            await updateDocument('matches', matchId, update);
            toastSuccess('メンバーを変更しました');
            setEditingSlot(null);
        } catch {
            toastError('変更に失敗しました');
        }
        setEditSaving(false);
    };

    /**
     * トーナメント表を画像として保存
     */
    const handleSaveAsImage = async () => {
        const target = bracketContentRef.current || bracketRef.current;
        if (!target) return;

        setExporting(true);
        try {
            // スクロール領域を含む全体を取得
            const originalOverflow = target.style.overflow;
            const originalMaxHeight = target.style.maxHeight;
            const originalTransform = target.style.transform;
            target.style.overflow = 'visible';
            target.style.maxHeight = 'none';
            target.style.transform = 'none';

            const fullWidth = Math.max(target.scrollWidth, target.offsetWidth);
            const fullHeight = Math.max(target.scrollHeight, target.offsetHeight);

            // 画像生成（高解像度・全体キャプチャ）
            const dataUrl = await toPng(target, {
                quality: 1.0,
                pixelRatio: 2,
                cacheBust: true,
                backgroundColor: '#ffffff',
                width: fullWidth,
                height: fullHeight,
            });

            target.style.overflow = originalOverflow;
            target.style.maxHeight = originalMaxHeight;
            target.style.transform = originalTransform;

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
        const isSingles = tournamentType.includes('singles');

        // 2回戦以降: 前ラウンドのソース試合を特定
        // next_match_number（グループステージ方式）と next_match_id（シンプルブラケット方式）の両方を参照
        let sourceMatch: Match | undefined;
        if (match.phase === 'knockout' && match.round > 1) {
            const prevRoundMatches = knockoutMatches.filter(m => m.round === match.round - 1);
            sourceMatch = prevRoundMatches.find(m =>
                (m.next_match_number === match.match_number && m.next_match_position === position) ||
                (m.next_match_id === match.id && m.next_match_position === position)
            );
        }

        // ソース試合が存在するが未完了（かつ非BYE）の場合:
        // Firestore に player_id が入っていてもゴミデータ（誤伝播）の可能性があるため
        // 「X回戦の勝者」表示にフォールバックし、名前を出さない
        if (sourceMatch && !isByeMatch(sourceMatch) && sourceMatch.status !== 'completed') {
            const actualMatchNum = getActualMatchNumber(sourceMatch);
            return `${getUnifiedRoundName(sourceMatch, maxRound)} 第${actualMatchNum}試合の勝者`;
        }

        // ソース試合がBYEの場合: 常にソース試合から選手名を再計算（保存済みの古いplayer_idを無視）
        // これにより PairSeedManager でペアを変更した直後も正しい選手名が即座に表示される
        if (sourceMatch && isByeMatch(sourceMatch)) {
            const byePlayerId = sourceMatch.player1_id || sourceMatch.player2_id;
            if (byePlayerId) {
                const mainPlayerName = getPlayerName(byePlayerId);
                const byeIsDoubles = !isSingles && (!!sourceMatch.player3_id || !!sourceMatch.player4_id);
                if (byeIsDoubles) {
                    const isP1Side = !!sourceMatch.player1_id;
                    const pairPlayerId = isP1Side ? sourceMatch.player3_id : sourceMatch.player4_id;
                    const thirdPlayerId = isP1Side ? sourceMatch.player5_id : sourceMatch.player6_id;
                    if (pairPlayerId) {
                        const pairPlayerName = getPlayerName(pairPlayerId);
                        const thirdPlayerName = thirdPlayerId ? ` / ${getPlayerName(thirdPlayerId)}` : '';
                        return `${mainPlayerName} / ${pairPlayerName}${thirdPlayerName}`;
                    }
                }
                return mainPlayerName;
            }
        }

        // Firestoreに保存済みのplayer_idがある場合（実際の試合結果で確定した選手）
        if (playerId && playerId !== '') {
            const mainPlayerName = getPlayerName(playerId);
            const isDoubles = !isSingles && (!!match.player3_id || !!match.player4_id);
            if (isDoubles) {
                const pairPlayerId = position === 1 ? match.player3_id : match.player4_id;
                const thirdPlayerId = position === 1 ? match.player5_id : match.player6_id;
                if (pairPlayerId) {
                    const pairPlayerName = getPlayerName(pairPlayerId);
                    const thirdPlayerName = thirdPlayerId ? ` / ${getPlayerName(thirdPlayerId)}` : '';
                    return `${mainPlayerName} / ${pairPlayerName}${thirdPlayerName}`;
                }
            }
            return mainPlayerName;
        }

        // player_idが空: 非BYEのソース試合からの勝者表示
        if (sourceMatch) {
            const actualMatchNum = getActualMatchNumber(sourceMatch);
            return `${getUnifiedRoundName(sourceMatch, maxRound)} 第${actualMatchNum}試合の勝者`;
        }

        // 予選リーグからの勝ち上がり
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
        const p5Name = match.player5_id ? getPlayerName(match.player5_id).toLowerCase() : '';
        const p6Name = match.player6_id ? getPlayerName(match.player6_id).toLowerCase() : '';
        return p1Name.includes(query) || p2Name.includes(query) || p3Name.includes(query) || p4Name.includes(query) || p5Name.includes(query) || p6Name.includes(query);
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

    // ※ matches.length === 0 の場合は早期returnせず、種目セレクターを表示したまま
    //   コンテンツ内で「未生成」メッセージを表示する（Task3 fix）

    return (
        <>
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    {/* 1行目: タイトル + 編集ボタン */}
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
                            <Trophy className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            トーナメント表
                        </CardTitle>
                        {!readOnly && (
                            <Button
                                onClick={() => { setEditMode(e => !e); setSelectedSlot(null); }}
                                variant={editMode ? "default" : "outline"}
                                size="sm"
                                className={`flex-shrink-0 ${editMode ? "bg-blue-500 text-white" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}
                            >
                                {editMode ? <><Check className="w-4 h-4 mr-1" />編集完了</> : <><Pencil className="w-4 h-4 mr-1" />ペア入替</>}
                            </Button>
                        )}
                    </div>
                    {/* 2行目: ズームコントロール + 保存ボタン */}
                    <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                                onClick={() => setZoom(z => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
                                variant="outline"
                                size="sm"
                                className="px-2"
                                disabled={zoom <= 0.4}
                            >
                                <ZoomOut className="w-4 h-4" />
                            </Button>
                            <button
                                onClick={() => setZoom(1.0)}
                                className="text-xs font-mono text-slate-600 hover:text-slate-900 w-12 text-center"
                            >
                                {Math.round(zoom * 100)}%
                            </button>
                            <Button
                                onClick={() => setZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
                                variant="outline"
                                size="sm"
                                className="px-2"
                                disabled={zoom >= 2.0}
                            >
                                <ZoomIn className="w-4 h-4" />
                            </Button>
                        </div>
                        <Button
                            onClick={handleSaveAsImage}
                            disabled={exporting || matches.length === 0}
                            variant="outline"
                            size="sm"
                            className="flex-shrink-0 border-amber-200 text-amber-700 hover:bg-amber-50"
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
                    <Select value={tournamentType} onValueChange={(v) => {
                        setTournamentType(v as TournamentType);
                        localStorage.setItem(LS_KEY_TYPE, v);
                    }}>
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
                                                    {match.player5_id && ` / ${getPlayerName(match.player5_id)}`}
                                                </p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 my-1">vs</p>
                                                <p className="font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                                                    {getPlayerName(match.player2_id)}
                                                    {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                                                    {match.player6_id && ` / ${getPlayerName(match.player6_id)}`}
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
                    <Tabs value={String(division)} onValueChange={(v) => {
                        setDivision(Number(v) as Division);
                        localStorage.setItem(LS_KEY_DIV, v);
                    }} className="w-full">
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
                        <div className="flex flex-col items-center justify-center py-12 space-y-2">
                            <Trophy className="w-12 h-12 text-slate-300" />
                            <p className="text-slate-500 font-medium">
                                {matches.length === 0
                                    ? 'この種目のトーナメントはまだ生成されていません'
                                    : 'この部門（Division）の試合はまだ作成されていません'}
                            </p>
                            <p className="text-xs text-slate-400">トーナメント生成タブから生成してください</p>
                        </div>
                    )}

                    {!loading && divisionMatches.length > 0 && (
                        <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                        <div className="space-y-8" ref={bracketContentRef} style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: `${Math.round(100 / zoom)}%` }}>
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
                                    editMode={editMode}
                                    selectedSlot={selectedSlot}
                                    onSlotClick={handleSlotClick}
                                    onSlotEditClick={handleSlotEditOpen}
                                />
                            )}
                        </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>

        {/* メンバー変更ダイアログ */}

        <Dialog open={!!editingSlot} onOpenChange={(open) => !open && setEditingSlot(null)}>
            <DialogContent className="bg-white max-w-sm">
                <DialogHeader>
                    <DialogTitle>メンバー変更</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    {/* 絞り込み */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                            placeholder="選手名で絞り込み..."
                            value={editSearch}
                            onChange={e => setEditSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    {/* メインプレイヤー */}
                    <div>
                        <label className="text-sm font-medium text-slate-700">メインプレイヤー</label>
                        <select
                            value={editMain}
                            onChange={e => setEditMain(e.target.value)}
                            className="mt-1 w-full border border-slate-300 rounded-md p-2 text-sm bg-white"
                        >
                            <option value="">（なし）</option>
                            {players
                                .filter(p => !editSearch || p.name.toLowerCase().includes(editSearch.toLowerCase()))
                                .map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                        </select>
                    </div>
                    {/* パートナー（ダブルスのみ） */}
                    {!tournamentType.includes('singles') && (
                        <div>
                            <label className="text-sm font-medium text-slate-700">ペアパートナー</label>
                            <select
                                value={editPartner}
                                onChange={e => setEditPartner(e.target.value)}
                                className="mt-1 w-full border border-slate-300 rounded-md p-2 text-sm bg-white"
                            >
                                <option value="">（なし）</option>
                                {players
                                    .filter(p => !editSearch || p.name.toLowerCase().includes(editSearch.toLowerCase()))
                                    .map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                            </select>
                        </div>
                    )}
                    {/* 3人目（ダブルスのみ） */}
                    {!tournamentType.includes('singles') && (
                        <div>
                            <label className="text-sm font-medium text-slate-700">3人目（任意）</label>
                            <select
                                value={editThird}
                                onChange={e => setEditThird(e.target.value)}
                                className="mt-1 w-full border border-slate-300 rounded-md p-2 text-sm bg-white"
                            >
                                <option value="">（なし）</option>
                                {players
                                    .filter(p => !editSearch || p.name.toLowerCase().includes(editSearch.toLowerCase()))
                                    .map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                            </select>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setEditingSlot(null)}>キャンセル</Button>
                    <Button onClick={handlePlayerSaveEdit} disabled={editSaving}>
                        {editSaving ? '保存中...' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}