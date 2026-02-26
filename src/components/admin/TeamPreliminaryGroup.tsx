'use client';

import { Trophy } from 'lucide-react';
import type { TeamEncounter, TeamRankEntry } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';

interface TeamPreliminaryGroupProps {
  groups: string[];
  encountersByGroup: Record<string, TeamEncounter[]>;
  rankingsByGroup: Record<string, TeamRankEntry[]>;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2) => void;
  readOnly?: boolean;
}

export default function TeamPreliminaryGroup({
  groups,
  encountersByGroup,
  rankingsByGroup,
  getTeamName,
  onGameResult,
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
                            <th className="py-1 px-2 text-left">順位</th>
                            <th className="py-1 px-2 text-left">チーム</th>
                            <th className="py-1 px-2 text-center">勝</th>
                            <th className="py-1 px-2 text-center">負</th>
                            <th className="py-1 px-2 text-center">差</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rankings.map((r, i) => (
                            <tr key={r.teamId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="py-1 px-2 font-bold text-slate-700">{i + 1}</td>
                              <td className="py-1 px-2 truncate max-w-[80px]">{getTeamName(r.teamId)}</td>
                              <td className="py-1 px-2 text-center text-emerald-700">{r.wins}</td>
                              <td className="py-1 px-2 text-center text-red-600">{r.losses}</td>
                              <td className={`py-1 px-2 text-center ${r.gameDiff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                {r.gameDiff > 0 ? `+${r.gameDiff}` : r.gameDiff}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
