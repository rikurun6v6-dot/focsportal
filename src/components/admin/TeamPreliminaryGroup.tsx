'use client';

import { Trophy, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TeamEncounter, TeamRankEntry } from '@/types';
import TeamEncounterCard from './TeamEncounterCard';
import TeamStandingsTable from '../TeamStandingsTable';
import { DEFAULT_TEAM_RANK_ORDER, type TeamRankCriterion } from '@/lib/tournament-logic';

interface TeamPreliminaryGroupProps {
  groups: string[];
  encountersByGroup: Record<string, TeamEncounter[]>;
  rankingsByGroup: Record<string, TeamRankEntry[]>;
  jankenPairsByGroup?: Record<string, [string, string][]>;
  manualRanksByGroup?: Record<string, string[]>;
  rankOrder?: TeamRankCriterion[];
  /** 「予選結果を確定」を押した後だけ、じゃんけん入力を出す */
  showJanken?: boolean;
  getTeamName: (id: string) => string;
  onScore?: (encounterId: string, winnerSide: 1 | 2, winnerGames: number) => void;
  onClearScore?: (encounterId: string) => void;
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
  rankOrder = DEFAULT_TEAM_RANK_ORDER,
  showJanken = false,
  getTeamName,
  onScore,
  onClearScore,
  onJanken,
  onManualRankChange,
  readOnly = false,
}: TeamPreliminaryGroupProps) {
  const move = (group: string, idx: number, dir: -1 | 1) => {
    const rankings = rankingsByGroup[group] ?? [];
    const target = idx + dir;
    if (target < 0 || target >= rankings.length) return;
    const newOrder = rankings.map(r => r.teamId);
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    onManualRankChange?.(group, newOrder);
  };

  /** 対戦をラウンド（巡）ごとにまとめる。round が無い古いデータは1つにまとまる */
  const roundsOf = (list: TeamEncounter[]) => {
    const byRound = new Map<number, TeamEncounter[]>();
    for (const e of list) {
      const r = e.round ?? 0;
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r)!.push(e);
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, l]) => ({ round, list: l }));
  };

  // 3グループまでは画面幅で割り付ける。Tailwind は動的なクラス名を拾えないので固定文字列で持つ
  const useGrid = groups.length > 0 && groups.length <= 3;
  const gridColsClass =
    groups.length === 1 ? 'grid-cols-1'
      : groups.length === 2 ? 'grid-cols-1 md:grid-cols-2'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div>
      <h2 className="text-lg font-bold text-violet-700 mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5" />
        予選グループ
      </h2>

      {/* グループが3つまでなら画面幅いっぱいに並べる（横スクロールさせない）。
          4つ以上は幅が足りないので従来どおり横スクロール。 */}
      <div className={useGrid ? 'pb-4' : 'overflow-x-auto pb-4'}>
        <div className={useGrid ? `grid gap-5 ${gridColsClass}` : 'flex gap-4 min-w-max p-2'}>
          {groups.map(group => {
            const encounters = encountersByGroup[group] ?? [];
            const rankings = rankingsByGroup[group] ?? [];
            const jankenPairs = jankenPairsByGroup?.[group] ?? [];
            const isManual = (manualRanksByGroup?.[group] ?? []).length > 0;

            return (
              <div key={group} className={`flex flex-col gap-3 ${useGrid ? 'min-w-0' : 'w-80'}`}>
                <h3 className="text-center font-bold text-violet-700 text-sm bg-violet-100 rounded-md py-2 px-2 shadow-sm">
                  グループ {group}
                </h3>

                {/* 順位表を最上部に。入力しながら順位の変化を追えるようにする */}
                <TeamStandingsTable
                  rankings={rankings}
                  getTeamName={getTeamName}
                  rankOrder={rankOrder}
                  isManual={isManual}
                  onResetManual={!readOnly ? () => onManualRankChange?.(group, []) : undefined}
                  onMoveUp={!readOnly && onManualRankChange ? (i) => move(group, i, -1) : undefined}
                  onMoveDown={!readOnly && onManualRankChange ? (i) => move(group, i, 1) : undefined}
                />

                {/* じゃんけん入力: 「予選結果を確定」を押して、それでも並んだままのときだけ出す */}
                {!readOnly && showJanken && jankenPairs.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1">
                      <Scissors className="w-3.5 h-3.5" />
                      順位が決まらないのでじゃんけんで決めてください
                    </p>
                    {jankenPairs.map(([t1, t2]) => (
                      <div key={`${t1}_${t2}`} className="bg-white border border-amber-200 rounded-md p-2 space-y-1.5">
                        <p className="text-xs text-slate-700 font-medium text-center">
                          {getTeamName(t1)} と {getTeamName(t2)}
                        </p>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-10 text-xs font-bold border-blue-200 text-blue-700 hover:bg-blue-50"
                            onClick={() => onJanken?.(t1, t2, t1)}
                          >
                            {getTeamName(t1)} 勝ち
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-10 text-xs font-bold border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => onJanken?.(t1, t2, t2)}
                          >
                            {getTeamName(t2)} 勝ち
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 対戦一覧: ラウンドごとにまとめ、カードは折りたたむ */}
                <div className="space-y-2">
                  {roundsOf(encounters).map(({ round, list }) => (
                    <div key={round} className="space-y-1.5">
                      <div className="flex items-center justify-between px-0.5">
                        <p className="text-xs font-bold text-slate-600">
                          {round > 0 ? `第${round}巡` : '対戦'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {list.filter(e => e.completed).length}/{list.length} 入力済み
                        </p>
                      </div>
                      {list.map(enc => (
                        <TeamEncounterCard
                          key={enc.id}
                          encounter={enc}
                          getTeamName={getTeamName}
                          onScore={onScore}
                          onClear={onClearScore}
                          readOnly={readOnly}
                          collapsible
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
