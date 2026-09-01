'use client';

import { useEffect, useRef, useState } from 'react';
import type { Config } from '@/types';
import { autoDispatchAll } from '@/lib/dispatcher';
import { getDocument, acquireDispatchLease, releaseDispatchLease } from '@/lib/firestore-helpers';
import { Timestamp } from 'firebase/firestore';
import { useCamp } from '@/context/CampContext';

const POLL_INTERVAL = 5000; // 5 seconds

/** これ以上巡回が途切れたら「止まっている」と見なして画面に出す */
const STALL_WARN_MS = 30000;

const DEVICE_ID_KEY = 'focs_dispatch_device_id';

/**
 * この端末（タブ）を識別するID。
 * 自動割り当てはブラウザ内で動くため、/admin を開いた端末が全部回すと
 * 二重割り当てが起きる。担当を1台に絞るための札として使う。
 * sessionStorage に置くので、再読み込みしても同じ端末として扱われる。
 */
function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = sessionStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    // sessionStorage が使えない環境では毎回別IDになる（担当が移りやすくなるだけ）
    return `dev_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * 自動割り当ての巡回。
 *
 * ブラウザの中で回しているので、タブが裏に回る・画面が消えると
 * ブラウザがタイマーを間引く。リハーサルでは、前面なら1試合2秒で進む処理が
 * 裏に回った瞬間に1分に1回まで落ちた。コートが空いても試合が入らず、
 * 画面には何も出ないまま進行だけが止まる。
 *
 * ここでは3つの手当てをしている。
 *   1. 前の巡回が終わるまで次を始めない（間引かれた分がたまって同時に走ると、
 *      担当（リース）の取り合いで全部が失敗し、かえって一件も進まなくなる）
 *   2. 画面が消えないようにする（Wake Lock）
 *   3. それでも途切れたら画面に出す（黙って止まるのがいちばん怖い）
 */
export default function AutoDispatchEngine() {
  const { camp } = useCamp();
  // 変更点: オブジェクトそのものではなく、IDを取り出す
  const campId = camp?.id;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  /** 巡回中フラグ。間引かれて溜まった呼び出しが重なるのを防ぐ */
  const runningRef = useRef(false);
  /** 最後に巡回を終えた時刻 */
  const lastTickRef = useRef(Date.now());
  /** いま自動割り当てが動くべき状態か（OFF・中断中は警告しない） */
  const shouldRunRef = useRef(false);

  const [stalledSec, setStalledSec] = useState(0);

  useEffect(() => {
    // campId がない場合は何もしない
    if (!campId) return;

    const deviceId = getDeviceId();
    lastTickRef.current = Date.now();

    const runDispatcher = async () => {
      // 前の巡回がまだ終わっていないなら、今回は見送る
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const config = await getDocument<Config>('config', campId);

        const paused = config?.pause_until
          ? ((config.pause_until as Timestamp).toMillis?.() ?? 0) > Date.now()
          : false;
        shouldRunRef.current = !!config?.auto_dispatch_enabled && !config?.dispatch_suspended && !paused;

        if (!config?.auto_dispatch_enabled) return;

        // 全コート中断チェック（時間指定なし・進行中の試合はそのまま）
        if (config.dispatch_suspended) return;

        // 一時中断チェック
        if (paused) return;

        // 担当を取れた端末だけが回す。取れなければ何もしない。
        // 担当端末が閉じられてもリースが切れて他の端末が引き継ぐので、止まりはしない。
        const isOwner = await acquireDispatchLease(campId, deviceId);
        if (!isOwner) return;

        // ここで campId と default_rest_minutes を使う
        const defaultRestMinutes = config.default_rest_minutes || 10;
        await autoDispatchAll(campId, defaultRestMinutes);
      } catch (error) {
        console.error('[Auto-Dispatch] Error:', error);
      } finally {
        runningRef.current = false;
        lastTickRef.current = Date.now();
      }
    };

    // 初回実行
    // runDispatcher(); 

    intervalRef.current = setInterval(runDispatcher, POLL_INTERVAL);

    // ── 画面を消させない ──
    // iPad を置いたままにすると画面が落ち、そこから割り当てが止まる。
    // 画面が見えている間だけ取れるので、戻ってきたら取り直す。
    let sentinel: { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void } | null = null;
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (t: string) => Promise<typeof sentinel> };
    }).wakeLock;

    const acquireWakeLock = async () => {
      if (!wakeLock || document.visibilityState !== 'visible' || sentinel) return;
      try {
        sentinel = await wakeLock.request('screen');
        sentinel?.addEventListener?.('release', () => { sentinel = null; });
      } catch {
        // 取れない環境（未対応ブラウザ・省電力モード）では何もしない
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void acquireWakeLock();
      // 裏にいた間に溜まった分は捨てて、戻った時点から数え直す
      lastTickRef.current = Date.now();
      void runDispatcher();
    };

    void acquireWakeLock();
    document.addEventListener('visibilitychange', onVisible);

    // ── 途切れの見張り ──
    const watchdog = setInterval(() => {
      const gap = Date.now() - lastTickRef.current;
      setStalledSec(shouldRunRef.current && gap > STALL_WARN_MS ? Math.round(gap / 1000) : 0);
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
      // 画面を離れるときは担当を明け渡す。次の端末がすぐ引き継げる
      void releaseDispatchLease(campId, deviceId);
    };
    // 変更点: 依存配列を [camp] から [campId] に変更
  }, [campId]);

  if (stalledSec === 0) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-xl border-2 border-red-400 bg-red-50 px-4 py-2.5 shadow-lg">
      <p className="text-sm font-bold text-red-800">
        自動割り当てが {stalledSec} 秒止まっています
      </p>
      <p className="text-xs text-red-700 mt-0.5">
        この画面を前面にしたままにしてください。裏に回ると割り当てが進みません。
      </p>
    </div>
  );
}
