'use client';

import type { TeamRankEntry } from '@/types';
import { TEAM_RANK_CRITERION_LABEL, type TeamRankCriterion } from '@/lib/tournament-logic';
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

interface TeamStandingsTableProps {
  rankings: TeamRankEntry[];
  getTeamName: (id: string) => string;
  rankOrder?: TeamRankCriterion[];
  /** 手動並べ替えを出す場合に渡す（運営画面のみ） */
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  /** 手動並べ替え中なら、自動順位に戻すボタンを出す */
  onResetManual?: () => void;
  isManual?: boolean;
  /** 凡例と判定順の説明を出すか */
  showLegend?: boolean;
}

/**
 * 予選の順位表。運営画面と参加者画面の両方から使う。
 *
 * 参加者画面では読み取り専用（並べ替えのハンドラを渡さない）。
 */
export default function TeamStandingsTable({
  rankings,
  getTeamName,
  rankOrder,
  onMoveUp,
  onMoveDown,
  onResetManual,
  isManual = false,
  showLegend = true,
}: TeamStandingsTableProps) {
  const editable = !!onMoveUp && !!onMoveDown;

  if (rankings.length === 0) {
    return <p className="text-sm text-slate-500 py-4 text-center">まだ順位はありません</p>;
  }

  return (
    <div>
      {isManual && onResetManual && (
        <div className="flex justify-end mb-1">
          <button
            onClick={onResetManual}
            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800"
          >
            <RotateCcw className="w-3 h-3" />
            手動設定中 — 自動順位に戻す
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="py-2 px-2 text-left text-xs font-bold w-8">順</th>
              <th className="py-2 px-2 text-left text-xs font-bold">チーム</th>
              <th className="py-2 px-1.5 text-center text-xs font-bold w-9">勝</th>
              <th className="py-2 px-1.5 text-center text-xs font-bold w-9">負</th>
              <th className="py-2 px-1.5 text-center text-xs font-bold w-14">ゲーム</th>
              {editable && <th className="py-2 px-1 text-center text-xs font-bold w-9">移動</th>}
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, i) => (
              <tr
                key={r.teamId}
                className={`border-t border-slate-100 ${i === 0 ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}
              >
                <td className="py-2 px-2 font-bold text-slate-700 tabular-nums">{i + 1}</td>
                <td className="py-2 px-2 font-medium text-slate-800 truncate max-w-[8rem]">{getTeamName(r.teamId)}</td>
                <td className="py-2 px-1.5 text-center font-bold text-emerald-700 tabular-nums">{r.wins}</td>
                <td className="py-2 px-1.5 text-center text-red-600 tabular-nums">{r.losses}</td>
                <td className="py-2 px-1.5 text-center font-medium text-slate-700 tabular-nums">{r.gamesWon}</td>
                {editable && (
                  <td className="py-1 px-1 text-center">
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => onMoveUp?.(i)}
                        disabled={i === 0}
                        className="w-7 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-20"
                        aria-label={`${getTeamName(r.teamId)} を上へ`}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onMoveDown?.(i)}
                        disabled={i === rankings.length - 1}
                        className="w-7 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded disabled:opacity-20"
                        aria-label={`${getTeamName(r.teamId)} を下へ`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLegend && (
        <div className="mt-1.5 space-y-0.5">
          <p className="text-xs text-slate-500 leading-snug">ゲーム＝取ったゲーム数の合計</p>
          {rankOrder && (
            <p className="text-xs text-slate-500 leading-snug">
              順位: {rankOrder.map(c => TEAM_RANK_CRITERION_LABEL[c]).join(' → ')}
              {editable && '（▲▼で手動変更可）'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
