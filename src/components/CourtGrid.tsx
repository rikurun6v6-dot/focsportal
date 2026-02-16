"use client";

import { useEffect, useState, useRef } from "react";
import { Users, Clock } from "lucide-react";
import { subscribeToCourts, getMatchWithPlayers, getAllDocuments } from "@/lib/firestore-helpers";
import type { Court, MatchWithPlayers, TournamentType, Match } from "@/types";
import { useCamp } from "@/context/CampContext";

export default function CourtGrid() {
  const { camp } = useCamp();
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [matchesCache, setMatchesCache] = useState<Record<string, MatchWithPlayers>>({});
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [reservedMatches, setReservedMatches] = useState<Record<string, MatchWithPlayers>>({});

  const fetchedMatchIds = useRef<Set<string>>(new Set());

  // 1分ごとに現在時刻を更新（予約情報のカウントダウン用）
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // 1分ごと
    return () => clearInterval(timer);
  }, []);

  // 予約試合を取得
  useEffect(() => {
    if (!camp) return;

    const fetchReservedMatches = async () => {
      try {
        const allMatches = await getAllDocuments<Match>('matches');
        const reserved = allMatches.filter(m =>
          m.campId === camp.id &&
          m.status === 'waiting' &&
          m.available_at &&
          m.reserved_court_id
        );

        const reservedWithPlayers: Record<string, MatchWithPlayers> = {};
        await Promise.all(
          reserved.map(async (match) => {
            const withPlayers = await getMatchWithPlayers(match.id);
            if (withPlayers && match.reserved_court_id) {
              reservedWithPlayers[match.reserved_court_id] = withPlayers;
            }
          })
        );

        setReservedMatches(reservedWithPlayers);
      } catch (error) {
        console.error('Error fetching reserved matches:', error);
      }
    };

    fetchReservedMatches();
    const interval = setInterval(fetchReservedMatches, 60000); // 1分ごとに更新

    return () => clearInterval(interval);
  }, [camp?.id]);

  const getCategoryLabel = (type: TournamentType | string | undefined) => {
    if (!type) return "不明";
    const map: Record<string, string> = {
      mens_doubles: "男子D",
      womens_doubles: "女子D",
      mixed_doubles: "混合D",
      mens_singles: "男子S",
      womens_singles: "女子S",
      team_battle: "団体戦"
    };
    return map[type as string] || (type as string);
  };

  const getRoundLabel = (round: number | undefined) => {
    if (round === undefined) return "-";
    if (round === 100) return "決勝";
    if (round === 99) return "準決勝";
    return `${round}回戦`;
  };

  const getElapsedTime = (match: MatchWithPlayers | null) => {
    if (!match) return null;

    // 試合中の場合はstart_timeを使用、呼び出し中の場合はupdated_atを使用
    // どちらもない場合はcreated_atをフォールバックとして使用
    let startMs: number | null = null;

    if (match.status === 'playing' && match.start_time) {
      startMs = match.start_time.toMillis();
    } else if (match.status === 'calling' && match.updated_at) {
      startMs = match.updated_at.toMillis();
    } else if (match.status === 'calling' && match.created_at) {
      // updated_atがない場合のフォールバック
      startMs = match.created_at.toMillis();
    } else if (match.status === 'playing' && match.created_at) {
      // start_timeがない場合のフォールバック
      startMs = match.created_at.toMillis();
    }

    if (!startMs) return null;

    const elapsed = Math.floor((currentTime - startMs) / 1000);

    if (elapsed < 0) return null;

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getEstimatedRemaining = (match: MatchWithPlayers | null) => {
    if (!match || !match.start_time) return null;

    const AVERAGE_MATCH_DURATION_MINUTES = 15; // 平均試合時間（分）
    const startMs = match.start_time.toMillis();
    const elapsedMinutes = Math.floor((currentTime - startMs) / (1000 * 60));

    if (elapsedMinutes < 0) return null;

    const remainingMinutes = AVERAGE_MATCH_DURATION_MINUTES - elapsedMinutes;

    if (remainingMinutes <= 0) return "まもなく";

    return `あと約${remainingMinutes}分`;
  };

  useEffect(() => {
    if (!camp) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToCourts(async (updatedCourts) => {
      // コート番号順にソート
      const sorted = updatedCourts.sort((a, b) => {
        const numA = a.number || parseInt(a.id.replace('court_', '') || "0");
        const numB = b.number || parseInt(b.id.replace('court_', '') || "0");
        return numA - numB;
      });
      setCourts(sorted);
      setLoading(false);

      // --- データ取得ロジック ---
      const idsToFetch = sorted
        .map(c => c.current_match_id)
        .filter((id): id is string => !!id && !fetchedMatchIds.current.has(id));

      if (idsToFetch.length === 0) return;

      // 重複取得を防ぐために先にマーク
      idsToFetch.forEach(id => fetchedMatchIds.current.add(id));

      const newMatches: Record<string, MatchWithPlayers> = {};

      await Promise.all(
        idsToFetch.map(async (id) => {
          try {
            const match = await getMatchWithPlayers(id);
            if (match) {
              newMatches[id] = match;
            } else {
              // データが見つからない場合、無限ロードを防ぐために「不明」データを入れる
              newMatches[id] = {
                id: id,
                tournament_type: "mens_singles", // 仮
                round: 0,
                // エラー回避用のダミー選手データ
                player1: { name: "データ不明", id: "unknown" } as any,
                player2: { name: "データ不明", id: "unknown" } as any,
                // ...他に必要なプロパティがあれば適当に埋める
              } as any;
            }
          } catch (e) {
            console.error(`Error fetching match ${id}:`, e);
            // エラー時もリトライさせず「エラー」と表示させるならここでダミーを入れる
            // 今回はリトライさせるためにセットから削除
            fetchedMatchIds.current.delete(id);
          }
        })
      );

      if (Object.keys(newMatches).length > 0) {
        setMatchesCache(prev => ({ ...prev, ...newMatches }));
      }
    }, camp.id);

    return () => unsubscribe();
  }, [camp?.id]);

  if (!camp) {
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-6 rounded-lg">
        <p className="text-amber-800 font-medium">
          合宿を選択してください
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 bg-slate-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (courts.length === 0) {
    return (
      <div className="bg-slate-50 border-2 border-dashed border-slate-300 p-8 rounded-lg text-center">
        <p className="text-slate-600 font-medium">
          コートが初期化されていません
        </p>
        <p className="text-sm text-slate-500 mt-2">
          管理者画面で「システムを初期化」を実行してください
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
      {courts.map((court) => {
        const isOccupied = !!court.current_match_id;
        const match = isOccupied && court.current_match_id ? matchesCache[court.current_match_id] : null;

        const courtNumber = court.number || court.id.replace('court_', '');

        return (
          <div
            key={court.id}
            className={`
              relative flex flex-col items-center justify-between p-3 rounded-lg border transition-all duration-300 min-h-[180px]
              ${isOccupied
                ? "bg-sky-50 border-sky-200 shadow-sm"
                : "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-300 border-dashed hover:shadow-md hover:border-emerald-200 hover:from-emerald-50 hover:to-white"
              }
            `}
          >
            {/* ヘッダー: コート番号と種目 */}
            <div className="w-full flex justify-between items-start mb-2">
              <div className="relative group">
                <span className={`
                  relative inline-flex items-center text-sm md:text-base font-bold px-3 py-1.5 rounded-lg
                  transition-all duration-200
                  ${isOccupied
                    ? "bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-md"
                    : "bg-slate-200 text-slate-600 shadow-sm"
                  }
                `}>
                  <span className="tracking-wide">
                    コート{courtNumber}
                  </span>
                  {isOccupied && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  )}
                </span>
              </div>

              {match && (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-bold text-white bg-sky-500 px-2 py-0.5 rounded-full shadow-sm">
                    {getCategoryLabel(match.tournament_type)}
                  </span>
                  <span className="text-[10px] font-medium text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                    {getRoundLabel(match.round)}
                  </span>
                  {match.division && (
                    <span className="text-[10px] font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                      {match.division}部
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* メイン: 選手名 */}
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              {isOccupied ? (
                match ? (
                  <div className="w-full space-y-2">
                    {/* Team 1 */}
                    <div className="flex flex-col items-center bg-white p-2 rounded-lg border-2 border-sky-100 shadow-sm">
                      <span className="font-bold text-slate-800 text-sm md:text-base truncate w-full text-center">
                        {match.player1?.name || "未登録"}
                      </span>
                      {match.player3?.id && (
                        <span className="font-bold text-slate-800 text-sm md:text-base truncate w-full text-center">
                          & {match.player3?.name || "未登録"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <div className="h-[1px] bg-sky-200 w-full"></div>
                      <span className="text-[10px] font-black text-sky-400">VS</span>
                      <div className="h-[1px] bg-sky-200 w-full"></div>
                    </div>

                    {/* Team 2 */}
                    <div className="flex flex-col items-center bg-white p-2 rounded-lg border-2 border-sky-100 shadow-sm">
                      <span className="font-bold text-slate-800 text-sm md:text-base truncate w-full text-center">
                        {match.player2?.name || "未登録"}
                      </span>
                      {match.player4?.id && (
                        <span className="font-bold text-slate-800 text-sm md:text-base truncate w-full text-center">
                          & {match.player4?.name || "未登録"}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  // 読み込み中スケルトン
                  <div className="animate-pulse space-y-2 w-full px-2">
                    <div className="h-8 bg-sky-100 rounded w-full"></div>
                    <div className="h-8 bg-sky-100 rounded w-full"></div>
                    <p className="text-[10px] text-center text-slate-400">データ取得中...</p>
                  </div>
                )
              ) : (
                // 空きコート（フリータイム）
                <div className="flex flex-col items-center text-slate-400 group-hover:text-emerald-500 transition-colors">
                  <div className="relative">
                    <Clock className="w-8 h-8 mb-2" />
                    <div className="absolute inset-0 blur-md opacity-0 group-hover:opacity-30 bg-emerald-400 transition-opacity"></div>
                  </div>
                  <span className="text-xs font-medium">空きコート</span>
                  {reservedMatches[court.id] ? (
                    (() => {
                      const reservedMatch = reservedMatches[court.id];
                      const remainingMinutes = reservedMatch.available_at
                        ? Math.max(0, Math.ceil((reservedMatch.available_at.toMillis() - currentTime) / (1000 * 60)))
                        : 0;

                      return (
                        <div className="mt-2 w-full px-2">
                          <div className="bg-orange-50 border border-orange-200 rounded p-2 text-center">
                            <p className="text-[10px] font-bold text-orange-700 mb-1">予約あり</p>
                            <p className="text-[9px] text-orange-600 truncate">
                              {reservedMatch.player1?.name}
                              {reservedMatch.player3?.id && ` / ${reservedMatch.player3.name}`}
                            </p>
                            <p className="text-[9px] text-orange-600 mb-1 truncate">
                              vs {reservedMatch.player2?.name}
                              {reservedMatch.player4?.id && ` / ${reservedMatch.player4.name}`}
                            </p>
                            <div className="flex items-center justify-center gap-1 text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                              <Clock className="w-3 h-3" />
                              <span className="text-[10px] font-bold">
                                {remainingMinutes > 0 ? `あと${remainingMinutes}分` : '復帰可能'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-[10px] mt-0.5">使用可能です</span>
                  )}
                </div>
              )}
            </div>

            {/* フッター: ステータス表示 */}
            {isOccupied && match && (
              <div className="mt-3 w-full flex flex-col items-center gap-1">
                {match.status === 'playing' ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-green-100 shadow-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-600">試合中</span>
                    </div>
                    {getElapsedTime(match) && (
                      <div className="flex items-center gap-1 text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Clock className="w-3 h-3" />
                        <span className="text-[11px] font-mono font-bold tabular-nums">{getElapsedTime(match)}</span>
                      </div>
                    )}
                    {getEstimatedRemaining(match) && (
                      <div className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{getEstimatedRemaining(match)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-yellow-100 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-600">試合中</span>
                      </div>
                      {getElapsedTime(match) && (
                        <div className="flex items-center gap-1 text-orange-700 border-l border-yellow-200 pl-2">
                          <Clock className="w-3 h-3" />
                          <span className="text-[10px] font-mono font-bold tabular-nums">{getElapsedTime(match)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* 予約試合がある場合は「次に控えている」として表示 */}
                {reservedMatches[court.id] && (() => {
                  const reservedMatch = reservedMatches[court.id];
                  const remainingMinutes = reservedMatch.available_at
                    ? Math.max(0, Math.ceil((reservedMatch.available_at.toMillis() - currentTime) / (1000 * 60)))
                    : 0;

                  return (
                    <div className="mt-1 w-full px-1">
                      <div className="bg-orange-50/50 border border-orange-200 rounded px-2 py-1">
                        <p className="text-[9px] font-bold text-orange-700 mb-0.5">次に控えている:</p>
                        <p className="text-[8px] text-orange-600 truncate">
                          {reservedMatch.player1?.name}
                          {reservedMatch.player3?.id && ` / ${reservedMatch.player3.name}`}
                          {' vs '}
                          {reservedMatch.player2?.name}
                          {reservedMatch.player4?.id && ` / ${reservedMatch.player4.name}`}
                        </p>
                        <div className="flex items-center justify-center gap-1 text-orange-700 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span className="text-[8px] font-bold">
                            {remainingMinutes > 0 ? `あと${remainingMinutes}分` : '復帰可能'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}