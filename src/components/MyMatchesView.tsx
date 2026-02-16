'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Match, Player, TournamentConfig } from '@/types';
import { Calendar, Trophy, Clock, MapPin } from 'lucide-react';

interface MyMatchesViewProps {
  playerId: string;
  campId: string;
}

const isPlayerInMatch = (match: Match, playerId: string) => {
  return (
    match.player1_id === playerId ||
    match.player2_id === playerId ||
    match.player3_id === playerId ||
    match.player4_id === playerId
  );
};

export default function MyMatchesView({ playerId, campId }: MyMatchesViewProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [tournamentConfigs, setTournamentConfigs] = useState<TournamentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifiedMatches, setNotifiedMatches] = useState<Set<string>>(new Set());

  useEffect(() => {
    const matchesQ = query(
      collection(db, 'matches'),
      where('campId', '==', campId),
      orderBy('match_number')
    );

    const unsubscribeMatches = onSnapshot(matchesQ, (snapshot) => {
      const fetchedMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      setAllMatches(fetchedMatches);
      const myMatches = fetchedMatches.filter(m => isPlayerInMatch(m, playerId));
      setMatches(myMatches);
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

    const configsQ = query(collection(db, 'tournament_configs'), where('campId', '==', campId));
    const unsubscribeConfigs = onSnapshot(configsQ, (snapshot) => {
      const configs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TournamentConfig));
      setTournamentConfigs(configs);
    });

    return () => {
      unsubscribeMatches();
      unsubscribePlayers();
      unsubscribeConfigs();
    };
  }, [playerId, campId]);

  // 試合呼び出し時の通知（ブラウザ通知は廃止、アプリ内通知のみ使用）
  useEffect(() => {
    const callingMatches = matches.filter(m => m.status === 'calling' && !notifiedMatches.has(m.id));

    callingMatches.forEach(match => {
      // 音声やアプリ内通知は別途実装
      setNotifiedMatches(prev => new Set(prev).add(match.id));
    });
  }, [matches, notifiedMatches]);

  const getPlayerName = useCallback((pid: string | undefined) => {
    if (!pid) return '未定';
    return players.get(pid)?.name || '不明';
  }, [players]);

  const getPlayerNameOrPending = useCallback((match: Match, position: 1 | 2) => {
    const pid = position === 1 ? match.player1_id : match.player2_id;
    const partnerPid = position === 1 ? match.player3_id : match.player4_id;

    if (pid && pid !== '') {
      const name = getPlayerName(pid);
      const partnerName = partnerPid ? getPlayerName(partnerPid) : null;
      return partnerName ? `${name} / ${partnerName}` : name;
    }

    // 未確定の場合、next_match情報から取得
    const sourceMatchId = position === 1 ? findSourceMatch(match, 1) : findSourceMatch(match, 2);
    if (sourceMatchId) {
      const sourceMatch = allMatches.find(m => m.id === sourceMatchId);
      if (sourceMatch) {
        const p1Name = getPlayerName(sourceMatch.player1_id);
        const p2Name = getPlayerName(sourceMatch.player2_id);
        const p3Name = sourceMatch.player3_id ? getPlayerName(sourceMatch.player3_id) : null;
        const p4Name = sourceMatch.player4_id ? getPlayerName(sourceMatch.player4_id) : null;

        const team1 = p3Name ? `${p1Name}/${p3Name}` : p1Name;
        const team2 = p4Name ? `${p2Name}/${p4Name}` : p2Name;

        return `試合#${sourceMatch.match_number || '?'} (${team1} vs ${team2}) の勝者`;
      }
    }

    return '未定';
  }, [players, allMatches, getPlayerName]);

  const findSourceMatch = (match: Match, position: 1 | 2): string | null => {
    // この試合のposition側の選手が「次の試合」として設定されている試合を探す
    const source = allMatches.find(m =>
      m.next_match_id === match.id && m.next_match_position === position
    );
    return source ? source.id : null;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: any }> = {
      waiting: { label: '待機中', variant: 'secondary' },
      calling: { label: '呼び出し中', variant: 'default' },
      playing: { label: '試合中', variant: 'default' },
      completed: { label: '完了', variant: 'outline' },
    };
    const { label, variant } = config[status] || { label: status, variant: 'secondary' };
    return <Badge variant={variant} className="text-xs">{label}</Badge>;
  };

  const isMyWin = (match: Match) => {
    if (match.status !== 'completed' || !match.winner_id) return null;
    if (match.winner_id === playerId) return true;
    if (match.player1_id === playerId || match.player3_id === playerId) {
      return match.winner_id === match.player1_id;
    }
    if (match.player2_id === playerId || match.player4_id === playerId) {
      return match.winner_id === match.player2_id;
    }
    return null;
  };

  const waiting = useMemo(() => matches.filter(m => m.status === 'waiting'), [matches]);
  const active = useMemo(() => matches.filter(m => m.status === 'calling' || m.status === 'playing'), [matches]);
  const completed = useMemo(() => matches.filter(m => m.status === 'completed'), [matches]);

  // Task 6: 進行順位に基づいて表示する待機試合をフィルタ
  const visibleWaiting = useMemo(() => {
    if (tournamentConfigs.length === 0) return waiting;

    // 現在進行中の種目を取得
    const activeTournamentTypes = new Set(active.map(m => `${m.tournament_type}_${m.division || 0}`));

    // 各種目の優先度をマッピング
    const priorityMap = new Map<string, number>();
    tournamentConfigs.forEach(tc => {
      const eventType = tournamentTypeToEventType(tc.event_type);
      const key = `${eventTypeTtoTournamentType(eventType)}_${tc.division}`;
      priorityMap.set(key, tc.priority || 999);
    });

    // 進行中の種目がある場合、その種目のみ表示
    if (activeTournamentTypes.size > 0) {
      return waiting.filter(m => {
        const key = `${m.tournament_type}_${m.division || 0}`;
        return activeTournamentTypes.has(key);
      });
    }

    // 進行中の種目がない場合、最も優先度が高い種目のみ表示
    let minPriority = 999;
    waiting.forEach(m => {
      const key = `${m.tournament_type}_${m.division || 0}`;
      const priority = priorityMap.get(key) || 999;
      if (priority < minPriority) minPriority = priority;
    });

    return waiting.filter(m => {
      const key = `${m.tournament_type}_${m.division || 0}`;
      const priority = priorityMap.get(key) || 999;
      return priority === minPriority;
    });
  }, [waiting, active, tournamentConfigs]);

  function tournamentTypeToEventType(eventType: string): string {
    return eventType; // MD, WD, XD, MS, WS, TEAM
  }

  function eventTypeTtoTournamentType(eventType: string): string {
    const mapping: Record<string, string> = {
      'MS': 'mens_singles',
      'WS': 'womens_singles',
      'MD': 'mens_doubles',
      'WD': 'womens_doubles',
      'XD': 'mixed_doubles',
      'TEAM': 'team_battle',
    };
    return mapping[eventType] || 'mens_doubles';
  }

  const getMatchesBeforeCount = useCallback((match: Match) => {
    if (!match.match_number) return null;
    // この試合より前の試合番号で、まだ完了していない試合をカウント
    const beforeMatches = matches.filter(m =>
      m.match_number &&
      match.match_number &&
      m.match_number < match.match_number &&
      m.status !== 'completed'
    );
    return beforeMatches.length;
  }, [matches]);

  const avgMatchDuration = useMemo(() => {
    // 平均試合時間（分）を計算
    const completedWithTime = matches.filter(m =>
      m.status === 'completed' && m.start_time && m.end_time
    );

    let avgDuration = 15; // デフォルト15分
    if (completedWithTime.length > 0) {
      const durations = completedWithTime.map(m => {
        const duration = (m.end_time!.toMillis() - m.start_time!.toMillis()) / (1000 * 60);
        return duration > 3 && duration < 40 ? duration : 0; // 外れ値除外
      }).filter(d => d > 0);

      if (durations.length > 0) {
        avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
    }

    return avgDuration;
  }, [matches]);

  const getEstimatedWaitTime = useCallback((matchesBefore: number): number => {
    // コート数を推定（最大6面）
    const activeCourts = 6;

    // 計算: (前の試合数 / コート数) * 平均試合時間
    return Math.ceil((matchesBefore / activeCourts) * avgMatchDuration);
  }, [avgMatchDuration]);

  if (loading) {
    return <Loading message="試合データを読み込み中..." />;
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
            <Clock className="w-4 h-4 text-orange-500" />
            進行中
          </h3>
          {active.map(match => {
            const isWin = isMyWin(match);
            return (
              <Card key={match.id} className="mb-2 border-l-4 border-l-orange-500">
                <CardContent className="p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">試合 #{match.match_number}</p>
                      {getStatusBadge(match.status)}
                    </div>
                    {match.court_id && (
                      <Badge variant="outline" className="text-xs">
                        コート {match.court_id.replace('court_', '')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm">
                    <p className={`${match.player1_id === playerId || match.player3_id === playerId ? 'font-bold text-blue-600' : ''}`}>
                      {getPlayerName(match.player1_id)}
                      {match.player3_id && ` / ${getPlayerName(match.player3_id)}`}
                    </p>
                    <p className="text-xs text-gray-500 my-1">vs</p>
                    <p className={`${match.player2_id === playerId || match.player4_id === playerId ? 'font-bold text-blue-600' : ''}`}>
                      {getPlayerName(match.player2_id)}
                      {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {visibleWaiting.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
            <Calendar className="w-4 h-4 text-blue-500" />
            待機中 ({visibleWaiting.length}試合)
          </h3>
          <div className="space-y-2">
            {visibleWaiting.slice(0, 3).map(match => {
              const beforeCount = getMatchesBeforeCount(match);
              const estimatedMinutes = beforeCount !== null && beforeCount > 0
                ? getEstimatedWaitTime(beforeCount)
                : 0;
              return (
                <Card key={match.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs text-gray-500">試合 #{match.match_number}</p>
                      <div className="flex flex-col items-end gap-1">
                        {beforeCount !== null && beforeCount > 0 && (
                          <>
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                              あと{beforeCount}試合後
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                              約{estimatedMinutes}分後
                            </Badge>
                          </>
                        )}
                        {beforeCount === 0 && (
                          <Badge variant="default" className="text-xs bg-orange-500">
                            次の試合
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm">
                    <p className={`${match.player1_id === playerId || match.player3_id === playerId ? 'font-bold' : ''}`}>
                      {getPlayerNameOrPending(match, 1)}
                    </p>
                    <p className="text-xs text-gray-500 my-1">vs</p>
                    <p className={`${match.player2_id === playerId || match.player4_id === playerId ? 'font-bold' : ''}`}>
                      {getPlayerNameOrPending(match, 2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              );
            })}
            {visibleWaiting.length > 3 && (
              <p className="text-xs text-gray-500 text-center">他 {visibleWaiting.length - 3} 試合</p>
            )}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
            <Trophy className="w-4 h-4 text-green-500" />
            完了 ({completed.length}試合)
          </h3>
          <div className="space-y-2">
            {completed.slice(0, 3).map(match => {
              const isWin = isMyWin(match);
              return (
                <Card key={match.id} className="border-l-4 border-l-green-500">
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-xs text-gray-500">試合 #{match.match_number}</p>
                      {isWin !== null && (
                        <Badge variant={isWin ? "default" : "outline"} className="text-xs">
                          {isWin ? '勝利' : '敗北'}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <div className="flex-1">
                        <p className={`${match.player1_id === playerId || match.player3_id === playerId ? 'font-bold' : ''}`}>
                          {getPlayerName(match.player1_id)}
                          {match.player3_id && ` / ${getPlayerName(match.player3_id)}`}
                        </p>
                        <p className="text-xs text-gray-500 my-1">vs</p>
                        <p className={`${match.player2_id === playerId || match.player4_id === playerId ? 'font-bold' : ''}`}>
                          {getPlayerName(match.player2_id)}
                          {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className={`text-lg font-bold ${match.winner_id === match.player1_id ? 'text-green-600' : 'text-gray-400'}`}>
                          {match.score_p1}
                        </p>
                        <p className={`text-lg font-bold ${match.winner_id === match.player2_id ? 'text-green-600' : 'text-gray-400'}`}>
                          {match.score_p2}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {completed.length > 3 && (
              <p className="text-xs text-gray-500 text-center">他 {completed.length - 3} 試合</p>
            )}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <p className="text-gray-600 text-center py-4">試合がありません</p>
      )}
    </div>
  );
}
