'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getAllPlayers, setDocument, getAllDocuments, deleteDocument } from '@/lib/firestore-helpers';
import { createTeamsFromPlayers, generateRoundRobinMatches, calculateStandings, generatePlacementMatches } from '@/lib/team-battle';
// ✅ 修正: TeamBattle を TeamBattleData に名前変更
import type { Team, Player, TeamBattle as TeamBattleData, TeamStanding } from '@/types';
import { Users, Trophy } from 'lucide-react';

export default function TeamBattle() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  // ✅ 修正: TeamBattleData 型を使用
  const [battles, setBattles] = useState<TeamBattleData[]>([]);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [numTeams, setNumTeams] = useState(8);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [playersData, teamsData, battlesData] = await Promise.all([
      getAllPlayers(),
      getAllDocuments<Team>('teams'),
      // ✅ 修正: TeamBattleData 型を使用
      getAllDocuments<TeamBattleData>('team_battles'),
    ]);

    setPlayers(playersData.filter(p => p.is_active));
    setTeams(teamsData);
    setBattles(battlesData);

    if (teamsData.length > 0 && battlesData.length > 0) {
      const standingsData = calculateStandings(teamsData, battlesData);
      setStandings(standingsData);
    }

    setLoading(false);
  };

  const handleCreateTeams = async () => {
    if (players.length < numTeams * 4) {
      alert(`最低${numTeams * 4}名の選手が必要です`);
      return;
    }

    if (!confirm(`${numTeams}チームを作成してもよろしいですか?`)) return;

    // Delete existing teams and battles
    for (const team of teams) {
      await deleteDocument('teams', team.id);
    }
    for (const battle of battles) {
      await deleteDocument('team_battles', battle.id);
    }

    // Create new teams
    const newTeams = createTeamsFromPlayers(players, numTeams);
    for (const team of newTeams) {
      await setDocument('teams', team);
    }

    // Generate round-robin matches
    const newBattles = generateRoundRobinMatches(newTeams);
    for (const battle of newBattles) {
      await setDocument('team_battles', battle);
    }

    await loadData();
  };

  const handleGeneratePlacementMatches = async () => {
    if (standings.length === 0) {
      alert('まず予選リーグを完了してください');
      return;
    }

    if (!confirm('順位戦を生成してもよろしいですか?')) return;

    const placementBattles = generatePlacementMatches(standings);
    for (const battle of placementBattles) {
      await setDocument('team_battles', battle);
    }

    await loadData();
  };

  const handleUpdateBattleResult = async (battleId: string, winnerId: string) => {
    const battle = battles.find(b => b.id === battleId);
    if (!battle) return;

    const team1Score = winnerId === battle.team1_id ? 3 : 2;
    const team2Score = winnerId === battle.team2_id ? 3 : 2;

    // Update battle
    // ✅ 修正: TeamBattleData 型を使用
    await setDocument<TeamBattleData>('team_battles', {
      ...battle,
      team1_score: team1Score,
      team2_score: team2Score,
      winner_id: winnerId,
      completed: true,
    });

    // Update team records
    const team1 = teams.find(t => t.id === battle.team1_id);
    const team2 = teams.find(t => t.id === battle.team2_id);

    // ✅ 修正: 両方のチームが存在する場合のみ更新する（エラー防止）
    if (team1 && team2) {
      await setDocument<Team>('teams', {
        ...team1,
        wins: team1.wins + (winnerId === team1.id ? 1 : 0),
        losses: team1.losses + (winnerId === team2.id ? 1 : 0),
        game_points_won: team1.game_points_won + team1Score,
        game_points_lost: team1.game_points_lost + team2Score,
      });

      await setDocument<Team>('teams', {
        ...team2,
        wins: team2.wins + (winnerId === team2.id ? 1 : 0),
        losses: team2.losses + (winnerId === team1.id ? 1 : 0),
        game_points_won: team2.game_points_won + team2Score,
        game_points_lost: team2.game_points_lost + team1Score,
      });
    }

    await loadData();
  };

  if (loading) {
    return <p className="text-gray-600 dark:text-gray-400">読み込み中...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm md:text-base">チーム編成</CardTitle>
          <CardDescription>
            登録されている選手を均等に{numTeams}チームに振り分けます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">チーム数:</label>
            <select
              value={numTeams}
              onChange={(e) => setNumTeams(parseInt(e.target.value))}
              className="h-10 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3"
            >
              <option value="4">4チーム</option>
              <option value="6">6チーム</option>
              <option value="8">8チーム</option>
            </select>
            <Badge variant="outline">
              <Users className="w-4 h-4 mr-1" />
              {players.length}名登録済み
            </Badge>
          </div>
          <Button onClick={handleCreateTeams} className="w-full">
            チームを作成 (予選リーグも自動生成)
          </Button>
        </CardContent>
      </Card>

      {teams.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm md:text-base">予選リーグ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['A', 'B'].map((group) => {
                  const groupTeams = teams.filter((t) => t.group === group);
                  const groupBattles = battles.filter(
                    (b) =>
                      b.phase === 'preliminary' &&
                      groupTeams.some((t) => t.id === b.team1_id || t.id === b.team2_id)
                  );

                  return (
                    <div key={group}>
                      <h3 className="font-bold mb-3">グループ{group}</h3>
                      <div className="space-y-2">
                        {groupBattles.map((battle) => {
                          const team1 = teams.find((t) => t.id === battle.team1_id);
                          const team2 = teams.find((t) => t.id === battle.team2_id);

                          return (
                            <div
                              key={battle.id}
                              className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{team1?.name}</span>
                                <span className="text-xs text-gray-500">vs</span>
                                <span className="text-sm font-medium">{team2?.name}</span>
                              </div>
                              {battle.completed ? (
                                <Badge variant={battle.winner_id === team1?.id ? 'default' : 'secondary'}>
                                  {battle.winner_id === team1?.id ? team1?.name : team2?.name} 勝利
                                </Badge>
                              ) : (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUpdateBattleResult(battle.id, team1!.id)}
                                  >
                                    {team1?.name} 勝利
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUpdateBattleResult(battle.id, team2!.id)}
                                  >
                                    {team2?.name} 勝利
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {standings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm md:text-base">順位表</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['A', 'B'].map((group) => {
                    const groupStandings = standings.filter((s) => s.group === group);

                    return (
                      <div key={group}>
                        <h3 className="font-bold mb-3">グループ{group}</h3>
                        <div className="space-y-2">
                          {groupStandings.map((standing) => (
                            <div
                              key={standing.id}
                              className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
                            >
                              <div className="flex items-center gap-2">
                                {standing.rank === 1 && <Trophy className="w-4 h-4 text-yellow-500" />}
                                <span className="font-medium">
                                  {standing.rank}位 {standing.name}
                                </span>
                              </div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">
                                {standing.wins}勝 {standing.losses}敗 (得失: {standing.game_diff})
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm md:text-base">順位戦</CardTitle>
              <CardDescription>予選リーグの同順位同士で対戦</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleGeneratePlacementMatches} variant="outline" className="w-full">
                順位戦を生成
              </Button>
              <div className="mt-4 space-y-2">
                {battles
                  .filter((b) => b.phase === 'placement')
                  .map((battle) => {
                    const team1 = teams.find((t) => t.id === battle.team1_id);
                    const team2 = teams.find((t) => t.id === battle.team2_id);

                    return (
                      <div
                        key={battle.id}
                        className="p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{team1?.name}</span>
                          <span className="text-xs text-gray-500">vs</span>
                          <span className="text-sm font-medium">{team2?.name}</span>
                        </div>
                        {battle.completed ? (
                          <Badge variant="default">
                            {battle.winner_id === team1?.id ? team1?.name : team2?.name} 勝利
                          </Badge>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateBattleResult(battle.id, team1!.id)}
                            >
                              {team1?.name} 勝利
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateBattleResult(battle.id, team2!.id)}
                            >
                              {team2?.name} 勝利
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}