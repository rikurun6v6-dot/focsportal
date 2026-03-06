'use client';

import { useEffect, useState, useRef } from 'react';
import {
  subscribeToCourts,
  subscribeToActiveMatches,
  subscribeToPlayers,
} from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import type { Court, Match, Player, MatchWithPlayers } from '@/types';

// ---- helpers ----------------------------------------------------------------

function buildMWP(
  match: Match,
  playersMap: Map<string, Player>
): MatchWithPlayers | null {
  const player1 = playersMap.get(match.player1_id);
  const player2 = playersMap.get(match.player2_id);
  if (!player1 || !player2) return null;
  const result: MatchWithPlayers = { ...match, player1, player2 };
  if (match.player3_id) { const p = playersMap.get(match.player3_id); if (p) result.player3 = p; }
  if (match.player4_id) { const p = playersMap.get(match.player4_id); if (p) result.player4 = p; }
  if (match.player5_id) { const p = playersMap.get(match.player5_id); if (p) result.player5 = p; }
  if (match.player6_id) { const p = playersMap.get(match.player6_id); if (p) result.player6 = p; }
  return result;
}

function getPairName(match: MatchWithPlayers, side: 1 | 2): string {
  if (side === 1) {
    const names = [match.player1.name];
    if (match.player3) names.push(match.player3.name);
    if (match.player5) names.push(match.player5.name);
    return names.join(' / ');
  } else {
    const names = [match.player2.name];
    if (match.player4) names.push(match.player4.name);
    if (match.player6) names.push(match.player6.name);
    return names.join(' / ');
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  mens_doubles: '男子D',
  womens_doubles: '女子D',
  mixed_doubles: '混合D',
  mens_singles: '男子S',
  womens_singles: '女子S',
  team_battle: '団体戦',
};

const COURTS_PER_PAGE = 6;

// ---- component --------------------------------------------------------------

export default function PreviewPage() {
  const { camp } = useCamp();
  const [courts, setCourts] = useState<Court[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playersMap, setPlayersMap] = useState<Map<string, Player>>(new Map());
  const [page, setPage] = useState(0);

  // ---- subscriptions --------------------------------------------------------
  useEffect(() => {
    if (!camp) return;
    const unsub1 = subscribeToCourts(
      (c) => setCourts(c.sort((a, b) => (a.number || 0) - (b.number || 0))),
      camp.id
    );
    const unsub2 = subscribeToActiveMatches((m) => setMatches(m), camp.id);
    const unsub3 = subscribeToPlayers((players) => {
      const map = new Map<string, Player>();
      players.forEach((p) => map.set(p.id, p));
      setPlayersMap(map);
    }, camp.id);
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [camp?.id]);

  // ---- auto-page ------------------------------------------------------------
  const totalPages = Math.ceil(courts.length / COURTS_PER_PAGE);
  useEffect(() => {
    if (totalPages <= 1) { setPage(0); return; }
    const timer = setInterval(() => {
      setPage((p) => (p + 1) % totalPages);
    }, 10000);
    return () => clearInterval(timer);
  }, [totalPages]);

  // ---- calling history (latest new caller shown briefly) --------------------
  const prevCallingRef = useRef<Set<string>>(new Set());
  const [recentCallerIds, setRecentCallerIds] = useState<string[]>([]);

  useEffect(() => {
    const nowCalling = new Set(
      matches.filter((m) => m.status === 'calling').map((m) => m.id)
    );
    const newOnes = [...nowCalling].filter((id) => !prevCallingRef.current.has(id));
    if (newOnes.length > 0) {
      setRecentCallerIds((prev) => [...newOnes, ...prev].slice(0, 8));
    }
    prevCallingRef.current = nowCalling;
  }, [matches]);

  // ---- derived data ---------------------------------------------------------
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const callingMatches = matches.filter((m) => m.status === 'calling');
  const activeCourts = courts.filter((c) => c.is_active);
  const pagedCourts =
    totalPages > 1
      ? activeCourts.slice(page * COURTS_PER_PAGE, (page + 1) * COURTS_PER_PAGE)
      : activeCourts;

  const cols = Math.min(pagedCourts.length, 3);
  const rows = Math.ceil(pagedCourts.length / cols) || 1;

  // ---- render ---------------------------------------------------------------
  if (!camp) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <p className="text-gray-500 text-xl">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white flex flex-col overflow-hidden select-none">
      {/* ── Header ── */}
      <header className="flex-shrink-0 px-5 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-3xl font-black text-yellow-400 tracking-wide">
          🏸 コート状況
        </h1>
        <div className="flex items-center gap-5">
          <span className="text-gray-400 font-medium text-lg">{camp.title}</span>
          {totalPages > 1 && (
            <div className="flex gap-1.5 items-center">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    i === page ? 'bg-yellow-400' : 'bg-gray-600 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Courts grid */}
        <div className="flex-1 p-4 overflow-hidden">
          <div
            className="h-full grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {pagedCourts.map((court) => {
              const matchRaw = court.current_match_id
                ? matchesById.get(court.current_match_id)
                : null;
              const match = matchRaw ? buildMWP(matchRaw, playersMap) : null;
              const isCalling = match?.status === 'calling';
              const isPlaying = match?.status === 'playing';

              return (
                <div
                  key={court.id}
                  className={`rounded-2xl border-2 flex flex-col overflow-hidden transition-colors ${
                    isCalling
                      ? 'border-yellow-400 bg-gray-800 shadow-[0_0_24px_rgba(250,204,21,0.25)]'
                      : isPlaying
                      ? 'border-green-500 bg-gray-800'
                      : match
                      ? 'border-blue-600 bg-gray-800'
                      : 'border-gray-700 bg-gray-900'
                  }`}
                >
                  {/* Court header */}
                  <div
                    className={`px-4 py-2 flex items-center justify-between flex-shrink-0 ${
                      isCalling
                        ? 'bg-yellow-400 text-black'
                        : isPlaying
                        ? 'bg-green-800 text-white'
                        : match
                        ? 'bg-blue-900 text-white'
                        : 'bg-gray-800 text-gray-500'
                    }`}
                  >
                    <span className="text-3xl font-black">{court.number}コート</span>
                    <div className="flex items-center gap-2">
                      {match && (
                        <span className="text-sm font-bold opacity-75">
                          {CATEGORY_LABEL[match.tournament_type] || match.tournament_type}
                          {match.division ? ` ${match.division}部` : ''}
                        </span>
                      )}
                      {isCalling && (
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black opacity-60" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-black" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Match content */}
                  <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-2 min-h-0 overflow-hidden">
                    {match ? (
                      <>
                        <p className="text-2xl font-black text-white text-center leading-tight break-all w-full">
                          {getPairName(match, 1)}
                        </p>
                        <span
                          className={`text-xl font-black ${
                            isCalling ? 'text-yellow-400' : 'text-gray-500'
                          }`}
                        >
                          VS
                        </span>
                        <p className="text-2xl font-black text-white text-center leading-tight break-all w-full">
                          {getPairName(match, 2)}
                        </p>

                        {isCalling && (
                          <div className="mt-1 px-4 py-1.5 bg-yellow-400 text-black text-sm font-black rounded-full animate-pulse">
                            📢 呼び出し中
                          </div>
                        )}
                        {isPlaying && (
                          <div className="mt-1 px-4 py-1.5 bg-green-500 text-white text-sm font-black rounded-full">
                            ▶ 試合中
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-600 text-2xl font-bold">— 空きコート —</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Calling notification panel ── */}
        <aside className="w-56 flex-shrink-0 bg-gray-950 border-l border-gray-800 flex flex-col overflow-hidden">
          <div className="bg-yellow-400 px-4 py-2.5 flex-shrink-0">
            <h2 className="text-base font-black text-black">📢 呼び出し中</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {callingMatches.length === 0 ? (
              <p className="text-gray-600 text-sm text-center pt-8">現在呼び出しなし</p>
            ) : (
              callingMatches.map((m) => {
                const mwp = buildMWP(m, playersMap);
                if (!mwp) return null;
                const courtNum = activeCourts.find(
                  (c) => c.current_match_id === m.id
                )?.number;
                const isNew = recentCallerIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl p-3 ${
                      isNew
                        ? 'bg-yellow-400 text-black animate-pulse'
                        : 'bg-yellow-500 text-black'
                    }`}
                  >
                    <div className="text-xs font-black text-yellow-900 mb-1">
                      {courtNum}コート
                    </div>
                    <div className="font-black text-sm leading-snug break-all">
                      {getPairName(mwp, 1)}
                    </div>
                    <div className="text-center text-yellow-900 font-black text-xs my-0.5">
                      VS
                    </div>
                    <div className="font-black text-sm leading-snug break-all">
                      {getPairName(mwp, 2)}
                    </div>
                    <div className="mt-1.5 text-center">
                      <span className="text-[10px] font-black bg-black/20 rounded-full px-2 py-0.5">
                        {CATEGORY_LABEL[m.tournament_type] || m.tournament_type}
                        {m.division ? ` ${m.division}部` : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: page indicator */}
          {totalPages > 1 && (
            <div className="flex-shrink-0 px-3 py-2 border-t border-gray-800 text-center">
              <p className="text-gray-600 text-xs">
                {page + 1} / {totalPages} ページ
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
