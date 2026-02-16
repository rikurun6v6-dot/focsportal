"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, X } from "lucide-react";

export interface MatchAnnouncement {
  id: string;
  courtNumber: string;
  player1Name: string;
  player2Name: string;
  roundName: string;
  status: 'calling' | 'playing';
  timestamp: number;
}

interface NotificationBarProps {
  announcements: MatchAnnouncement[];
  onDismiss: (id: string) => void;
  sidebarExpanded?: boolean;
}

export default function NotificationBar({ announcements, onDismiss, sidebarExpanded = false }: NotificationBarProps) {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
  const timersRef = useRef<{ [key: string]: NodeJS.Timeout[] }>({});
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    announcements.forEach((item) => {
      // 既に処理済みのIDはスキップ
      if (!processedIdsRef.current.has(item.id)) {
        processedIdsRef.current.add(item.id);
        setVisible(prev => ({ ...prev, [item.id]: true }));

        // playingステータスは10秒後に自動削除
        if (item.status === 'playing') {
          const hideTimer = setTimeout(() => {
            setVisible(prev => ({ ...prev, [item.id]: false }));
          }, 10000);

          const dismissTimer = setTimeout(() => {
            onDismiss(item.id);
            processedIdsRef.current.delete(item.id);
          }, 10300);

          // タイマーを保存
          timersRef.current[item.id] = [hideTimer, dismissTimer];
        }
      }
    });

    // クリーンアップ: コンポーネントがアンマウントされたら全タイマーをクリア
    return () => {
      Object.values(timersRef.current).forEach(timers => {
        timers.forEach(timer => clearTimeout(timer));
      });
      timersRef.current = {};
    };
  }, [announcements, onDismiss]);

  const handleDismiss = (id: string) => {
    // 既存のタイマーをクリア
    if (timersRef.current[id]) {
      timersRef.current[id].forEach(timer => clearTimeout(timer));
      delete timersRef.current[id];
    }

    setVisible(prev => ({ ...prev, [id]: false }));

    const dismissTimer = setTimeout(() => {
      onDismiss(id);
      processedIdsRef.current.delete(id);
    }, 300);

    // 新しいタイマーを保存
    timersRef.current[id] = [dismissTimer];
  };

  const leftOffset = sidebarExpanded ? 'ml-64' : 'ml-16';

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-[90] bg-white border-b border-slate-200 transition-all duration-300 ${leftOffset}`}
      style={{ height: '48px' }}
    >
      <div className="relative h-full">
        <div className="h-full px-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-6 h-full min-w-max">
            {announcements.length === 0 ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Bell className="w-3.5 h-3.5" />
                <span>通知はありません</span>
              </div>
            ) : (
              announcements.map((announcement, index) => (
                <div
                  key={announcement.id + "-" + index}
                  className={`
                  flex items-center gap-3 whitespace-nowrap
                  transition-opacity duration-300
                  ${visible[announcement.id] ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                `}
                  style={{
                    transitionDelay: visible[announcement.id] ? `${index * 50}ms` : '0ms'
                  }}
                >
                  {announcement.status === 'calling' && (
                    <Bell className="w-4 h-4 text-indigo-500" />
                  )}
                  <span className="text-xs font-bold text-indigo-600">
                    コート{announcement.courtNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {announcement.player1Name} vs {announcement.player2Name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {announcement.roundName}
                  </span>
                  <button
                    onClick={() => handleDismiss(announcement.id)}
                    className="ml-2 hover:text-slate-600 transition-colors"
                    aria-label="閉じる"
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右端フェードマスク（mask-imageで実装） */}
        <div
          className="absolute right-0 top-0 bottom-0 w-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to left, white, transparent)',
            maskImage: 'linear-gradient(to left, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to left, black, transparent)'
          }}
        />
      </div>
    </div>
  );
}
