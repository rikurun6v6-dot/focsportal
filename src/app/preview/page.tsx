'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  subscribeToCourts,
  subscribeToActiveMatches,
  subscribeToPlayers,
  getDocument,
} from '@/lib/firestore-helpers';
import type { Court, Match, Player, MatchWithPlayers, Camp } from '@/types';
import { Clock, Sparkles } from 'lucide-react';
import { calculateTournamentETA } from '@/lib/eta';
import type { TournamentETAByType } from '@/lib/eta';

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

function sideName(m: MatchWithPlayers, side: 1 | 2): string {
  if (side === 1)
    return [m.player1.name, m.player3?.name, m.player5?.name].filter(Boolean).join(' / ');
  return [m.player2.name, m.player4?.name, m.player6?.name].filter(Boolean).join(' / ');
}

const CAT: Record<string, string> = {
  mens_doubles: '男子D', womens_doubles: '女子D', mixed_doubles: '混合D',
  mens_singles: '男子S', womens_singles: '女子S', team_battle: '団体戦',
};

const COURTS_PER_PAGE = 3;
const PAGE_INTERVAL_MS = 8000; // 8秒ごとに切り替え

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
  const [page, setPage] = useState(0);
  const [estimatedEndTime, setEstimatedEndTime] = useState<Date | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);
  const [etaByType, setEtaByType] = useState<TournamentETAByType[]>([]);

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

  // ── auto-page ────────────────────────────────────────────────────────────
  const activeCourts = courts.filter((c) => c.is_active);
  const totalPages = Math.max(1, Math.ceil(activeCourts.length / COURTS_PER_PAGE));

  useEffect(() => {
    // ページ数が変わったとき範囲外になっていたらリセット
    setPage((p) => (p >= totalPages ? 0 : p));
  }, [totalPages]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % totalPages), PAGE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [totalPages]);

  // ── ETA ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!campId) return;
    const fetchETA = async () => {
      const eta = await calculateTournamentETA(campId);
      setEstimatedEndTime(eta.estimatedEndTime);
      setEstimatedMinutes(eta.estimatedMinutesRemaining);
      setEtaByType(eta.byType);
    };
    fetchETA();
    const t = setInterval(fetchETA, 30000);
    return () => clearInterval(t);
  }, [campId]);

  // ── elapsed time ──────────────────────────────────────────────────────────
  const getElapsedTime = (match: MatchWithPlayers) => {
    const startTime = match.start_time || match.updated_at;
    if (!startTime) return null;
    const elapsed = Math.floor((currentTime - startTime.toMillis()) / 1000);
    if (elapsed < 0) return null;
    return `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const matchesById = new Map(matches.map((m) => [m.id, m]));
  const activeCategories = [...new Set(matches.map((m) => m.tournament_type))].filter(Boolean);
  const pagedCourts = activeCourts.slice(page * COURTS_PER_PAGE, (page + 1) * COURTS_PER_PAGE);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] bg-white flex flex-col overflow-hidden p-2">
      <style>{`
        @keyframes shrinkBar {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-start justify-between gap-4 border-b border-slate-100">
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

        {/* 右: タイトル + 合宿名 + ページドット */}
        <div className="text-right flex flex-col items-end gap-2">
          <div>
            <h2 className="text-3xl font-bold text-slate-800">コート別状況</h2>
            {campName && <p className="text-base text-slate-600 mt-1">{campName}</p>}
          </div>
          {/* ページインジケーター */}
          {totalPages > 1 && (
            <div className="flex gap-2 items-center">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`rounded-full transition-all ${
                    i === page
                      ? 'w-6 h-3 bg-sky-500'
                      : 'w-3 h-3 bg-slate-200 hover:bg-slate-300'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 h-2 bg-slate-100 overflow-hidden">
          <div
            key={page}
            className="h-full rounded-r-full origin-left"
            style={{
              background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 50%, #f472b6 100%)',
              boxShadow: '0 0 8px rgba(129, 140, 248, 0.6)',
              animation: `shrinkBar ${PAGE_INTERVAL_MS}ms linear forwards`,
            }}
          />
        </div>
      )}

      {/* ── Court grid ── */}
      <div className="flex-1 grid grid-cols-3 gap-5 p-4 min-h-0">
        {pagedCourts.map((court) => {
          const courtNumber = court.number || court.id.replace('court_', '');
          const matchRaw = court.current_match_id ? matchesById.get(court.current_match_id) : null;
          const match = matchRaw ? buildMWP(matchRaw, playersMap) : null;
          const isOccupied = !!match;
          const isCalling = match?.status === 'calling';
          const isPlaying = match?.status === 'playing';

          return (
            <Card
              key={court.id}
              className={`flex flex-col overflow-hidden ${
                isOccupied ? 'border-sky-300 shadow-lg' : 'border-slate-200'
              }`}
            >
              <CardHeader
                className={`flex-shrink-0 pb-2 ${
                  isOccupied ? 'bg-gradient-to-r from-sky-50 to-blue-50' : 'bg-slate-50'
                }`}
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

              <CardContent className="flex-1 flex flex-col justify-center pt-3 pb-4">
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

                    {/* calling */}
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

                    {/* playing */}
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
                  <div className="flex items-center justify-center h-full">
                    <span className="text-sm font-medium text-slate-400">空きコート</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── ETA bar ── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-purple-50 via-blue-50 to-purple-50 border-t border-purple-100 px-4 py-2 flex items-center gap-4">
        {/* 全体予想 */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-xs text-slate-400 leading-none mb-0.5">AI予想終了（全体）</div>
            {estimatedEndTime ? (
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-xl font-black text-purple-700 tabular-nums">
                  {estimatedEndTime.getHours().toString().padStart(2, '0')}:{estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                </span>
                <span className="text-xs font-medium text-slate-500">残り{estimatedMinutes}分</span>
              </div>
            ) : (
              <div className="text-sm font-bold text-slate-400 leading-none">全試合終了</div>
            )}
          </div>
        </div>

        {/* セパレーター */}
        <div className="w-px h-9 bg-purple-200 flex-shrink-0" />

        {/* 種目別 */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {etaByType.map((t) => (
            <div
              key={t.tournamentType}
              className="bg-white/80 border border-purple-100 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-sm"
            >
              <span className="text-sm font-bold text-slate-700">{t.label}</span>
              {t.estimatedEndTime ? (
                <>
                  <span className="text-base font-black text-purple-600 tabular-nums">
                    {t.estimatedEndTime.getHours().toString().padStart(2, '0')}:{t.estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                  </span>
                  <span className="text-xs text-slate-400">残{t.estimatedMinutesRemaining}分</span>
                </>
              ) : (
                <span className="text-xs text-slate-400">終了</span>
              )}
            </div>
          ))}
          {etaByType.length === 0 && (
            <span className="text-xs text-slate-400">計算中...</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── page export ──────────────────────────────────────────────────────────────

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-white flex items-center justify-center">
          <p className="text-slate-400 text-lg">読み込み中…</p>
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
