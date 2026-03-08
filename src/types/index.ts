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
export type Division = number; // カスタム部門対応のためnumberに変更
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
  owner_id?: string;      // 合宿作成者のUID (認証ユーザー)
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
  last_match_finished_at?: Timestamp | null; // 👈 最終試合終了時刻（休息管理用）
  pushSubscription?: object | null; // Web Push サブスクリプション
}

/**
 * Match entity
 * Represents a single match in any tournament type
 */
export interface Match {
  id: string;
  campId?: string; // 👈 追加: 合宿ID
  tournament_type: TournamentType;
  division?: Division; // 👈 追加: 1部 or 2部
  round: number; // 1 = first round, 2 = quarter-final, etc.
  match_number?: number; // 👈 試合の通し番号
  player1_id: string;
  player2_id: string;
  player3_id?: string; // For doubles: partner of player1
  player4_id?: string; // For doubles: partner of player2
  player5_id?: string; // For 3-person teams: 3rd member of player1's side
  player6_id?: string; // For 3-person teams: 3rd member of player2's side
  status: MatchStatus;
  available_at?: Timestamp | null; // 👈 試合が利用可能になる時刻（休息時間後）
  reserved_court_id?: string | null; // 👈 休憩時に予約する元のコートID
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
  group?: TeamGroup; // 👈 予選リーグのグループ (A/B/C/D)
  phase?: 'preliminary' | 'knockout'; // 👈 予選リーグ or 決勝トーナメント
  seed_p1?: number; // 👈 ペア1のシードランク (1=第1シード, 2=第2シード...)
  seed_p2?: number; // 👈 ペア2のシードランク
  next_match_id?: string; // 👈 勝者が進む次の試合のID
  next_match_number?: number; // 👈 勝者が進む次の試合番号
  next_match_position?: 1 | 2; // 👈 次の試合での位置 (1=上側, 2=下側)
  is_walkover?: boolean; // 👈 棄権試合かどうか
  walkover_winner?: 1 | 2; // 👈 棄権時の勝者 (1=player1側, 2=player2側)
  points_per_match?: number; // 👈 この試合の点数設定（カスタム点数対応）
  subtitle?: string; // 👈 試合カードの補足情報（例：「敗者復活戦」「1部」）
}

/**
 * Court entity
 * Represents one of the 6 physical courts
 */
export interface Court {
  id: string;
  number: number;
  preferred_gender: Gender;
  current_match_id: string | null;
  is_active: boolean;
  campId?: string;
  manually_freed?: boolean; // 👈 管理者が手動でフリーに設定したコート（自動割り当て対象外）
  freed_match_id?: string | null; // 👈 フリーにされた試合のID（復帰用）
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
  last_operation: Operation | null;
  activeCampId?: string;
  enabled_tournaments?: TournamentType[];
  is_sequential_mode?: boolean; // 種目の完全順次進行モード
  finals_wait_mode?: { [key: string]: boolean }; // 決勝戦の待機モード ("mens_doubles_1" -> true)
  min_rest_interval?: number; // 👈 最低休息時間（分）デフォルト10分
  default_rest_minutes?: number; // デフォルト休息時間（分）Admin画面で設定
  avg_match_duration_11?: number; // 11点マッチの平均時間
  avg_match_duration_15?: number; // 15点マッチの平均時間
  avg_match_duration_21?: number; // 21点マッチの平均時間
  recent_durations_11?: number[]; // 直近10試合の11点マッチ時間
  recent_durations_15?: number[]; // 直近10試合の15点マッチ時間
  recent_durations_21?: number[]; // 直近10試合の21点マッチ時間
  temporary_category_boost?: Record<string, number>; // AIアドバイザーによる一時的な優先度ブースト
}

/**
 * Settings entity
 * Global settings including chat feature toggle
 */
export interface Settings {
  id: string;
  campId: string;
  isChatEnabled: boolean; // チャット機能の有効/無効
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Message entity
 * Represents a message in the chat system
 */
export interface Message {
  id: string;
  campId: string;
  type: 'individual' | 'broadcast'; // 個別メッセージ or 一斉送信
  sender_type: 'admin' | 'user'; // 送信者タイプ
  sender_id?: string; // 送信者のプレイヤーID（ユーザーの場合）
  recipient_ids?: string[]; // 受信者のプレイヤーID（個別メッセージの場合）
  content: string; // メッセージ本文
  created_at: Timestamp;
  read_by?: string[]; // 既読したプレイヤーIDの配列
  is_announcement?: boolean; // 重要なアナウンスかどうか
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
  player3_id?: string;
  player4_id?: string;
  player5_id?: string; // 3人ペア: ペア1側の3人目
  player6_id?: string; // 3人ペア: ペア2側の3人目
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
  player5?: Player; // 3人ペア用
  player6?: Player; // 3人ペア用
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
  points_per_game: number; // カスタム点数対応
  points_by_round?: Record<number, number>; // カスタム点数対応
  group_count?: number; // 予選リーグのグループ数
  qualifiers_per_group?: number; // 各グループから予選通過する人数
  priority?: number; // 👈 進行順位（小さいほど優先、デフォルト999）
  created_at: Timestamp;
}

export const SCORE_CONFIG: Record<EventType, (round: number, maxRound: number) => 11 | 15 | 21> = {
  MD: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  WD: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  XD: () => 15,
  MS: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  WS: (round, maxRound) => (maxRound - round >= 2 ? 15 : 21),
  TEAM: () => 11,
};


// ===== 新団体戦モード (TeamEncounter System) =====

/** 種目の種類（選手割り当てなし） */
export type TeamGameType = 'MD' | 'WD' | 'XD' | 'MS' | 'WS';

/** 種目構成設定 */
export interface TeamMatchConfig {
  games: { type: TeamGameType; count: number }[];
}

/** 1種目スロット */
export interface TeamGame {
  id: string;        // 例: "MD_1", "WD_1"
  type: TeamGameType;
  winner: 1 | 2 | null; // 1=team1勝, 2=team2勝
  score1?: number;   // team1の得点（得失点差計算用）
  score2?: number;   // team2の得点（得失点差計算用）
}

/** チーム間の1対戦 */
export interface TeamEncounter {
  id: string;
  campId?: string;
  team1_id: string;
  team2_id: string;
  games: TeamGame[];
  team1_wins: number;
  team2_wins: number;
  winner_id: string | null;
  phase: 'preliminary' | 'knockout' | 'placement';
  group?: string;
  round?: number;
  completed: boolean;
  next_encounter_id?: string;
  next_encounter_position?: 1 | 2;
  placement_rank?: number; // 1=1位決定戦, 2=3位決定戦, 3=5位決定戦, 4=7位決定戦
}

/** グループ順位エントリー */
export interface TeamRankEntry {
  teamId: string;
  wins: number;
  losses: number;
  gameDiff: number; // 種目勝利数の差分合計（得失試合数差）
  pointDiff: number; // 得失点差（個別種目の点数合計）
}
