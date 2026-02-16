'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import {
  subscribeToCourts,
  getMatchWithPlayers,
  updateMatchResult,
  updateDocument,
  recordWalkover,
  freeCourtManually,
  unfreeCourtManually,
  moveMatchToCourt,
  getAllDocuments,
  setMatchBreak,
  cancelMatchBreak,
  startMatchOnReservedCourt
} from '@/lib/firestore-helpers';
import { recordMatchDuration } from '@/lib/eta';
import type { Match, Court, MatchWithPlayers } from '@/types';
import { getRoundName } from '@/lib/formatters';
import { useCamp } from '@/context/CampContext';
import { Clock, Users } from 'lucide-react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError } from '@/lib/toast';

export default function ResultsTab() {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchesCache, setMatchesCache] = useState<Record<string, MatchWithPlayers>>({});
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showInputFor, setShowInputFor] = useState<string | null>(null);
  const [showCourtChangeFor, setShowCourtChangeFor] = useState<string | null>(null);
  const [availableCourts, setAvailableCourts] = useState<Court[]>([]);
  const [showBreakFor, setShowBreakFor] = useState<string | null>(null);
  const [breakingMatches, setBreakingMatches] = useState<MatchWithPlayers[]>([]);
  const [showAddBreakFor, setShowAddBreakFor] = useState<string | null>(null);

  // 10秒ごとに現在時刻を更新（経過時間表示用）
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000); // 10秒ごと
    return () => clearInterval(timer);
  }, []);

  // 休憩中の試合を取得
  useEffect(() => {
    if (!camp) return;

    const fetchBreakingMatches = async () => {
      try {
        const allMatches = await getAllDocuments<Match>('matches');
        const breaking = allMatches.filter(m =>
          m.campId === camp.id &&
          m.status === 'waiting' &&
          m.available_at &&
          m.reserved_court_id
        );

        // 各試合の選手情報を取得
        const breakingWithPlayers = await Promise.all(
          breaking.map(async (match) => {
            const withPlayers = await getMatchWithPlayers(match.id);
            return withPlayers;
          })
        );

        setBreakingMatches(breakingWithPlayers.filter((m): m is MatchWithPlayers => m !== null));
      } catch (error) {
        console.error('Error fetching breaking matches:', error);
      }
    };

    fetchBreakingMatches();
    const interval = setInterval(fetchBreakingMatches, 10000); // 10秒ごとに更新

    return () => clearInterval(interval);
  }, [camp?.id]);

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToCourts(async (updatedCourts) => {
      const sorted = updatedCourts.sort((a, b) => {
        const numA = a.number || parseInt(a.id.replace('court_', '') || "0");
        const numB = b.number || parseInt(b.id.replace('court_', '') || "0");
        return numA - numB;
      });
      setCourts(sorted);
      setLoading(false);

      // 試合データを取得
      const matchIds = sorted
        .map(c => c.current_match_id)
        .filter((id): id is string => !!id);

      const newMatches: Record<string, MatchWithPlayers> = {};
      await Promise.all(
        matchIds.map(async (id) => {
          try {
            const match = await getMatchWithPlayers(id);
            if (match) {
              newMatches[id] = match;
            }
          } catch (e) {
            console.error(`Error fetching match ${id}:`, e);
          }
        })
      );

      setMatchesCache(prev => ({ ...prev, ...newMatches }));
    }, camp.id);

    return () => unsubscribe();
  }, [camp?.id]);

  const handleScoreChange = (matchId: string, player: 'p1' | 'p2', value: string) => {
    const numValue = parseInt(value) || 0;
    setScores(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [player]: numValue,
      },
    }));
  };

  const handleSubmit = async (match: MatchWithPlayers, courtId: string) => {
    const score = scores[match.id];
    if (!score || (score.p1 === 0 && score.p2 === 0)) {
      alert('スコアを入力してください');
      return;
    }

    const winnerId = score.p1 > score.p2 ? match.player1_id : match.player2_id;
    setSubmitting(match.id);

    try {
      await updateMatchResult(match.id, score.p1, score.p2, winnerId);
      await updateDocument('courts', courtId, { current_match_id: null });
      await recordMatchDuration(match.id);

      setScores(prev => {
        const newScores = { ...prev };
        delete newScores[match.id];
        return newScores;
      });
    } catch (error) {
      alert('エラーが発生しました');
    }

    setSubmitting(null);
  };

  const handleWalkover = async (match: MatchWithPlayers, courtId: string, winnerSide: 1 | 2) => {
    const winnerName = winnerSide === 1
      ? (match.player1.name + (match.player3?.id ? ` / ${match.player3.name}` : ''))
      : (match.player2.name + (match.player4?.id ? ` / ${match.player4.name}` : ''));

    const confirmed = await confirm({
      title: '🏸 不戦勝の記録',
      message: `${winnerName} の不戦勝として記録しますか？`,
      confirmText: '記録する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    setSubmitting(match.id);
    try {
      await recordWalkover(match.id, winnerSide);
      await updateDocument('courts', courtId, { current_match_id: null });
      toastSuccess(`${winnerName} の不戦勝を記録しました`);
    } catch (error) {
      toastError('エラーが発生しました');
    }
    setSubmitting(null);
  };

  const handleFreeCourt = async (courtId: string) => {
    const confirmed = await confirm({
      title: '🆓 コートをフリーにする（手動固定）',
      message: 'このコートをフリー状態にしますか？\n現在の試合は削除されずに待機リストの先頭に戻ります。\n\n※ 自動割り当てが無効になり、手動で「割り当て再開」するまでフリー状態を維持します。',
      confirmText: 'フリーにする',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await freeCourtManually(courtId);
      if (success) {
        toastSuccess('コートをフリーにしました（試合は待機リストの先頭に戻りました）');
      } else {
        toastError('コートのフリー化に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleResumeAllocation = async (courtId: string) => {
    const confirmed = await confirm({
      title: '▶️ 割り当て再開',
      message: 'このコートの自動割り当てを再開しますか？\n待機中の試合が自動的に割り当てられるようになります。',
      confirmText: '再開する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await unfreeCourtManually(courtId);
      if (success) {
        toastSuccess('自動割り当てを再開しました');
      } else {
        toastError('再開に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleShowCourtChange = async (matchId: string) => {
    // 利用可能なコートを取得
    const allCourts = await getAllDocuments<Court>('courts');
    const available = camp ? allCourts.filter(c =>
      c.campId === camp.id &&
      c.is_active &&
      !c.current_match_id
    ) : [];
    setAvailableCourts(available);
    setShowCourtChangeFor(matchId);
  };

  const handleCourtChange = async (matchId: string, targetCourtId: string) => {
    const confirmed = await confirm({
      title: '🔄 コート変更',
      message: `この試合を指定のコートに移動しますか？`,
      confirmText: '移動する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowCourtChangeFor(null);
      return;
    }

    try {
      const success = await moveMatchToCourt(matchId, targetCourtId);
      if (success) {
        toastSuccess('試合を移動しました');
        setShowCourtChangeFor(null);
      } else {
        toastError('コート変更に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleSetBreak = async (matchId: string, courtId: string, minutes: number) => {
    const confirmed = await confirm({
      title: '⏸️ 休憩設定',
      message: `この試合を${minutes}分間休憩させますか？\nコートは一時的に解放され、時間が来たら元のコートへ優先的に復帰します。`,
      confirmText: '休憩する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowBreakFor(null);
      return;
    }

    try {
      const success = await setMatchBreak(matchId, courtId, minutes);
      if (success) {
        toastSuccess(`${minutes}分の休憩を設定しました`);
        setShowBreakFor(null);
      } else {
        toastError('休憩設定に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleCancelBreak = async (matchId: string) => {
    const confirmed = await confirm({
      title: '▶️ 休憩解除',
      message: `休憩を解除して即座に復帰可能にしますか？`,
      confirmText: '解除する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await cancelMatchBreak(matchId);
      if (success) {
        toastSuccess('休憩を解除しました');
      } else {
        toastError('休憩解除に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleAddBreak = async (matchId: string, courtId: string, minutes: number) => {
    const confirmed = await confirm({
      title: '⏸️ 休憩を延長',
      message: `さらに${minutes}分間休憩を延長しますか？`,
      confirmText: '延長する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) {
      setShowAddBreakFor(null);
      return;
    }

    try {
      const success = await setMatchBreak(matchId, courtId, minutes);
      if (success) {
        toastSuccess(`${minutes}分の休憩を追加しました`);
        setShowAddBreakFor(null);
      } else {
        toastError('休憩延長に失敗しました');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const handleStartOnReservedCourt = async (matchId: string) => {
    const confirmed = await confirm({
      title: '▶️ 試合開始',
      message: `この試合を予約コートで開始しますか？`,
      confirmText: '開始する',
      cancelText: 'キャンセル',
      type: 'info',
    });
    if (!confirmed) return;

    try {
      const success = await startMatchOnReservedCourt(matchId);
      if (success) {
        toastSuccess('試合を開始しました');
      } else {
        toastError('試合開始に失敗しました（コートが使用中の可能性があります）');
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
  };

  const getCategoryLabel = (type: string | undefined) => {
    if (!type) return "不明";
    const map: Record<string, string> = {
      mens_doubles: "男子D",
      womens_doubles: "女子D",
      mixed_doubles: "混合D",
      mens_singles: "男子S",
      womens_singles: "女子S",
      team_battle: "団体戦"
    };
    return map[type] || type;
  };

  const getRoundLabel = (match: MatchWithPlayers | null) => {
    if (!match) return "-";

    // 種目ごとにtotalRoundsを計算
    const allMatches = courts.flatMap(c => c.current_match_id ? [matchesCache[c.current_match_id]] : []).filter(Boolean) as MatchWithPlayers[];
    const sameTypeMatches = allMatches.filter(m =>
      m.tournament_type === match.tournament_type &&
      m.division === match.division
    );
    const maxRound = sameTypeMatches.length > 0 ? Math.max(...sameTypeMatches.map(m => m.round)) : match.round;

    return getRoundName(match.round, maxRound);
  };

  const getElapsedTime = (match: MatchWithPlayers | null) => {
    if (!match) return null;

    // callingまたはplayingステータスの場合、start_timeまたはupdated_atを使用
    const startTime = match.start_time || match.updated_at;
    if (!startTime) return null;

    const startMs = startTime.toMillis();
    const elapsed = Math.floor((currentTime - startMs) / 1000);

    if (elapsed < 0) return null;

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };;

  if (!camp) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-lg">
        <p className="text-amber-800 font-medium">合宿を選択してください</p>
      </div>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-4">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-slate-800">コート別結果入力</h2>
          <p className="text-sm text-slate-600 mt-1">各コートで進行中の試合のスコアを直接入力できます</p>
        </div>

        {/* 休憩中の試合 */}
        {breakingMatches.length > 0 && (
          <div className="mb-4">
            <h3 className="text-lg font-bold text-orange-700 mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              休憩中の試合
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {breakingMatches.map((match) => {
                const remainingMinutes = match.available_at
                  ? Math.max(0, Math.ceil((match.available_at.toMillis() - currentTime) / (1000 * 60)))
                  : 0;
                const courtNumber = match.reserved_court_id
                  ? courts.find(c => c.id === match.reserved_court_id)?.number || '?'
                  : '?';

                return (
                  <Card key={match.id} className="border-orange-300 bg-orange-50">
                    <CardHeader className="pb-2 bg-gradient-to-r from-orange-100 to-yellow-50">
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-sm font-bold text-orange-700">
                          {courtNumber}コート予約
                        </span>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-full">
                            {getCategoryLabel(match.tournament_type)}
                          </span>
                          <span className="text-[10px] font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">
                            {getRoundLabel(match)}
                          </span>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-2">
                      <div className="space-y-2">
                        <div className="bg-white p-2 rounded border border-orange-200">
                          <p className="font-bold text-slate-800 text-center text-xs">
                            {match.player1?.name || "未登録"}
                            {match.player3?.id && ` / ${match.player3.name}`}
                          </p>
                        </div>
                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-400">VS</span>
                        </div>
                        <div className="bg-white p-2 rounded border border-orange-200">
                          <p className="font-bold text-slate-800 text-center text-xs">
                            {match.player2?.name || "未登録"}
                            {match.player4?.id && ` / ${match.player4.name}`}
                          </p>
                        </div>

                        <div className={`flex items-center justify-center gap-2 px-2 py-1 rounded text-xs ${remainingMinutes > 0
                            ? 'text-orange-600 bg-orange-100'
                            : 'text-green-600 bg-green-100'
                          }`}>
                          <Clock className="w-3 h-3" />
                          <span className="font-bold">
                            {remainingMinutes > 0 ? `あと${remainingMinutes}分` : '✓ 休憩完了'}
                          </span>
                        </div>

                        {remainingMinutes > 0 ? (
                          // 休憩中（まだ時間が残っている）
                          <Button
                            onClick={() => handleCancelBreak(match.id)}
                            variant="outline"
                            size="sm"
                            className="w-full border-orange-400 text-orange-700 hover:bg-orange-100 h-7 text-xs"
                          >
                            ⏭️ 休憩をスキップ（即時復帰可能）
                          </Button>
                        ) : (
                          // 休憩完了（復帰可能）
                          <>
                            {showAddBreakFor === match.id ? (
                              <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1.5">
                                <p className="text-[10px] font-bold text-orange-800">追加休憩時間を選択:</p>
                                <div className="grid grid-cols-4 gap-1">
                                  {[5, 10, 15, 20].map(minutes => (
                                    <Button
                                      key={minutes}
                                      onClick={() => handleAddBreak(match.id, match.reserved_court_id!, minutes)}
                                      size="sm"
                                      variant="outline"
                                      className="border-orange-300 text-orange-700 hover:bg-orange-100 h-7 text-xs px-1"
                                    >
                                      {minutes}分
                                    </Button>
                                  ))}
                                </div>
                                <Button
                                  onClick={() => setShowAddBreakFor(null)}
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-[10px] h-6"
                                >
                                  キャンセル
                                </Button>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                <Button
                                  onClick={() => handleStartOnReservedCourt(match.id)}
                                  variant="default"
                                  size="sm"
                                  className="bg-green-500 hover:bg-green-600 text-white h-7 text-xs"
                                >
                                  ▶️ 試合開始
                                </Button>
                                <Button
                                  onClick={() => setShowAddBreakFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-orange-400 text-orange-700 hover:bg-orange-100 h-7 text-xs"
                                >
                                  ➕ 休憩延長
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courts.map((court) => {
            const courtNumber = court.number || court.id.replace('court_', '');
            const isOccupied = !!court.current_match_id;
            const match = isOccupied && court.current_match_id ? matchesCache[court.current_match_id] : null;

            return (
              <Card key={court.id} className={`relative ${isOccupied ? 'border-sky-300 shadow-lg' : 'border-slate-200'}`}>
                <CardHeader className={`pb-2 ${isOccupied ? 'bg-gradient-to-r from-sky-50 to-blue-50' : 'bg-slate-50'}`}>
                  <CardTitle className="flex items-center justify-between">
                    <span className={`text-xl font-black ${isOccupied ? 'text-sky-600' : 'text-slate-400'}`}>
                      {courtNumber}コート
                    </span>
                    {match && (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] font-bold text-white bg-sky-500 px-1.5 py-0.5 rounded-full">
                          {getCategoryLabel(match.tournament_type)}
                        </span>
                        <span className="text-[10px] font-medium text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded-full">
                          {getRoundLabel(match)}
                        </span>
                        {match.division && (
                          <span className="text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">
                            {match.division}部
                          </span>
                        )}
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>

                <CardContent className="pt-2">
                  {isOccupied && match ? (
                    <div className="space-y-2">
                      {/* 選手表示 */}
                      <div className="space-y-1.5">
                        <div className="bg-white p-2 rounded border border-slate-200">
                          <p className="font-bold text-slate-800 text-center text-sm">
                            {match.player1?.name || "未登録"}
                            {match.player3?.id && ` / ${match.player3.name}`}
                          </p>
                        </div>

                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-bold text-slate-400">VS</span>
                        </div>

                        <div className="bg-white p-2 rounded border border-slate-200">
                          <p className="font-bold text-slate-800 text-center text-sm">
                            {match.player2?.name || "未登録"}
                            {match.player4?.id && ` / ${match.player4.name}`}
                          </p>
                        </div>
                      </div>

                      {/* ステータス表示（管理者画面：callingも「試合中」と表示） */}
                      {match.status === 'calling' && (
                        <div className="flex items-center justify-center gap-2 text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-500"></span>
                          </span>
                          <span className="font-bold">試合中</span>
                          {getElapsedTime(match) && (
                            <>
                              <Clock className="w-3 h-3 ml-1" />
                              <span className="font-mono">{getElapsedTime(match)}</span>
                            </>
                          )}
                        </div>
                      )}

                      {match.status === 'playing' && (
                        <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 px-2 py-1 rounded text-xs">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="font-bold">試合中</span>
                          {getElapsedTime(match) && (
                            <>
                              <span className="font-mono font-bold">{getElapsedTime(match)}</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* スコア入力（結果入力ボタンクリック時に表示） */}
                      {match.status === 'completed' ? (
                        <div className="bg-green-50 border border-green-200 rounded p-2">
                          <p className="text-center text-green-800 font-bold text-xs mb-1">試合終了</p>
                          <div className="flex justify-center gap-3 text-xl font-bold">
                            <span className={match.winner_id === match.player1_id ? 'text-green-600' : 'text-gray-400'}>
                              {match.score_p1}
                            </span>
                            <span className="text-gray-400">-</span>
                            <span className={match.winner_id === match.player2_id ? 'text-green-600' : 'text-gray-400'}>
                              {match.score_p2}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {showInputFor === match.id ? (
                            <div className="space-y-2 mt-2">
                              <div className="flex gap-1.5 items-center">
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={scores[match.id]?.p1 || ''}
                                  onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                                  className="text-center text-base font-bold h-8"
                                  disabled={submitting === match.id}
                                />
                                <span className="text-slate-400 font-bold text-sm">-</span>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={scores[match.id]?.p2 || ''}
                                  onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                                  className="text-center text-base font-bold h-8"
                                  disabled={submitting === match.id}
                                />
                              </div>

                              <Button
                                onClick={() => handleSubmit(match, court.id)}
                                disabled={submitting === match.id}
                                className="w-full bg-sky-500 hover:bg-sky-600 h-8 text-xs"
                                size="sm"
                              >
                                {submitting === match.id ? '送信中...' : '結果を確定'}
                              </Button>

                              <div className="grid grid-cols-2 gap-1.5">
                                <Button
                                  onClick={() => handleWalkover(match, court.id, 1)}
                                  disabled={submitting === match.id}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                >
                                  上側 WO
                                </Button>
                                <Button
                                  onClick={() => handleWalkover(match, court.id, 2)}
                                  disabled={submitting === match.id}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                >
                                  下側 WO
                                </Button>
                              </div>

                              <Button
                                onClick={() => setShowInputFor(null)}
                                variant="ghost"
                                size="sm"
                                className="w-full h-7 text-xs"
                              >
                                閉じる
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2 mt-2">
                              <div className="grid grid-cols-4 gap-1.5">
                                <Button
                                  onClick={() => setShowInputFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-sky-300 text-sky-700 hover:bg-sky-50 text-xs px-1"
                                >
                                  結果入力
                                </Button>
                                <Button
                                  onClick={() => handleShowCourtChange(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-purple-300 text-purple-700 hover:bg-purple-50 text-xs px-1"
                                >
                                  コート変更
                                </Button>
                                <Button
                                  onClick={() => setShowBreakFor(match.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-orange-300 text-orange-700 hover:bg-orange-50 text-xs px-1"
                                >
                                  休憩
                                </Button>
                                <Button
                                  onClick={() => handleFreeCourt(court.id)}
                                  variant="outline"
                                  size="sm"
                                  className="border-slate-300 text-slate-600 hover:bg-slate-50 text-xs px-1"
                                >
                                  フリー
                                </Button>
                              </div>

                              {/* コート変更ダイアログ */}
                              {showCourtChangeFor === match.id && (
                                <div className="bg-purple-50 border border-purple-200 rounded p-2 space-y-1.5">
                                  <p className="text-[10px] font-bold text-purple-800">移動先のコートを選択:</p>
                                  <div className="grid grid-cols-4 gap-1">
                                    {availableCourts.map(c => {
                                      const num = c.number || c.id.replace('court_', '');
                                      return (
                                        <Button
                                          key={c.id}
                                          onClick={() => handleCourtChange(match.id, c.id)}
                                          size="sm"
                                          variant="outline"
                                          className="border-purple-300 text-purple-700 hover:bg-purple-100 h-7 text-xs px-1"
                                        >
                                          {num}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                  <Button
                                    onClick={() => setShowCourtChangeFor(null)}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-[10px] h-6"
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              )}

                              {/* 休憩時間選択ダイアログ */}
                              {showBreakFor === match.id && (
                                <div className="bg-orange-50 border border-orange-200 rounded p-2 space-y-1.5">
                                  <p className="text-[10px] font-bold text-orange-800">休憩時間を選択:</p>
                                  <div className="grid grid-cols-4 gap-1">
                                    {[5, 10, 15, 20].map(minutes => (
                                      <Button
                                        key={minutes}
                                        onClick={() => handleSetBreak(match.id, court.id, minutes)}
                                        size="sm"
                                        variant="outline"
                                        className="border-orange-300 text-orange-700 hover:bg-orange-100 h-7 text-xs px-1"
                                      >
                                        {minutes}分
                                      </Button>
                                    ))}
                                  </div>
                                  <Button
                                    onClick={() => setShowBreakFor(null)}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full text-[10px] h-6"
                                  >
                                    キャンセル
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-3">
                      <Users className={`w-8 h-8 mb-1.5 ${court.manually_freed ? 'text-amber-300' : 'text-slate-300'}`} />
                      <span className={`text-xs font-medium ${court.manually_freed ? 'text-amber-600' : 'text-slate-400'}`}>
                        フリー
                      </span>
                      {court.manually_freed ? (
                        <>
                          <span className="text-[10px] text-amber-500 mt-0.5 font-medium">🔒 自動割り当て無効</span>
                          <Button
                            onClick={() => handleResumeAllocation(court.id)}
                            variant="outline"
                            size="sm"
                            className="mt-2 border-amber-400 text-amber-700 hover:bg-amber-50 h-7 text-xs px-2"
                          >
                            ▶️ 割り当て再開
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-0.5">自由に使用できます</span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
