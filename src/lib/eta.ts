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
    const q = query(playersRef, where('name', '==', name));
    const snapshot = await safeGetDocs(q);
    if (snapshot.empty) return null;

    const playerDoc = snapshot.docs[0];
    const player = playerDoc.data() as Player;
    const playerId = playerDoc.id;
    const campId = player.campId;

    // 2. 合宿内の未完了試合を全取得
    const matchesRef = collection(db, 'matches');
    const matchQuery = campId
      ? query(matchesRef, where('campId', '==', campId), where('status', '!=', 'completed'))
      : query(matchesRef, where('status', '!=', 'completed'));
    const matchSnapshot = await safeGetDocs(matchQuery);
    const allMatches = matchSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    const isMyPlayer = (m: Match) =>
      m.player1_id === playerId || m.player2_id === playerId ||
      m.player3_id === playerId || m.player4_id === playerId;

    // ★ Fix: 試合中・呼出中を先に確認（これが原因で waiting 扱いになっていたバグを修正）
    const myActiveMatch = allMatches.find(m =>
      (m.status === 'calling' || m.status === 'playing') && isMyPlayer(m)
    );
    if (myActiveMatch) {
      return { minutes: 0, detail: '現在試合中または呼び出し中です', next_court: myActiveMatch.court_id, matches_before: 0 };
    }

    // ★ Fix: 次の試合は status === 'waiting' のみに限定
    const myNextMatch = allMatches.find(m => m.status === 'waiting' && isMyPlayer(m));
    // 待機試合がなければ null（12分バグの修正: avgDurationを返さない）
    if (!myNextMatch) return null;

    // 3. 設定取得
    const configDoc = await safeGetDoc(doc(db, 'config', 'system'));
    const configData = configDoc.data();
    const avgDuration11 = (configData?.avg_match_duration_11 as number | undefined) || DEFAULT_DURATION_11;
    const avgDuration15 = (configData?.avg_match_duration_15 as number | undefined) || DEFAULT_DURATION_15;
    const avgDuration21 = (configData?.avg_match_duration_21 as number | undefined) || DEFAULT_DURATION_21;
    const myMatchPoints = await getMatchPoints(myNextMatch);
    const avgDuration = myMatchPoints === 21 ? avgDuration21 : myMatchPoints === 11 ? avgDuration11 : avgDuration15;

    // 4. 性別別コート数を取得（dispatcher と同じ区分で計算）
    const courtsRef = collection(db, 'courts');
    const courtsSnap = await safeGetDocs(
      campId ? query(courtsRef, where('campId', '==', campId)) : courtsRef
    );
    const courts = courtsSnap.docs.map(d => d.data() as Court);
    const activeMaleCourts   = courts.filter(c => c.is_active && c.preferred_gender === 'male').length   || 1;
    const activeFemaleCourts = courts.filter(c => c.is_active && c.preferred_gender === 'female').length || 1;
    const totalActiveCourts  = courts.filter(c => c.is_active).length || 1;

    const myGender = getMatchGender(myNextMatch);
    const relevantCourts = myGender === 'male' ? activeMaleCourts
      : myGender === 'female' ? activeFemaleCourts
      : totalActiveCourts;

    // 5. ラウンドハードフィルタ（dispatcher の minRoundByGroup ロジックを再現）
    const allWaiting = allMatches.filter(m => m.status === 'waiting');
    const minRoundByGroup = new Map<string, number>();
    for (const m of allWaiting) {
      const key = `${m.tournament_type}_${m.division}`;
      const cur = minRoundByGroup.get(key);
      if (cur === undefined || m.round < cur) minRoundByGroup.set(key, m.round);
    }

    const myKey = `${myNextMatch.tournament_type}_${myNextMatch.division}`;
    const minRoundForMyGroup = minRoundByGroup.get(myKey) ?? myNextMatch.round;

    // 自分の試合が前ラウンド待ちの場合（例: 2回戦が待機中だが1回戦がまだ残っている）
    if (myNextMatch.round > minRoundForMyGroup) {
      const earlierRemaining = allWaiting.filter(m => {
        const k = `${m.tournament_type}_${m.division}`;
        return k === myKey && m.round < myNextMatch.round;
      }).length;
      const activeInMyGroup = allMatches.filter(m =>
        m.tournament_type === myNextMatch.tournament_type &&
        m.division === myNextMatch.division &&
        (m.status === 'calling' || m.status === 'playing')
      ).length;
      const effective = earlierRemaining + activeInMyGroup * 0.5;
      const estimatedMinutes = Math.max(1, Math.ceil((effective / relevantCourts) * avgDuration));
      return { minutes: estimatedMinutes, detail: `約${estimatedMinutes}分後（前ラウンド待ち）`, next_court: null, matches_before: earlierRemaining };
    }

    // 6. dispatcher の divisionBonus を再現するため完了試合数を取得
    const completedSnap = await safeGetDocs(
      campId
        ? query(matchesRef, where('campId', '==', campId), where('status', '==', 'completed'))
        : query(matchesRef, where('status', '==', 'completed'))
    );
    const completedMatches = completedSnap.docs.map(d => d.data() as Match);

    const allMatchesTotal = [...allMatches, ...completedMatches];
    const div1Total = allMatchesTotal.filter(m => m.division === 1).length;
    const div2Total = allMatchesTotal.filter(m => m.division === 2).length;
    const div1Completed = completedMatches.filter(m => m.division === 1).length;
    const div2Completed = completedMatches.filter(m => m.division === 2).length;
    const div1Progress = div1Total > 0 ? div1Completed / div1Total : 1;
    const div2Progress = div2Total > 0 ? div2Completed / div2Total : 1;
    const preferredDivision = div1Progress < div2Progress ? 1 : 2;
    const progressGap = Math.abs(div1Progress - div2Progress);
    const divisionBonusBase = Math.round(Math.min(600, progressGap * 2000));

    // 7. 同コートを競合する試合でディスパッチャー優先スコアを再現し、自分より前の試合数を算出
    const ROUND_COEFFICIENT = 100;
    const now = Date.now();

    // ★ 現在試合中の選手IDを収集（dispatcher と同ロジック）
    const busyPlayerIds = new Set<string>();
    allMatches
      .filter(m => m.status === 'calling' || m.status === 'playing')
      .forEach(m => {
        if (m.player1_id) busyPlayerIds.add(m.player1_id);
        if (m.player2_id) busyPlayerIds.add(m.player2_id);
        if (m.player3_id) busyPlayerIds.add(m.player3_id);
        if (m.player4_id) busyPlayerIds.add(m.player4_id);
      });

    const eligibleMatches = allWaiting.filter(m => {
      const key = `${m.tournament_type}_${m.division}`;
      if (m.round !== minRoundByGroup.get(key)) return false;
      const g = getMatchGender(m);
      if (myGender === 'male'   && g === 'female') return false;
      if (myGender === 'female' && g === 'male')   return false;
      if (m.available_at && now < m.available_at.toMillis()) return false;
      if (m.player1_id && busyPlayerIds.has(m.player1_id)) return false;
      if (m.player2_id && busyPlayerIds.has(m.player2_id)) return false;
      if (m.player3_id && m.player3_id !== '' && busyPlayerIds.has(m.player3_id)) return false;
      if (m.player4_id && m.player4_id !== '' && busyPlayerIds.has(m.player4_id)) return false;
      return true;
    });

    const calcScore = (m: Match) => {
      const wt = (now - m.created_at.toMillis()) / 60000;
      const rs = ROUND_COEFFICIENT * (4 - m.round + 1);
      const db = m.division === preferredDivision ? divisionBonusBase : 0;
      return wt + rs + db;
    };

    const myPriority = calcScore(myNextMatch);

    const matchesBefore = eligibleMatches.filter(m => {
      if (m.id === myNextMatch.id) return false;
      return calcScore(m) > myPriority;
    }).length;

    // 7. 同性別コートで進行中の試合数（残り約半分と仮定）
    const activeOnRelevantCourts = allMatches.filter(m => {
      if (m.status !== 'calling' && m.status !== 'playing') return false;
      const g = getMatchGender(m);
      if (myGender === 'male'   && g === 'female') return false;
      if (myGender === 'female' && g === 'male')   return false;
      return true;
    }).length;

    const occupiedSlots = Math.min(activeOnRelevantCourts, relevantCourts);
    const freeSlots     = Math.max(0, relevantCourts - occupiedSlots);

    let estimatedMinutes: number;
    if (matchesBefore === 0 && freeSlots > 0) {
      // コートが空いていて順番が来ている → まもなく
      estimatedMinutes = 1;
    } else if (matchesBefore < relevantCourts) {
      // 次のサイクル（進行中試合が終わり次第）
      estimatedMinutes = Math.ceil(avgDuration * 0.5);
    } else {
      estimatedMinutes = Math.ceil((matchesBefore / relevantCourts) * avgDuration);
    }

    return {
      minutes: estimatedMinutes,
      detail: matchesBefore === 0 ? 'まもなく（次の試合です）' : `約${estimatedMinutes}分後（前に${matchesBefore}試合）`,
      next_court: null,
      matches_before: matchesBefore
    };

  } catch (error) {
    console.error("ETA Search Error:", error);
    return null;
  }
}

function getMatchGender(match: Match): 'male' | 'female' | null {
  if (match.tournament_type === 'mens_singles' || match.tournament_type === 'mens_doubles') return 'male';
  if (match.tournament_type === 'womens_singles' || match.tournament_type === 'womens_doubles') return 'female';
  return null;
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