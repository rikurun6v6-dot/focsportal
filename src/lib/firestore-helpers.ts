import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, deleteField,
  query, where, orderBy, limit, onSnapshot, Timestamp, DocumentData, serverTimestamp, QueryConstraint,
  getDocsFromCache, getDocsFromServer, getDocFromCache, getDocFromServer, Query, QuerySnapshot, DocumentSnapshot
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player, Match, Court, MatchHistory, Config, TournamentType, MatchStatus, TournamentConfig, Camp, MatchWithPlayers, Settings, Message } from '@/types';

const COLLECTIONS = {
  players: 'players',
  matches: 'matches',
  courts: 'courts',
  teams: 'teams',
  team_battles: 'team_battles',
  match_history: 'match_history',
  config: 'config',
} as const;

// オフライン系エラーかどうかを判定
function isOfflineError(error: any): boolean {
  const code = error?.code;
  const message = error?.message || '';
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    message.includes('offline') ||
    message.includes('Failed to get document because the client is offline')
  );
}

/**
 * ハイブリッド取得ラッパー: サーバー取得を試み、失敗したらキャッシュにフォールバック
 * オフライン系エラーは絶対に外に投げない
 * サーバー取得は5秒でタイムアウト
 */
export async function safeGetDocs<T = DocumentData>(q: Query<T>): Promise<QuerySnapshot<T>> {
  // まずサーバー取得を試みる（5秒タイムアウト付き）
  try {
    const serverPromise = getDocsFromServer(q);
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Server request timeout after 5s')), 5000)
    );
    
    return await Promise.race([serverPromise, timeoutPromise]);
  } catch (serverError: any) {
    // タイムアウトまたはオフラインエラーの場合
    const isTimeout = serverError?.message?.includes('timeout');
    if (isTimeout) {
      console.log('[safeGetDocs] サーバー取得タイムアウト(5秒)、キャッシュにフォールバック');
    } else if (serverError?.code === 'unavailable' || isOfflineError(serverError)) {
      console.log('[safeGetDocs] オフライン検知、キャッシュにフォールバック');
    } else {
      console.warn('[safeGetDocs] サーバー取得失敗:', serverError?.code || serverError?.message);
    }
  }

  // サーバー失敗時はキャッシュから取得を試みる
  try {
    const cacheSnapshot = await getDocsFromCache(q);
    console.log('[safeGetDocs] キャッシュから取得成功:', cacheSnapshot.size, '件');
    return cacheSnapshot;
  } catch (cacheError: any) {
    // キャッシュがない場合は情報レベルのログ
    console.log('[safeGetDocs] キャッシュなし、空結果を返却');
  }

  // 最終フォールバック: 通常のgetDocs（エラーは握りつぶす）
  try {
    return await getDocs(q);
  } catch (finalError: any) {
    // 最終的なエラーのみ警告を出す
    console.warn('[safeGetDocs] 全ての取得方法が失敗、空結果を返却:', finalError?.code || finalError?.message);
    // 空のスナップショット相当を返す（エラーを外に投げない）
    return {
      docs: [],
      empty: true,
      size: 0,
      metadata: { fromCache: true, hasPendingWrites: false },
      forEach: () => {},
      docChanges: () => [],
    } as unknown as QuerySnapshot<T>;
  }
}

/**
 * 単一ドキュメント取得ラッパー: サーバー取得を試み、失敗したらキャッシュにフォールバック
 * オフライン系エラーは絶対に外に投げない
 * サーバー取得は5秒でタイムアウト
 */
export async function safeGetDoc(docRef: any): Promise<DocumentSnapshot> {
  // まずサーバー取得を試みる（5秒タイムアウト付き）
  try {
    const serverPromise = getDocFromServer(docRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Server request timeout after 5s')), 5000)
    );

    return await Promise.race([serverPromise, timeoutPromise]) as DocumentSnapshot;
  } catch (serverError: any) {
    // タイムアウトまたはオフラインエラーの場合
    const isTimeout = serverError?.message?.includes('timeout');
    if (isTimeout) {
      console.log('[safeGetDoc] サーバー取得タイムアウト(5秒)、キャッシュにフォールバック');
    } else if (serverError?.code === 'unavailable' || isOfflineError(serverError)) {
      console.log('[safeGetDoc] オフライン検知、キャッシュにフォールバック');
    } else {
      console.log('[safeGetDoc] サーバー取得失敗:', serverError?.code || serverError?.message);
    }
  }

  // サーバー失敗時はキャッシュから取得を試みる
  try {
    const cacheSnapshot = await getDocFromCache(docRef);
    console.log('[safeGetDoc] キャッシュから取得成功');
    return cacheSnapshot as DocumentSnapshot;
  } catch (cacheError: any) {
    // キャッシュがない場合は情報レベルのログ
    console.log('[safeGetDoc] キャッシュなし');
  }

  // 最終フォールバック: 通常のgetDoc（エラーは握りつぶす）
  try {
    return (await getDoc(docRef)) as DocumentSnapshot;
  } catch (finalError: any) {
    // 最終的なエラーは警告ではなくログに
    console.log('[safeGetDoc] 全ての取得方法が失敗、存在しないドキュメントとして扱う');
    // 存在しないドキュメントとして扱う（エラーを外に投げない）
    return {
      exists: () => false,
      data: () => undefined,
      id: docRef.id,
      ref: docRef,
      metadata: { fromCache: false, hasPendingWrites: false },
    } as unknown as DocumentSnapshot;
  }
}


// Generic helpers
export async function getAllDocuments<T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  try {
    const collectionRef = collection(db, collectionName);
    const q = constraints.length > 0 ? query(collectionRef, ...constraints) : query(collectionRef);
    const querySnapshot = await safeGetDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
  } catch (error) {
    console.warn(`[getAllDocuments] エラー発生、空配列を返却 (${collectionName}):`, error);
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
    const docSnap = await safeGetDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T;
    }
    return null;
  } catch (error) {
    console.error(`Error getting document from ${collectionName}:`, error);
    return null;
  }
}

export async function updateDocument(collectionName: string, docId: string, updates: Record<string, unknown>): Promise<void> {
  if (!docId) {
    const err = new Error(`[updateDocument] ドキュメントIDが空です (collection: ${collectionName})`);
    console.error(err.message);
    throw err;
  }
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, { ...updates, updated_at: Timestamp.now() });
  } catch (error: any) {
    console.error(`[updateDocument] 更新失敗 ${collectionName}/${docId} — code: ${error?.code ?? 'unknown'}, message: ${error?.message ?? error}`);
    throw error;
  }
}

