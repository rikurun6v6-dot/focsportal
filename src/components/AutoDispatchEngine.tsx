'use client';

import { useEffect, useRef } from 'react';
import type { Config } from '@/types';
import { autoDispatchAll } from '@/lib/dispatcher';
import { getDocument } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';

const POLL_INTERVAL = 5000; // 5 seconds

export default function AutoDispatchEngine() {
  const { camp } = useCamp();
  // 変更点: オブジェクトそのものではなく、IDを取り出す
  const campId = camp?.id;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // campId がない場合は何もしない
    if (!campId) return;

    const runDispatcher = async () => {
      const config = await getDocument<Config>('config', 'system');
      if (!config?.auto_dispatch_enabled) return;

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
    };
    // 変更点: 依存配列を [camp] から [campId] に変更
  }, [campId]);

  return null;
}
