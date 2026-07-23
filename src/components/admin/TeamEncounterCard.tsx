'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TeamEncounter } from '@/types';
import { listWinnerGameCounts } from '@/lib/tournament-logic';
import { Trophy, Undo2, ChevronDown, ChevronRight } from 'lucide-react';

interface TeamEncounterCardProps {
  encounter: TeamEncounter;
  getTeamName: (id: string) => string;
  /** 勝ったチームと本数を記録する */
  onScore?: (encounterId: string, winnerSide: 1 | 2, winnerGames: number) => void;
  /** 結果を未入力に戻す */
  onClear?: (encounterId: string) => void;
  readOnly?: boolean;
  /**
   * 折りたたみを有効にする。予選のように対戦が多い画面で使う。
   * 未入力の対戦は開いた状態で始まり、結果を入れると畳まれる。
   */
  collapsible?: boolean;
}

export default function TeamEncounterCard({
  encounter,
  getTeamName,
  onScore,
  onClear,
  readOnly = false,
  collapsible = false,
}: TeamEncounterCardProps) {
  const decided = encounter.completed && !!encounter.winner_id;

  // 未入力のものは開いて始める。入れ終わったら畳む
  const [open, setOpen] = useState(!collapsible || !decided);
  // 入力は「勝ったチーム」→「本数」の2段階。1段目で選んだ側をここに持つ
  const recordedSide: 1 | 2 | null =
    encounter.winner_id === encounter.team1_id ? 1
      : encounter.winner_id === encounter.team2_id ? 2 : null;
  const [pickedSide, setPickedSide] = useState<1 | 2 | null>(recordedSide);

  const team1Name = getTeamName(encounter.team1_id);
  const team2Name = getTeamName(encounter.team2_id);
  const total = encounter.games.length;
  const winnerCounts = listWinnerGameCounts(total);

  const handlePick = (winnerSide: 1 | 2, winnerGames: number) => {
    onScore?.(encounter.id, winnerSide, winnerGames);
    if (collapsible) setOpen(false);
  };

  const borderColor = decided ? 'border-emerald-300' : 'border-slate-200';

  /** チーム名とスコアの行。折りたたみ時はこれがボタンの中身になる */
  const headline = (
    <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
      <span className={`text-sm font-bold truncate ${encounter.winner_id === encounter.team1_id ? 'text-blue-700' : 'text-slate-700'}`}>
        {team1Name}
      </span>
      <span className="shrink-0 font-bold tabular-nums">
        {decided ? (
          <span className="text-base">
            <span className="text-blue-700">{encounter.team1_wins}</span>
            <span className="text-slate-400 text-xs mx-0.5">-</span>
            <span className="text-red-700">{encounter.team2_wins}</span>
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400">未入力</span>
        )}
      </span>
      <span className={`text-sm font-bold truncate text-right ${encounter.winner_id === encounter.team2_id ? 'text-red-700' : 'text-slate-700'}`}>
        {team2Name}
      </span>
    </div>
  );

  return (
    <Card className={`bg-white shadow-sm ${borderColor} overflow-hidden`}>
      {/* 折りたたみ時はカードの上半分すべてがタップ目標。矢印だけを狙わせない */}
      {collapsible ? (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full text-left px-3 py-3.5 min-h-[56px] flex items-center gap-2 hover:bg-slate-50 active:bg-slate-100 transition-colors"
          aria-expanded={open}
          aria-label={`${team1Name} 対 ${team2Name} の結果入力を${open ? '閉じる' : '開く'}`}
        >
          {open
            ? <ChevronDown className="w-5 h-5 shrink-0 text-slate-400" />
            : <ChevronRight className="w-5 h-5 shrink-0 text-slate-400" />}
          {headline}
        </button>
      ) : (
        <div className="px-3 pt-3 flex items-center gap-2">{headline}</div>
      )}

      <CardContent className="px-3 pb-3 pt-0 space-y-2">
        {decided && encounter.winner_id && (
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded py-1">
            <Trophy className="w-3.5 h-3.5" />
            {getTeamName(encounter.winner_id)} の勝ち
          </div>
        )}

        {open && !readOnly && (
          <div className="space-y-2 pt-1">
            {/* 1段目: どちらが勝ったか */}
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-600">1. 勝ったチーム</p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={pickedSide === 1 ? 'default' : 'outline'}
                  className={`flex-1 min-w-0 h-11 px-1 text-xs font-bold ${pickedSide === 1
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                    }`}
                  onClick={() => setPickedSide(1)}
                  aria-pressed={pickedSide === 1}
                >
                  <span className="truncate">{team1Name}</span>
                </Button>
                <Button
                  size="sm"
                  variant={pickedSide === 2 ? 'default' : 'outline'}
                  className={`flex-1 min-w-0 h-11 px-1 text-xs font-bold ${pickedSide === 2
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'border-red-200 text-red-700 hover:bg-red-50'
                    }`}
                  onClick={() => setPickedSide(2)}
                  aria-pressed={pickedSide === 2}
                >
                  <span className="truncate">{team2Name}</span>
                </Button>
              </div>
            </div>

            {/* 2段目: 本数。勝ったチームを選ぶまで出さない */}
            {pickedSide === null ? (
              <p className="text-[11px] text-slate-400 text-center py-1">
                勝ったチームを選ぶと本数を選べます
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-slate-600">
                  2. 本数（{pickedSide === 1 ? team1Name : team2Name} の勝ち）
                </p>
                <div className="flex gap-1.5">
                  {winnerCounts.map(count => {
                    const picked = recordedSide === pickedSide
                      && (pickedSide === 1 ? encounter.team1_wins : encounter.team2_wins) === count;
                    return (
                      <Button
                        key={count}
                        size="sm"
                        variant={picked ? 'default' : 'outline'}
                        className={`flex-1 h-11 text-sm font-bold tabular-nums ${picked
                          ? pickedSide === 1
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                          : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        onClick={() => handlePick(pickedSide, count)}
                        aria-pressed={picked}
                        aria-label={`${pickedSide === 1 ? team1Name : team2Name} が ${count}対${total - count} で勝ち`}
                      >
                        {count}-{total - count}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {decided && (
              <button
                onClick={() => { setPickedSide(null); onClear?.(encounter.id); }}
                className="w-full h-10 flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                結果を取り消す
              </button>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}
