'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  subscribeToCourts,
  subscribeToActiveMatches,
  subscribeToPlayers,
  getDocument,
} from '@/lib/firestore-helpers';
import type { Court, Match, Player, MatchWithPlayers, Camp } from '@/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function buildMWP(match: Match, pm: Map<string, Player>): MatchWithPlayers | null {
  const p1 = pm.get(match.player1_id);
  const p2 = pm.get(match.player2_id);
  if (!p1 || !p2) return null;
  const r: MatchWithPlayers = { ...match, player1: p1, player2: p2 };
  if (match.player3_id) { const p = pm.get(match.player3_id); if (p) r.player3 = p; }
  if (match.player4_id) { const p = pm.get(match.player4_id); if (p) r.player4 = p; }
  if (match.player5_id) { const p = pm.get(match.player5_id); if (p) r.player5 = p; }
  if (match.player6_id) { const p = pm.get(match.player6_id); if (p) r.player6 = p; }
  return r;
}

function getSideNames(m: MatchWithPlayers, side: 1 | 2): string[] {
  if (side === 1) {
    const n = [m.player1.name];
    if (m.player3) n.push(m.player3.name);
    if (m.player5) n.push(m.player5.name);
    return n;
  }
  const n = [m.player2.name];
  if (m.player4) n.push(m.player4.name);
  if (m.player6) n.push(m.player6.name);
  return n;
}

function getPairName(m: MatchWithPlayers, side: 1 | 2) {
  return getSideNames(m, side).join(' / ');
}

const CAT: Record<string, string> = {
  mens_doubles: '男子D',
  womens_doubles: '女子D',
  mixed_doubles: '混合D',
  mens_singles: '男子S',
  womens_singles: '女子S',
  team_battle: '団体戦',
};

// ─── sub-components ─────────────────────────────────────────────────────────

/** 選手名表示（3人ペア対応・2行レイアウト） */
function PlayerBox({
  names,
  status,
}: {
  names: string[];
  status: 'calling' | 'playing' | 'other';
}) {
  const bg =
    status === 'calling'
      ? 'bg-yellow-100'
      : status === 'playing'
      ? 'bg-sky-50'
      : 'bg-gray-50';

  // 3人の場合: 1行目=筆頭, 2行目=残り
  if (names.length >= 3) {
    return (
      <div className={`rounded-xl px-4 py-3 ${bg}`}>
        <p className="text-2xl font-black text-gray-900 text-center leading-tight tracking-tight">
          {names[0]}
        </p>
        <p className="text-xl font-bold text-gray-700 text-center leading-tight tracking-tight mt-0.5">
          {names.slice(1).join(' / ')}
        </p>
      </div>
    );
  }
  return (
    <div className={`rounded-xl px-4 py-3 ${bg}`}>
      <p className="text-2xl font-black text-gray-900 text-center leading-tight tracking-tight">
        {names.join(' / ')}
      </p>
    </div>
  );
}

type OverlayData = {
  players1: string;
  players2: string;
  courtNum: number | string;
};

// ─── main content ───────────────────────────────────────────────────────────

