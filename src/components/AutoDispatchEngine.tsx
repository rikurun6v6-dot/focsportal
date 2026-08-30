'use client';

import { useEffect, useRef } from 'react';
import type { Config } from '@/types';
import { autoDispatchAll } from '@/lib/dispatcher';
import { getDocument, acquireDispatchLease, releaseDispatchLease } from '@/lib/firestore-helpers';
import { Timestamp } from 'firebase/firestore';
import { useCamp } from '@/context/CampContext';

const POLL_INTERVAL = 5000; // 5 seconds

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

export default function AutoDispatchEngine() {
  const { camp } = useCamp();
  // 変更点: オブジェクトそのものではなく、IDを取り出す
  const campId = camp?.id;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // campId がない場合は何もしない
    if (!campId) return;

    const deviceId = getDeviceId();

    const runDispatcher = async () => {
      const config = await getDocument<Config>('config', campId);
      if (!config?.auto_dispatch_enabled) return;

      // 全コート中断チェック（時間指定なし・進行中の試合はそのまま）
      if (config.dispatch_suspended) return;

      // 一時中断チェック
      if (config.pause_until) {
        const pauseMs = (config.pause_until as Timestamp).toMillis?.() ?? 0;
        if (pauseMs > Date.now()) return;
      }

      // 担当を取れた端末だけが回す。取れなければ何もしない。
      // 担当端末が閉じられてもリースが切れて他の端末が引き継ぐので、止まりはしない。
      const isOwner = await acquireDispatchLease(campId, deviceId);
      if (!isOwner) return;

      try {
        // ここで campId と default_rest_minutes を使う
        const defaultRestMinutes = config.default_rest_minutes || 10;
        const count = await autoDispatchAll(campId, defaultRestMinutes);
        if (count > 0) {
          // 念のため camp オブジェクトをログに出すのは避けるか、タイトルだけにする
        }
      } catch (error) {
        console.error('[Auto-Dispatch] Error:', error);
      }
    };

    // 初回実行
    // runDispatcher(); 

    intervalRef.current = setInterval(runDispatcher, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // 画面を離れるときは担当を明け渡す。次の端末がすぐ引き継げる
      void releaseDispatchLease(campId, deviceId);
    };
    // 変更点: 依存配列を [camp] から [campId] に変更
  }, [campId]);

  return null;
}
