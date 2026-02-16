'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Match, Player } from '@/types';

interface ActiveMatchesViewProps {
  campId: string;
}

export default function ActiveMatchesView({ campId }: ActiveMatchesViewProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const matchesQ = query(
      collection(db, 'matches'),
      where('campId', '==', campId),
      where('status', 'in', ['calling', 'playing']),
      orderBy('updated_at', 'desc')
    );

    const unsubscribeMatches = onSnapshot(matchesQ, (snapshot) => {
      const matchList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setMatches(matchList);
      setLoading(false);
    });

    const playersQ = query(collection(db, 'players'), where('campId', '==', campId));
    const unsubscribePlayers = onSnapshot(playersQ, (snapshot) => {
      const playerMap = new Map<string, Player>();
      snapshot.docs.forEach(doc => {
        const player = { id: doc.id, ...doc.data() } as Player;
        playerMap.set(player.id!, player);
      });
      setPlayers(playerMap);
    });

    return () => {
      unsubscribeMatches();
      unsubscribePlayers();
    };
  }, [campId]);

  const getPlayerName = (pid: string | undefined) => {
    if (!pid) return '未定';
    return players.get(pid)?.name || '不明';
  };

  const getStatusConfig = (status: string) => {
    if (status === 'calling') {
      return {
        label: '呼び出し中',
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-800',
        borderColor: 'border-l-orange-500',
      };
    }
    return {
      label: '試合中',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-l-blue-500',
    };
  };

  if (loading) {
    return <p className="text-gray-600">読み込み中...</p>;
  }

  if (matches.length === 0) {
    return <p className="text-gray-600 text-center py-4">現在進行中の試合はありません</p>;
  }

  return (
    <div className="space-y-3">
      {matches.map(match => {
        const statusConfig = getStatusConfig(match.status);
        return (
          <Card key={match.id} className={`border-l-4 ${statusConfig.borderColor}`}>
            <CardContent className="p-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-xs text-gray-500">試合 #{match.match_number}</p>
                  <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} text-xs mt-1`}>
                    {statusConfig.label}
                  </Badge>
                </div>
                {match.court_id && (
                  <Badge variant="outline" className="text-xs font-bold">
                    コート {match.court_id.replace('court_', '')}
                  </Badge>
                )}
              </div>
              <div className="text-sm">
                <p className="font-semibold">
                  {getPlayerName(match.player1_id)}
                  {match.player3_id && ` / ${getPlayerName(match.player3_id)}`}
                </p>
                <p className="text-xs text-gray-500 my-1">vs</p>
                <p className="font-semibold">
                  {getPlayerName(match.player2_id)}
                  {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                </p>
              </div>
              {match.points_per_match && (
                <p className="text-xs text-purple-600 mt-2">{match.points_per_match}点マッチ</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