function PreviewContent() {
  const searchParams = useSearchParams();
  const campId = searchParams.get('campId') ?? '';

  const [campName, setCampName] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playersMap, setPlayersMap] = useState<Map<string, Player>>(new Map());
  const [currentOverlay, setCurrentOverlay] = useState<OverlayData | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPausedRef = useRef(false);
  const prevCallingRef = useRef<Set<string>>(new Set());
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── camp name ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campId) return;
    getDocument<Camp>('camps', campId).then((c) => { if (c) setCampName(c.title); });
  }, [campId]);

  // ── subscriptions ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campId) return;
    const u1 = subscribeToCourts(
      (c) => setCourts(c.sort((a, b) => (a.number || 0) - (b.number || 0))),
      campId,
    );
    const u2 = subscribeToActiveMatches((m) => setMatches(m), campId);
    const u3 = subscribeToPlayers((players) => {
      const map = new Map<string, Player>();
      players.forEach((p) => map.set(p.id, p));
      setPlayersMap(map);
    }, campId);
    return () => { u1(); u2(); u3(); };
  }, [campId]);

  // ── calling overlay ────────────────────────────────────────────────────────
  const showOverlay = useCallback((data: OverlayData) => {
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    setCurrentOverlay(data);
    overlayTimerRef.current = setTimeout(() => {
      setCurrentOverlay(null);
      overlayTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    const nowCalling = new Set(
      matches.filter((m) => m.status === 'calling').map((m) => m.id),
    );
    const newIds = [...nowCalling].filter((id) => !prevCallingRef.current.has(id));

    if (newIds.length > 0) {
      const byId = new Map(matches.map((m) => [m.id, m]));
      const id = newIds[0];
      const match = byId.get(id);
      if (match) {
        const mwp = buildMWP(match, playersMap);
        if (mwp) {
          const courtNum = courts.find((c) => c.current_match_id === id)?.number ?? '?';
          showOverlay({ players1: getPairName(mwp, 1), players2: getPairName(mwp, 2), courtNum });
        }
      }
    }
    prevCallingRef.current = nowCalling;
  }, [matches, playersMap, courts, showOverlay]);

  // cleanup overlay timer on unmount
  useEffect(() => () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); }, []);

  // ── auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const timer = setInterval(() => {
      if (scrollPausedRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 4) return;
      if (scrollTop + clientHeight >= scrollHeight - 4) {
        scrollPausedRef.current = true;
        setTimeout(() => {
          el.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => { scrollPausedRef.current = false; }, 1500);
        }, 2500);
      } else {
        el.scrollTop += 1;
      }
    }, 30);
    return () => clearInterval(timer);
  }, []);

  // ── derived ────────────────────────────────────────────────────────────────
  const activeCourts = courts.filter((c) => c.is_active);
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const callingMatches = matches.filter((m) => m.status === 'calling');

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden select-none">
      {/* ─── keyframe animations ─── */}
      <style>{`
        @keyframes callingBorder {
          0%,100% { box-shadow: 0 0 0 3px #FACC15, 0 4px 20px rgba(250,204,21,.35); }
          50%      { box-shadow: 0 0 0 6px #FDE047, 0 4px 32px rgba(250,204,21,.6); }
        }
        .calling-card { animation: callingBorder 1.2s ease-in-out infinite; }
        @keyframes overlayIn {
          from { opacity:0; transform:scale(.88); }
          to   { opacity:1; transform:scale(1); }
        }
        .overlay-card { animation: overlayIn .38s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes backdropIn { from{opacity:0} to{opacity:1} }
        .overlay-backdrop { animation: backdropIn .22s ease-out both; }
      `}</style>

      {/* ─── Header ─── */}
      <header className="flex-shrink-0 bg-white shadow-md px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
            <span className="text-white text-2xl leading-none">🏸</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 leading-none tracking-tight">
              コート状況
            </h1>
            {campName && <p className="text-sm text-gray-500 mt-0.5 font-medium">{campName}</p>}
          </div>
        </div>
        {/* ライブインジケーター */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs text-gray-400 font-medium">リアルタイム</span>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── Courts scroll area ─── */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4"
          onMouseEnter={() => { scrollPausedRef.current = true; }}
          onMouseLeave={() => { scrollPausedRef.current = false; }}
          onTouchStart={() => { scrollPausedRef.current = true; }}
          onTouchEnd={() => { setTimeout(() => { scrollPausedRef.current = false; }, 3000); }}
        >
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
            {activeCourts.map((court) => {
              const matchRaw = court.current_match_id
                ? matchesById.get(court.current_match_id)
                : null;
              const match = matchRaw ? buildMWP(matchRaw, playersMap) : null;
              const isCalling = match?.status === 'calling';
              const isPlaying = match?.status === 'playing';
              const sideStatus = isCalling ? 'calling' : isPlaying ? 'playing' : 'other';
              const names1 = match ? getSideNames(match, 1) : [];
              const names2 = match ? getSideNames(match, 2) : [];

              return (
                <div
                  key={court.id}
                  className={`rounded-2xl overflow-hidden bg-white border-2 transition-colors ${
                    isCalling
                      ? 'border-yellow-400 calling-card'
                      : isPlaying
                      ? 'border-sky-300 shadow-md shadow-sky-100'
                      : match
                      ? 'border-gray-200 shadow-md'
                      : 'border-gray-100 shadow-sm'
                  }`}
                >
                  {/* ─ Card header ─ */}
                  <div
                    className={`px-4 py-2.5 flex items-center justify-between ${
                      isCalling
                        ? 'bg-yellow-400'
                        : isPlaying
                        ? 'bg-sky-500'
                        : match
                        ? 'bg-blue-600'
                        : 'bg-gray-50 border-b border-gray-100'
                    }`}
                  >
                    {/* コート番号バッジ */}
                    <span
                      className={`text-3xl font-black tracking-tight ${
                        isCalling ? 'text-yellow-900' : match ? 'text-white' : 'text-gray-400'
                      }`}
                    >
                      {court.number}コート
                    </span>

                    <div className="flex flex-col items-end gap-1">
                      {match && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            isCalling
                              ? 'bg-yellow-200 text-yellow-900'
                              : 'bg-white/25 text-white'
                          }`}
                        >
                          {CAT[match.tournament_type] ?? match.tournament_type}
                          {match.division ? ` ${match.division}部` : ''}
                        </span>
                      )}
                      {isCalling && (
                        <span className="text-[11px] font-black text-yellow-900 bg-yellow-200 px-2 py-0.5 rounded-full animate-pulse">
                          📢 呼び出し中
                        </span>
                      )}
                      {isPlaying && (
                        <span className="text-[11px] font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                          ▶ 試合中
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ─ Card body ─ */}
                  <div className="px-4 py-4 flex flex-col gap-2">
                    {match ? (
                      <>
                        <PlayerBox names={names1} status={sideStatus} />
                        <div className="flex items-center justify-center">
                          <span
                            className={`text-xl font-black ${
                              isCalling ? 'text-yellow-500' : 'text-gray-300'
                            }`}
                          >
                            VS
                          </span>
                        </div>
                        <PlayerBox names={names2} status={sideStatus} />
                      </>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-gray-300 text-2xl font-bold">空きコート</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Calling sidebar ─── */}
        <aside className="w-56 flex-shrink-0 bg-amber-50 border-l border-amber-200 flex flex-col overflow-hidden">
          <div className="bg-amber-400 px-4 py-3 flex-shrink-0">
            <h2 className="text-base font-black text-amber-900">📢 呼び出し中</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {callingMatches.length === 0 ? (
              <p className="text-amber-300 text-sm text-center pt-10">現在呼び出しなし</p>
            ) : (
              callingMatches.map((m) => {
                const mwp = buildMWP(m, playersMap);
                if (!mwp) return null;
                const courtNum = activeCourts.find((c) => c.current_match_id === m.id)?.number;
                return (
                  <div key={m.id} className="bg-yellow-400 rounded-xl p-3 shadow-sm">
                    <p className="text-xs font-black text-yellow-900 mb-1.5">
                      {courtNum}コート
                    </p>
                    <p className="font-black text-sm text-yellow-900 leading-snug break-words">
                      {getPairName(mwp, 1)}
                    </p>
                    <p className="text-center text-yellow-800 text-xs font-bold my-0.5">VS</p>
                    <p className="font-black text-sm text-yellow-900 leading-snug break-words">
                      {getPairName(mwp, 2)}
                    </p>
                    <div className="mt-2">
                      <span className="text-[10px] font-bold text-yellow-800 bg-yellow-200 px-2 py-0.5 rounded-full">
                        {CAT[m.tournament_type] ?? m.tournament_type}
                        {m.division ? ` ${m.division}部` : ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* ─── Calling overlay ─── */}
      {currentOverlay && (
        <div
          className="overlay-backdrop fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'rgba(0,0,0,.68)' }}
          onClick={() => {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            setCurrentOverlay(null);
          }}
        >
          <div className="overlay-card bg-white rounded-3xl shadow-2xl px-10 py-9 mx-6 max-w-lg w-full text-center">
            <p className="text-5xl mb-5">📢</p>

            {/* 選手名 */}
            <div className="mb-6">
              <p className="text-4xl font-black text-gray-900 leading-tight break-words">
                {currentOverlay.players1}
              </p>
              <p className="text-xl font-black text-gray-300 my-1">VS</p>
              <p className="text-4xl font-black text-gray-900 leading-tight break-words">
                {currentOverlay.players2}
              </p>
            </div>

            {/* コール文 */}
            <div
              className="rounded-2xl px-6 py-4 inline-block"
              style={{ backgroundColor: '#FFEB3B' }}
            >
              <p className="text-2xl font-black text-yellow-900 leading-snug">
                {currentOverlay.courtNum}コートへ
                <br />
                お越しください！
              </p>
            </div>

            <p className="text-sm text-gray-400 mt-5">（タップで閉じる）</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── page export ────────────────────────────────────────────────────────────

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-gray-100 flex items-center justify-center">
          <p className="text-gray-400 text-2xl font-bold">読み込み中…</p>
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
