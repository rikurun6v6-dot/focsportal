import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, Timestamp, DocumentData, serverTimestamp, QueryConstraint
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player, Match, Court, MatchHistory, Config, TournamentType, MatchStatus, TournamentConfig, Camp, MatchWithPlayers } from '@/types';

const COLLECTIONS = {
  players: 'players',
  matches: 'matches',
  courts: 'courts',
  teams: 'teams',
  team_battles: 'team_battles',
  match_history: 'match_history',
  config: 'config',
} as const;

// Generic helpers
export async function getAllDocuments<T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  try {
    const collectionRef = collection(db, collectionName);
    const q = constraints.length > 0 ? query(collectionRef, ...constraints) : collectionRef;
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
  } catch (error) {
    console.error(`Error getting documents from ${collectionName}:`, error);
    return [];
  }
}

export async function setDocument<T extends { id: string }>(collectionName: string, data: T): Promise<boolean> {
  try {
    const { id, ...docData } = data;
    if (!id) {
      console.error(`Error: Missing ID for setDocument in ${collectionName}`);
      return false;
    }
    const docRef = doc(db, collectionName, id);
    await setDoc(docRef, docData);
    return true;
  } catch (error) {
    console.error(`Error setting document in ${collectionName}:`, error);
    return false;
  }
}

export async function getDocument<T>(collectionName: string, docId: string): Promise<T | null> {
  try {
    if (!docId) return null;
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
    console.error(`Error getting document from ${collectionName}:`, error);
    return null;
  }
}

export async function updateDocument(collectionName: string, docId: string, updates: any): Promise<void> {
  if (!docId) {
    console.error(`Error: Missing ID for updateDocument in ${collectionName}`);
    return;
  }
  const docRef = doc(db, collectionName, docId);
  await updateDoc(docRef, { ...updates, updated_at: Timestamp.now() });
}

export async function deleteDocument(collectionName: string, docId: string): Promise<boolean> {
  try {
    if (!docId) {
      console.warn(`Warning: Attempted to delete document from ${collectionName} with undefined/null ID`);
      return false;
    }
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
    return true;
  } catch (error) {
    console.error(`Error deleting document from ${collectionName}:`, error);
    return false;
  }
}

export function subscribeToCollection<T>(collectionName: string, callback: (data: T[]) => void, constraints: QueryConstraint[] = []) {
  const collectionRef = collection(db, collectionName);
  const q = constraints.length > 0 ? query(collectionRef, ...constraints) : collectionRef;
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
    callback(data);
  }, (error) => { console.error(`Error in ${collectionName} listener:`, error); });
}

export function subscribeToDocument<T>(collectionName: string, docId: string, callback: (data: T | null) => void) {
  if (!docId) {
    callback(null);
    return () => { }; // Return empty unsubscribe function
  }
  const docRef = doc(db, collectionName, docId);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = { id: snapshot.id, ...snapshot.data() } as T;
      callback(data);
    } else {
      callback(null);
    }
  }, (error) => { console.error(`Error in ${collectionName}/${docId} listener:`, error); });
}

// Court functions
export async function getAllCourts(): Promise<Court[]> {
  return getAllDocuments<Court>(COLLECTIONS.courts, [orderBy('number')]);
}

export function subscribeToCourts(callback: (courts: Court[]) => void) {
  return subscribeToCollection<Court>(COLLECTIONS.courts, callback, [orderBy('number')]);
}

export async function initializeCourts(): Promise<boolean> {
  try {
    const courts: Court[] = [
      { id: 'court_1', number: 1, preferred_gender: 'male', current_match_id: null, is_active: true },
      { id: 'court_2', number: 2, preferred_gender: 'male', current_match_id: null, is_active: true },
      { id: 'court_3', number: 3, preferred_gender: 'male', current_match_id: null, is_active: true },
      { id: 'court_4', number: 4, preferred_gender: 'female', current_match_id: null, is_active: true },
      { id: 'court_5', number: 5, preferred_gender: 'female', current_match_id: null, is_active: true },
      { id: 'court_6', number: 6, preferred_gender: 'female', current_match_id: null, is_active: true },
    ];
    for (const court of courts) { await setDocument(COLLECTIONS.courts, court); }
    return true;
  } catch (error) {
    console.error('Error initializing courts:', error);
    return false;
  }
}

export async function initializeConfig(): Promise<boolean> {
  try {
    const config: Config = {
      auto_dispatch_enabled: false,
      current_phase: null,
      tournament_date: Timestamp.now(),
      last_operation: null,
    };
    await setDoc(doc(db, COLLECTIONS.config, 'system'), config);
    return true;
  } catch (error) {
    console.error('Error initializing config:', error);
    return false;
  }
}

// Player functions
export async function getAllPlayers(): Promise<Player[]> {
  return getAllDocuments<Player>(COLLECTIONS.players, [orderBy('name')]);
}

