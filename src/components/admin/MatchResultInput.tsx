'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { subscribeToActiveMatches, getPlayerById, updateMatchResult, updateDocument } from '@/lib/firestore-helpers';
import { recordMatchDuration } from '@/lib/eta';
import type { Match, Player, MatchWithPlayers } from '@/types';

export default function MatchResultInput() {
  const [matches, setMatches] = useState<MatchWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, { p1: number; p2: number }>>({});

  useEffect(() => {
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
    });

    return () => unsubscribe();
  }, []);

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

  if (loading) {
    return <p className="text-gray-600 dark:text-gray-400">読み込み中...</p>;
  }

  if (matches.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">進行中の試合がありません</p>;
  }

  return (
    <div className="space-y-4">
      {matches.map((match) => (
        <Card key={match.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">
                    {match.status === 'waiting' && '待機中'}
                    {match.status === 'calling' && '呼び出し中'}
                    {match.status === 'playing' && '試合中'}
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
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={scores[match.id]?.p1 || ''}
                    onChange={(e) => handleScoreChange(match.id, 'p1', e.target.value)}
                    className="w-16 text-center"
                    disabled={submitting === match.id}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={scores[match.id]?.p2 || ''}
                    onChange={(e) => handleScoreChange(match.id, 'p2', e.target.value)}
                    className="w-16 text-center"
                    disabled={submitting === match.id}
                  />
                </div>

                <Button
                  onClick={() => handleSubmit(match)}
                  disabled={submitting === match.id}
                  size="sm"
                >
                  {submitting === match.id ? '送信中...' : '結果確定'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
