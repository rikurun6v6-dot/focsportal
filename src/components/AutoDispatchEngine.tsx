'use client';

import { useEffect, useRef } from 'react';
import { Config } from '@/types';
import { autoDispatchAll } from '@/lib/dispatcher';
import { getDocument } from '@/lib/firestore-helpers';

const POLL_INTERVAL = 5000; // 5 seconds

export default function AutoDispatchEngine() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const runDispatcher = async () => {
      const config = await getDocument<Config>('config', 'system');
      if (!config?.auto_dispatch_enabled) return;

      try {
        const count = await autoDispatchAll();
        if (count > 0) {
          console.log(`[Auto-Dispatch] ${count}試合を割り当てました`);
        }
      } catch (error) {
        console.error('[Auto-Dispatch] Error:', error);
      }
    };

    intervalRef.current = setInterval(runDispatcher, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return null;
}
