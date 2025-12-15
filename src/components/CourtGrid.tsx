"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { subscribeToCourts, getMatchWithPlayers } from '@/lib/firestore-helpers';
import type { Court, MatchWithPlayers } from '@/types';

export default function CourtGrid() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchesCache, setMatchesCache] = useState<Record<string, MatchWithPlayers>>({});

  useEffect(() => {
    const unsubscribe = subscribeToCourts((courtsData) => {
      setCourts(courtsData);
      setLoading(false);

      courtsData.forEach(async (court) => {
        if (court.current_match_id && !matchesCache[court.current_match_id]) {
          const match = await getMatchWithPlayers(court.current_match_id);
          if (match) {
            setMatchesCache(prev => ({ ...prev, [match.id]: match }));
          }
        }
      });
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">コート情報を読み込み中...</p>
        </CardContent>
      </Card>
    );
  }

  if (courts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            コート情報がありません
          </p>
          <p className="text-sm text-gray-500">
            管理者画面でコートを初期化してください
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {courts.map((court) => (
        <Card 
          key={court.id}
          className={`transition-all ${
            court.current_match_id 
              ? 'border-blue-500 dark:border-blue-700' 
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-lg">コート {court.number}</span>
              <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">
                {court.preferred_gender === 'male' ? '男子優先' : '女子優先'}
              </span>
            </div>
            
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {court.current_match_id ? (
                <div>
                  <div className="inline-block px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded text-xs mb-2">
                    試合中
                  </div>
                  {matchesCache[court.current_match_id] ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {matchesCache[court.current_match_id].player1.name}
                        {matchesCache[court.current_match_id]?.player3 && ` / ${matchesCache[court.current_match_id].player3?.name}`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">vs</p>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {matchesCache[court.current_match_id].player2.name}
                        {matchesCache[court.current_match_id]?.player4 && ` / ${matchesCache[court.current_match_id].player4?.name}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      試合情報読み込み中...
                    </p>
                  )}
                </div>
              ) : (
                <div className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-xs">
                  空きコート
                </div>
              )}
            </div>

            {!court.is_active && (
              <div className="mt-2 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 rounded text-xs">
                使用不可
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
