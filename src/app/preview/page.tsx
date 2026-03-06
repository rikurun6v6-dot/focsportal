'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  subscribeToCourts,
  subscribeToActiveMatches,
  subscribeToPlayers,
  getDocument,
} from '@/lib/firestore-helpers';
import type { Court, Match, Player, MatchWithPlayers, Camp } from '@/types';
import { Clock } from 'lucide-react';

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

// Side1: player1 / player3 / player5  Side2: player2 / player4 / player6
function sideName(m: MatchWithPlayers, side: 1 | 2): string {
  if (side === 1)
    return [m.player1.name, m.player3?.name, m.player5?.name].filter(Boolean).join(' / ');
  return [m.player2.name, m.player4?.name, m.player6?.name].filter(Boolean).join(' / ');
}

const CAT: Record<string, string> = {
  mens_doubles: '男子D', womens_doubles: '女子D', mixed_doubles: '混合D',
  mens_singles: '男子S', womens_singles: '女子S', team_battle: '団体戦',
};

// ─── main content ─────────────────────────────────────────────────────────────

function PreviewContent() {
  const searchParams = useSearchParams();
  const campId = searchParams.get('campId') ?? '';

  const [campName, setCampName] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [playersMap, setPlayersMap] = useState<Map<string, Player>>(new Map());
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [clockStr, setClockStr] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPausedRef = useRef(false);

  // ── clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(now.getTime());
      setClockStr(now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const t = setInterval(update, 10000);
    return () => clearInterval(t);
  }, []);

  // ── camp name ─────────────────────────────────────────────────────────────
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

  const getElapsedTime = (match: MatchWithPlayers) => {
    const startTime = match.start_time || match.updated_at;
    if (!startTime) return null;
    const elapsed = Math.floor((currentTime - startTime.toMillis()) / 1000);
    if (elapsed < 0) return null;
    return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const activeCourts = courts.filter((c) => c.is_active);
  const matchesById = new Map(matches.map((m) => [m.id, m]));

  // 開催中の種目（waiting/calling/playing の試合に含まれる tournament_type を重複なし・表示順で）
  const activeCategories = [...new Set(matches.map((m) => m.tournament_type))].filter(Boolean);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-white overflow-y-auto"
      onMouseEnter={() => { scrollPausedRef.current = true; }}
      onMouseLeave={() => { scrollPausedRef.current = false; }}
      onTouchStart={() => { scrollPausedRef.current = true; }}
      onTouchEnd={() => { setTimeout(() => { scrollPausedRef.current = false; }, 3000); }}
    >
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-4">
        {/* 左: 時刻 + 種目 */}
        <div>
          <p className="text-7xl font-black text-slate-800 tabular-nums leading-none">{clockStr}</p>
          {activeCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {activeCategories.map((type) => (
                <span key={type} className="text-base font-bold text-white bg-sky-500 px-3 py-1 rounded-full">
                  {CAT[type] ?? type}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* 右: タイトル + 合宿名 */}
        <div className="text-right">
          <h2 className="text-3xl font-bold text-slate-800">コート別状況</h2>
          {campName && <p className="text-base text-slate-600 mt-1">{campName}</p>}
        </div>
      </div>

      {/* ── Court grid (ResultsTab と同一構造) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 p-4">
        {activeCourts.map((court) => {
          const courtNumber = court.number || court.id.replace('court_', '');
          const matchRaw = court.current_match_id ? matchesById.get(court.current_match_id) : null;
          const match = matchRaw ? buildMWP(matchRaw, playersMap) : null;
          const isOccupied = !!match;
          const isCalling = match?.status === 'calling';
          const isPlaying = match?.status === 'playing';

          return (
            <Card
              key={court.id}
              className={`relative ${isOccupied ? 'border-sky-300 shadow-lg' : 'border-slate-200'}`}
            >
              <CardHeader
                className={`pb-2 ${isOccupied ? 'bg-gradient-to-r from-sky-50 to-blue-50' : 'bg-slate-50'}`}
              >
                <CardTitle className="flex items-center justify-between">
                  <span className={`text-4xl font-black ${isOccupied ? 'text-sky-600' : 'text-slate-400'}`}>
                    {courtNumber}コート
                  </span>
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
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-3">
                {isOccupied && match ? (
                  <div className="space-y-3">
                    {/* 選手表示 */}
                    <div className="space-y-2">
                      <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="font-black text-slate-800 text-center text-2xl leading-snug">
                          {sideName(match, 1) || '未登録'}
                        </p>
                      </div>
                      <div className="flex items-center justify-center">
                        <span className="text-base font-black text-slate-400">VS</span>
                      </div>
                      <div className="bg-white p-3 rounded border border-slate-200">
                        <p className="font-black text-slate-800 text-center text-2xl leading-snug">
                          {sideName(match, 2) || '未登録'}
                        </p>
                      </div>
                    </div>

                    {/* calling → 呼び出し中（黄色 pinging dot） */}
                    {isCalling && (
                      <div className="flex items-center justify-center gap-2 text-yellow-600 bg-yellow-50 px-3 py-2 rounded text-base">
                        <span className="relative flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-yellow-500" />
                        </span>
                        <span className="font-bold">呼び出し中</span>
                        {getElapsedTime(match) && (
                          <>
                            <Clock className="w-4 h-4 ml-1" />
                            <span className="font-mono">{getElapsedTime(match)}</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* playing → 試合中（緑） */}
                    {isPlaying && (
                      <div className="flex items-center justify-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded text-base">
                        <Clock className="w-5 h-5" />
                        <span className="font-bold">試合中</span>
                        {getElapsedTime(match) && (
                          <span className="font-mono font-bold">{getElapsedTime(match)}</span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6">
                    <span className="text-sm font-medium text-slate-400">空きコート</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── page export ──────────────────────────────────────────────────────────────

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <p className="text-slate-400 text-lg">読み込み中…</p>
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
