'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamGame } from '@/types';
import { Trophy, Undo2, ChevronDown, ChevronRight } from 'lucide-react';

interface TeamEncounterCardProps {
  encounter: TeamEncounter;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2 | null) => void;
  readOnly?: boolean;
  /**
   * 折りたたみを有効にする。予選のように対戦が多い画面で使う。
   * 決着済み・未着手は畳み、入力途中のものだけ開いた状態で始まる。
   */
  collapsible?: boolean;
}

/** 種目コードを日本語に。第N試合だけでは何の種目か分からないため併記する */
const GAME_TYPE_LABEL: Record<string, string> = {
  MD: '男子D',
  WD: '女子D',
  XD: '混合D',
  MS: '男子S',
  WS: '女子S',
};

export default function TeamEncounterCard({
  encounter,
  getTeamName,
  onGameResult,
  readOnly = false,
  collapsible = false,
}: TeamEncounterCardProps) {
  const enteredCount = encounter.games.filter(g => g.winner !== null).length;
  const inProgress = enteredCount > 0 && !encounter.completed;

  // 入力途中のものだけ開いて始める。決着済み・未着手は畳む
  const [open, setOpen] = useState(!collapsible || inProgress);

  const team1Name = getTeamName(encounter.team1_id);
  const team2Name = getTeamName(encounter.team2_id);

  const borderColor = encounter.completed
    ? 'border-emerald-300'
    : inProgress
      ? 'border-sky-300'
      : 'border-slate-200';

  // 何本先取で決着かを出す（5試合なら3本）
  const majority = Math.floor(encounter.games.length / 2) + 1;

  const handleWinner = (game: TeamGame, winner: 1 | 2) => {
    // 同じボタンをもう一度押したら未入力に戻す（押し間違いの取り消し）
    onGameResult?.(encounter.id, game.id, game.winner === winner ? null : winner);
  };

  /** 1行サマリ。畳んだ状態でも「誰と誰が何対何で、決着したか」が分かるようにする */
  const summary = (
    <div className="flex items-center gap-2 min-w-0">
      {collapsible && (
        open ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-blue-700 truncate">{team1Name}</span>
          <span className="shrink-0 text-base font-bold tabular-nums">
            <span className="text-blue-700">{encounter.team1_wins}</span>
            <span className="text-slate-400 text-xs mx-0.5">-</span>
            <span className="text-red-700">{encounter.team2_wins}</span>
          </span>
          <span className="text-sm font-bold text-red-700 truncate text-right">{team2Name}</span>
        </div>
      </div>
    </div>
  );

  const statusLine = encounter.completed && encounter.winner_id ? (
    <div className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded py-1">
      <Trophy className="w-3.5 h-3.5" />
      {getTeamName(encounter.winner_id)} の勝ち
    </div>
  ) : (
    <div className="text-center text-[11px] text-slate-500">
      {majority}本先取
      {enteredCount > 0 && <span className="ml-1 text-sky-700 font-bold">入力{enteredCount}/{encounter.games.length}</span>}
    </div>
  );

  return (
    <Card className={`bg-white shadow-sm ${borderColor}`}>
      <CardContent className="p-2.5 space-y-2">
        {collapsible ? (
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full text-left"
            aria-expanded={open}
            aria-label={`${team1Name} 対 ${team2Name} の入力を${open ? '閉じる' : '開く'}`}
          >
            {summary}
          </button>
        ) : summary}

        {statusLine}

        {/* 試合スロット: 1行1試合。勝ったチーム名のボタンを押す */}
        {open && (
          <div className="flex flex-col gap-1">
            {encounter.games.map((game: TeamGame, idx: number) => {
              const typeLabel = GAME_TYPE_LABEL[game.type] ?? game.type;
              return (
                <div key={game.id} className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500 w-11 shrink-0 leading-tight">
                    {idx + 1}
                    <span className="block text-[11px] text-slate-400">{typeLabel}</span>
                  </span>
                  <Button
                    size="sm"
                    variant={game.winner === 1 ? 'default' : 'outline'}
                    className={`flex-1 min-w-0 h-11 px-1 text-xs font-bold ${game.winner === 1
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'border-blue-200 text-blue-700 hover:bg-blue-50'
                      }`}
                    disabled={readOnly}
                    onClick={() => handleWinner(game, 1)}
                    aria-pressed={game.winner === 1}
                    aria-label={`第${idx + 1}試合（${typeLabel}）は ${team1Name} の勝ち`}
                  >
                    <span className="truncate">{team1Name}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant={game.winner === 2 ? 'default' : 'outline'}
                    className={`flex-1 min-w-0 h-11 px-1 text-xs font-bold ${game.winner === 2
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'border-red-200 text-red-700 hover:bg-red-50'
                      }`}
                    disabled={readOnly}
                    onClick={() => handleWinner(game, 2)}
                    aria-pressed={game.winner === 2}
                    aria-label={`第${idx + 1}試合（${typeLabel}）は ${team2Name} の勝ち`}
                  >
                    <span className="truncate">{team2Name}</span>
                  </Button>
                  {/* 取り消し: 入力済みのときだけ押せる */}
                  <button
                    onClick={() => onGameResult?.(encounter.id, game.id, null)}
                    disabled={readOnly || game.winner === null}
                    className="w-8 h-11 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0 disabled:pointer-events-none"
                    aria-label={`第${idx + 1}試合の結果を取り消す`}
                    title="この試合の結果を取り消す"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
