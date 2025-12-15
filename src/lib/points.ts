import { Match, Player, PointsDistribution, TournamentConfig } from '@/types';
import { getDocument, updateDocument, getAllDocuments } from './firestore-helpers';

export async function calculateTournamentRankings(
  matches: Match[],
  tournamentType: string
): Promise<Map<string, number>> {
  const rankings = new Map<string, number>();
  
  const tournamentMatches = matches.filter(
    m => m.tournament_type === tournamentType && m.status === 'completed'
  );
  
  if (tournamentMatches.length === 0) return rankings;
  
  const maxRound = Math.max(...tournamentMatches.map(m => m.round));
  
  for (const match of tournamentMatches) {
    const rank = Math.pow(2, maxRound - match.round + 1);
    
    if (match.winner_id) {
      const losers = [
        match.player1_id,
        match.player2_id,
        match.player3_id,
        match.player4_id
      ].filter((id): id is string => id !== undefined && id !== match.winner_id);
      
      losers.forEach(loserId => {
        if (!rankings.has(loserId)) {
          rankings.set(loserId, rank);
        }
      });
    }
  }
  
  const finalMatch = tournamentMatches.find(m => m.round === maxRound);
  if (finalMatch?.winner_id) {
    rankings.set(finalMatch.winner_id, 1);
  }
  
  return rankings;
}

export async function awardPointsForTournament(
  tournamentConfigId: string,
  matches: Match[]
): Promise<void> {
  const config = await getDocument<TournamentConfig>('tournament_configs', tournamentConfigId);
  if (!config) return;
  
  const rankings = await calculateTournamentRankings(
    matches,
    matches[0]?.tournament_type || ''
  );
  
  for (const [playerId, rank] of rankings.entries()) {
    const pointsEntry = config.points_distribution.find(p => p.rank === rank);
    if (pointsEntry) {
      await addPointsToPlayer(playerId, pointsEntry.points);
    }
  }
  
  for (const match of matches) {
    await updateDocument('matches', match.id, { points_awarded: true });
  }
}

export async function addPointsToPlayer(
  playerId: string,
  additionalPoints: number
): Promise<void> {
  const player = await getDocument<Player>('players', playerId);
  if (!player) return;
  
  const currentPoints = player.total_points || 0;
  await updateDocument('players', playerId, {
    total_points: currentPoints + additionalPoints
  });
}

export async function getPlayerRankings(
  gender?: 'male' | 'female',
  division?: 1 | 2
): Promise<Player[]> {
  const players = await getAllDocuments<Player>('players');
  
  return players
    .filter(p => {
      if (gender && p.gender !== gender) return false;
      if (division && p.division !== division) return false;
      return true;
    })
    .sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
}
