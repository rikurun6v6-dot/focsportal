import { Card, CardContent } from "@/components/ui/card";
import { Users, Trophy } from "lucide-react";
import type { Match, Player } from "@/types";

interface PreliminaryGroupProps {
  groups: string[];
  groupMatches: { [group: string]: Match[] };
  getPlayerDisplay: (playerId: string | undefined, match: Match, position: 1 | 2) => string;
  getPlayerName: (playerId?: string) => string;
}

export default function PreliminaryGroup({
  groups,
  groupMatches,
  getPlayerDisplay,
  getPlayerName,
}: PreliminaryGroupProps) {
  return (
    <div>
      <h2 className="text-lg font-bold text-violet-700 mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5" />
        予選リーグ
      </h2>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max p-4">
          {groups.map(group => (
            <div key={group} className="flex flex-col gap-3 min-w-[220px]">
              <h3 className="text-center font-bold text-violet-700 dark:text-violet-300 text-xs bg-violet-100 dark:bg-violet-900/30 rounded-md py-1.5 px-2 shadow-sm">
                グループ {group}
              </h3>
              <div className="flex flex-col gap-3">
                {(groupMatches[group] || []).map(match => {
                  const isDoubles = match.player3_id !== undefined;
                  return (
                    <Card
                      key={match.id}
                      className={`border shadow-sm transition-all ${match.status === 'completed'
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
                          : match.status === 'playing'
                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                        }`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className={`flex items-start gap-1.5 p-2 rounded-md transition-colors ${match.winner_id && (match.winner_id === match.player1_id || match.winner_id === match.player3_id)
                            ? 'bg-amber-100 dark:bg-amber-900/30 font-bold'
                            : 'bg-slate-50 dark:bg-slate-700/50'
                          }`}>
                          <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 text-xs leading-relaxed">
                            <div className="break-words">
                              {getPlayerDisplay(match.player1_id, match, 1)}
                              {isDoubles && match.player3_id && (
                                <span className="text-slate-600 dark:text-slate-400"> / {getPlayerName(match.player3_id)}</span>
                              )}
                            </div>
                            {match.seed_p1 && (
                              <span className="inline-block mt-1 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">
                                第{match.seed_p1}
                              </span>
                            )}
                          </div>
                          {match.status === 'completed' && (
                            <span className="ml-auto font-bold text-slate-800 dark:text-slate-100 shrink-0">
                              {match.score_p1}
                            </span>
                          )}
                        </div>
                        <div className={`flex items-start gap-1.5 p-2 rounded-md transition-colors ${match.winner_id && (match.winner_id === match.player2_id || match.winner_id === match.player4_id)
                            ? 'bg-amber-100 dark:bg-amber-900/30 font-bold'
                            : 'bg-slate-50 dark:bg-slate-700/50'
                          }`}>
                          <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 text-xs leading-relaxed">
                            <div className="break-words">
                              {getPlayerDisplay(match.player2_id, match, 2)}
                              {isDoubles && match.player4_id && (
                                <span className="text-slate-600 dark:text-slate-400"> / {getPlayerName(match.player4_id)}</span>
                              )}
                            </div>
                            {match.seed_p2 && (
                              <span className="inline-block mt-1 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">
                                第{match.seed_p2}
                              </span>
                            )}
                          </div>
                          {match.status === 'completed' && (
                            <span className="ml-auto font-bold text-slate-800 dark:text-slate-100 shrink-0">
                              {match.score_p2}
                            </span>
                          )}
                        </div>
                        {match.status === 'playing' && (
                          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium text-center bg-blue-100 dark:bg-blue-900/30 rounded py-1">
                            試合中
                          </p>
                        )}
                        {match.status === 'calling' && (
                          <p className="text-xs text-orange-700 dark:text-orange-400 font-medium text-center bg-orange-100 dark:bg-orange-900/30 rounded py-1">
                            試合中
                          </p>
                        )}
                        {match.phase === 'preliminary' && (
                          <p className="text-xs text-violet-700 dark:text-violet-400 font-medium text-center mt-1 pt-2 border-t border-slate-200 dark:border-slate-600">
                            予選リーグ戦
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 勝敗マトリックス表 */}
      <div className="mt-6">
        <h3 className="text-md font-bold text-violet-700 mb-3">勝敗表</h3>
        <div className="overflow-x-auto">
          <div className="flex gap-6">
            {groups.map(group => {
              const matches = groupMatches[group] || [];
              const pairIds = new Set<string>();
              matches.forEach(m => {
                pairIds.add(m.player1_id + (m.player3_id ? `-${m.player3_id}` : ''));
                pairIds.add(m.player2_id + (m.player4_id ? `-${m.player4_id}` : ''));
              });
              const pairs = Array.from(pairIds);

              return (
                <div key={group} className="min-w-max">
                  <h4 className="text-center font-semibold text-slate-700 text-sm mb-2">Group {group}</h4>
                  <table className="border border-slate-300">
                    <thead>
                      <tr>
                        <th className="border border-slate-300 bg-slate-100 p-2 text-xs"></th>
                        {pairs.map((pairId, idx) => {
                          const [p1, p3] = pairId.split('-');
                          return (
                            <th key={idx} className="border border-slate-300 bg-slate-100 p-2 text-xs">
                              {getPlayerName(p1)}{p3 && `/${getPlayerName(p3)}`}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((pairId1, rowIdx) => {
                        const [p1, p3] = pairId1.split('-');
                        return (
                          <tr key={rowIdx}>
                            <td className="border border-slate-300 bg-slate-100 p-2 text-xs font-medium">
                              {getPlayerName(p1)}{p3 && `/${getPlayerName(p3)}`}
                            </td>
                            {pairs.map((pairId2, colIdx) => {
                              if (pairId1 === pairId2) {
                                return <td key={colIdx} className="border border-slate-300 bg-slate-200 p-2 text-center text-xs">-</td>;
                              }
                              const [p2, p4] = pairId2.split('-');
                              const match = matches.find(m =>
                                (m.player1_id === p1 && (m.player3_id || '') === (p3 || '') && m.player2_id === p2 && (m.player4_id || '') === (p4 || '')) ||
                                (m.player2_id === p1 && (m.player4_id || '') === (p3 || '') && m.player1_id === p2 && (m.player3_id || '') === (p4 || ''))
                              );
                              if (!match || match.status !== 'completed') {
                                return <td key={colIdx} className="border border-slate-300 p-2 text-center text-xs text-slate-400">-</td>;
                              }
                              const isWin = (match.player1_id === p1 && match.winner_id === match.player1_id) ||
                                (match.player2_id === p1 && match.winner_id === match.player2_id);
                              return (
                                <td key={colIdx} className={`border border-slate-300 p-2 text-center text-xs font-bold ${isWin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                  {isWin ? '○' : '●'}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
