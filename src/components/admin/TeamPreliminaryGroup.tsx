'use client';

import { Trophy, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamRankEntry } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';

interface TeamPreliminaryGroupProps {
  groups: string[];
  encountersByGroup: Record<string, TeamEncounter[]>;
  rankingsByGroup: Record<string, TeamRankEntry[]>;
  jankenPairsByGroup?: Record<string, [string, string][]>;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => void;
  onJanken?: (team1Id: string, team2Id: string, winnerId: string) => void;
  readOnly?: boolean;
}

export default function TeamPreliminaryGroup({
  groups,
  encountersByGroup,
  rankingsByGroup,
  jankenPairsByGroup,
  getTeamName,
  onGameResult,
  onJanken,
  readOnly = false,
}: TeamPreliminaryGroupProps) {
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
                    <p className="text-[10px] font-semibold text-slate-500 mb-1">現在の順位</p>
                    <div className="bg-slate-50 rounded-md overflow-hidden border border-slate-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600">
                            <th className="py-1 px-1.5 text-left">順</th>
                            <th className="py-1 px-1.5 text-left">チーム</th>
                            <th className="py-1 px-1 text-center">勝</th>
                            <th className="py-1 px-1 text-center">負</th>
                            <th className="py-1 px-1 text-center" title="得失試合数差">試</th>
                            <th className="py-1 px-1 text-center" title="得失点差">点</th>
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
                              <td className={`py-1 px-1 text-center text-[10px] ${r.pointDiff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {r.pointDiff !== 0 ? (r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
