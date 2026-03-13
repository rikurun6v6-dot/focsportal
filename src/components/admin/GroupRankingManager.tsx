'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateGroupStandings, rankStandings, needsManualIntervention, compareStandings, getLossRatio, type GroupStanding } from '@/lib/group-ranking';
import { getMatchesByTournament, getAllPlayers, updateDocument } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import type { Match, Player, TournamentType, Division, TeamGroup } from '@/types';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError } from '@/lib/toast';

export default function GroupRankingManager() {
  const { camp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [tournamentType, setTournamentType] = useState<TournamentType>('mens_doubles');
  const [division, setDivision] = useState<Division>(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [groupStandings, setGroupStandings] = useState<Map<string, GroupStanding[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!camp) return;
    loadData();
  }, [tournamentType, division, camp]);

  const loadData = async () => {
    if (!camp) return;
    setLoading(true);

    const [matchList, playerList] = await Promise.all([
      getMatchesByTournament(tournamentType, camp.id),
      getAllPlayers(camp.id)
    ]);

    setMatches(matchList);
    setPlayers(playerList);

    const preliminaryMatches = matchList.filter(m => m.phase === 'preliminary' && m.division === division);
    const groups = [...new Set(preliminaryMatches.map(m => m.group).filter(g => g))] as TeamGroup[];

    const standingsMap = new Map<string, GroupStanding[]>();
    groups.forEach(group => {
      const standings = calculateGroupStandings(preliminaryMatches, playerList, group);
      const ranked = rankStandings(standings, preliminaryMatches, group);
      standingsMap.set(group, ranked);
    });

    setGroupStandings(standingsMap);
    setLoading(false);
  };

  const handleRankChange = (group: string, standingIndex: number, newRank: number) => {
    const standings = groupStandings.get(group);
    if (!standings) return;

    const updated = [...standings];
    updated[standingIndex].rank = newRank;

    const preliminaryMatches = matches.filter(m => m.phase === 'preliminary' && m.division === division);
    const sorted = rankStandings(updated, preliminaryMatches, group);
    const newMap = new Map(groupStandings);
    newMap.set(group, sorted);
    setGroupStandings(newMap);
  };

  /**
   * グループ1位選手の中から全体1位（スーパーシード）を特定する
   */
  const getSuperSeed = (): GroupStanding | null => {
    const groups = Array.from(groupStandings.keys()).sort();
    if (groups.length < 3) return null; // 3グループ以上で有効

    const rank1Players = groups
      .map(g => groupStandings.get(g)?.[0])
      .filter(Boolean) as GroupStanding[];

    if (rank1Players.length < 2) return null;

    const preliminaryMatches = matches.filter(m => m.phase === 'preliminary' && m.division === division);
    const sorted = [...rank1Players].sort((a, b) => compareStandings(a, b, preliminaryMatches));
    return sorted[0];
  };

  const handlePromoteAllToKnockout = async (qualifiersPerGroup: number) => {
    const groups = Array.from(groupStandings.keys()).sort();

    for (const group of groups) {
      const standings = groupStandings.get(group);
      if (!standings || standings.length < qualifiersPerGroup) {
        toastError(`グループ${group}の順位が確定していません`);
        return;
      }
    }

    const confirmed = await confirm({
      title: '🏆 決勝トーナメント進出',
      message: `全グループの上位${qualifiersPerGroup}名を決勝トーナメントに進出させますか？`,
      confirmText: '進出させる',
      cancelText: 'キャンセル',
      type: 'success',
    });
    if (!confirmed) return;

    const qualifiersByGroup: Map<string, GroupStanding[]> = new Map();
    groups.forEach(group => {
      const standings = groupStandings.get(group)!;
      qualifiersByGroup.set(group, standings.slice(0, qualifiersPerGroup));
    });

    const knockoutMatches = matches.filter(
      m => m.phase === 'knockout' && m.round === 1 && m.division === division
    ).sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

    if (knockoutMatches.length === 0) {
      toastError('決勝トーナメントの試合が見つかりません');
      return;
    }

    // スーパーシードを特定（3グループ以上の場合）
    const superSeed = getSuperSeed();

    // flat配列を構築: スーパーシードを先頭に確保
    const flat: GroupStanding[] = [];

    if (superSeed && groups.length >= 3) {
      // スーパーシードを先頭に配置
      flat.push(superSeed);

      // 残りのrank1選手をスーパーシード以外で配置
      const otherRank1 = groups
        .map(g => qualifiersByGroup.get(g)![0])
        .filter(s => s.playerId !== superSeed.playerId || s.partnerId !== superSeed.partnerId);
      flat.push(...otherRank1);

      // rank2以降を追加（偶数ランクは逆順）
      for (let rank = 1; rank < qualifiersPerGroup; rank++) {
        const rankSlice = groups.map(g => qualifiersByGroup.get(g)![rank]);
        if (rank % 2 === 0) {
          flat.push(...rankSlice);
        } else {
          flat.push(...rankSlice.slice().reverse());
        }
      }
    } else {
      // 標準クロスマッチング
      for (let rank = 0; rank < qualifiersPerGroup; rank++) {
        const rankSlice = groups.map(g => qualifiersByGroup.get(g)![rank]);
        if (rank % 2 === 0) {
          flat.push(...rankSlice);
        } else {
          flat.push(...rankSlice.slice().reverse());
        }
      }
    }

    const byeSlots = knockoutMatches.filter(m => m.is_walkover);
    const realSlots = knockoutMatches.filter(m => !m.is_walkover);

    const byeSeeds = flat.slice(0, byeSlots.length);
    const remainders = flat.slice(byeSlots.length);
    const remHalf = Math.floor(remainders.length / 2);
    const remTops = remainders.slice(0, remHalf);
    const remBottoms = remainders.slice(remHalf);

    try {
      for (let i = 0; i < Math.min(byeSeeds.length, byeSlots.length); i++) {
        const seed = byeSeeds[i];
        await updateDocument('matches', byeSlots[i].id, {
          player1_id: seed.playerId,
          player3_id: seed.partnerId || '',
          player2_id: '',
          player4_id: '',
        });
      }

      for (let i = 0; i < Math.min(remTops.length, remBottoms.length, realSlots.length); i++) {
        await updateDocument('matches', realSlots[i].id, {
          player1_id: remTops[i].playerId,
          player3_id: remTops[i].partnerId || '',
          player2_id: remBottoms[i].playerId,
          player4_id: remBottoms[i].partnerId || '',
        });
      }

      toastSuccess('全グループの進出者を決勝トーナメントに設定しました');
      await loadData();
    } catch (error) {
      console.error('Error promoting to knockout:', error);
      toastError('エラーが発生しました');
    }
  };

  if (!camp) return <p>合宿を選択してください</p>;
  if (loading) return <p>読み込み中...</p>;

  const groups = Array.from(groupStandings.keys()).sort();
  const superSeed = getSuperSeed();

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>予選リーグ順位管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 種目・部選択 */}
            <div className="flex flex-wrap gap-3">
              <Select value={tournamentType} onValueChange={(v) => setTournamentType(v as TournamentType)}>
                <SelectTrigger className="w-48 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
                  <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
                  <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
                  <SelectItem value="mens_singles">男子シングルス</SelectItem>
                  <SelectItem value="womens_singles">女子シングルス</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(division)} onValueChange={(v) => setDivision(parseInt(v) as Division)}>
                <SelectTrigger className="w-32 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1部</SelectItem>
                  <SelectItem value="2">2部</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={loadData} variant="outline" className="h-11 px-5">
                再読み込み
              </Button>
            </div>

            {/* スーパーシード表示（3グループ以上） */}
            {superSeed && (
              <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center gap-2">
                <span className="text-lg">👑</span>
                <div>
                  <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">スーパーシード</p>
                  <p className="text-sm font-bold text-yellow-900">
                    {superSeed.playerName}
                    {superSeed.partnerName && ` / ${superSeed.partnerName}`}
                  </p>
                  <p className="text-xs text-yellow-700">
                    {superSeed.wins}勝 / 失点率 {(getLossRatio(superSeed) * 100).toFixed(1)}%
                  </p>
                </div>
                <p className="ml-auto text-xs text-yellow-700 max-w-[160px] text-right">
                  ブラケット上で最大BYE優遇配置されます
                </p>
              </div>
            )}

            {groups.length > 0 && (() => {
              const preliminaryMatches = matches.filter(m => m.phase === 'preliminary' && m.division === division);
              const totalMatches = preliminaryMatches.length;
              const completedMatches = preliminaryMatches.filter(m => m.status === 'completed').length;
              const progressPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

              return (
                <>
                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-slate-700">予選リーグ進捗</p>
                      <p className="text-sm text-slate-600">
                        {completedMatches} / {totalMatches} 試合完了 ({progressPercent}%)
                      </p>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${progressPercent}%` }}
                      >
                        {progressPercent > 10 && (
                          <span className="text-[10px] font-bold text-white">{progressPercent}%</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-3">全グループの順位確定後、決勝トーナメントへ一括進出</p>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => handlePromoteAllToKnockout(2)} variant="default" className="h-11">
                        全グループ上位2名を決勝Tへ
                      </Button>
                      <Button onClick={() => handlePromoteAllToKnockout(1)} variant="outline" className="h-11">
                        全グループ1位のみ決勝Tへ
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        {groups.length === 0 && (
          <p className="text-gray-600">予選リーグの試合がありません</p>
        )}

        {groups.map(group => {
          const standings = groupStandings.get(group) || [];
          const needsManual = needsManualIntervention(standings);

          return (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>グループ {group}</span>
                  {needsManual && (
                    <span className="text-sm text-amber-600 font-normal">
                      ⚠️ 同率のため手動で順位を設定してください
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="text-left p-2 md:p-3 whitespace-nowrap">順位</th>
                        <th className="text-left p-2 md:p-3">選手</th>
                        <th className="text-center p-2 md:p-3">勝</th>
                        <th className="text-center p-2 md:p-3">敗</th>
                        <th className="text-center p-2 md:p-3 whitespace-nowrap">失点率</th>
                        <th className="text-center p-2 md:p-3 whitespace-nowrap hidden md:table-cell">得失G</th>
                        <th className="text-left p-2 md:p-3 whitespace-nowrap">順位変更</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((standing, index) => {
                        const isSuperSeed = superSeed &&
                          standing.playerId === superSeed.playerId &&
                          standing.partnerId === superSeed.partnerId;
                        const lossRatio = getLossRatio(standing);

                        return (
                          <tr
                            key={`${standing.playerId}-${standing.partnerId}`}
                            className={`border-b transition-colors ${isSuperSeed ? 'bg-yellow-50' : 'hover:bg-slate-50'}`}
                          >
                            <td className="p-2 md:p-3 font-bold text-base">
                              {isSuperSeed ? '👑' : standing.rank}
                            </td>
                            <td className="p-2 md:p-3 font-medium">
                              {standing.playerName}
                              {standing.partnerName && ` / ${standing.partnerName}`}
                            </td>
                            <td className="p-2 md:p-3 text-center font-semibold text-emerald-700">{standing.wins}</td>
                            <td className="p-2 md:p-3 text-center text-rose-600">{standing.losses}</td>
                            <td className="p-2 md:p-3 text-center tabular-nums">
                              {(standing.totalPointsFor + standing.totalPointsAgainst) > 0
                                ? `${(lossRatio * 100).toFixed(1)}%`
                                : '-'}
                            </td>
                            <td className="p-2 md:p-3 text-center tabular-nums hidden md:table-cell">
                              {standing.gameDiff > 0 ? `+${standing.gameDiff}` : standing.gameDiff}
                            </td>
                            <td className="p-2 md:p-3">
                              <Select
                                value={String(standing.rank)}
                                onValueChange={(v) => handleRankChange(group, index, parseInt(v))}
                              >
                                <SelectTrigger className="w-20 h-10">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {standings.map((_, i) => (
                                    <SelectItem key={i} value={String(i + 1)}>
                                      {i + 1}位
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  順位決定基準: 勝利数 → 直接対決 → 失点率（低い方が上位）
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
