import {
  collection,
  query,
  where,
  doc,
  updateDoc
} from "firebase/firestore";
import { db } from "./firebase";
import { safeGetDoc, safeGetDocs } from "./firestore-helpers";
import type { Match, Player, ETAResult, Config, TournamentType, TournamentConfig, Court } from "@/types";

const DEFAULT_DURATION_11 = 8;
const DEFAULT_DURATION_15 = 12.5;
const DEFAULT_DURATION_21 = 15;
const MOVING_AVERAGE_SIZE = 10;
const MIN_DURATION = 3;
const MAX_DURATION = 40;

/**
 * 試合時間を記録し、平均時間を更新する（学習機能）
 */
export async function recordMatchDuration(matchId: string): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await safeGetDoc(matchRef);

    if (!matchSnap.exists()) return;
    const match = matchSnap.data() as Match;

    // 開始・終了時間がなければスキップ
    if (!match.start_time || !match.end_time) return;

    // 時間計算 (ミリ秒 -> 分)
    const durationMinutes = (match.end_time.toMillis() - match.start_time.toMillis()) / (1000 * 60);

    // 外れ値を除外 (短すぎる/長すぎる試合)
    if (durationMinutes < MIN_DURATION || durationMinutes > MAX_DURATION) return;

    // 設定を取得して更新
    const configRef = doc(db, 'config', 'system');
    const configSnap = await safeGetDoc(configRef);

    if (!configSnap.exists()) return;
    const configData = configSnap.data();

    // 点数判定（11/15/21）
    const points = await getMatchPoints(match);
    const key = points === 21 ? 'recent_durations_21' : points === 11 ? 'recent_durations_11' : 'recent_durations_15';
    const avgKey = points === 21 ? 'avg_match_duration_21' : points === 11 ? 'avg_match_duration_11' : 'avg_match_duration_15';

    // 配列を更新 (直近10件)
    const recentDurations: number[] = (configData[key] as number[] | undefined) || [];
    recentDurations.push(durationMinutes);

    if (recentDurations.length > MOVING_AVERAGE_SIZE) {
      recentDurations.shift(); // 古いものを捨てる
    }

    // 平均を再計算
    const avgDuration = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;

    // Firestore保存
    await updateDoc(configRef, {
      [key]: recentDurations,
      [avgKey]: avgDuration
    });

  } catch (error) {
    console.error("Error recording match duration:", error);
  }
}

/**
 * プレイヤー名から次の試合と待ち時間を検索する
 */
export async function searchPlayerByName(name: string): Promise<ETAResult | null> {
  try {
    // 1. プレイヤー検索
    const playersRef = collection(db, 'players');
    // 名前で検索
    const q = query(playersRef, where('name', '==', name));
    const snapshot = await safeGetDocs(q);

    if (snapshot.empty) return null;

    // ヒットした最初のプレイヤーを使用
    const playerDoc = snapshot.docs[0];
    const player = playerDoc.data() as Player;
    const playerId = playerDoc.id;
    const campId = player.campId; // 所属する合宿ID

    // 2. 試合検索 (その合宿の、未完了の試合)
    const matchesRef = collection(db, 'matches');
    let matchQuery = query(
      matchesRef,
      where('status', '!=', 'completed') // finished ではなく completed (Typesに合わせて修正)
    );

    // 合宿IDがあれば絞り込む
    if (campId) {
      matchQuery = query(
        matchesRef,
        where('campId', '==', campId),
        where('status', '!=', 'completed')
      );
    }

    const matchSnapshot = await safeGetDocs(matchQuery);
    const allMatches = matchSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    // 自分の関わる試合を探す
    const myMatch = allMatches.find(m =>
      m.player1_id === playerId ||
      m.player2_id === playerId ||
      m.player3_id === playerId ||
      m.player4_id === playerId
    );

    // 試合がない場合
    if (!myMatch) {
      // もしかしたら「試合中」かもしれないので確認 (status check)
      const playingMatch = allMatches.find(m =>
        (m.status === 'playing' || m.status === 'calling') &&
        (m.player1_id === playerId || m.player2_id === playerId || m.player3_id === playerId || m.player4_id === playerId)
      );

      if (playingMatch) {
        return {
          minutes: 0,
          detail: '現在試合中または呼び出し中です',
          next_court: playingMatch.court_id,
          matches_before: 0
        };
      }

      // 待機中の試合がない場合は null を返す
      return null;
    }

    // 3. 待ち時間計算
    const waitingMatches = allMatches.filter(m => m.status === 'waiting');

    // 自分より前の試合数 (作成日時でソートしてカウント)
    const myCreateTime = myMatch.created_at.toMillis();
    const matchesBefore = waitingMatches.filter(m =>
      m.created_at.toMillis() < myCreateTime
    ).length;

    // 設定から平均時間を取得
    const configDoc = await safeGetDoc(doc(db, 'config', 'system'));
    const configData = configDoc.data();
    const avgDuration11 = (configData?.avg_match_duration_11 as number | undefined) || DEFAULT_DURATION_11;
    const avgDuration15 = (configData?.avg_match_duration_15 as number | undefined) || DEFAULT_DURATION_15;
    const avgDuration21 = (configData?.avg_match_duration_21 as number | undefined) || DEFAULT_DURATION_21;

    // 現在の合宿のコート数を取得したいが、簡易的に config か camp データから取る
    // ここではアクティブなコート数を取得
    const courtsRef = collection(db, 'courts');
    const courtsSnap = await safeGetDocs(courtsRef);
    const activeCourts = courtsSnap.docs.filter(d => d.data().is_active).length || 6;

    // 自分の試合のポイント数 (11/15/21)
    const myMatchPoints = await getMatchPoints(myMatch);
    const avgDuration = myMatchPoints === 21 ? avgDuration21 : myMatchPoints === 11 ? avgDuration11 : avgDuration15;

    // 計算式: (前の試合数 / コート数) * 1試合平均
    let estimatedMinutes = Math.ceil((matchesBefore / activeCourts) * avgDuration);

    // ✅ 前の試合がない場合（次の試合）、平均試合時間を返す
    if (matchesBefore === 0) {
      estimatedMinutes = Math.ceil(avgDuration);
    }

    return {
      minutes: estimatedMinutes,
      detail: `約${estimatedMinutes}分後（前に${matchesBefore}試合）`,
      next_court: null,
      matches_before: matchesBefore
    };

  } catch (error) {
    console.error("ETA Search Error:", error);
    // エラー時は null を返す（ゴースト表示を防ぐ）
    return null;
  }
}

