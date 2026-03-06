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

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Side 1 = player1 / player3 / player5
 * Side 2 = player2 / player4 / player6
 * （player3 は player1 のダブルスパートナー、player5 は3人目）
 */
function getSideNames(m: MatchWithPlayers, side: 1 | 2): string[] {
  if (side === 1) {
    return [m.player1.name, m.player3?.name, m.player5?.name].filter(Boolean) as string[];
  }
  return [m.player2.name, m.player4?.name, m.player6?.name].filter(Boolean) as string[];
}

function getPairLine(m: MatchWithPlayers, side: 1 | 2): string {
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

// ─── PlayerBox ───────────────────────────────────────────────────────────────
// ResultsTab の選手ボックス（bg-white p-2 rounded border-slate-200）を
// iPad 用に 2〜3 倍スケールアップ。3人ペアは 2 行表示。

function PlayerBox({
  names,
  highlight,
}: {
  names: string[];
  highlight: boolean; // calling時に黄色背景
}) {
  const border = highlight ? 'border-yellow-300 bg-yellow-50' : 'border-slate-200 bg-white';
  if (names.length >= 3) {
    // 3人: 1行目=筆頭, 2行目=partner / 3rd
    return (
      <div className={`rounded-lg border px-4 py-3 shadow-sm ${border}`}>
        <p className="font-black text-slate-800 text-center text-2xl leading-tight tracking-tight">
          {names[0]}
        </p>
        <p className="font-bold text-slate-700 text-center text-xl leading-tight mt-0.5">
          {names.slice(1).join(' / ')}
        </p>
      </div>
    );
  }
  return (
    <div className={`rounded-lg border px-4 py-3 shadow-sm ${border}`}>
      <p className="font-black text-slate-800 text-center text-2xl leading-tight tracking-tight">
        {names.join(' / ')}
      </p>
    </div>
  );
}

// ─── Overlay data ─────────────────────────────────────────────────────────────
type OverlayData = {
  side1: string;
  side2: string;
  courtNum: number | string;
};

// ─── PreviewContent ───────────────────────────────────────────────────────────

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

  // ── camp name ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campId) return;
    getDocument<Camp>('camps', campId).then((c) => { if (c) setCampName(c.title); });
  }, [campId]);

  // ── Firestore subscriptions ───────────────────────────────────────────────
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

  // ── calling overlay ───────────────────────────────────────────────────────
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
      const match = byId.get(newIds[0]);
      if (match) {
        const mwp = buildMWP(match, playersMap);
        if (mwp) {
          const courtNum = courts.find((c) => c.current_match_id === newIds[0])?.number ?? '?';
          showOverlay({ side1: getPairLine(mwp, 1), side2: getPairLine(mwp, 2), courtNum });
        }
      }
    }
    prevCallingRef.current = nowCalling;
  }, [matches, playersMap, courts, showOverlay]);

  useEffect(() => () => { if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current); }, []);

  // ── auto-scroll ───────────────────────────────────────────────────────────
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

  // ── derived ───────────────────────────────────────────────────────────────
  const activeCourts = courts.filter((c) => c.is_active);
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const callingMatches = matches.filter((m) => m.status === 'calling');

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-slate-100 flex flex-col overflow-hidden select-none">
      {/* CSS animations */}
      <style>{`
        @keyframes callingGlow {
          0%,100% { border-left-color: #FACC15; }
          50%      { border-left-color: #CA8A04; box-shadow: -6px 0 18px rgba(250,204,21,.5), 0 4px 16px rgba(0,0,0,.08); }
        }
        .calling-card { animation: callingGlow 1.1s ease-in-out infinite; }
        @keyframes overlayIn {
          from { opacity:0; transform:scale(.86); }
          to   { opacity:1; transform:scale(1); }
        }
        .overlay-card { animation: overlayIn .38s cubic-bezier(.34,1.56,.64,1) both; }
        @keyframes backdropIn { from{opacity:0} to{opacity:1} }
        .overlay-backdrop { animation: backdropIn .22s ease-out both; }
      `}</style>

      {/* ── Header (ResultsTab の見出し行に合わせた白いバー) ── */}
      <header className="flex-shrink-0 bg-white shadow-sm px-6 py-3 flex items-center justify-between border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 leading-none">コート別状況</h1>
          {campName && <p className="text-sm text-slate-500 mt-0.5">{campName}</p>}
        </div>
        {/* ライブインジケーター */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-xs text-slate-400 font-medium">リアルタイム</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Auto-scroll court grid ── */}
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
              const names1 = match ? getSideNames(match, 1) : [];
              const names2 = match ? getSideNames(match, 2) : [];

              return (
                <div
                  key={court.id}
                  className={`
                    bg-white rounded-lg shadow-md overflow-hidden
                    border-l-[6px] transition-colors
                    ${isCalling
                      ? 'border-l-yellow-400 calling-card'
                      : isPlaying
                      ? 'border-l-green-500'
                      : match
                      ? 'border-l-sky-400'
                      : 'border-l-slate-200'}
                  `}
                >
                  {/* ─ CardHeader (ResultsTab と同じグラデーション) ─ */}
                  <div
                    className={`px-5 py-3 flex items-center justify-between ${
                      isCalling
                        ? 'bg-gradient-to-r from-yellow-50 to-amber-50'
                        : isPlaying
                        ? 'bg-gradient-to-r from-green-50 to-emerald-50'
                        : match
                        ? 'bg-gradient-to-r from-sky-50 to-blue-50'
                        : 'bg-slate-50'
                    }`}
                  >
                    {/* コート番号 */}
                    <span
                      className={`text-4xl font-black leading-none ${
                        isCalling
                          ? 'text-yellow-700'
                          : isPlaying
                          ? 'text-green-700'
                          : match
                          ? 'text-sky-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {court.number}コート
                    </span>

                    {/* 種目 / 部門バッジ */}
                    {match && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-bold text-white bg-sky-500 px-2.5 py-0.5 rounded-full">
                          {CAT[match.tournament_type] ?? match.tournament_type}
                        </span>
                        {match.division && (
                          <span className="text-sm font-medium text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full">
                            {match.division}部
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ─ CardContent ─ */}
                  <div className="px-4 py-4 space-y-3">
                    {match ? (
                      <>
                        {/* Side 1: player1 / player3 / player5 */}
                        <PlayerBox names={names1} highlight={isCalling} />

                        {/* VS */}
                        <div className="flex items-center justify-center">
                          <span className="text-lg font-black text-slate-400">VS</span>
                        </div>

                        {/* Side 2: player2 / player4 / player6 */}
                        <PlayerBox names={names2} highlight={isCalling} />

                        {/* ステータス (ResultsTab と同じ pinging dot スタイル) */}
                        {isCalling && (
                          <div className="flex items-center justify-center gap-2 text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg mt-1">
                            <span className="relative flex h-3.5 w-3.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-yellow-500" />
                            </span>
                            <span className="text-xl font-black">呼び出し中</span>
                          </div>
                        )}
                        {isPlaying && (
                          <div className="flex items-center justify-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg mt-1">
                            <span className="text-xl font-bold">▶ 試合中</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-slate-300 text-2xl font-bold">空きコート</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Calling sidebar ── */}
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
                  <div key={m.id} className="bg-yellow-300 rounded-xl p-3 shadow-sm border border-yellow-400">
                    <p className="text-xs font-black text-yellow-900 mb-1.5">{courtNum}コート</p>
                    <p className="font-black text-sm text-yellow-900 leading-snug break-words">
                      {getPairLine(mwp, 1)}
                    </p>
                    <p className="text-center text-yellow-800 text-xs font-bold my-0.5">VS</p>
                    <p className="font-black text-sm text-yellow-900 leading-snug break-words">
                      {getPairLine(mwp, 2)}
                    </p>
                    <div className="mt-2">
                      <span className="text-[10px] font-bold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-full">
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

      {/* ── Calling overlay ── */}
      {currentOverlay && (
        <div
          className="overlay-backdrop fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'rgba(0,0,0,.70)' }}
          onClick={() => {
            if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
            setCurrentOverlay(null);
          }}
        >
          <div className="overlay-card bg-white rounded-2xl shadow-2xl px-10 py-9 mx-6 max-w-lg w-full text-center">
            <p className="text-5xl mb-5">📢</p>

            {/* 選手名 (bg-white p-2 rounded border-slate-200 を拡大) */}
            <div className="space-y-3 mb-6">
              <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-3xl font-black text-slate-800 leading-tight break-words">
                  {currentOverlay.side1}
                </p>
              </div>
              <p className="text-xl font-black text-slate-400">VS</p>
              <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 shadow-sm">
                <p className="text-3xl font-black text-slate-800 leading-tight break-words">
                  {currentOverlay.side2}
                </p>
              </div>
            </div>

            {/* コール文 */}
            <div className="rounded-xl px-6 py-4 inline-block" style={{ backgroundColor: '#FFEB3B' }}>
              <p className="text-2xl font-black text-yellow-900 leading-snug">
                {currentOverlay.courtNum}コートへ
                <br />
                お越しください！
              </p>
            </div>

            <p className="text-sm text-slate-400 mt-5">（タップで閉じる）</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── page export ──────────────────────────────────────────────────────────────

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-slate-100 flex items-center justify-center">
          <p className="text-slate-400 text-2xl font-bold">読み込み中…</p>
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
