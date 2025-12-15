import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "./firebase";
import type { Match, Player, ETAResult, Config, TournamentType } from "@/types";

const DEFAULT_DURATION_15 = 20;
const DEFAULT_DURATION_21 = 30;
const MOVING_AVERAGE_SIZE = 10;
const MIN_DURATION = 3;
const MAX_DURATION = 40;

/**
 * 試合時間を記録し、平均時間を更新する（学習機能）
 */
export async function recordMatchDuration(matchId: string): Promise<void> {
  try {
    const matchRef = doc(db, 'matches', matchId);
    const matchSnap = await getDoc(matchRef);

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
    const configSnap = await getDoc(configRef);

    if (!configSnap.exists()) return;
    const configData = configSnap.data();

    // 15点か21点か判定
    const points = getMatchPoints(match);
    const key = points === 21 ? 'recent_durations_21' : 'recent_durations_15';
    const avgKey = points === 21 ? 'avg_match_duration_21' : 'avg_match_duration_15';

    // 配列を更新 (直近10件)
    const recentDurations: number[] = (configData as any)[key] || [];
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
    const snapshot = await getDocs(q);

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

    const matchSnapshot = await getDocs(matchQuery);
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

      return {
        minutes: 0,
        detail: '待機中の試合はありません',
        next_court: null,
        matches_before: 0
      };
    }

    // 3. 待ち時間計算
    const waitingMatches = allMatches.filter(m => m.status === 'waiting');

    // 自分より前の試合数 (作成日時でソートしてカウント)
    const myCreateTime = myMatch.created_at.toMillis();
    const matchesBefore = waitingMatches.filter(m =>
      m.created_at.toMillis() < myCreateTime
    ).length;

    // 設定から平均時間を取得
    const configDoc = await getDoc(doc(db, 'config', 'system'));
    const configData = configDoc.data();
    const avgDuration15 = (configData as any)?.avg_match_duration_15 || DEFAULT_DURATION_15;
    const avgDuration21 = (configData as any)?.avg_match_duration_21 || DEFAULT_DURATION_21;

    // 現在の合宿のコート数を取得したいが、簡易的に config か camp データから取る
    // ここではアクティブなコート数を取得
    const courtsRef = collection(db, 'courts');
    const courtsSnap = await getDocs(courtsRef);
    const activeCourts = courtsSnap.docs.filter(d => d.data().is_active).length || 6;

    // 自分の試合のポイント数 (15 or 21)
    const myMatchPoints = getMatchPoints(myMatch);
    const avgDuration = myMatchPoints === 21 ? avgDuration21 : avgDuration15;

    // 計算式: (前の試合数 / コート数) * 1試合平均
    const estimatedMinutes = Math.ceil((matchesBefore / activeCourts) * avgDuration);

    return {
      minutes: estimatedMinutes,
      detail: `約${estimatedMinutes}分後（前に${matchesBefore}試合）`,
      next_court: null,
      matches_before: matchesBefore
    };

  } catch (error) {
    console.error("ETA Search Error:", error);
    return null;
  }
}

// ヘルパー: 試合の点数を判定
function getMatchPoints(match: Match): 15 | 21 | 11 {
  if (match.tournament_type === 'team_battle') return 11;
  if (match.tournament_type === 'mixed_doubles') return 15;
  // 準決勝(3回戦)以降は21点など、ルールに合わせて調整
  return match.round >= 3 ? 21 : 15;
}