export async function deleteDocument(collectionName: string, docId: string): Promise<boolean> {
  try {
    if (!docId) {
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

/**
 * 特定種目のmatches一括削除（種目削除機能用）
 * campId + tournament_typeでフィルタし、divisionが指定されれば追加フィルタをかける。
 * Firestoreの500件/バッチ制限に対応。
 * @returns 削除したドキュメント数
 */
export async function deleteMatchesByCategory(
  campId: string,
  tournamentType: TournamentType,
  division?: number | null
): Promise<number> {
  const constraints: QueryConstraint[] = [
    where('campId', '==', campId),
    where('tournament_type', '==', tournamentType),
  ];
  if (division != null) {
    constraints.push(where('division', '==', division));
  }
  const matches = await getAllDocuments<Match>('matches', constraints);
  if (matches.length === 0) return 0;

  const BATCH_SIZE = 500;
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    matches.slice(i, i + BATCH_SIZE).forEach(m => {
      batch.delete(doc(db, 'matches', m.id));
    });
    await batch.commit();
  }
  return matches.length;
}

export function subscribeToCollection<T>(collectionName: string, callback: (data: T[]) => void, constraints: QueryConstraint[] = []) {
  const collectionRef = collection(db, collectionName);
  const q = constraints.length > 0 ? query(collectionRef, ...constraints) : collectionRef;
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    // hasPendingWritesやfromCacheに関係なく、常にUIを即座に更新
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
    callback(data);
  }, (error: any) => {
    if (isOfflineError(error)) {
      console.warn(`[subscribeToCollection] オフラインエラー (${collectionName}):`, error?.code || error?.message);
    } else {
      console.error(`Error in ${collectionName} listener:`, error);
    }
  });
}

export function subscribeToDocument<T>(collectionName: string, docId: string, callback: (data: T | null) => void) {
  if (!docId) {
    callback(null);
    return () => { }; // Return empty unsubscribe function
  }
  const docRef = doc(db, collectionName, docId);
  return onSnapshot(docRef, { includeMetadataChanges: true }, (snapshot) => {
    // hasPendingWritesやfromCacheに関係なく、常にUIを即座に更新
    if (snapshot.exists()) {
      const data = { id: snapshot.id, ...snapshot.data() } as T;
      callback(data);
    } else {
      callback(null);
    }
  }, (error: any) => {
    if (isOfflineError(error)) {
      console.warn(`[subscribeToDocument] オフラインエラー (${collectionName}/${docId}):`, error?.code || error?.message);
    } else {
      console.error(`Error in ${collectionName}/${docId} listener:`, error);
    }
  });
}

// Court functions
export async function getAllCourts(): Promise<Court[]> {
  return getAllDocuments<Court>(COLLECTIONS.courts, [orderBy('number')]);
}

export function subscribeToCourts(callback: (courts: Court[]) => void, campId?: string) {
  const constraints = campId
    ? [where('campId', '==', campId), orderBy('number')]
    : [orderBy('number')];
  return subscribeToCollection<Court>(COLLECTIONS.courts, callback, constraints);
}

