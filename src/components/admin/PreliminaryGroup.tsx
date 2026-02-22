import { Card, CardContent } from "@/components/ui/card";
import { Users, Trophy } from "lucide-react";
import type { Match } from "@/types";

interface PreliminaryGroupProps {
  groups: string[];
  groupMatches: { [group: string]: Match[] };
  getPlayerName: (playerId?: string) => string;
}

export default function PreliminaryGroup({
  groups,
  groupMatches,
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
              <h3 className="text-center font-bold text-violet-700 text-xs bg-violet-100 rounded-md py-1.5 px-2 shadow-sm">
                グループ {group}
              </h3>
              <div className="flex flex-col gap-3">
                {(groupMatches[group] || []).map(match => {
                  return (
                    <Card
                      key={match.id}
                      className={`bg-white border shadow-sm transition-all ${
                        match.status === "completed"
                          ? "border-emerald-300"
                          : match.status === "playing"
                          ? "border-blue-400"
                          : "border-slate-200"
                      }`}
                    >
                      <CardContent className="p-3 space-y-2 bg-white">
                        {/* ペア1 */}
                        <div
                          className={`flex items-start gap-1.5 p-2 rounded-md transition-colors ${
                            match.winner_id && (match.winner_id === match.player1_id || match.winner_id === match.player3_id)
                              ? "bg-amber-50"
                              : "bg-slate-50"
                          }`}
                        >
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 text-xs leading-relaxed text-slate-900">
                            <div className="break-words font-medium">
                              {getPlayerName(match.player1_id)}
                              {match.player3_id && ` / ${getPlayerName(match.player3_id)}`}
                              {match.player5_id && ` / ${getPlayerName(match.player5_id)}`}
                            </div>
                            {match.seed_p1 && (
                              <span className="inline-block mt-1 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">
                                第{match.seed_p1}シード
                              </span>
                            )}
                          </div>
                          {match.status === "completed" && (
                            <span className="ml-auto font-bold shrink-0 text-slate-900">
                              {match.score_p1}
                            </span>
                          )}
                        </div>

                        {/* ペア2 */}
                        <div
                          className={`flex items-start gap-1.5 p-2 rounded-md transition-colors ${
                            match.winner_id && (match.winner_id === match.player2_id || match.winner_id === match.player4_id)
                              ? "bg-amber-50"
                              : "bg-slate-50"
                          }`}
                        >
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0 text-xs leading-relaxed text-slate-900">
                            <div className="break-words font-medium">
                              {getPlayerName(match.player2_id)}
                              {match.player4_id && ` / ${getPlayerName(match.player4_id)}`}
                              {match.player6_id && ` / ${getPlayerName(match.player6_id)}`}
                            </div>
                            {match.seed_p2 && (
                              <span className="inline-block mt-1 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold">
                                第{match.seed_p2}シード
                              </span>
                            )}
                          </div>
                          {match.status === "completed" && (
                            <span className="ml-auto font-bold shrink-0 text-slate-900">
                              {match.score_p2}
                            </span>
                          )}
                        </div>

                        {match.status === "playing" && (
                          <p className="text-xs text-blue-700 font-medium text-center bg-blue-50 border border-blue-200 rounded py-1">
                            試合中
                          </p>
                        )}
                        {match.status === "calling" && (
                          <p className="text-xs text-orange-700 font-medium text-center bg-orange-50 border border-orange-200 rounded py-1">
                            呼出中
                          </p>
                        )}
                        {match.phase === "preliminary" && (
                          <p className="text-xs text-violet-600 font-medium text-center mt-1 pt-2 border-t border-slate-200">
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
                const key1 = [m.player1_id, m.player3_id, m.player5_id].filter(Boolean).join("-");
                const key2 = [m.player2_id, m.player4_id, m.player6_id].filter(Boolean).join("-");
                pairIds.add(key1);
                pairIds.add(key2);
              });
              const pairs = Array.from(pairIds);

              const pairLabel = (pairId: string) =>
                pairId.split("-").map(id => getPlayerName(id)).join(" / ");

              return (
                <div key={group} className="min-w-max">
                  <h4 className="text-center font-semibold text-slate-700 text-sm mb-2">Group {group}</h4>
                  <table className="border border-slate-200 shadow-sm rounded-lg overflow-hidden bg-white">
                    <thead>
                      <tr>
                        <th className="border border-slate-200 p-2 text-xs font-semibold bg-violet-50 text-violet-700"></th>
                        {pairs.map((pairId, idx) => (
                          <th key={idx} className="border border-slate-200 p-2 text-xs font-semibold bg-violet-50 text-violet-700">
                            {pairLabel(pairId)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((pairId1, rowIdx) => {
                        const [p1, p3, p5] = pairId1.split("-");
                        return (
                          <tr key={rowIdx}>
                            <td className="border border-slate-200 p-2 text-xs font-semibold bg-violet-50 text-violet-700">
                              {pairLabel(pairId1)}
                            </td>
                            {pairs.map((pairId2, colIdx) => {
                              if (pairId1 === pairId2) {
                                return <td key={colIdx} className="border border-slate-200 p-2 text-center text-xs font-bold bg-slate-100 text-slate-400">-</td>;
                              }
                              const [p2, p4, p6] = pairId2.split("-");
                              const match = matches.find(m =>
                                (m.player1_id === p1 && (m.player3_id || "") === (p3 || "") && (m.player5_id || "") === (p5 || "") &&
                                  m.player2_id === p2 && (m.player4_id || "") === (p4 || "") && (m.player6_id || "") === (p6 || "")) ||
                                (m.player2_id === p1 && (m.player4_id || "") === (p3 || "") && (m.player6_id || "") === (p5 || "") &&
                                  m.player1_id === p2 && (m.player3_id || "") === (p4 || "") && (m.player5_id || "") === (p6 || ""))
                              );
                              if (!match || match.status !== "completed") {
                                return <td key={colIdx} className="border border-slate-200 p-2 text-center text-xs bg-white text-slate-300">-</td>;
                              }
                              const isWin = (match.player1_id === p1 && match.winner_id === match.player1_id) ||
                                (match.player2_id === p1 && match.winner_id === match.player2_id);
                              return (
                                <td key={colIdx} className={`border border-slate-200 p-2 text-center text-xs font-bold ${
                                  isWin
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-red-50 text-red-700"
                                }`}>
                                  {isWin ? "○" : "●"}
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
