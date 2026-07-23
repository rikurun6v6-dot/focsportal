'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TeamEncounter } from '@/types';
import {
  buildTeamSchedule,
  formatMinutes,
  GAME_MINUTES,
  TURNOVER_MINUTES,
} from '@/lib/team-schedule';
import { CalendarClock, AlertTriangle, ChevronDown, ChevronUp, Coffee } from 'lucide-react';

interface TeamScheduleViewProps {
  encounters: TeamEncounter[];
  byeByGroupRound: Record<string, string | null>;
  concurrentPerGroup: number;
  courtCount: number;
  gamesPerEncounter: number;
  getTeamName: (id: string) => string;
  /** 開始時刻（"09:00"）。空なら経過時間だけ出す */
  startTime?: string;
}

/** "09:00" + n分 → "10:35"。開始時刻が未指定なら null */
function addMinutes(start: string | undefined, minutes: number): string | null {
  if (!start) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(start.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  const h = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function TeamScheduleView({
  encounters,
  byeByGroupRound,
  concurrentPerGroup,
  courtCount,
  gamesPerEncounter,
  getTeamName,
  startTime,
}: TeamScheduleViewProps) {
  const [open, setOpen] = useState(true);

  const schedule = buildTeamSchedule({
    encounters,
    byeByGroupRound,
    concurrentPerGroup,
    courtCount,
    gamesPerEncounter,
  });

  if (schedule.blocks.length === 0) return null;

  // 各ブロックの開始時刻（前のブロックの所要時間＋転換を積み上げる）
  const blockStarts = schedule.blocks.reduce<number[]>((acc, _, i) => {
    if (i === 0) return [0];
    const prev = schedule.blocks[i - 1];
    acc.push(acc[i - 1] + prev.minutes + TURNOVER_MINUTES);
    return acc;
  }, []);

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="w-4 h-4 text-sky-600" />
            進行表
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1" onClick={() => setOpen(o => !o)}>
            {open ? '閉じる' : '開く'}
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 全体の見込み */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-xs text-slate-500">同時に進む対戦</p>
            <p className="text-lg font-bold text-slate-800">{schedule.concurrentEncounters}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-xs text-slate-500">コートに入るチーム</p>
            <p className="text-lg font-bold text-slate-800">{schedule.teamsOnCourt}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-xs text-slate-500">使う面数</p>
            <p className="text-lg font-bold text-slate-800">{schedule.courtsUsed} / {courtCount}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <p className="text-xs text-slate-500">所要時間の目安</p>
            <p className="text-lg font-bold text-slate-800">{formatMinutes(schedule.totalMinutes)}</p>
          </div>
        </div>

        {schedule.notEnoughCourts && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-bold text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              面数が足りません
            </p>
            <p className="text-xs text-red-800 mt-1">
              {schedule.concurrentEncounters}対戦を同時に進めるには最低{schedule.concurrentEncounters}面必要です。
              同時に進める対戦数を減らすか、面数を増やしてください。
            </p>
          </div>
        )}

        <p className="text-xs text-slate-500">
          1対戦を{schedule.blocks[0].courtsPerEncounter}面で回すので、5試合を
          {schedule.blocks[0].waves}波に分けます（1試合{GAME_MINUTES}分・転換{TURNOVER_MINUTES}分で計算）。
          休憩は含んでいません。
        </p>

        {open && (
          <div className="space-y-2">
            {schedule.blocks.map((block, i) => {
              const from = addMinutes(startTime, blockStarts[i]);
              const to = addMinutes(startTime, blockStarts[i] + block.minutes);
              const byes = Object.entries(block.byeByGroup).filter(([, id]) => !!id);
              return (
                <div key={block.index} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-sm font-bold text-slate-800">ブロック{block.index}</span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {from && to ? `${from} 〜 ${to}` : `${formatMinutes(blockStarts[i])}後から ${block.minutes}分`}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {block.encounters.map(enc => (
                      <li key={enc.id} className="text-sm text-slate-700 flex items-center gap-2">
                        <span className="shrink-0 w-14 text-xs font-bold text-violet-700 bg-violet-50 rounded px-1.5 py-0.5 text-center">
                          G{enc.group}
                        </span>
                        <span className="truncate">
                          {getTeamName(enc.team1_id)} <span className="text-slate-400">vs</span> {getTeamName(enc.team2_id)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {byes.length > 0 && (
                    <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1">
                      <Coffee className="w-3 h-3" />
                      この巡の休み: {byes.map(([g, id]) => `G${g} ${getTeamName(id!)}`).join(' / ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
