'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { subscribeToActiveMatches, subscribeToCompletedMatches, getPlayerById, updateMatchResult, updateDocument, resetMatchResult, recordWalkover } from '@/lib/firestore-helpers';
import { recordMatchDuration } from '@/lib/eta';
import type { Match, Player, MatchWithPlayers } from '@/types';
import { useCamp } from '@/context/CampContext';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError } from '@/lib/toast';

export default function MatchResultInput({ readOnly = false }: { readOnly?: boolean }) {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [completedMatches, setCompletedMatches] = useState<MatchWithPlayers[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToActiveMatches(async (matchesData) => {
      const matchesWithPlayers = await Promise.all(
        matchesData.map(async (match) => {
          const p1 = await getPlayerById(match.player1_id);
          const p2 = await getPlayerById(match.player2_id);
          const p3 = match.player3_id ? await getPlayerById(match.player3_id) : undefined;
          const p4 = match.player4_id ? await getPlayerById(match.player4_id) : undefined;

          return {
            ...match,
            player1: p1!,
            player2: p2!,
            player3: p3,
            player4: p4,
          } as MatchWithPlayers;
        })
      );

      setMatches(matchesWithPlayers.filter(m => m.player1 && m.player2));
      setLoading(false);
    }, camp.id);

    return () => unsubscribe();
  }, [camp]);

  useEffect(() => {
    if (!camp || !showCompleted) return;

    const unsubscribe = subscribeToCompletedMatches(async (matchesData) => {
      const matchesWithPlayers = await Promise.all(
        matchesData.map(async (match) => {
          const p1 = await getPlayerById(match.player1_id);
          const p2 = await getPlayerById(match.player2_id);
          const p3 = match.player3_id ? await getPlayerById(match.player3_id) : undefined;
          const p4 = match.player4_id ? await getPlayerById(match.player4_id) : undefined;

          return {
            ...match,
            player1: p1!,
            player2: p2!,
            player3: p3,
            player4: p4,
          } as MatchWithPlayers;
        })
      );

      setCompletedMatches(matchesWithPlayers.filter(m => m.player1 && m.player2));
    }, camp.id);

    return () => unsubscribe();
  }, [camp, showCompleted]);

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


  const handleSubmit = async (match: MatchWithPlayers) => {
    const score = scores[match.id];
    if (!score || (score.p1 === 0 && score.p2 === 0)) {
      alert('スコアを入力してください');
      return;
    }

    const winnerId = score.p1 > score.p2 ? match.player1_id : match.player2_id;

    setSubmitting(match.id);

    try {
      await updateMatchResult(match.id, score.p1, score.p2, winnerId);

      if (match.court_id) {
        await updateDocument('courts', match.court_id, { current_match_id: null });
      }

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

  const handleReset = async (matchId: string) => {
    const confirmed = await confirm({
      title: '⚠️ 試合結果の取り消し',
      message: 'この試合結果を取り消して未実施に戻しますか？',
      confirmText: '取り消す',
      cancelText: 'キャンセル',
      type: 'warning',
    });
    if (!confirmed) return;

    setSubmitting(matchId);
    try {
      await resetMatchResult(matchId);
    } catch (error) {
      alert('エラーが発生しました');
    }
    setSubmitting(null);
  };

  const handleEditScore = async (match: MatchWithPlayers) => {
    const score = scores[match.id];
    if (!score || (score.p1 === 0 && score.p2 === 0)) {
      alert('スコアを入力してください');
      return;
    }

    const winnerId = score.p1 > score.p2 ? match.player1_id : match.player2_id;

    setSubmitting(match.id);
    try {
      await updateDocument('matches', match.id, {
        score_p1: score.p1,
        score_p2: score.p2,
        winner_id: winnerId,
      });
      setEditingMatchId(null);
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

  const handleWalkover = async (match: MatchWithPlayers, winnerSide: 1 | 2) => {
    const winnerName = winnerSide === 1
      ? (match.player1.name + (match.player3 ? ` / ${match.player3.name}` : ''))
      : (match.player2.name + (match.player4 ? ` / ${match.player4.name}` : ''));

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
      toastSuccess(`${winnerName} の不戦勝を記録しました`);

      if (match.court_id) {
        await updateDocument('courts', match.court_id, { current_match_id: null });
      }
    } catch (error) {
      toastError('エラーが発生しました');
    }
    setSubmitting(null);
  };

  if (loading) {
    return <Loading />;
  }

  // 検索フィルター
  const filterMatches = (matchList: MatchWithPlayers[]) => {
    if (!searchQuery.trim()) return matchList;

    const query = searchQuery.toLowerCase();
    return matchList.filter(match => {
      const player1Name = match.player1?.name.toLowerCase() || '';
      const player2Name = match.player2?.name.toLowerCase() || '';
      const player3Name = match.player3?.name.toLowerCase() || '';
      const player4Name = match.player4?.name.toLowerCase() || '';

      return player1Name.includes(query) ||
        player2Name.includes(query) ||
        player3Name.includes(query) ||
        player4Name.includes(query);
    });
  };

  const displayMatches = filterMatches(showCompleted ? completedMatches : matches);

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCompleted(false)}
            variant={!showCompleted ? "default" : "outline"}
            size="sm"
          >
            進行中 ({matches.length})
          </Button>
          <Button
            onClick={() => setShowCompleted(true)}
            variant={showCompleted ? "default" : "outline"}
            size="sm"
          >
            完了済み ({completedMatches.length})
          </Button>
        </div>

        {showCompleted && (
          <Input
            type="text"
            placeholder="選手名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="md:max-w-xs"
          />
        )}
      </div>

      {displayMatches.length === 0 && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 p-8 rounded-lg text-center">
          <p className="text-slate-600 font-medium">
            {searchQuery ? `「${searchQuery}」に一致する試合がありません` :
             (showCompleted ? '完了済みの試合がありません' : '進行中の試合がありません')}
          </p>
          {searchQuery && (
            <Button
              onClick={() => setSearchQuery('')}
              variant="outline"
              size="sm"
              className="mt-3"
            >
              検索をクリア
            </Button>
          )}
        </div>
      )}

      {displayMatches.map((match) => (
        <Card key={match.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">
                    {match.status === 'waiting' && '待機中'}
                    {match.status === 'calling' && '試合中'}
                    {match.status === 'playing' && '試合中'}
                    {match.status === 'completed' && '完了'}
                  </span>
                  {match.court_id && (
                    <span className="text-xs text-gray-500">
                      コート {match.court_id.replace('court_', '')}
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-semibold">
                    {match.player1.name}
                    {match.player3 && ` / ${match.player3.name}`}
                  </p>
                  <p className="text-xs text-gray-500 my-1">vs</p>
                  <p className="font-semibold">
                    {match.player2.name}
                    {match.player4 && ` / ${match.player4.name}`}
                  </p>
                  {match.points_per_match && (
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      {match.points_per_match}点マッチ
                    </p>
                  )}
                  {match.next_match_number && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      勝者は試合#{match.next_match_number}へ進出
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {match.status === 'completed' ? (
                  <>
                    {match.is_walkover ? (
                      <div className="flex flex-col gap-1 items-center">
                        <div className={`text-lg font-bold ${match.walkover_winner === 1 ? 'text-green-600' : 'text-gray-400'}`}>
                          WO
                        </div>
                        <div className={`text-lg font-bold ${match.walkover_winner === 2 ? 'text-green-600' : 'text-gray-400'}`}>
                          WO
                        </div>
                      </div>
                    ) : editingMatchId === match.id ? (
                      <div className="flex flex-col gap-1">
                        <Input
                          type="number"
                          min="0"
                          value={scores[match.id]?.p1 ?? match.score_p1}
                          onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                          className="w-16 text-center"
                          disabled={submitting === match.id || readOnly}
                        />
                        <Input
                          type="number"
                          min="0"
                          value={scores[match.id]?.p2 ?? match.score_p2}
                          onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                          className="w-16 text-center"
                          disabled={submitting === match.id || readOnly}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 items-center">
                        <div className={`text-lg font-bold ${match.winner_id === match.player1_id ? 'text-green-600' : 'text-gray-400'}`}>
                          {match.score_p1}
                        </div>
                        <div className={`text-lg font-bold ${match.winner_id === match.player2_id ? 'text-green-600' : 'text-gray-400'}`}>
                          {match.score_p2}
                        </div>
                      </div>
                    )}
                    {editingMatchId === match.id ? (
                      <>
                        <Button
                          onClick={() => handleEditScore(match)}
                          disabled={submitting === match.id || readOnly}
                          size="sm"
                          variant="default"
                        >
                          {submitting === match.id ? '保存中...' : '保存'}
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingMatchId(null);
                            setScores(prev => {
                              const newScores = { ...prev };
                              delete newScores[match.id];
                              return newScores;
                            });
                          }}
                          disabled={submitting === match.id}
                          size="sm"
                          variant="outline"
                        >
                          キャンセル
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            setEditingMatchId(match.id);
                            setScores(prev => ({
                              ...prev,
                              [match.id]: { p1: match.score_p1, p2: match.score_p2 }
                            }));
                          }}
                          disabled={submitting === match.id || readOnly}
                          size="sm"
                          variant="outline"
                        >
                          編集
                        </Button>
                        <Button
                          onClick={() => handleReset(match.id)}
                          disabled={submitting === match.id || readOnly}
                          size="sm"
                          variant="destructive"
                        >
                          {submitting === match.id ? '取消中...' : '結果取消'}
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex gap-2">
                    <div className="flex flex-col gap-1">
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={scores[match.id]?.p1 || ''}
                        onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                        className="w-16 text-center"
                        disabled={submitting === match.id || readOnly}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={scores[match.id]?.p2 || ''}
                        onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                        className="w-16 text-center"
                        disabled={submitting === match.id || readOnly}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <Button
                        onClick={() => handleSubmit(match)}
                        disabled={submitting === match.id || readOnly}
                        size="sm"
                      >
                        {submitting === match.id ? '送信中...' : '結果確定'}
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => handleWalkover(match, 1)}
                          disabled={submitting === match.id || readOnly}
                          size="sm"
                          variant="outline"
                          className="text-xs px-2"
                        >
                          WO上
                        </Button>
                        <Button
                          onClick={() => handleWalkover(match, 2)}
                          disabled={submitting === match.id || readOnly}
                          size="sm"
                          variant="outline"
                          className="text-xs px-2"
                        >
                          WO下
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      </div>
    </>
  );
}