export async function initializeCourts(courtCount: number, campId: string): Promise<boolean> {
  try {
    const courts: Court[] = [];
    for (let i = 1; i <= courtCount; i++) {
      courts.push({
        id: `court_${campId}_${i}`,
        number: i,
        preferred_gender: i <= Math.floor(courtCount / 2) ? 'male' : 'female',
        current_match_id: null,
        is_active: true,
        campId
      });
    }
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
export async function getAllPlayers(campId?: string): Promise<Player[]> {
  const constraints = campId
    ? [where('campId', '==', campId), orderBy('name')]
    : [orderBy('name')];
  return getAllDocuments<Player>(COLLECTIONS.players, constraints);
}

export async function importPlayers(players: Omit<Player, 'id'>[]): Promise<{ success: number; errors: string[]; }> {
  const errors: string[] = [];
  
  if (players.length === 0) {
    return { success: 0, errors: [] };
  }

  try {
    const batch = writeBatch(db);
    const timestamp = Date.now();

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const safeName = player.name.replace(/\s+/g, '_');
      const id = `player_${timestamp}_${i}_${safeName}`;
      const docRef = doc(db, COLLECTIONS.players, id);
      batch.set(docRef, player);
    }

    await batch.commit();
    return { success: players.length, errors: [] };
  } catch (error) {
    console.error('[importPlayers] バッチ保存失敗:', error);
    errors.push(`一括保存に失敗: ${error instanceof Error ? error.message : String(error)}`);
    return { success: 0, errors };
  }
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
  const errors: string[] = [];

  if (matches.length === 0) {
    return { success: 0, errors: [] };
  }

  try {
    const timestamp = Date.now();
    const BATCH_SIZE = 500;

    // 500件ごとにバッチを分割して保存
    for (let batchStart = 0; batchStart < matches.length; batchStart += BATCH_SIZE) {
      const batch = writeBatch(db);
      const batchEnd = Math.min(batchStart + BATCH_SIZE, matches.length);

      for (let i = batchStart; i < batchEnd; i++) {
        const match = matches[i];
        const id = `match_${timestamp}_${i}`;
        const docRef = doc(db, COLLECTIONS.matches, id);
        batch.set(docRef, {
          id,
          ...match,
          created_at: Timestamp.now(),
          updated_at: Timestamp.now()
        });
      }

      await batch.commit();
    }

    return { success: matches.length, errors: [] };
  } catch (error) {
    console.error('[createMatches] バッチ保存失敗:', error);
    errors.push(`一括保存に失敗: ${error instanceof Error ? error.message : String(error)}`);
    return { success: 0, errors };
  }
}

export async function getAllMatches(campId?: string): Promise<Match[]> {
  const constraints = campId
    ? [where('campId', '==', campId), orderBy('created_at')]
    : [orderBy('created_at')];
  return getAllDocuments<Match>(COLLECTIONS.matches, constraints);
}

export async function getMatchesByTournament(tournamentType: TournamentType, campId?: string): Promise<Match[]> {
  const constraints = campId
    ? [
        where('campId', '==', campId),
        where('tournament_type', '==', tournamentType),
        orderBy('round'),
        orderBy('created_at')
      ]
    : [
        where('tournament_type', '==', tournamentType),
        orderBy('round'),
        orderBy('created_at')
      ];
  return getAllDocuments<Match>(COLLECTIONS.matches, constraints);
}

export function subscribeToMatchesByTournament(
  tournamentType: TournamentType,
  callback: (matches: Match[]) => void,
  campId?: string
) {
  const constraints = campId
    ? [
        where('campId', '==', campId),
        where('tournament_type', '==', tournamentType),
        orderBy('round'),
        orderBy('created_at')
      ]
    : [
        where('tournament_type', '==', tournamentType),
        orderBy('round'),
        orderBy('created_at')
      ];
  return subscribeToCollection<Match>(COLLECTIONS.matches, callback, constraints);
}

export function subscribeToPlayers(callback: (players: Player[]) => void, campId?: string) {
  const constraints = campId ? [where('campId', '==', campId)] : [];
  return subscribeToCollection<Player>(COLLECTIONS.players, callback, constraints);
}

export async function startMatch(matchId: string): Promise<void> {
  await updateDocument('matches', matchId, {
    status: 'playing',
    started_at: Timestamp.now()
  });
}

export async function cancelMatchResult(matchId: string): Promise<boolean> {
  try {
    if (!matchId) return false;
    const currentMatch = await getDocument<Match>(COLLECTIONS.matches, matchId);
    if (!currentMatch) return false;

    // 次の試合から進出プレイヤーを削除
    if (currentMatch.next_match_id) {
      const nextMatchRef = doc(db, COLLECTIONS.matches, currentMatch.next_match_id);
      const position = currentMatch.next_match_position ??
        ((currentMatch.match_number ?? 0) % 2 === 1 ? 1 : 2);
      const clearUpdate: Record<string, unknown> = { updated_at: Timestamp.now() };
      if (position === 1) {
        clearUpdate.player1_id = '';
        clearUpdate.player3_id = null;
        clearUpdate.player5_id = null;
      } else {
        clearUpdate.player2_id = '';
        clearUpdate.player4_id = null;
        clearUpdate.player6_id = null;
      }
      await updateDoc(nextMatchRef, clearUpdate);
    }

    // 試合を待機状態に戻す
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    await updateDoc(matchRef, {
      score_p1: 0,
      score_p2: 0,
      winner_id: null,
      status: 'waiting',
      end_time: null,
      court_id: null,
      updated_at: Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Error cancelling match result:', error);
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
    if (!matchId || !winnerId) return false;

    // 現在の試合データを取得
    const currentMatch = await getDocument<Match>(COLLECTIONS.matches, matchId);
    if (!currentMatch) return false;

    // 試合結果を更新
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    await updateDoc(matchRef, {
      score_p1: scoreP1,
      score_p2: scoreP2,
      winner_id: winnerId,
      status: 'completed',
      end_time: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // 次の試合がある場合、勝者を設定
    if (currentMatch.next_match_id) {
      const nextMatchRef = doc(db, COLLECTIONS.matches, currentMatch.next_match_id);
      const isWinner1 = winnerId === currentMatch.player1_id;

      // 勝者のプレイヤーIDを取得（ダブルスの場合はパートナーも）
      const winnerMainId = isWinner1 ? currentMatch.player1_id : currentMatch.player2_id;
      const winnerPartnerId = isWinner1 ? currentMatch.player3_id : currentMatch.player4_id;

      // 次の試合での位置を決定（既存データへのフォールバック処理）
      let nextPosition = currentMatch.next_match_position;

      if (!nextPosition) {
        // next_match_positionがない場合、match_numberから計算（既存データ対応）
        // matchNumberが奇数なら1（上側）、偶数なら2（下側）
        const matchNumber = currentMatch.match_number || 0;
        nextPosition = (matchNumber % 2 === 1) ? 1 : 2;

        console.log(`[フォールバック] Match ${matchId}: match_number=${matchNumber} → next_position=${nextPosition}`);
      }

      // 次の試合での位置に応じてプレイヤーを設定
      const nextMatchUpdate: Record<string, unknown> = {
        updated_at: Timestamp.now(),
      };

      if (nextPosition === 1) {
        // 上側（player1側）に設定
        nextMatchUpdate.player1_id = winnerMainId;
        if (winnerPartnerId) {
          nextMatchUpdate.player3_id = winnerPartnerId;
        }
        // 3人ペアの場合、5人目も進出
        const winner3rdId = isWinner1 ? currentMatch.player5_id : currentMatch.player6_id;
        if (winner3rdId) {
          nextMatchUpdate.player5_id = winner3rdId;
          console.log(`[進出処理] 3人ペアの5人目を進出: ${winner3rdId}`);
        }
      } else if (nextPosition === 2) {
        // 下側（player2側）に設定
        nextMatchUpdate.player2_id = winnerMainId;
        if (winnerPartnerId) {
          nextMatchUpdate.player4_id = winnerPartnerId;
        }
        // 3人ペアの場合、6人目も進出
        const winner3rdId = isWinner1 ? currentMatch.player5_id : currentMatch.player6_id;
        if (winner3rdId) {
          nextMatchUpdate.player6_id = winner3rdId;
          console.log(`[進出処理] 3人ペアの6人目を進出: ${winner3rdId}`);
        }
      }

      console.log(`[進出処理] Match ${matchId} → Next Match ${currentMatch.next_match_id} (position ${nextPosition})`);
      await updateDoc(nextMatchRef, nextMatchUpdate);
    }

    // 選手の休息時間を記録
    await updatePlayersRestTime(currentMatch);

    return true;
  } catch (error) {
    console.error('Error updating match result:', error);
    return false;
  }
}

/**
 * 誤伝播されたプレイヤーIDを一括クリーンアップする。
 * Round 2以降の waiting 試合に対し、フィーダー試合（next_match_id/next_match_number が
 * この試合を指す round-1 試合）が未完了であれば、誤って書き込まれたプレイヤーIDをクリアする。
 *
 * @returns クリアした試合数
 */
export async function cleanupEarlyPropagations(
  campId: string,
  tournamentType: TournamentType,
  division?: number | null
): Promise<number> {
  const constraints: QueryConstraint[] = [
    where('campId', '==', campId),
    where('tournament_type', '==', tournamentType),
  ];
  if (division != null) {
    constraints.push(where('division', '==', division));
  }
  const allMatches = await getAllDocuments<Match>('matches', constraints);

  const getPosition = (m: Match): 1 | 2 =>
    m.next_match_position ?? ((m.match_number ?? 0) % 2 === 1 ? 1 : 2);

  const updates: Array<{ id: string; update: Record<string, unknown> }> = [];

  for (const match of allMatches) {
    if (match.round <= 1) continue;
    // completed は正常進出済みなのでスキップ
    if (match.status === 'completed') continue;

    const hasP1 = !!match.player1_id;
    const hasP2 = !!match.player2_id;
    if (!hasP1 && !hasP2) continue;

    // この試合にフィードする試合を探す
    const feeders = allMatches.filter(m => {
      if (m.next_match_id) return m.next_match_id === match.id;
      if (m.next_match_number != null) return m.next_match_number === match.match_number;
      return false;
    });
    if (feeders.length === 0) continue;

    const feedersForPos1 = feeders.filter(f => getPosition(f) === 1);
    const feedersForPos2 = feeders.filter(f => getPosition(f) === 2);

    // 「確定した進出」= feeder が completed（BYE/walkover 含む）
    const pos1Done = feedersForPos1.length === 0 || feedersForPos1.some(f => f.status === 'completed');
    const pos2Done = feedersForPos2.length === 0 || feedersForPos2.some(f => f.status === 'completed');

    const clearUpdate: Record<string, unknown> = { updated_at: Timestamp.now() };
    let needsClear = false;

    if (hasP1 && feedersForPos1.length > 0 && !pos1Done) {
      clearUpdate.player1_id = '';
      clearUpdate.player3_id = null;
      clearUpdate.player5_id = null;
      needsClear = true;
    }
    if (hasP2 && feedersForPos2.length > 0 && !pos2Done) {
      clearUpdate.player2_id = '';
      clearUpdate.player4_id = null;
      clearUpdate.player6_id = null;
      needsClear = true;
    }

    if (needsClear && match.id) {
      updates.push({ id: match.id, update: clearUpdate });
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_SIZE).forEach(({ id, update }) => {
      batch.update(doc(db, 'matches', id), update);
    });
    await batch.commit();
  }

  return updates.length;
}

export async function getActiveMatches(): Promise<Match[]> {
  return getAllDocuments<Match>(COLLECTIONS.matches, [
    where('status', 'in', ['waiting', 'calling', 'playing']),
    orderBy('created_at')
  ]);
}

/**
 * BYE試合（不戦勝）のプレイヤー変更を次ラウンドに連動させる。
 * PairSeedManagerで1回戦のペアを変更した後に呼び出す。
 * 次のラウンドもBYEであれば再帰的に伝播する。
 *
 * @param changedMatch 変更済みの試合データ（新しいplayer_idを含む）
 * @param allMatches   同一トーナメントの全試合（構造参照用）
 */
export async function propagateByePlayerChange(
  changedMatch: Match,
  allMatches: Match[]
): Promise<void> {
  // 確定済みBYEのみ伝播する。
  // waiting状態の試合（Round 2以降で片側だけ埋まっている試合）は伝播しない。
  // これにより PairSeedManager が Round 2 試合に対して呼んでも Round 3 を汚染しない。
  const isConfirmedBye = changedMatch.status === 'completed' || !!changedMatch.is_walkover;
  if (!isConfirmedBye) return;

  // BYE判定: 片方のみ選手が存在する
  const hasPlayer1 = !!changedMatch.player1_id;
  const hasPlayer2 = !!changedMatch.player2_id;
  const isBye = hasPlayer1 !== hasPlayer2;

  if (!isBye) return;

  // 次の試合を構造参照で探す
  // next_match_id（シンプルブラケット）と next_match_number（グループ→ノックアウト）の両方をサポート
  let nextMatch: Match | undefined;
  if (changedMatch.next_match_id) {
    nextMatch = allMatches.find(m => m.id === changedMatch.next_match_id);
  } else if (changedMatch.next_match_number != null) {
    nextMatch = allMatches.find(m =>
      m.match_number === changedMatch.next_match_number &&
      (changedMatch.division == null || m.division === changedMatch.division) &&
      m.tournament_type === changedMatch.tournament_type
    );
  }
  if (!nextMatch || !nextMatch.id) return;

  // 進出者はプレイヤーが存在する側
  const isPlayer1Winner = hasPlayer1;

  // 次の試合での位置（1=上側 / 2=下側）
  const position: 1 | 2 = changedMatch.next_match_position ??
    ((changedMatch.match_number ?? 0) % 2 === 1 ? 1 : 2);

  // 更新フィールドを構築
  const update: Record<string, unknown> = {};
  if (position === 1) {
    update.player1_id = isPlayer1Winner ? changedMatch.player1_id : changedMatch.player2_id;
    update.player3_id = (isPlayer1Winner ? changedMatch.player3_id : changedMatch.player4_id) || null;
    update.player5_id = (isPlayer1Winner ? changedMatch.player5_id : changedMatch.player6_id) || null;
  } else {
    update.player2_id = isPlayer1Winner ? changedMatch.player1_id : changedMatch.player2_id;
    update.player4_id = (isPlayer1Winner ? changedMatch.player3_id : changedMatch.player4_id) || null;
    update.player6_id = (isPlayer1Winner ? changedMatch.player5_id : changedMatch.player6_id) || null;
  }

  console.log(`[BYE伝播] ${changedMatch.id} → ${nextMatch.id} (pos ${position})`, update);
  await updateDocument('matches', nextMatch.id, update);

  // 次の試合もBYEなら再帰的に伝播（連続BYEへの対応）
  // ただし、次の試合が「確定済みBYE」の場合のみ再帰する。
  // waiting状態の試合（round 2以降の未対戦枠）は player2_id="" となっているため、
  // hasPlayer1=true, hasPlayer2=false → isBye=true と誤判定されてしまう。
  // status='completed' または is_walkover=true の場合のみ本物のBYEとして再帰する。
  const updatedNextMatch = { ...nextMatch, ...update } as Match;
  const shouldRecurse = updatedNextMatch.status === 'completed' || !!updatedNextMatch.is_walkover;
  if (shouldRecurse) {
    await propagateByePlayerChange(updatedNextMatch, allMatches);
  }
}

export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus
): Promise<boolean> {
  try {
    if (!matchId) return false;
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    const updateData: Record<string, unknown> = {
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
    const docSnap = await safeGetDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Player;
    }
    return null;
  } catch (error) {
    console.error('Error getting player:', error);
    return null;
  }
}

export function subscribeToActiveMatches(callback: (matches: Match[]) => void, campId?: string) {
  const constraints = [
    where('status', 'in', ['waiting', 'calling', 'playing']),
    orderBy('created_at')
  ];
  if (campId) {
    constraints.unshift(where('campId', '==', campId));
  }
  return subscribeToCollection<Match>(COLLECTIONS.matches, callback, constraints);
}

export function subscribeToCompletedMatches(callback: (matches: Match[]) => void, campId?: string) {
  const constraints = [
    where('status', '==', 'completed'),
    orderBy('updated_at', 'desc')
  ];
  if (campId) {
    constraints.unshift(where('campId', '==', campId));
  }
  return subscribeToCollection<Match>(COLLECTIONS.matches, callback, constraints);
}

export async function resetMatchResult(matchId: string): Promise<boolean> {
  try {
    if (!matchId) return false;

    const currentMatch = await getDocument<Match>(COLLECTIONS.matches, matchId);
    if (!currentMatch) return false;

    // 次の試合から勝者情報を削除
    if (currentMatch.next_match_id && currentMatch.next_match_position) {
      const nextMatchRef = doc(db, COLLECTIONS.matches, currentMatch.next_match_id);
      const nextMatchUpdate: any = { updated_at: Timestamp.now() };

      if (currentMatch.next_match_position === 1) {
        nextMatchUpdate.player1_id = '';
        if (currentMatch.player3_id) nextMatchUpdate.player3_id = '';
      } else if (currentMatch.next_match_position === 2) {
        nextMatchUpdate.player2_id = '';
        if (currentMatch.player4_id) nextMatchUpdate.player4_id = '';
      }

      await updateDoc(nextMatchRef, nextMatchUpdate);
    }

    // 試合を未実施に戻す
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    await updateDoc(matchRef, {
      score_p1: 0,
      score_p2: 0,
      winner_id: null,
      status: 'waiting',
      end_time: null,
      is_walkover: false,
      walkover_winner: null,
      updated_at: Timestamp.now(),
    });

    return true;
  } catch (error) {
    console.error('Error resetting match:', error);
    return false;
  }
}

export async function recordWalkover(
  matchId: string,
  winnerSide: 1 | 2
): Promise<boolean> {
  try {
    if (!matchId) return false;

    const currentMatch = await getDocument<Match>(COLLECTIONS.matches, matchId);
    if (!currentMatch) return false;

    const winnerId = winnerSide === 1 ? currentMatch.player1_id : currentMatch.player2_id;

    // 試合を棄権として完了
    const matchRef = doc(db, COLLECTIONS.matches, matchId);
    await updateDoc(matchRef, {
      is_walkover: true,
      walkover_winner: winnerSide,
      winner_id: winnerId,
      status: 'completed',
      end_time: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    // 次の試合がある場合、勝者を設定
    if (currentMatch.next_match_id && currentMatch.next_match_position) {
      const nextMatchRef = doc(db, COLLECTIONS.matches, currentMatch.next_match_id);
      const winnerMainId = winnerSide === 1 ? currentMatch.player1_id : currentMatch.player2_id;
      const winnerPartnerId = winnerSide === 1 ? currentMatch.player3_id : currentMatch.player4_id;

      const nextMatchUpdate: any = { updated_at: Timestamp.now() };

      if (currentMatch.next_match_position === 1) {
        nextMatchUpdate.player1_id = winnerMainId;
        if (winnerPartnerId) nextMatchUpdate.player3_id = winnerPartnerId;
      } else if (currentMatch.next_match_position === 2) {
        nextMatchUpdate.player2_id = winnerMainId;
        if (winnerPartnerId) nextMatchUpdate.player4_id = winnerPartnerId;
      }

      await updateDoc(nextMatchRef, nextMatchUpdate);
    }

    // ✅ 追加: 選手の休息時間を更新
    const updatedMatch = await getDocument<Match>(COLLECTIONS.matches, matchId);
    if (updatedMatch) {
      await updatePlayersRestTime(updatedMatch);
    }

    return true;
  } catch (error) {
    console.error('Error recording walkover:', error);
    return false;
  }
}


// Phase 9: Tournament Config CRUD
export async function getTournamentConfigs(campId?: string): Promise<TournamentConfig[]> {
  const constraints = campId ? [where('campId', '==', campId)] : [];
  return getAllDocuments<TournamentConfig>('tournament_configs', constraints);
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

export function subscribeToTournamentConfigs(callback: (configs: TournamentConfig[]) => void, campId?: string) {
  const constraints = campId ? [where('campId', '==', campId)] : [];
  return subscribeToCollection<TournamentConfig>('tournament_configs', callback, constraints);
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

  // 3人ペアの場合

  if (match.player5_id) {
    const player5 = await getPlayerById(match.player5_id);
    if (player5) result.player5 = player5;
  }

  if (match.player6_id) {
    const player6 = await getPlayerById(match.player6_id);
    if (player6) result.player6 = player6;
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
export const createCamp = async (title: string, courtCount: number = 6, ownerId?: string) => {
  try {
    // Task 3: 手動でドキュメントIDを生成し、setDocで同期書き込み
    const manualId = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const newCampRef = doc(db, 'camps', manualId);

    const newCamp: Camp = {
      id: manualId,
      title: title,
      court_count: courtCount,
      status: 'setup', // 最初はセットアップ中
      created_at: serverTimestamp() as any,
      owner_id: ownerId, // 作成者のUIDを保存
      config: {
        default_match_points: 15, // デフォルト15点
      },
    };

    console.log('[createCamp] 新規合宿作成 (手動ID):', { title, owner_id: ownerId, id: manualId });
    await setDoc(newCampRef, newCamp);
    // 書き込み成功後、キャッシュをバイパスして強制再読み込み
    if (typeof window !== "undefined") {
      location.reload();
    }
    return manualId;
  } catch (error) {
    console.error("Error creating camp:", error);
    return null;
  }
};

/**
 * すべての合宿を取得する
 */
export const getAllCamps = async (currentUserId?: string): Promise<Camp[]> => {
  try {
    const campsRef = collection(db, 'camps');
    // 作成日順に並べる（新しいものが上）
    const q = query(campsRef, orderBy('created_at', 'desc'));
    const snapshot = await safeGetDocs(q);

    const camps = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Camp));

    // デバッグ: owner_idと現在のユーザーUIDを比較
    if (currentUserId) {
      console.log('[getAllCamps] 現在のログインユーザーUID:', currentUserId);
      camps.forEach(camp => {
        const match = camp.owner_id === currentUserId;
        console.log('[getAllCamps]', {
          camp_id: camp.id,
          camp_title: camp.title,
          owner_id: camp.owner_id || '(未設定)',
          current_user: currentUserId,
          match: match ? '✓' : '✗'
        });
      });
    }

    // 注: 開発中はowner_id未設定の合宿も全て表示
    // 本番環境ではフィルタリングを検討
    // 例: return camps.filter(c => !c.owner_id || c.owner_id === currentUserId);
    return camps;
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
export const archiveCamp = async (campId: string) => {
  try {
    const campRef = doc(db, 'camps', campId);
    await updateDoc(campRef, { status: 'archived' });
  } catch (error) {
    console.error('Error archiving camp:', error);
    throw error;
  }
};

export const unarchiveCamp = async (campId: string) => {
  try {
    const campRef = doc(db, 'camps', campId);
    await updateDoc(campRef, { status: 'setup' });
  } catch (error) {
    console.error('Error unarchiving camp:', error);
    throw error;
  }
};

export const updateCamp = async (campId: string, title: string, courtCount: number) => {
  try {
    await updateDocument('camps', campId, { title, court_count: courtCount });
    return true;
  } catch (error) {
    console.error('Error updating camp:', error);
    return false;
  }
};

export const deleteCamp = async (campId: string) => {
  try {
    const campRef = doc(db, 'camps', campId);
    await deleteDoc(campRef);
  } catch (error) {
    console.error('Error deleting camp:', error);
    throw error;
  }
};

/**
 * 合宿に紐づく全データを完全削除する
 * - Players
 * - Matches
 * - Courts
 * - Tournament Configs
 * - Camp自体
 */
export const deleteCompleteCampData = async (campId: string): Promise<{
  success: boolean;
  deletedCounts: {
    players: number;
    matches: number;
    courts: number;
    tournamentConfigs: number;
  };
  errors: string[];
}> => {
  const errors: string[] = [];
  const deletedCounts = {
    players: 0,
    matches: 0,
    courts: 0,
    tournamentConfigs: 0,
  };

  try {
    // 1. 選手（Players）の削除
    try {
      const playersQuery = query(collection(db, 'players'), where('campId', '==', campId));
      const playersSnapshot = await safeGetDocs(playersQuery);

      if (playersSnapshot.docs.length > 0) {
        const playersBatch = writeBatch(db);
        playersSnapshot.docs.forEach(doc => {
          playersBatch.delete(doc.ref);
        });
        await playersBatch.commit();
        deletedCounts.players = playersSnapshot.docs.length;
      }
    } catch (error) {
      errors.push(`選手の削除に失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 2. 試合（Matches）の削除
    try {
      const matchesQuery = query(collection(db, 'matches'), where('campId', '==', campId));
      const matchesSnapshot = await safeGetDocs(matchesQuery);

      if (matchesSnapshot.docs.length > 0) {
        const matchesBatch = writeBatch(db);
        matchesSnapshot.docs.forEach(doc => {
          matchesBatch.delete(doc.ref);
        });
        await matchesBatch.commit();
        deletedCounts.matches = matchesSnapshot.docs.length;
      }
    } catch (error) {
      errors.push(`試合の削除に失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 3. コート（Courts）の削除
    try {
      const courtsQuery = query(collection(db, 'courts'), where('campId', '==', campId));
      const courtsSnapshot = await safeGetDocs(courtsQuery);

      if (courtsSnapshot.docs.length > 0) {
        const courtsBatch = writeBatch(db);
        courtsSnapshot.docs.forEach(doc => {
          courtsBatch.delete(doc.ref);
        });
        await courtsBatch.commit();
        deletedCounts.courts = courtsSnapshot.docs.length;
      }
    } catch (error) {
      errors.push(`コートの削除に失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 4. トーナメント設定（Tournament Configs）の削除
    try {
      const configsQuery = query(collection(db, 'tournament_configs'), where('campId', '==', campId));
      const configsSnapshot = await safeGetDocs(configsQuery);

      if (configsSnapshot.docs.length > 0) {
        const configsBatch = writeBatch(db);
        configsSnapshot.docs.forEach(doc => {
          configsBatch.delete(doc.ref);
        });
        await configsBatch.commit();
        deletedCounts.tournamentConfigs = configsSnapshot.docs.length;
      }
    } catch (error) {
      errors.push(`トーナメント設定の削除に失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 5. 合宿本体（Camp）の削除
    try {
      const campRef = doc(db, 'camps', campId);
      await deleteDoc(campRef);
    } catch (error) {
      errors.push(`合宿本体の削除に失敗: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      success: errors.length === 0,
      deletedCounts,
      errors
    };
  } catch (error) {
    console.error('Error in deleteCompleteCampData:', error);
    return {
      success: false,
      deletedCounts,
      errors: [...errors, `予期せぬエラー: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
};

export const deleteAllMatches = async (campId: string) => {
  try {
    const matchesQuery = query(collection(db, 'matches'), where('campId', '==', campId));
    const snapshot = await safeGetDocs(matchesQuery);
    const batch = snapshot.docs.reduce((b, doc) => {
      b.delete(doc.ref);
      return b;
    }, writeBatch(db));
    await batch.commit();
  } catch (error) {
    console.error('Error deleting all matches:', error);
    throw error;
  }
};

export const deleteTournamentMatches = async (campId: string, eventType: string, division: number) => {
  try {
    const matchesQuery = query(
      collection(db, 'matches'),
      where('campId', '==', campId),
      where('tournament_type', '==', eventType),
      where('division', '==', division)
    );
    const snapshot = await safeGetDocs(matchesQuery);
    if (snapshot.docs.length === 0) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  } catch (error) {
    console.warn('[deleteTournamentMatches] エラー:', error);
  }
};

export const setupCampCourts = async (courtCount: number, campId: string) => {
  try {
    // Camp専用のコートを作成（initializeCortsと同じ形式）
    // コートID: court_${campId}_${i}

    for (let i = 1; i <= courtCount; i++) {
      const courtId = `court_${campId}_${i}`;
      const courtRef = doc(db, 'courts', courtId);

      // 既存データを取得してマージしないと、進行中の試合が消える恐れがあるが
      // 「合宿切り替え時」前提なので上書きでリセットする
      await setDoc(courtRef, {
        id: courtId,
        number: i,
        // 前半が男子優先、後半が女子優先（例: 6コート→1-3:男子, 4-6:女子）
        preferred_gender: i <= Math.floor(courtCount / 2) ? 'male' : 'female',
        current_match_id: null,
        is_active: true,
        campId
      });
    }

    // 既存のコート数が新しい設定より多い場合（例: 6面→4面）、
    // 余分なコートを無効化
    // この合宿の既存コートを取得
    const existingCourtsQuery = query(
      collection(db, 'courts'),
      where('campId', '==', campId)
    );
    const existingCourtsSnapshot = await getDocs(existingCourtsQuery);

    for (const courtDoc of existingCourtsSnapshot.docs) {
      const court = courtDoc.data() as Court;
      if (court.number > courtCount) {
        // 無効化
        await updateDoc(doc(db, 'courts', courtDoc.id), {
          is_active: false,
          current_match_id: null
        });
      }
    }

    return true;
  } catch (error) {
    console.error("Error setting up camp courts:", error);
    return false;
  }
};

// ===== Chat System Helpers =====

/**
 * チャット機能の設定を取得
 */
export const getSettings = async (campId: string): Promise<Settings | null> => {
  try {
    const settingsRef = doc(db, 'settings', campId);
    const snapshot = await safeGetDoc(settingsRef);
    if (snapshot.exists()) {
      return { id: snapshot.id, ...snapshot.data() } as Settings;
    }
    return null;
  } catch (error) {
    console.error('Error getting settings:', error);
    return null;
  }
};

/**
 * チャット機能の設定を更新
 */
export const updateSettings = async (campId: string, data: Partial<Settings>): Promise<boolean> => {
  try {
    const settingsRef = doc(db, 'settings', campId);
    const existing = await getSettings(campId);

    if (existing) {
      await updateDoc(settingsRef, {
        ...data,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(settingsRef, {
        id: campId,
        campId,
        isChatEnabled: data.isChatEnabled ?? true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }
    return true;
  } catch (error) {
    console.error('Error updating settings:', error);
    return false;
  }
};

/**
 * メッセージを送信
 */
export const sendMessage = async (campId: string, message: Omit<Message, 'id' | 'created_at' | 'read_by'>): Promise<string | null> => {
  try {
    const messagesRef = collection(db, 'messages');
    const newMessageRef = doc(messagesRef);

    await setDoc(newMessageRef, {
      ...message,
      id: newMessageRef.id,
      campId,
      created_at: serverTimestamp(),
      read_by: [],
    });

    return newMessageRef.id;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
};

/**
 * メッセージを取得（特定のプレイヤー宛、または一斉送信）
 *
 * ⚠️ 注意: このクエリには複合インデックスが必要です
 * Firebase Console で以下のインデックスを作成してください:
 * Collection: messages
 * Fields: campId (Ascending), created_at (Descending)
 */
export const getMessages = async (campId: string, playerId?: string): Promise<Message[]> => {
  try {
    // 複合インデックスを使用したクエリを試行
    let q = query(
      collection(db, 'messages'),
      where('campId', '==', campId),
      orderBy('created_at', 'desc'),
      limit(100)
    );

    const snapshot = await safeGetDocs(q);
    let messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

    // プレイヤー用フィルタリング
    if (playerId) {
      messages = messages.filter(msg =>
        msg.type === 'broadcast' ||
        (msg.type === 'individual' && msg.recipient_ids?.includes(playerId))
      );
    }

    return messages;
  } catch (error: any) {
    // インデックスエラーの場合の詳細ログ
    if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
      console.warn('⚠️ [getMessages] Firebaseインデックスが不足しています。');
      console.warn('Firebase Console で複合インデックスを作成してください:');
      console.warn('Collection: messages | Fields: campId (Asc), created_at (Desc)');
      console.warn('フォールバック: orderBy なしのクエリで取得します');

      // フォールバック: orderBy を使わない単純なクエリ
      try {
        const fallbackQuery = query(
          collection(db, 'messages'),
          where('campId', '==', campId),
          limit(100)
        );
        const fallbackSnapshot = await safeGetDocs(fallbackQuery);
        let messages = fallbackSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

        // プレイヤー用フィルタリング
        if (playerId) {
          messages = messages.filter(msg =>
            msg.type === 'broadcast' ||
            (msg.type === 'individual' && msg.recipient_ids?.includes(playerId))
          );
        }

        // クライアント側でソート
        messages.sort((a, b) => {
          const timeA = a.created_at ? (a.created_at as any).toMillis() : 0;
          const timeB = b.created_at ? (b.created_at as any).toMillis() : 0;
          return timeB - timeA;
        });

        return messages;
      } catch (fallbackError) {
        console.error('Error in fallback query:', fallbackError);
        return [];
      }
    }

    console.error('Error getting messages:', error);
    return [];
  }
};

/**
 * メッセージをリアルタイム購読
 *
 * ⚠️ 注意: このクエリには複合インデックスが必要です
 * Firebase Console で以下のインデックスを作成してください:
 * Collection: messages
 * Fields: campId (Ascending), created_at (Descending)
 */
export const subscribeToMessages = (
  campId: string,
  callback: (messages: Message[]) => void,
  playerId?: string
): (() => void) => {
  try {
    // 複合インデックスを使用したクエリを試行
    const q = query(
      collection(db, 'messages'),
      where('campId', '==', campId),
      orderBy('created_at', 'desc'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        let messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

        // プレイヤー用フィルタリング
        if (playerId) {
          messages = messages.filter(msg =>
            msg.type === 'broadcast' ||
            (msg.type === 'individual' && msg.recipient_ids?.includes(playerId))
          );
        }

        callback(messages);
      },
      (error: any) => {
        // インデックスエラーの場合の詳細ログとフォールバック
        if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
          console.warn('⚠️ [subscribeToMessages] Firebaseインデックスが不足しています。');
          console.warn('Firebase Console で複合インデックスを作成してください:');
          console.warn('Collection: messages | Fields: campId (Asc), created_at (Desc)');
          console.warn('フォールバック: orderBy なしのクエリで購読します');

          // フォールバック: orderBy を使わない単純なクエリで再試行
          const fallbackQuery = query(
            collection(db, 'messages'),
            where('campId', '==', campId),
            limit(100)
          );

          return onSnapshot(
            fallbackQuery,
            (snapshot) => {
              let messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

              // プレイヤー用フィルタリング
              if (playerId) {
                messages = messages.filter(msg =>
                  msg.type === 'broadcast' ||
                  (msg.type === 'individual' && msg.recipient_ids?.includes(playerId))
                );
              }

              // クライアント側でソート
              messages.sort((a, b) => {
                const timeA = a.created_at ? (a.created_at as any).toMillis() : 0;
                const timeB = b.created_at ? (b.created_at as any).toMillis() : 0;
                return timeB - timeA;
              });

              callback(messages);
            },
            (fallbackError) => {
              console.error('Error in fallback subscription:', fallbackError);
              callback([]);
            }
          );
        }

        console.error('Error subscribing to messages:', error);
        callback([]);
      }
    );
  } catch (error: any) {
    console.error('Error setting up message subscription:', error);
    return () => {};
  }
};

/**
 * メッセージを既読にする
 */
export const markMessageAsRead = async (messageId: string, playerId: string): Promise<boolean> => {
  try {
    const messageRef = doc(db, 'messages', messageId);
    const snapshot = await safeGetDoc(messageRef);

    if (snapshot.exists()) {
      const message = snapshot.data() as Message;
      const readBy = message.read_by || [];

      if (!readBy.includes(playerId)) {
        await updateDoc(messageRef, {
          read_by: [...readBy, playerId],
        });
      }
    }

    return true;
  } catch (error) {
    console.error('Error marking message as read:', error);
    return false;
  }
};

/**
 * 試合終了時に選手の休息時間を記録
 */
export const updatePlayersRestTime = async (match: Match): Promise<void> => {
  try {
    const playerIds = [
      match.player1_id,
      match.player2_id,
      match.player3_id,
      match.player4_id
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    const now = Timestamp.now();

    for (const playerId of playerIds) {
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await safeGetDoc(playerRef);

      if (playerSnap.exists()) {
        await updateDoc(playerRef, {
          last_match_finished_at: now
        });
      }
    }
  } catch (error) {
    console.error('Error updating players rest time:', error);
  }
};

/**
 * コートを手動でフリーにし、試合を待機リストの先頭に戻す
 */
export const freeCourtManually = async (courtId: string): Promise<boolean> => {
  try {
    const court = await getDocument<Court>('courts', courtId);
    if (!court) return false;

    const currentMatchId = court.current_match_id;
    if (!currentMatchId) {
      // 試合が割り当てられていない場合は単にmanually_freedをtrueに
      await updateDocument('courts', courtId, {
        manually_freed: true,
        freed_match_id: null
      });
      return true;
    }

    // 試合を待機状態に戻す（created_atを現在時刻より少し前に設定して先頭に）
    const priorityTime = Timestamp.fromMillis(Date.now() - 1000000); // 現在時刻より約16分前
    await updateDocument('matches', currentMatchId, {
      status: 'waiting',
      court_id: null,
      created_at: priorityTime // 待機リストの先頭に来るよう調整
    });

    // コートをフリーに
    await updateDocument('courts', courtId, {
      current_match_id: null,
      manually_freed: true,
      freed_match_id: currentMatchId
    });

    return true;
  } catch (error) {
    console.error('Error freeing court manually:', error);
    return false;
  }
};

/**
 * 手動フリー状態を解除
 */
export const unfreeCourtManually = async (courtId: string): Promise<boolean> => {
  try {
    await updateDocument('courts', courtId, {
      manually_freed: false,
      freed_match_id: null
    });
    return true;
  } catch (error) {
    console.error('Error unfreeing court:', error);
    return false;
  }
};

/**
 * 試合を特定のコートに移動
 */
export const moveMatchToCourt = async (matchId: string, targetCourtId: string): Promise<boolean> => {
  try {
    const match = await getDocument<Match>('matches', matchId);
    const targetCourt = await getDocument<Court>('courts', targetCourtId);

    if (!match || !targetCourt) return false;

    // ターゲットコートが使用中でないことを確認
    if (targetCourt.current_match_id) {
      console.error('Target court is already in use');
      return false;
    }

    // 元のコートから試合を解放
    if (match.court_id) {
      await updateDocument('courts', match.court_id, {
        current_match_id: null
      });
    }

    // 新しいコートに割り当て
    await updateDocument('matches', matchId, {
      court_id: targetCourtId,
      status: 'calling' // 移動後は呼び出し状態に
    });

    await updateDocument('courts', targetCourtId, {
      current_match_id: matchId
    });

    return true;
  } catch (error) {
    console.error('Error moving match to court:', error);
    return false;
  }
};

/**
 * 試合に休憩を設定してコートを解放
 */
export const setMatchBreak = async (
  matchId: string,
  courtId: string,
  breakMinutes: number
): Promise<boolean> => {
  try {
    const match = await getDocument<Match>('matches', matchId);
    const court = await getDocument<Court>('courts', courtId);

    if (!match || !court) return false;

    // 復帰時刻を計算
    const availableAt = Timestamp.fromMillis(Date.now() + breakMinutes * 60 * 1000);

    // 試合に休憩情報を設定
    await updateDocument('matches', matchId, {
      available_at: availableAt,
      reserved_court_id: courtId,
      status: 'waiting', // 待機状態に戻す
      court_id: null // コートから解放
    });

    // コートを解放
    await updateDocument('courts', courtId, {
      current_match_id: null
    });

    return true;
  } catch (error) {
    console.error('Error setting match break:', error);
    return false;
  }
};

/**
 * 休憩を解除して即時復帰可能にする
 */
export const cancelMatchBreak = async (matchId: string): Promise<boolean> => {
  try {
    const match = await getDocument<Match>('matches', matchId);
    if (!match) return false;

    // available_atを現在時刻に設定（即時復帰可能）
    await updateDocument('matches', matchId, {
      available_at: Timestamp.now()
    });

    return true;
  } catch (error) {
    console.error('Error canceling match break:', error);
    return false;
  }
};

/**
 * 休憩終了後、そのまま予約コートで試合を開始
 */
export const startMatchOnReservedCourt = async (matchId: string): Promise<boolean> => {
  try {
    const match = await getDocument<Match>('matches', matchId);
    if (!match || !match.reserved_court_id) return false;

    const court = await getDocument<Court>('courts', match.reserved_court_id);
    if (!court) return false;

    // コートが使用中の場合はエラー
    if (court.current_match_id) {
      console.error('Reserved court is already in use');
      return false;
    }

    // 試合を予約コートにアサイン
    await updateDocument('matches', matchId, {
      status: 'calling',
      court_id: match.reserved_court_id,
      reserved_court_id: null,  // 予約解除
      available_at: null         // 休憩時間クリア
    });

    await updateDocument('courts', match.reserved_court_id, {
      current_match_id: matchId
    });

    return true;
  } catch (error) {
    console.error('Error starting match on reserved court:', error);
    return false;
  }
};


// Web Push サブスクリプションを player ドキュメントに保存 / 削除
export const savePushSubscription = async (playerId: string, sub: object | null): Promise<void> => {
  const ref = doc(db, 'players', playerId);
  if (sub) {
    await updateDoc(ref, { pushSubscription: sub });
  } else {
    await updateDoc(ref, { pushSubscription: deleteField() });
  }
};
