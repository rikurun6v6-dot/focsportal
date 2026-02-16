import type { Team, Player, TeamBattle, SubMatch, TeamStanding } from '@/types';

export function createTeamsFromPlayers(
  players: Player[],
  numTeams: number = 8
): Team[] {
  const maleDiv1 = players.filter(p => p.gender === 'male' && p.division === 1);
  const maleDiv2 = players.filter(p => p.gender === 'male' && p.division === 2);
  const femaleDiv1 = players.filter(p => p.gender === 'female' && p.division === 1);
  const femaleDiv2 = players.filter(p => p.gender === 'female' && p.division === 2);
  
  const teams: Team[] = [];
  for (let i = 0; i < numTeams; i++) {
    teams.push({
      id: `team_${String.fromCharCode(97 + i)}`,
      name: `チーム${String.fromCharCode(65 + i)}`,
      group: i < numTeams / 2 ? 'A' : 'B',
      player_ids: [],
      wins: 0,
      losses: 0,
      game_points_won: 0,
      game_points_lost: 0
    });
  }
  
  [maleDiv1, maleDiv2, femaleDiv1, femaleDiv2].forEach(pool => {
    pool.forEach((player, idx) => {
      const teamIdx = idx % numTeams;
      teams[teamIdx].player_ids.push(player.id);
    });
  });
  
  return teams;
}

export function generateRoundRobinMatches(teams: Team[]): TeamBattle[] {
  const battles: TeamBattle[] = [];
  const groupA = teams.filter(t => t.group === 'A');
  const groupB = teams.filter(t => t.group === 'B');
  
  [groupA, groupB].forEach(group => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        battles.push({
          id: `battle_${group[i].id}_${group[j].id}`,
          team1_id: group[i].id,
          team2_id: group[j].id,
          sub_matches: [],
          team1_score: 0,
          team2_score: 0,
          winner_id: null,
          phase: 'preliminary',
          completed: false,
          created_at: new Date() as any
        });
      }
    }
  });
  
  return battles;
}

export function calculateStandings(
  teams: Team[],
  battles: TeamBattle[]
): TeamStanding[] {
  const standings = teams.map(team => ({
    ...team,
    rank: 0,
    game_diff: team.game_points_won - team.game_points_lost
  }));
  
  standings.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    
    const headToHead = battles.find(
      battle =>
        (battle.team1_id === a.id && battle.team2_id === b.id) ||
        (battle.team1_id === b.id && battle.team2_id === a.id)
    );
    
    if (headToHead && headToHead.winner_id) {
      if (headToHead.winner_id === a.id) return -1;
      if (headToHead.winner_id === b.id) return 1;
    }
    
    return b.game_diff - a.game_diff;
  });
  
  standings.forEach((team, idx) => {
    team.rank = idx + 1;
  });
  
  return standings;
}

export function generatePlacementMatches(standings: TeamStanding[]): TeamBattle[] {
  const groupA = standings.filter(t => t.group === 'A');
  const groupB = standings.filter(t => t.group === 'B');
  
  const battles: TeamBattle[] = [];
  
  for (let rank = 0; rank < Math.min(groupA.length, groupB.length); rank++) {
    if (groupA[rank] && groupB[rank]) {
      battles.push({
        id: `placement_${rank + 1}_${groupA[rank].id}_${groupB[rank].id}`,
        team1_id: groupA[rank].id,
        team2_id: groupB[rank].id,
        sub_matches: [],
        team1_score: 0,
        team2_score: 0,
        winner_id: null,
        phase: 'placement',
        completed: false,
        created_at: new Date() as any
      });
    }
  }
  
  return battles;
}
