'use client';

import { Trophy, Scissors, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamRankEntry } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';

interface TeamPreliminaryGroupProps {
  groups: string[];
  encountersByGroup: Record<string, TeamEncounter[]>;
  rankingsByGroup: Record<string, TeamRankEntry[]>;
  jankenPairsByGroup?: Record<string, [string, string][]>;
  manualRanksByGroup?: Record<string, string[]>;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => void;
  onJanken?: (team1Id: string, team2Id: string, winnerId: string) => void;
  onManualRankChange?: (group: string, orderedTeamIds: string[]) => void;
  readOnly?: boolean;
}

export default function TeamPreliminaryGroup({
  groups,
  encountersByGroup,
  rankingsByGroup,
  jankenPairsByGroup,
  manualRanksByGroup,
  getTeamName,
  onGameResult,
  onJanken,
  onManualRankChange,
  readOnly = false,
}: TeamPreliminaryGroupProps) {
  const handleMoveUp = (group: string, idx: number) => {
    if (idx === 0) return;
    const rankings = rankingsByGroup[group] ?? [];
    const newOrder = rankings.map(r => r.teamId);
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    onManualRankChange?.(group, newOrder);
  };

  const handleMoveDown = (group: string, idx: number) => {
    const rankings = rankingsByGroup[group] ?? [];
    if (idx >= rankings.length - 1) return;
    const newOrder = rankings.map(r => r.teamId);
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    onManualRankChange?.(group, newOrder);
  };

  const handleResetManual = (group: string) => {
    onManualRankChange?.(group, []);
  };
  return (
    <div>
      <h2 className="text-lg font-bold text-violet-700 mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5" />
        予選グループ
      </h2>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max p-2">
          {groups.map(group => {
            const encounters = encountersByGroup[group] ?? [];
            const rankings = rankingsByGroup[group] ?? [];
            const jankenPairs = jankenPairsByGroup?.[group] ?? [];

            return (
              <div key={group} className="flex flex-col gap-3 w-64">
                <h3 className="text-center font-bold text-violet-700 text-xs bg-violet-100 rounded-md py-1.5 px-2 shadow-sm">
                  グループ {group}
                </h3>

                {/* 対戦カード一覧 */}
                <div className="flex flex-col gap-2">
                  {encounters.map(enc => (
                    <TeamEncounterCard
                      key={enc.id}
                      encounter={enc}
                      getTeamName={getTeamName}
                      onGameResult={onGameResult}
                      readOnly={readOnly}
                    />
                  ))}
                </div>

                {/* 順位表 */}
                {rankings.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-semibold text-slate-500">現在の順位</p>
                      {!readOnly && (manualRanksByGroup?.[group] ?? []).length > 0 && (
                        <button
                          onClick={() => handleResetManual(group)}
                          className="flex items-center gap-0.5 text-[9px] text-amber-600 hover:text-amber-800"
                          title="自動順位に戻す"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          手動設定中
                        </button>
                      )}
                    </div>
                    <div className="bg-slate-50 rounded-md overflow-hidden border border-slate-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600">
                            <th className="py-1 px-1.5 text-left">順</th>
                            <th className="py-1 px-1.5 text-left">チーム</th>
                            <th className="py-1 px-1 text-center">勝</th>
                            <th className="py-1 px-1 text-center">負</th>
                            <th className="py-1 px-1 text-center" title="得失試合数差">試</th>
                            {!readOnly && onManualRankChange && <th className="py-1 px-1 text-center">移動</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rankings.map((r, i) => (
                            <tr key={r.teamId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="py-1 px-1.5 font-bold text-slate-700">{i + 1}</td>
                              <td className="py-1 px-1.5 truncate max-w-[72px]">{getTeamName(r.teamId)}</td>
                              <td className="py-1 px-1 text-center text-emerald-700">{r.wins}</td>
                              <td className="py-1 px-1 text-center text-red-600">{r.losses}</td>
                              <td className={`py-1 px-1 text-center ${r.gameDiff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}
                              </td>
                              {!readOnly && onManualRankChange && (
                                <td className="py-1 px-1 text-center">
                                  <div className="flex flex-col items-center gap-0">
                                    <button
                                      onClick={() => handleMoveUp(group, i)}
                                      disabled={i === 0}
                                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleMoveDown(group, i)}
                                      disabled={i === rankings.length - 1}
                                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20"
                                    >
                                      <ChevronDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!readOnly && onManualRankChange && (
                      <p className="text-[9px] text-slate-400 mt-0.5">
                        順位基準: 勝利数→得失試合数→直接対決。▲▼で手動変更可
                      </p>
                    )}
                  </div>
                )}

                {/* じゃんけん入力 */}
                {!readOnly && jankenPairs.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[10px] font-semibold text-amber-600 flex items-center gap-1">
                      <Scissors className="w-3 h-3" />
                      じゃんけん決定が必要
                    </p>
                    {jankenPairs.map(([t1, t2]) => (
                      <div key={`${t1}_${t2}`} className="bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
                        <p className="text-[10px] text-amber-700 font-medium">
                          {getTeamName(t1)} vs {getTeamName(t2)}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-6 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => onJanken?.(t1, t2, t1)}
                          >
                            {getTeamName(t1)} 勝
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-6 text-[10px] border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => onJanken?.(t1, t2, t2)}
                          >
                            {getTeamName(t2)} 勝
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
