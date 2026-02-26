'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamGame } from '@/types';
import { Trophy } from 'lucide-react';

interface TeamEncounterCardProps {
  encounter: TeamEncounter;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2) => void;
  readOnly?: boolean;
}

const GAME_TYPE_LABEL: Record<string, string> = {
  MD: '男D',
  WD: '女D',
  XD: '混D',
  MS: '男S',
  WS: '女S',
};

export default function TeamEncounterCard({
  encounter,
  getTeamName,
  onGameResult,
  readOnly = false,
}: TeamEncounterCardProps) {
  const team1Name = getTeamName(encounter.team1_id);
  const team2Name = getTeamName(encounter.team2_id);

  const borderColor = encounter.completed
    ? 'border-emerald-300'
    : 'border-slate-200';

  return (
    <Card className={`bg-white shadow-sm ${borderColor}`}>
      <CardContent className="p-3 space-y-3">
        {/* チーム名とスコア */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${encounter.winner_id === encounter.team1_id ? 'text-amber-600' : 'text-slate-800'}`}>
              {team1Name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-lg font-bold tabular-nums">{encounter.team1_wins}</span>
            <span className="text-slate-400 text-xs">-</span>
            <span className="text-lg font-bold tabular-nums">{encounter.team2_wins}</span>
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className={`text-sm font-semibold truncate ${encounter.winner_id === encounter.team2_id ? 'text-amber-600' : 'text-slate-800'}`}>
              {team2Name}
            </p>
          </div>
        </div>

        {encounter.completed && encounter.winner_id && (
          <div className="flex items-center justify-center gap-1 text-xs text-emerald-700 bg-emerald-50 rounded py-1">
            <Trophy className="w-3 h-3" />
            {getTeamName(encounter.winner_id)} の勝ち
          </div>
        )}

        {/* 種目スロット */}
        <div className="flex flex-wrap gap-1.5">
          {encounter.games.map((game: TeamGame) => {
            const label = GAME_TYPE_LABEL[game.type] ?? game.type;
            return (
              <div key={game.id} className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-slate-500">{label}</span>
                <div className="flex gap-0.5">
                  {/* team1勝ボタン */}
                  <Button
                    size="sm"
                    variant={game.winner === 1 ? 'default' : 'outline'}
                    className={`h-7 w-7 p-0 text-xs ${game.winner === 1 ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                    disabled={readOnly || encounter.completed}
                    onClick={() => onGameResult?.(encounter.id, game.id, 1)}
                    title={`${team1Name} 勝`}
                  >
                    1
                  </Button>
                  {/* team2勝ボタン */}
                  <Button
                    size="sm"
                    variant={game.winner === 2 ? 'default' : 'outline'}
                    className={`h-7 w-7 p-0 text-xs ${game.winner === 2 ? 'bg-red-600 hover:bg-red-700' : ''}`}
                    disabled={readOnly || encounter.completed}
                    onClick={() => onGameResult?.(encounter.id, game.id, 2)}
                    title={`${team2Name} 勝`}
                  >
                    2
                  </Button>
                </div>
                {game.winner && (
                  <Badge
                    className={`text-[9px] px-1 h-4 ${game.winner === 1 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {game.winner === 1 ? team1Name.slice(0, 3) : team2Name.slice(0, 3)}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