export interface TournamentETAByType {
  tournamentType: TournamentType;
  label: string;
  estimatedEndTime: Date | null;
  remainingMatches: number;
  activeMatches: number;
  estimatedMinutesRemaining: number;
}

/**
 * トーナメント全体の予想終了時刻を計算
 */
export async function calculateTournamentETA(campId: string): Promise<{
  estimatedEndTime: Date | null;
  remainingMatches: number;
  activeMatches: number;
  estimatedMinutesRemaining: number;
  byType: TournamentETAByType[];
}> {
  try {
    // 全試合を取得
    const matchesRef = collection(db, 'matches');
    const matchQuery = query(matchesRef, where('campId', '==', campId));
    const matchSnapshot = await safeGetDocs(matchQuery);
    const allMatches = matchSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    // 待機中と進行中の試合数をカウント
    const waitingMatches = allMatches.filter(m => m.status === 'waiting');
    const activeMatches = allMatches.filter(m => m.status === 'calling' || m.status === 'playing');

    const remainingCount = waitingMatches.length;
    const activeCount = activeMatches.length;

    // 残りがなければ終了
    if (remainingCount === 0 && activeCount === 0) {
      return {
        estimatedEndTime: null,
        remainingMatches: 0,
        activeMatches: 0,
        estimatedMinutesRemaining: 0,
        byType: []
      };
    }

    // アクティブなコート数を取得（男女別）
    const courtsRef = collection(db, 'courts');
    const courtsSnap = await safeGetDocs(query(courtsRef, where('campId', '==', campId)));
    const courtDocs = courtsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
    const activeMaleCourts = courtDocs.filter(c => c.is_active && c.preferred_gender === 'male').length || 1;
    const activeFemaleCourts = courtDocs.filter(c => c.is_active && c.preferred_gender === 'female').length || 1;
    const totalActiveCourts = courtDocs.filter(c => c.is_active).length || 1;

    // 平均試合時間を取得
    const configDoc = await safeGetDoc(doc(db, 'config', 'system'));
    const configData = configDoc.data();
    const avgDuration11 = (configData?.avg_match_duration_11 as number | undefined) || DEFAULT_DURATION_11;
    const avgDuration15 = (configData?.avg_match_duration_15 as number | undefined) || DEFAULT_DURATION_15;
    const avgDuration21 = (configData?.avg_match_duration_21 as number | undefined) || DEFAULT_DURATION_21;

    // 男子・女子・混合別に試合時間を計算
    let maleEstimatedMinutes = 0;
    let femaleEstimatedMinutes = 0;
    let mixedEstimatedMinutes = 0;

    const calculateMatchDuration = async (match: Match) => {
      const points = await getMatchPoints(match);
      const avgDuration = points === 21 ? avgDuration21 : points === 11 ? avgDuration11 : avgDuration15;
      return avgDuration;
    };

    // 待機中の試合を種目別に集計
    for (const match of waitingMatches) {
      const duration = await calculateMatchDuration(match);
      if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') {
        maleEstimatedMinutes += duration;
      } else if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') {
        femaleEstimatedMinutes += duration;
      } else if (match.tournament_type === 'mixed_doubles') {
        mixedEstimatedMinutes += duration;
      }
    }

    // 進行中の試合を種目別に集計（残り半分と仮定）
    for (const match of activeMatches) {
      const duration = await calculateMatchDuration(match);
      if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') {
        maleEstimatedMinutes += duration * 0.5;
      } else if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') {
        femaleEstimatedMinutes += duration * 0.5;
      } else if (match.tournament_type === 'mixed_doubles') {
        mixedEstimatedMinutes += duration * 0.5;
      }
    }

    // 各性別のコート数で並列処理を計算
    const maleMinutesRemaining = Math.ceil(maleEstimatedMinutes / activeMaleCourts);
    const femaleMinutesRemaining = Math.ceil(femaleEstimatedMinutes / activeFemaleCourts);
    const mixedMinutesRemaining = Math.ceil(mixedEstimatedMinutes / totalActiveCourts);

    // 全体の予想終了時刻は、最も遅く終わる種目の時刻
    const estimatedMinutesRemaining = Math.max(maleMinutesRemaining, femaleMinutesRemaining, mixedMinutesRemaining);

    // 予想終了時刻を計算
    const now = new Date();
    const estimatedEndTime = new Date(now.getTime() + estimatedMinutesRemaining * 60 * 1000);

    // 種目別の予想終了時刻を計算
    const tournamentTypes: TournamentType[] = [
      'mens_singles',
      'womens_singles',
      'mens_doubles',
      'womens_doubles',
      'mixed_doubles',
      'team_battle'
    ];

    const tournamentLabels: Record<TournamentType, string> = {
      'mens_singles': '男子S',
      'womens_singles': '女子S',
      'mens_doubles': '男子D',
      'womens_doubles': '女子D',
      'mixed_doubles': '混合D',
      'team_battle': '団体戦'
    };

    const byType: TournamentETAByType[] = [];

    for (const type of tournamentTypes) {
      const typeWaitingMatches = waitingMatches.filter(m => m.tournament_type === type);
      const typeActiveMatches = activeMatches.filter(m => m.tournament_type === type);

      if (typeWaitingMatches.length === 0 && typeActiveMatches.length === 0) {
        continue; // この種目には試合がない
      }

      let typeEstimatedMinutes = 0;

      // 待機中の試合
      for (const match of typeWaitingMatches) {
        const points = await getMatchPoints(match);
        const avgDuration = points === 21 ? avgDuration21 : points === 11 ? avgDuration11 : avgDuration15;
        typeEstimatedMinutes += avgDuration;
      }

      // 進行中の試合
      for (const match of typeActiveMatches) {
        const points = await getMatchPoints(match);
        const avgDuration = points === 21 ? avgDuration21 : points === 11 ? avgDuration11 : avgDuration15;
        typeEstimatedMinutes += avgDuration * 0.5;
      }

      // 種目に応じたコート数で並列処理を計算
      let courtsForType = totalActiveCourts;
      if (type === 'mens_singles' || type === 'mens_doubles') {
        courtsForType = activeMaleCourts;
      } else if (type === 'womens_singles' || type === 'womens_doubles') {
        courtsForType = activeFemaleCourts;
      } else if (type === 'mixed_doubles') {
        courtsForType = totalActiveCourts; // 混合は全コート使用可
      }

      const typeEstimatedMinutesRemaining = Math.ceil(typeEstimatedMinutes / courtsForType);
      const typeEstimatedEndTime = new Date(now.getTime() + typeEstimatedMinutesRemaining * 60 * 1000);

      byType.push({
        tournamentType: type,
        label: tournamentLabels[type],
        estimatedEndTime: typeEstimatedEndTime,
        remainingMatches: typeWaitingMatches.length,
        activeMatches: typeActiveMatches.length,
        estimatedMinutesRemaining: typeEstimatedMinutesRemaining
      });
    }

    return {
      estimatedEndTime,
      remainingMatches: remainingCount,
      activeMatches: activeCount,
      estimatedMinutesRemaining,
      byType
    };

  } catch (error) {
    console.error("Error calculating tournament ETA:", error);
    return {
      estimatedEndTime: null,
      remainingMatches: 0,
      activeMatches: 0,
      estimatedMinutesRemaining: 0,
      byType: []
    };
  }
}

// ヘルパー: 試合の点数を判定（TournamentConfigから取得）
async function getMatchPoints(match: Match): Promise<number> {
  try {
    // tournament_config_idがあればそれを使用
    if (match.tournament_config_id) {
      const configDoc = await safeGetDoc(doc(db, 'tournament_configs', match.tournament_config_id));
      if (configDoc.exists()) {
        const config = configDoc.data() as TournamentConfig;
        // points_by_roundがあればそれを使用
        if (config.points_by_round && config.points_by_round[match.round]) {
          return config.points_by_round[match.round];
        }
        // なければデフォルト点数
        return config.points_per_game;
      }
    }
  } catch (error) {
    console.error("Error getting match points:", error);
  }

  // フォールバック: 旧ロジック
  if (match.tournament_type === 'team_battle') return 11;
  if (match.tournament_type === 'mixed_doubles') return 15;
  return match.round >= 3 ? 21 : 15;
}