'use client';

import { Trophy } from 'lucide-react';
import type { TeamEncounter } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';
import { getRoundNameByNumber } from '@/lib/tournament-logic';

interface TeamKnockoutTreeProps {
  encounters: TeamEncounter[];
  bronzeEncounter?: TeamEncounter | null;
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2) => void;
  readOnly?: boolean;
}

export default function TeamKnockoutTree({
  encounters,
  bronzeEncounter,
  getTeamName,
  onGameResult,
  readOnly = false,
}: TeamKnockoutTreeProps) {
  const knockoutOnly = encounters.filter(e => e.phase === 'knockout');
  const rounds = [...new Set(knockoutOnly.map(e => e.round ?? 0))].sort((a, b) => a - b);
  const maxRound = rounds.length > 0 ? Math.max(...rounds) : 0;

  const roundGroups: Record<number, TeamEncounter[]> = {};
  for (const enc of knockoutOnly) {
    const r = enc.round ?? 0;
    if (!roundGroups[r]) roundGroups[r] = [];
    roundGroups[r].push(enc);
  }

  if (knockoutOnly.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-bold text-violet-700 mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />
        決勝トーナメント
      </h2>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max p-2 items-start">
          {rounds.map(round => (
            <div key={round} className="flex flex-col gap-4">
              <h3 className="text-center text-xs font-semibold text-slate-600 bg-slate-100 rounded py-1 px-3">
                {getRoundNameByNumber(round, maxRound)}
              </h3>
              <div className="flex flex-col gap-8">
                {(roundGroups[round] ?? []).map(enc => (
                  <div key={enc.id} className="w-64">
                    <TeamEncounterCard
                      encounter={enc}
                      getTeamName={getTeamName}
                      onGameResult={onGameResult}
                      readOnly={readOnly}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 3位決定戦 */}
          {bronzeEncounter && (
            <div className="flex flex-col gap-4">
              <h3 className="text-center text-xs font-semibold text-orange-600 bg-orange-50 rounded py-1 px-3">
                3位決定戦
              </h3>
              <div className="w-64">
                <TeamEncounterCard
                  encounter={bronzeEncounter}
                  getTeamName={getTeamName}
                  onGameResult={onGameResult}
                  readOnly={readOnly}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
