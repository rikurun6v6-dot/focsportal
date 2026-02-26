'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TeamMatchConfig, TeamGameType } from '@/types';
import { Settings2, Plus, Minus } from 'lucide-react';

const GAME_TYPES: TeamGameType[] = ['MD', 'WD', 'XD', 'MS', 'WS'];
const GAME_TYPE_LABEL: Record<TeamGameType, string> = {
  MD: '男子ダブルス',
  WD: '女子ダブルス',
  XD: '混合ダブルス',
  MS: '男子シングルス',
  WS: '女子シングルス',
};

const DEFAULT_CONFIG: TeamMatchConfig = {
  games: [
    { type: 'MD', count: 1 },
    { type: 'WD', count: 1 },
    { type: 'XD', count: 1 },
    { type: 'MS', count: 1 },
    { type: 'WS', count: 1 },
  ],
};

interface TeamMatchConfigEditorProps {
  value?: TeamMatchConfig;
  onChange: (config: TeamMatchConfig) => void;
}

export default function TeamMatchConfigEditor({ value, onChange }: TeamMatchConfigEditorProps) {
  const [config, setConfig] = useState<TeamMatchConfig>(value ?? DEFAULT_CONFIG);

  const totalGames = config.games.reduce((sum, g) => sum + g.count, 0);

  const updateCount = (type: TeamGameType, delta: number) => {
    const updated: TeamMatchConfig = {
      games: config.games
        .map(g => g.type === type ? { ...g, count: Math.max(0, g.count + delta) } : g)
        .filter(g => g.count > 0),
    };
    // Ensure all selected types remain
    GAME_TYPES.forEach(t => {
      if (!updated.games.find(g => g.type === t)) {
        // type removed (count reached 0), that's fine
      }
    });
    setConfig(updated);
    onChange(updated);
  };

  const getCount = (type: TeamGameType) =>
    config.games.find(g => g.type === type)?.count ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings2 className="w-4 h-4 text-blue-500" />
          種目構成設定
          <Badge variant="outline" className="ml-auto text-xs">
            全{totalGames}種目 / 過半数{Math.floor(totalGames / 2) + 1}勝
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {GAME_TYPES.map(type => {
            const count = getCount(type);
            return (
              <div key={type} className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700 w-28">{GAME_TYPE_LABEL[type]}</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0"
                    onClick={() => updateCount(type, -1)}
                    disabled={count === 0}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-5 text-center text-sm font-semibold tabular-nums">{count}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 w-6 p-0"
                    onClick={() => updateCount(type, 1)}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
