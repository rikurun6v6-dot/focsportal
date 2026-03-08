'use client';

import { Trophy, Medal } from 'lucide-react';
import type { TeamEncounter } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';

interface TeamPlacementViewProps {
  encounters: TeamEncounter[];
  getTeamName: (id: string) => string;
  onGameResult?: (encounterId: string, slotId: string, winner: 1 | 2, score1?: number, score2?: number) => void;
}

const PLACEMENT_LABEL: Record<number, string> = {
  1: '1位決定戦',
  2: '3位決定戦',
  3: '5位決定戦',
  4: '7位決定戦',
};

const RANK_ICON: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '4' };

export default function TeamPlacementView({
  encounters,
  getTeamName,
  onGameResult,
}: TeamPlacementViewProps) {
  const sorted = [...encounters]
    .filter(e => e.placement_rank !== undefined)
    .sort((a, b) => (a.placement_rank ?? 0) - (b.placement_rank ?? 0));

  const allDone = sorted.length > 0 && sorted.every(e => e.completed);

  // 最終順位を算出
  const standings: { rank: number; teamId: string }[] = [];
  if (allDone) {
    sorted.forEach(enc => {
      const rank = enc.placement_rank!;
      const winnerRank = (rank - 1) * 2 + 1;
      const loserRank = winnerRank + 1;
      if (enc.winner_id) {
        const loserId = enc.winner_id === enc.team1_id ? enc.team2_id : enc.team1_id;
        standings.push({ rank: winnerRank, teamId: enc.winner_id });
        standings.push({ rank: loserRank, teamId: loserId });
      }
    });
    standings.sort((a, b) => a.rank - b.rank);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-violet-700 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />
        順位決定戦
      </h2>

      <div className="flex flex-wrap gap-6">
        {sorted.map(enc => {
          const label = PLACEMENT_LABEL[enc.placement_rank!] ?? `${(enc.placement_rank! - 1) * 2 + 1}位決定戦`;
          return (
            <div key={enc.id} className="w-64 flex flex-col gap-2">
              <h3 className="text-center text-xs font-semibold text-slate-600 bg-slate-100 rounded py-1.5 px-3">
                {label}
              </h3>
              <TeamEncounterCard
                encounter={enc}
                getTeamName={getTeamName}
                onGameResult={onGameResult}
              />
            </div>
          );
        })}
      </div>

      {/* 最終順位表 */}
      {allDone && standings.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-base font-bold text-slate-700 flex items-center gap-2">
            <Medal className="w-5 h-5 text-amber-500" />
            最終順位
          </h3>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden max-w-xs shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="py-2 px-4 text-left text-xs font-semibold text-slate-600">順位</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold text-slate-600">チーム</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr
                    key={s.rank}
                    className={`border-t border-slate-100 ${s.rank === 1 ? 'bg-amber-50' : s.rank === 2 ? 'bg-slate-50' : ''}`}
                  >
                    <td className="py-2 px-4 font-bold text-slate-700">
                      {RANK_ICON[s.rank] ?? s.rank} 位
                    </td>
                    <td className="py-2 px-4 font-medium">{getTeamName(s.teamId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!allDone && (
        <p className="text-xs text-center text-slate-400 mt-2">
          全順位決定戦が完了すると最終順位が確定します
        </p>
      )}
    </div>
  );
}
