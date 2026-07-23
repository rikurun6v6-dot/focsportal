'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamGame } from '@/types';
import { Trophy, Undo2 } from 'lucide-react';

interface TeamEncounterCardProps {
  encounter: TeamEncounter;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2 | null) => void;
  readOnly?: boolean;
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
}: TeamEncounterCardProps) {
  const team1Name = getTeamName(encounter.team1_id);
  const team2Name = getTeamName(encounter.team2_id);

  const borderColor = encounter.completed ? 'border-emerald-300' : 'border-slate-200';

  // 何本先取で決着かを出す（5試合なら3本）
  const majority = Math.floor(encounter.games.length / 2) + 1;

  const handleWinner = (game: TeamGame, winner: 1 | 2) => {
    // 同じボタンをもう一度押したら未入力に戻す（押し間違いの取り消し）
    onGameResult?.(encounter.id, game.id, game.winner === winner ? null : winner);
  };

  return (
    <Card className={`bg-white shadow-sm ${borderColor}`}>
      <CardContent className="p-3 space-y-3">
        {/* チーム名とスコア。名前の色を勝者ボタンの色と揃える（青=左, 赤=右） */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-700 truncate" title={team1Name}>
              {team1Name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-lg font-bold tabular-nums text-blue-700">{encounter.team1_wins}</span>
            <span className="text-slate-400 text-xs">-</span>
            <span className="text-lg font-bold tabular-nums text-red-700">{encounter.team2_wins}</span>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-sm font-bold text-red-700 truncate" title={team2Name}>
              {team2Name}
            </p>
          </div>
        </div>

        {encounter.completed && encounter.winner_id ? (
          <div className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded py-1.5">
            <Trophy className="w-3.5 h-3.5" />
            {getTeamName(encounter.winner_id)} の勝ち（決着済み）
          </div>
        ) : (
          <div className="text-center text-[11px] text-slate-500">
            {majority}本先取
          </div>
        )}

        {/* 試合スロット: 1行1試合。勝ったチーム名のボタンを押す */}
        <div className="flex flex-col gap-1.5">
          {encounter.games.map((game: TeamGame, idx: number) => {
            const typeLabel = GAME_TYPE_LABEL[game.type] ?? game.type;
            return (
              <div key={game.id} className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 w-16 shrink-0 leading-tight">
                  第{idx + 1}試合
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
                {/* 取り消し: 入力済みのときだけ出す */}
                <button
                  onClick={() => onGameResult?.(encounter.id, game.id, null)}
                  disabled={readOnly || game.winner === null}
                  className="w-9 h-11 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-0 disabled:pointer-events-none"
                  aria-label={`第${idx + 1}試合の結果を取り消す`}
                  title="この試合の結果を取り消す"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
