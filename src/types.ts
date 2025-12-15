// src/types/index.ts

import { Timestamp } from 'firebase/firestore';

export type SubMatchType = 'MD' | 'WD' | 'XD'; // Men's Doubles, Women's Doubles, Mixed Doubles
export type TeamPhase = 'preliminary' | 'placement';
export type TournamentFormat =
  | 'single-elimination'
  | 'double-elimination'
  | 'round-robin'
  | 'group-stage-knockout';
export type EventType = 'MD' | 'WD' | 'XD' | 'MS' | 'WS' | 'TEAM';
export type Gender = 'male' | 'female';
export type Division = 1 | 2;
export type MatchStatus = 'waiting' | 'calling' | 'playing' | 'completed';
export type TournamentType = 'mens_singles' | 'womens_singles' | 'mens_doubles' | 'womens_doubles' | 'mixed_doubles' | 'team_battle';
export type TeamGroup = 'A' | 'B' | 'C' | 'D';

export { Timestamp };

// ✅ 1. 合宿 (Camp) の定義を追加
export interface Camp {
  id: string;
  title: string;          // 合宿名 (例: 2025春合宿)
  court_count: number;    // その合宿で使うコート数 (例: 6)
  status: 'setup' | 'active' | 'archived'; // 状態
  created_at: Timestamp;
  config: {
    default_match_points: 15 | 21; // 基本点数
  };
}

// ===== Core Interfaces =====
/**
 * Player entity
 * Represents a tournament participant
 */
export interface Player {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  name: string;
  gender: Gender;
  division: Division;
  team_id: string; // Team ID for team battles
  is_active: boolean; // false if player has withdrawn
  total_points?: number; // Phase 9: Accumulated points
}

/**
 * Match entity
 * Represents a single match in any tournament type
 */
export interface Match {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  tournament_type: TournamentType;
  round: number; // 1 = first round, 2 = quarter-final, etc.
  player1_id: string;
  player2_id: string;
  player3_id?: string; // For doubles: partner of player1
  player4_id?: string; // For doubles: partner of player2
  status: MatchStatus;
  court_id: string | null; // null if not assigned to a court
  score_p1: number;
  score_p2: number;
  winner_id: string | null; // ID of winning player/pair
  start_time: Timestamp | null; // When match status changed to 'playing'
  end_time: Timestamp | null; // When match status changed to 'completed'
  created_at: Timestamp; // For wait time calculations
  updated_at: Timestamp;
  tournament_config_id?: string; // Phase 9: Link to tournament config
  points_awarded?: boolean; // Phase 9: Points distribution status
}

/**
 * Court entity
 * Represents one of the 6 physical courts
 */
export interface Court {
  id: string;
  number: 1 | 2 | 3 | 4 | 5 | 6; // ※ Phase 10以降は可変になる可能性あり
  preferred_gender: Gender; // Courts 1-3 prefer male, 4-6 prefer female
  current_match_id: string | null;
  is_active: boolean; // Can be disabled for maintenance
  // ※ Courtは物理的な場所なので campId は必須ではないが、構造上持たせても良い
}

/**
 * Team entity
 * Represents a team in team battles
 */
export interface Team {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  name: string;
  group: TeamGroup; // Preliminary round group
  player_ids: string[]; // Members of this team
  wins: number; // Number of team battles won
  losses: number; // Number of team battles lost
  game_points_won: number; // Total sub-matches won
  game_points_lost: number; // Total sub-matches lost
}

/**
 * Team Battle entity
 * Represents one team vs team match (5 sub-matches)
 */
export interface TeamBattle {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  team1_id: string;
  team2_id: string;
  sub_matches: SubMatch[];
  team1_score: number; // Number of sub-matches won by team1
  team2_score: number; // Number of sub-matches won by team2
  winner_id: string | null; // ID of winning team
  phase: TeamPhase;
  completed: boolean;
  created_at: Timestamp;
}

/**
 * Sub-match within a team battle
 */
export interface SubMatch {
  type: SubMatchType;
  player1_id: string; // From team1
  player2_id: string; // From team2
  winner: 1 | 2 | null; // 1 for team1, 2 for team2
  score_p1?: number; // Optional detailed score
  score_p2?: number; // Optional detailed score
}

/**
 * Match History entity
 * Records completed match durations for ETA learning
 */
export interface MatchHistory {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  match_id: string;
  duration_minutes: number;
  tournament_type: TournamentType;
  points: 15 | 21 | 11; // Match point type
  recorded_at: Timestamp;
}

/**
 * System Configuration
 * Global settings for the tournament
 */
export interface Config {
  auto_dispatch_enabled: boolean;
  current_phase: TournamentType | null;
  tournament_date: Timestamp;
  last_operation: Operation | null; // For undo functionality
  activeCampId?: string; // 👈 追加: 現在アクティブな合宿ID
}

/**
 * Operation record for undo functionality
 */
export interface Operation {
  type: 'result_entry' | 'walkover' | 'substitute' | 'manual_assignment';
  timestamp: Timestamp;
  data: Record<string, unknown>; // Stores the previous state
  description: string;
}

/**
 * Pairing for doubles tournaments
 */
export interface Pair {
  player1_id: string;
  player2_id: string;
  division: Division;
  tournament_type: TournamentType;
}

/**
 * ETA Calculation Result
 */
export interface ETAResult {
  minutes: number;
  detail: string; // Human-readable explanation
  next_court: string | null;
  matches_before: number;
}

// ===== Helper Types =====

/**
 * CSV Import Row
 */
export interface PlayerCSVRow {
  name: string;
  gender: 'male' | 'female' | 'M' | 'F' | '男' | '女';
  division: '1' | '2' | 1 | 2 | '1部' | '2部';
  team?: string;
}

/**
 * Match with populated player data (for display)
 */
export interface MatchWithPlayers extends Match {
  player1: Player;
  player2: Player;
  player3?: Player;
  player4?: Player;
}

/**
 * Court with current match data (for display)
 */
export interface CourtWithMatch extends Court {
  current_match: MatchWithPlayers | null;
}

/**
 * Team with standings data
 */
export interface TeamStanding extends Team {
  rank: number;
  game_diff: number; // game_points_won - game_points_lost
}

export interface TournamentConfig {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  event_type: EventType;
  division: Division;
  format: TournamentFormat;
  points_per_game: 11 | 15 | 21;
  points_by_round?: Record<number, 11 | 15 | 21>;
  points_distribution: PointsDistribution[];
  created_at: Timestamp;
}

export interface PointsDistribution {
  rank: number;
  points: number;
}

export const SCORE_CONFIG: Record<EventType, (round: number, maxRound: number) => 11 | 15 | 21> = {
  MD: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  WD: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  XD: () => 15,
  MS: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  WS: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  TEAM: () => 11,
};