'use client';

// 例外投入の承認カード。
//
// 均等化を厳しくしたぶん、遅れている部・組が全員ふさがっているとコートが空いたままになる。
// そのときだけ「ルール上は入れられないけど、例外で入れますか」と聞く。
//
// 出す端末は「承認モード」を ON にした端末だけ。iPad かどうかは判定しない。
// iPadOS の Safari は既定で Mac と名乗るので、端末判定は必ず壊れる。
// トグルなら iPad が落ちても、別の端末で ON にすれば運用が続く。

import { useEffect, useState } from 'react';
import type { Court } from '@/types';
import { useCamp } from '@/context/CampContext';
import { subscribeToCourts } from '@/lib/firestore-helpers';
import { approveDispatch, dismissDispatch } from '@/lib/dispatcher';
import { toastSuccess, toastError, toastInfo } from '@/lib/toast';
import { Button } from '@/components/ui/button';

const APPROVAL_MODE_KEY = 'focs_approval_mode';

export function isApprovalModeOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(APPROVAL_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setApprovalMode(on: boolean) {
  try {
    localStorage.setItem(APPROVAL_MODE_KEY, on ? '1' : '0');
  } catch {
    // localStorage が使えない端末では承認モードを覚えられないだけ
  }
  window.dispatchEvent(new Event('focs-approval-mode'));
}

/** 「あと2分30秒」のような残り時間 */
function remainLabel(untilMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
  if (sec >= 60) return `あと${Math.floor(sec / 60)}分${String(sec % 60).padStart(2, '0')}秒`;
  return `あと${sec}秒`;
}

export default function DispatchApprovalCards() {
  const { camp } = useCamp();
  const campId = camp?.id;

  const [enabled, setEnabled] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);

  // 承認モードの ON/OFF（この端末だけ）
  useEffect(() => {
    const sync = () => setEnabled(isApprovalModeOn());
    sync();
    window.addEventListener('focs-approval-mode', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focs-approval-mode', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !campId) return;
    return subscribeToCourts(setCourts, campId);
  }, [enabled, campId]);

  // 自動投入までの残り時間表示用
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enabled]);

  if (!enabled) return null;

  const pendingCourts = courts
    .filter(c => !c.current_match_id && c.pending_dispatch && c.pending_dispatch.candidates.length > 0)
    .sort((a, b) => a.number - b.number);

  if (pendingCourts.length === 0) return null;

  const onApprove = async (court: Court, matchId: string, label: string) => {
    setBusy(court.id);
    try {
      await approveDispatch(court.id, matchId);
      toastSuccess(`${court.number}コートに入れます`, label);
    } catch {
      toastError('承認に失敗しました', '通信を確認してもう一度お試しください');
    } finally {
      setBusy(null);
    }
  };

  const onDismiss = async (court: Court) => {
    setBusy(court.id);
    try {
      await dismissDispatch(court.id);
      toastInfo(`${court.number}コートは空けたままにします`, '10分後にまた確認します');
    } catch {
      toastError('操作に失敗しました', '通信を確認してもう一度お試しください');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 mb-4">
      {pendingCourts.map(court => {
        const pending = court.pending_dispatch!;
        const createdMs = pending.created_at?.toMillis?.() ?? now;
        const autoMs = pending.auto_at?.toMillis?.() ?? 0;
        const waitedSec = Math.max(0, Math.floor((now - createdMs) / 1000));

        return (
          <div
            key={court.id}
            className="border-2 border-amber-400 bg-amber-50 rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-baseline gap-2 flex-wrap mb-1">
              <span className="text-lg font-bold text-amber-900">
                {court.number}コートが空いています
              </span>
              <span className="text-xs text-amber-700">
                {waitedSec >= 60 ? `${Math.floor(waitedSec / 60)}分${waitedSec % 60}秒` : `${waitedSec}秒`}
              </span>
            </div>
            <p className="text-sm text-amber-800 mb-3">
              均等に進めるルールでは、次の試合を入れられません。例外で入れますか？
            </p>

            <div className="space-y-2">
              {pending.candidates.map((c, i) => (
                <div
                  key={c.match_id}
                  className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 break-words">
                      {i === 0 && (
                        <span className="text-[10px] font-bold text-white bg-amber-500 px-1.5 py-0.5 rounded-full mr-1.5 align-middle">
                          おすすめ
                        </span>
                      )}
                      {c.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 break-words">{c.reason}</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={busy === court.id}
                    onClick={() => onApprove(court, c.match_id, c.label)}
                    className="shrink-0"
                  >
                    この試合を入れる
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
              <span className="text-xs text-amber-700">
                {autoMs > 0
                  ? `${remainLabel(autoMs, now)}で、おすすめを自動で入れます`
                  : '自動では入れません。ここで決めてください'}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === court.id}
                onClick={() => onDismiss(court)}
              >
                空けたままにする
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
