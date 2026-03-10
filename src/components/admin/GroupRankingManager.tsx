'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateGroupStandings, rankStandings, needsManualIntervention, type GroupStanding } from '@/lib/group-ranking';
import { getMatchesByTournament, getAllPlayers, updateDocument } from '@/lib/firestore-helpers';
import { useCamp } from '@/context/CampContext';
import type { Match, Player, TournamentType, Division, TeamGroup } from '@/types';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toastSuccess, toastError, toastInfo } from '@/lib/toast';

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

    // グループごとに成績を集計
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

    // 再ソート
    const preliminaryMatches = matches.filter(m => m.phase === 'preliminary' && m.division === division);
    const sorted = rankStandings(updated, preliminaryMatches, group);
    const newMap = new Map(groupStandings);
    newMap.set(group, sorted);
    setGroupStandings(newMap);
  };

  const handlePromoteAllToKnockout = async (qualifiersPerGroup: number) => {
    const groups = Array.from(groupStandings.keys()).sort();

    // 全グループの順位が確定しているか確認
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

    // 全グループの進出者を収集
    const qualifiersByGroup: Map<string, GroupStanding[]> = new Map();
    groups.forEach(group => {
      const standings = groupStandings.get(group)!;
      qualifiersByGroup.set(group, standings.slice(0, qualifiersPerGroup));
    });

    // 決勝トーナメントのround=1の試合を取得
    const knockoutMatches = matches.filter(
      m => m.phase === 'knockout' && m.round === 1 && m.division === division
    ).sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

    if (knockoutMatches.length === 0) {
      alert('決勝トーナメントの試合が見つかりません');
      return;
    }

    // クロスマッチング: 同グループの選手が反対ブロックに入るように配置
    // flat = [A1,B1,..(順位1 forward), D2,C2,..(順位2 reversed), A3,B3,..(順位3 forward), ...]
    const flat: GroupStanding[] = [];
    for (let rank = 0; rank < qualifiersPerGroup; rank++) {
      const rankSlice = groups.map(g => qualifiersByGroup.get(g)![rank]);
      if (rank % 2 === 0) {
        flat.push(...rankSlice); // 奇数順位: グループ順
      } else {
        flat.push(...rankSlice.slice().reverse()); // 偶数順位: 逆順
      }
    }

    // BYEスロット（is_walkover=true）は先頭シードが1人で入り、実試合スロットは2人ペア
    const byeSlots = knockoutMatches.filter(m => m.is_walkover);
    const realSlots = knockoutMatches.filter(m => !m.is_walkover);

    const byeSeeds = flat.slice(0, byeSlots.length);
    const remainders = flat.slice(byeSlots.length);
    const remHalf = Math.floor(remainders.length / 2);
    const remTops = remainders.slice(0, remHalf);
    const remBottoms = remainders.slice(remHalf); // 既に逆順済み（偶数ランクで反転済み）

    try {
      const { updateDocument } = await import('@/lib/firestore-helpers');

      // BYEスロット: player1のみ設定（walkover_winner=1なので自動勝ち抜け）
      for (let i = 0; i < Math.min(byeSeeds.length, byeSlots.length); i++) {
        const seed = byeSeeds[i];
        await updateDocument('matches', byeSlots[i].id, {
          player1_id: seed.playerId,
          player3_id: seed.partnerId || '',
          player2_id: '',
          player4_id: '',
        });
      }

      // 実試合スロット: tops vs bottoms クロスマッチング
      for (let i = 0; i < Math.min(remTops.length, remBottoms.length, realSlots.length); i++) {
        await updateDocument('matches', realSlots[i].id, {
          player1_id: remTops[i].playerId,
          player3_id: remTops[i].partnerId || '',
          player2_id: remBottoms[i].playerId,
          player4_id: remBottoms[i].partnerId || '',
        });
      }

      alert('全グループの進出者を決勝トーナメントに設定しました');
      await loadData();
    } catch (error) {
      console.error('Error promoting to knockout:', error);
      alert('エラーが発生しました');
    }
  };

  if (!camp) return <p>合宿を選択してください</p>;

  if (loading) return <p>読み込み中...</p>;

  const groups = Array.from(groupStandings.keys()).sort();

  return (
    <>
      <ConfirmDialog />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>予選リーグ順位管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Select value={tournamentType} onValueChange={(v) => setTournamentType(v as TournamentType)}>
              <SelectTrigger className="w-48">
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
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1部</SelectItem>
                <SelectItem value="2">2部</SelectItem>
              </SelectContent>
            </Select>

            <Button onClick={loadData} variant="outline">
              再読み込み
            </Button>
          </div>

          {groups.length > 0 && (() => {
            const preliminaryMatches = matches.filter(m => m.phase === 'preliminary' && m.division === division);
            const totalMatches = preliminaryMatches.length;
            const completedMatches = preliminaryMatches.filter(m => m.status === 'completed').length;
            const progressPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

            return (
              <>
                {/* 進捗バー */}
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
                  <p className="text-sm text-gray-600 mb-2">全グループの順位確定後、決勝トーナメントへ一括進出</p>
                  <div className="flex gap-2">
                    <Button onClick={() => handlePromoteAllToKnockout(2)} variant="default">
                      全グループ上位2名を決勝Tへ
                    </Button>
                    <Button onClick={() => handlePromoteAllToKnockout(1)} variant="outline">
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">順位</th>
                    <th className="text-left p-2">選手</th>
                    <th className="text-center p-2">勝</th>
                    <th className="text-center p-2">敗</th>
                    <th className="text-center p-2">得失G</th>
                    <th className="text-center p-2">得失点</th>
                    <th className="text-left p-2">順位変更</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing, index) => (
                    <tr key={`${standing.playerId}-${standing.partnerId}`} className="border-b">
                      <td className="p-2 font-bold">{standing.rank}</td>
                      <td className="p-2">
                        {standing.playerName}
                        {standing.partnerName && ` / ${standing.partnerName}`}
                      </td>
                      <td className="p-2 text-center">{standing.wins}</td>
                      <td className="p-2 text-center">{standing.losses}</td>
                      <td className="p-2 text-center">{standing.gameDiff > 0 ? `+${standing.gameDiff}` : standing.gameDiff}</td>
                      <td className="p-2 text-center">{standing.pointDiff > 0 ? `+${standing.pointDiff}` : standing.pointDiff}</td>
                      <td className="p-2">
                        <Select
                          value={String(standing.rank)}
                          onValueChange={(v) => handleRankChange(group, index, parseInt(v))}
                        >
                          <SelectTrigger className="w-20">
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
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </>
  );
}
