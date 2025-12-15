import { Match, Court, Config } from '@/types';
import { getAllDocuments, getDocument, updateDocument } from './firestore-helpers';

const ROUND_COEFFICIENT = 100;

export async function autoDispatchAll(): Promise<number> {
  const courts = await getAllDocuments<Court>('courts');
  const emptyCourts = courts.filter(c => c.is_active && !c.current_match_id);
  
  if (emptyCourts.length === 0) return 0;
  
  const matches = await getAllDocuments<Match>('matches');
  const waitingMatches = matches.filter(m => m.status === 'waiting');
  
  if (waitingMatches.length === 0) return 0;
  
  let dispatchedCount = 0;
  
  for (const court of emptyCourts) {
    const assigned = await dispatchToEmptyCourt(court, waitingMatches);
    if (assigned) {
      dispatchedCount++;
      const idx = waitingMatches.findIndex(m => m.id === assigned.id);
      if (idx >= 0) waitingMatches.splice(idx, 1);
    }
  }
  
  return dispatchedCount;
}

export async function dispatchToEmptyCourt(
  court: Court,
  waitingMatches: Match[]
): Promise<Match | null> {
  const now = Date.now();
  
  const candidatesWithScore = waitingMatches.map(match => {
    const waitTime = (now - match.created_at.toMillis()) / (1000 * 60);
    const roundScore = ROUND_COEFFICIENT * (getMaxRound(match.tournament_type) - match.round + 1);
    const priorityScore = waitTime + roundScore;
    
    const preferredGender = getPreferredGender(match);
    const matchesCourt = preferredGender === court.preferred_gender;
    
    return {
      match,
      priorityScore,
      matchesCourt
    };
  });
  
  const preferred = candidatesWithScore
    .filter(c => c.matchesCourt)
    .sort((a, b) => b.priorityScore - a.priorityScore);
  
  const candidate = preferred.length > 0 ? preferred[0] : 
    candidatesWithScore.sort((a, b) => b.priorityScore - a.priorityScore)[0];
  
  if (!candidate) return null;
  
  await updateDocument('matches', candidate.match.id, {
    status: 'calling',
    court_id: court.id
  });
  
  await updateDocument('courts', court.id, {
    current_match_id: candidate.match.id
  });
  
  return candidate.match;
}

function getPreferredGender(match: Match): 'male' | 'female' {
  if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') return 'male';
  if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') return 'female';
  return 'male';
}

function getMaxRound(tournamentType: string): number {
  return 4;
}
