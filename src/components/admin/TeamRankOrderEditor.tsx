'use client';

import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import {
  DEFAULT_TEAM_RANK_ORDER,
  TEAM_RANK_CRITERION_LABEL,
  type TeamRankCriterion,
} from '@/lib/tournament-logic';

interface TeamRankOrderEditorProps {
  order: TeamRankCriterion[];
  onChange: (order: TeamRankCriterion[]) => void;
  disabled?: boolean;
}

/** 各基準の補足。運営が「何がどう効くのか」を推測しないで済むようにする */
const CRITERION_NOTE: Record<TeamRankCriterion, string> = {
  wins: '対戦の勝ち数。決着した対戦のみ数える',
  headToHead: '2チームが並んだときだけ有効。3チーム以上が並んだ場合は飛ばす',
  gamesWon: '取ったゲームの合計。1対戦の試合数が同じなので得失差と並び順は同じになる',
  janken: '手入力。上の基準で決まらなかったペアにだけ入力欄が出る',
};

export default function TeamRankOrderEditor({ order, onChange, disabled = false }: TeamRankOrderEditorProps) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const isDefault = order.join() === DEFAULT_TEAM_RANK_ORDER.join();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">上から順に当てはめて、決まらなければ次の基準に進みます</p>
        {!isDefault && !disabled && (
          <button
            onClick={() => onChange([...DEFAULT_TEAM_RANK_ORDER])}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
          >
            <RotateCcw className="w-3 h-3" />
            既定に戻す
          </button>
        )}
      </div>

      <ol className="space-y-1">
        {order.map((criterion, idx) => (
          <li
            key={criterion}
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5"
          >
            <span className="w-5 h-5 shrink-0 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{TEAM_RANK_CRITERION_LABEL[criterion]}</p>
              <p className="text-xs text-slate-500 leading-snug">{CRITERION_NOTE[criterion]}</p>
            </div>
            <div className="flex flex-col shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-8 p-0"
                disabled={disabled || idx === 0}
                onClick={() => move(idx, -1)}
                aria-label={`${TEAM_RANK_CRITERION_LABEL[criterion]} を上へ`}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-8 p-0"
                disabled={disabled || idx === order.length - 1}
                onClick={() => move(idx, 1)}
                aria-label={`${TEAM_RANK_CRITERION_LABEL[criterion]} を下へ`}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