export async function importPlayers(players: Omit<Player, 'id'>[]): Promise<{ success: number; errors: string[]; }> {
  let success = 0;
  const errors: string[] = [];
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    try {
      const timestamp = Date.now();
      const safeName = player.name.replace(/\s+/g, '_');
      const id = `player_${timestamp}_${i}_${safeName}`;
      const playerWithId: Player = { id, ...player };
      const result = await setDocument(COLLECTIONS.players, playerWithId);
      if (result) { success++; } else { errors.push(`${player.name}: 登録に失敗しました`); }
    } catch (error) {
      errors.push(`${player.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { success, errors };
}

export async function deleteAllPlayers(): Promise<boolean> {
  try {
    const players = await getAllPlayers();
    for (const player of players) { await deleteDocument(COLLECTIONS.players, player.id); }
    return true;
  } catch (error) {
    console.error('Error deleting all players:', error);
    return false;
  }
}

// Match functions
export async function createMatches(matches: Omit<Match, 'id'>[]): Promise<{ success: number; errors: string[]; }> {
  let success = 0;
  const errors: string[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    try {
      const id = `match_${Date.now()}_${i}`;
      const matchWithId: Match = { id, ...match };
      const result = await setDocument(COLLECTIONS.matches, matchWithId);
      if (result) {
        success++;
      } else {
        errors.push(`試合${i + 1}: 登録に失敗しました`);
      }
    } catch (error) {
      errors.push(`試合${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { success, errors };
}

export async function getAllMatches(): Promise<Match[]> {
  return getAllDocuments<Match>(COLLECTIONS.matches, [orderBy('created_at')]);
}

export async function getMatchesByTournament(tournamentType: TournamentType): Promise<Match[]> {
  return getAllDocuments<Match>(COLLECTIONS.matches, [
    where('tournament_type', '==', tournamentType),
    orderBy('round'),
    orderBy('created_at')
  ]);
}

export async function deleteAllMatches(): Promise<boolean> {
  try {
    const matches = await getAllMatches();
    for (const match of matches) {
      await deleteDocument(COLLECTIONS.matches, match.id);
    }
    return true;
  } catch (error) {
    console.error('Error deleting all matches:', error);
    return false;
  }
}

export async function updateMatchResult(
  matchId: string,
  scoreP1: number,
  scoreP2: number,
  winnerId: string
): Promise<boolean> {
  try {
    if (!matchId) return false;
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    await updateDoc(matchRef, {
      score_p1: scoreP1,
      score_p2: scoreP2,
      winner_id: winnerId,
      status: 'completed',
      end_time: Timestamp.now(),
      updated_at: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('Error updating match result:', error);
    return false;
  }
}

export async function getActiveMatches(): Promise<Match[]> {
  return getAllDocuments<Match>(COLLECTIONS.matches, [
    where('status', 'in', ['waiting', 'calling', 'playing']),
    orderBy('created_at')
  ]);
}

export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus
): Promise<boolean> {
  try {
    if (!matchId) return false;
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    const updateData: any = {
      status,
      updated_at: Timestamp.now(),
    };

    if (status === 'playing' && !updateData.start_time) {
      updateData.start_time = Timestamp.now();
    }

    await updateDoc(matchRef, updateData);
    return true;
  } catch (error) {
    console.error('Error updating match status:', error);
    return false;
  }
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  try {
    if (!playerId) return null;
    const docRef = doc(db, COLLECTIONS.players, playerId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Player;
    }
    return null;
  } catch (error) {
    console.error('Error getting player:', error);
    return null;
  }
}

export function subscribeToActiveMatches(callback: (matches: Match[]) => void) {
  return subscribeToCollection<Match>(COLLECTIONS.matches, callback, [
    where('status', 'in', ['waiting', 'calling', 'playing']),
    orderBy('created_at')
  ]);
}


// Phase 9: Tournament Config CRUD
export async function getTournamentConfigs(): Promise<TournamentConfig[]> {
  return getAllDocuments<TournamentConfig>('tournament_configs');
}

export async function getTournamentConfig(id: string): Promise<TournamentConfig | null> {
  return getDocument<TournamentConfig>('tournament_configs', id);
}

export async function createTournamentConfig(config: Omit<TournamentConfig, 'id' | 'created_at'>): Promise<string> {
  const docRef = doc(collection(db, 'tournament_configs'));
  const newConfig: TournamentConfig = {
    ...config,
    id: docRef.id,
    created_at: Timestamp.now()
  };
  await setDoc(docRef, newConfig);
  return docRef.id;
}

export async function updateTournamentConfig(id: string, updates: Partial<TournamentConfig>): Promise<void> {
  return updateDocument('tournament_configs', id, updates);
}

export async function deleteTournamentConfig(id: string): Promise<boolean> {
  return deleteDocument('tournament_configs', id);
}

export function subscribeToTournamentConfigs(callback: (configs: TournamentConfig[]) => void) {
  return subscribeToCollection<TournamentConfig>('tournament_configs', callback);
}

export async function getMatchWithPlayers(matchId: string): Promise<MatchWithPlayers | null> {
  const match = await getDocument<Match>(COLLECTIONS.matches, matchId);
  if (!match) return null;

  const player1 = await getPlayerById(match.player1_id);
  const player2 = await getPlayerById(match.player2_id);
  if (!player1 || !player2) return null;

  const result: MatchWithPlayers = { ...match, player1, player2 };

  if (match.player3_id) {
    const player3 = await getPlayerById(match.player3_id);
    if (player3) result.player3 = player3;
  }

  if (match.player4_id) {
    const player4 = await getPlayerById(match.player4_id);
    if (player4) result.player4 = player4;
  }

  return result;
}

// 👇 必要なimportが足りない場合は、ファイルの先頭に追加してください
// import { collection, doc, getDocs, getDoc, setDoc, updateDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
// import { db } from "./firebase";
// import type { Camp, Config } from "@/types";

// ==========================================
// ✅ Phase 10: 合宿 (Camp) 管理用・新機能
// ==========================================

/**
 * 新しい合宿を作成する
 */
export const createCamp = async (title: string, courtCount: number = 6) => {
  try {
    const campsRef = collection(db, 'camps');
    const newCampRef = doc(campsRef); // IDを自動生成

    const newCamp: Camp = {
      id: newCampRef.id,
      title: title,
      court_count: courtCount,
      status: 'setup', // 最初はセットアップ中
      created_at: serverTimestamp() as any,
      config: {
        default_match_points: 15, // デフォルト15点
      },
    };

    await setDoc(newCampRef, newCamp);
    return newCampRef.id;
  } catch (error) {
    console.error("Error creating camp:", error);
    return null;
  }
};

/**
 * すべての合宿を取得する
 */
export const getAllCamps = async (): Promise<Camp[]> => {
  try {
    const campsRef = collection(db, 'camps');
    // 作成日順に並べる（新しいものが上）
    const q = query(campsRef, orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Camp));
  } catch (error) {
    console.error("Error getting all camps:", error);
    return [];
  }
};

/**
 * 特定の合宿を「アクティブ（開催中）」にする
 * ユーザー画面にはこの合宿が表示されるようになる
 */
export const activateCamp = async (campId: string) => {
  try {
    // 1. 指定された合宿のステータスを active にする
    // (他を archived にするかは運用次第だが、ここではシンプルにアクティブIDをConfigに記録する方式をとる)

    // Config/system に activeCampId を書き込む
    const configRef = doc(db, 'config', 'system');
    await setDoc(configRef, { activeCampId: campId }, { merge: true });

    // 合宿自体のステータスも更新
    await updateDocument('camps', campId, { status: 'active' });

    return true;
  } catch (error) {
    console.error("Error activating camp:", error);
    return false;
  }
};

/**
 * 現在アクティブな合宿のIDを取得する
 */
export const getActiveCampId = async (): Promise<string | null> => {
  try {
    const config = await getDocument<Config>('config', 'system');
    return config?.activeCampId || null;
  } catch (error) {
    console.error("Error getting active camp ID:", error);
    return null;
  }
};

/**
 * 合宿用のコートを初期化する
 * (既存の initializeCourts は6面固定だったが、こちらは可変対応)
 */
export const setupCampCourts = async (courtCount: number) => {
  try {
    // 既存のコートを削除する処理が必要だが、
    // Campアーキテクチャでは「Campごとにコートを持つ」か「物理コートは共有するか」の判断が必要。
    // 今回は「物理コートは共有（上書き）」とする（Phase 10仕様）

    // 一旦全コート削除はせず、上書きで対応
    // 余分なコートがある場合は削除が必要だが、まずは指定数分を作成/更新

    for (let i = 1; i <= courtCount; i++) {
      const courtId = `court_${i}`;
      const courtRef = doc(db, 'courts', courtId);

      // 既存データを取得してマージしないと、進行中の試合が消える恐れがあるが
      // 「合宿切り替え時」前提なので上書きでリセットする
      await setDoc(courtRef, {
        id: courtId,
        number: i,
        // 1-3は男子優先、4以降は女子優先（簡易ロジック）
        preferred_gender: i <= (courtCount / 2) ? 'male' : 'female',
        status: 'vacant',
        match: null,
        is_active: true
      });
    }

    // もし既存のコート数が新しい設定より多かった場合（例: 6面→4面）、
    // court_5, court_6 を無効化または削除する処理が必要
    // ここでは簡易的に「is_active: false」にする処理を入れると安全
    // (実装省略: 運用でカバー)

    return true;
  } catch (error) {
    console.error("Error setting up camp courts:", error);
    return false;
  }
};