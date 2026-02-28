"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, Play, X } from "lucide-react";

export interface MatchAnnouncement {
  id: string;
  courtNumber: string;
  player1Name: string;
  player2Name: string;
  roundName: string;
  status: 'calling' | 'playing';
  timestamp: number;
  tournamentType?: string;
  division?: number;
}

interface NotificationBarProps {
  announcements: MatchAnnouncement[];
  onDismiss: (id: string) => void;
  sidebarExpanded?: boolean;
}

function getTournamentLabel(type: string, division: number): string {
  const gender = type.includes('mens') && !type.includes('wo')
    ? '男子'
    : type.includes('womens')
    ? '女子'
    : type.includes('mixed')
    ? '混合'
    : '';
  const event = type.includes('doubles')
    ? 'ダブルス'
    : type.includes('singles')
    ? 'シングルス'
    : type.includes('team_battle')
    ? '団体戦'
    : '';
  const div = division > 0 ? `${division}部` : '';
  return [gender, event, div].filter(Boolean).join('・');
}

export default function NotificationBar({
  announcements,
  onDismiss,
  sidebarExpanded = false,
}: NotificationBarProps) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const timersRef = useRef<Record<string, NodeJS.Timeout[]>>({});
  const processedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    announcements.forEach((item) => {
      if (processedIdsRef.current.has(item.id)) return;
      processedIdsRef.current.add(item.id);

      // 次フレームで visible=true にすることでスライドインが発火
      const mountTimer = setTimeout(() => {
        setVisible((prev) => ({ ...prev, [item.id]: true }));
      }, 16);

      if (item.status === 'playing') {
        const hideTimer = setTimeout(() => {
          setVisible((prev) => ({ ...prev, [item.id]: false }));
        }, 10000);
        const dismissTimer = setTimeout(() => {
          onDismiss(item.id);
          processedIdsRef.current.delete(item.id);
        }, 10400);
        timersRef.current[item.id] = [mountTimer, hideTimer, dismissTimer];
      } else {
        timersRef.current[item.id] = [mountTimer];
      }
    });

    return () => {
      Object.values(timersRef.current).forEach((timers) =>
        timers.forEach(clearTimeout)
      );
      timersRef.current = {};
    };
  }, [announcements, onDismiss]);

  const handleDismiss = (id: string) => {
    (timersRef.current[id] ?? []).forEach(clearTimeout);
    delete timersRef.current[id];

    setVisible((prev) => ({ ...prev, [id]: false }));

    const t = setTimeout(() => {
      onDismiss(id);
      processedIdsRef.current.delete(id);
    }, 380);
    timersRef.current[id] = [t];
  };

  const leftOffset = sidebarExpanded ? 'ml-64' : 'ml-16';

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-[90] bg-white/90 backdrop-blur-sm border-b border-slate-200 transition-all duration-300 ${leftOffset}`}
      style={{ height: '72px' }}
    >
      <div className="relative h-full">
        <div className="h-full px-4 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 h-full py-2 min-w-max">
            {announcements.length === 0 ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs pl-2">
                <Bell className="w-3.5 h-3.5" />
                <span>通知はありません</span>
              </div>
            ) : (
              announcements.map((announcement) => {
                const isCalling = announcement.status === 'calling';
                const isVis = visible[announcement.id];
                const typeLabel = announcement.tournamentType
                  ? getTournamentLabel(
                      announcement.tournamentType,
                      announcement.division ?? 0
                    )
                  : '';

                return (
                  <div
                    key={announcement.id}
                    style={{
                      transform: isVis ? 'translateX(0) scale(1)' : 'translateX(-20px) scale(0.95)',
                      opacity: isVis ? 1 : 0,
                      transition:
                        'transform 0.38s cubic-bezier(0.34,1.56,0.64,1), opacity 0.32s ease',
                    }}
                    className={`
                      relative flex flex-col justify-between flex-shrink-0
                      w-60 h-full rounded-xl border shadow-md px-3 py-2 overflow-hidden
                      ${isCalling
                        ? 'bg-indigo-50 border-indigo-300 shadow-indigo-100'
                        : 'bg-emerald-50 border-emerald-300 shadow-emerald-100'
                      }
                    `}
                  >
                    {/* calling: 背景パルスグロー */}
                    {isCalling && (
                      <div className="absolute inset-0 rounded-xl bg-indigo-200 animate-pulse opacity-20 pointer-events-none" />
                    )}

                    {/* 上段: ステータス + コート + 種目 + × */}
                    <div className="relative flex items-center gap-1.5">
                      {isCalling ? (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-white bg-indigo-500 px-1.5 py-0.5 rounded-md flex-shrink-0">
                          <Bell className="w-2.5 h-2.5 animate-bounce" />
                          呼出中
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-white bg-emerald-500 px-1.5 py-0.5 rounded-md flex-shrink-0">
                          <Play className="w-2.5 h-2.5 fill-white" />
                          試合中
                        </span>
                      )}
                      <span
                        className={`text-xs font-bold flex-shrink-0 ${
                          isCalling ? 'text-indigo-700' : 'text-emerald-700'
                        }`}
                      >
                        コート{announcement.courtNumber}
                      </span>
                      {typeLabel && (
                        <span className="text-[10px] text-slate-400 truncate">
                          {typeLabel}
                        </span>
                      )}
                      <button
                        onClick={() => handleDismiss(announcement.id)}
                        className="ml-auto text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"
                        aria-label="閉じる"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 下段: 選手名 vs + ラウンド */}
                    <div className="relative flex items-center gap-1 text-xs min-w-0">
                      <span className="font-semibold text-slate-700 truncate">
                        {announcement.player1Name}
                      </span>
                      <span className="text-slate-400 flex-shrink-0 text-[10px] font-medium">
                        vs
                      </span>
                      <span className="font-semibold text-slate-700 truncate">
                        {announcement.player2Name}
                      </span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1">
                        {announcement.roundName}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右端フェードマスク */}
        <div
          className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to left, rgba(255,255,255,0.9), transparent)',
          }}
        />
      </div>
    </div>
  );
}
