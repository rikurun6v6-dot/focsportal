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

    // クロスマッチング: A1 vs B2, C1 vs D2, B1 vs A2, D1 vs C2
    const matchups: Array<{ player1: GroupStanding; player2: GroupStanding }> = [];

    if (groups.length === 4 && qualifiersPerGroup === 2) {
      // 4グループ各2名通過の典型的なパターン
      const [A, B, C, D] = groups;
      const aStandings = qualifiersByGroup.get(A)!;
      const bStandings = qualifiersByGroup.get(B)!;
      const cStandings = qualifiersByGroup.get(C)!;
      const dStandings = qualifiersByGroup.get(D)!;

      matchups.push(
        { player1: aStandings[0], player2: bStandings[1] }, // A1 vs B2
        { player1: cStandings[0], player2: dStandings[1] }, // C1 vs D2
        { player1: bStandings[0], player2: aStandings[1] }, // B1 vs A2
        { player1: dStandings[0], player2: cStandings[1] }  // D1 vs C2
      );
    } else {
      // 一般的なケース: 順番に割り当て
      const allQualifiers: GroupStanding[] = [];
      groups.forEach(group => {
        const standings = qualifiersByGroup.get(group)!;
        allQualifiers.push(...standings);
      });

      for (let i = 0; i < allQualifiers.length; i += 2) {
        if (i + 1 < allQualifiers.length) {
          matchups.push({ player1: allQualifiers[i], player2: allQualifiers[i + 1] });
        }
      }
    }

    // 試合を更新
    try {
      const { updateDocument } = await import('@/lib/firestore-helpers');

      for (let i = 0; i < Math.min(matchups.length, knockoutMatches.length); i++) {
        const matchup = matchups[i];
        const match = knockoutMatches[i];

        await updateDocument('matches', match.id, {
          player1_id: matchup.player1.playerId,
          player3_id: matchup.player1.partnerId || '',
          player2_id: matchup.player2.playerId,
          player4_id: matchup.player2.partnerId || '',
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
