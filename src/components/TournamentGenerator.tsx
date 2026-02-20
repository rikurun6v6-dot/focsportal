"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Trophy, AlertTriangle, Users, Sparkles, Check, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { collection, query, where, writeBatch, doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { safeGetDocs } from "@/lib/firestore-helpers";
import { db } from "@/lib/firebase";
import { generateRandomPairs, generateMixedPairs, generateTournamentBracket, generateSinglesMatches } from "@/lib/tournament-generator";
import { getTournamentConfigs, createTournamentConfig } from "@/lib/firestore-helpers";
import { generatePowerOf2Bracket, calculateBracketSize, calculateRounds, getRoundNameByNumber, getFinalMatchId } from "@/lib/tournament-logic";
import { useCamp } from "@/context/CampContext"; // 👈 Contextから合宿情報を取得
import type { Player, TournamentType, Division, TournamentFormat, TeamGroup } from "@/types";

type TournamentGeneratorState = {
  tournamentType: TournamentType;
  division: Division;
  format: TournamentFormat;
  pointsPerGame: number;
  priority: number;
  pointsByRound: Record<number, number>;
  groupCount: number;
  qualifiersPerGroup: number;
  loading: boolean;
  result: { matchCount: number; roundCount: number } | null;
  error: string | null;
  baselineDuration11: number;
  baselineDuration15: number;
  baselineDuration21: number;
};

interface MatchData {
  id?: string;
  campId: string;
  tournament_type: TournamentType;
  division: Division;
  round: number;
  match_number: number;
  phase: 'preliminary' | 'knockout';
  group?: TeamGroup;
  status: string;
  court_id: string | null;
  player1_id?: string;
  player2_id?: string;
  player3_id?: string;
  player4_id?: string;
  player5_id?: string; // 3人ペア用
  player6_id?: string; // 3人ペア用
  score_p1: number;
  score_p2: number;
  winner_id: string | null;
  start_time: null;
  end_time: null;
  points_per_match: number;
  next_match_id?: string;
  next_match_number?: number;
  next_match_position?: number;
  created_at?: unknown;
  updated_at?: unknown;
}

/**
 * 予選グループの試合データを生成（総当たり戦）
 */
function generateGroupStageMatches(
  pairs: ([Player, Player] | [Player, Player, Player])[],
  groupCount: number,
  campId: string,
  tournamentType: TournamentType,
  division: Division,
  pointsPerMatch: number
): MatchData[] {
  const matches: MatchData[] = [];
  const groupLabels: TeamGroup[] = ['A', 'B', 'C', 'D'];

  // ペアをグループに振り分け
  const groups: { [key in TeamGroup]?: ([Player, Player] | [Player, Player, Player])[] } = {};
  const pairsPerGroup = Math.ceil(pairs.length / groupCount);

  for (let i = 0; i < groupCount; i++) {
    const groupLabel = groupLabels[i];
    const startIdx = i * pairsPerGroup;
    const endIdx = Math.min(startIdx + pairsPerGroup, pairs.length);
    groups[groupLabel] = pairs.slice(startIdx, endIdx);
  }

  // 各グループで総当たり戦の試合を生成
  let matchNumber = 1;
  Object.entries(groups).forEach(([groupLabel, groupPairs]) => {
    if (!groupPairs) return;

    // 総当たり戦: 各ペアが他のすべてのペアと対戦
    for (let i = 0; i < groupPairs.length; i++) {
      for (let j = i + 1; j < groupPairs.length; j++) {
        const pair1 = groupPairs[i];
        const pair2 = groupPairs[j];

        matches.push({
          campId,
          tournament_type: tournamentType,
          division,
          round: 1, // 予選は全てround 1
          match_number: matchNumber++,
          phase: 'preliminary' as const,
          group: groupLabel as TeamGroup,
          status: 'waiting',
          court_id: null,
          player1_id: pair1[0].id,
          player3_id: pair1[1].id,
          ...(pair1.length === 3 && { player5_id: pair1[2].id }),
          player2_id: pair2[0].id,
          player4_id: pair2[1].id,
          ...(pair2.length === 3 && { player6_id: pair2[2].id }),
          score_p1: 0,
          score_p2: 0,
          winner_id: null,
          start_time: null,
          end_time: null,
          points_per_match: pointsPerMatch,
        });
      }
    }
  });

  return matches;
}

export default function TournamentGenerator({ readOnly = false, onGenerateSuccess }: { readOnly?: boolean; onGenerateSuccess?: () => void }) {
  const { camp } = useCamp();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // 1部用の状態
  const [division1State, setDivision1State] = useState<TournamentGeneratorState>({
    tournamentType: "mens_doubles",
    division: 1,
    format: "single-elimination",
    pointsPerGame: 15,
    priority: 999,
    pointsByRound: {},
    groupCount: 4,
    qualifiersPerGroup: 2,
    loading: false,
    result: null,
    error: null,
    baselineDuration11: 8,
    baselineDuration15: 12,
    baselineDuration21: 15,
  });

  // 2部用の状態
  const [division2State, setDivision2State] = useState<TournamentGeneratorState>({
    tournamentType: "mens_doubles",
    division: 2,
    format: "single-elimination",
    pointsPerGame: 15,
    priority: 999,
    pointsByRound: {},
    groupCount: 4,
    qualifiersPerGroup: 2,
    loading: false,
    result: null,
    error: null,
    baselineDuration11: 8,
    baselineDuration15: 12,
    baselineDuration21: 15,
  });

  const handleGenerate = async (division: Division) => {
    console.log('[トーナメント生成] 開始:', { division, campId: camp?.id });

    if (!camp) {
      console.error('[トーナメント生成] エラー: 合宿未選択');
      const setState = division === 1 ? setDivision1State : setDivision2State;
      setState(prev => ({ ...prev, error: "合宿データが選択されていません" }));
      return;
    }

    const currentState = division === 1 ? division1State : division2State;
    const setState = division === 1 ? setDivision1State : setDivision2State;

    console.log('[トーナメント生成] 設定:', {
      tournamentType: currentState.tournamentType,
      division,
      format: currentState.format,
      pointsPerGame: currentState.pointsPerGame
    });

    setState(prev => ({ ...prev, loading: true, result: null, error: null }));

    try {
      // 0. トーナメント設定を作成・保存
      await createTournamentConfig({
        campId: camp.id,
        event_type: getTournamentEventType(currentState.tournamentType),
        division: division,
        format: currentState.format,
        points_per_game: currentState.pointsPerGame,
        priority: currentState.priority,
        points_by_round: currentState.pointsByRound,
        group_count: currentState.groupCount,
        qualifiers_per_group: currentState.qualifiersPerGroup,
      });

      // 0.1. AI予測の基準値をconfig/systemに保存
      console.log('[トーナメント生成] AI予測基準値を保存:', {
        baselineDuration11: currentState.baselineDuration11,
        baselineDuration15: currentState.baselineDuration15,
        baselineDuration21: currentState.baselineDuration21,
      });

      const configRef = doc(db, 'config', 'system');
      await updateDoc(configRef, {
        avg_match_duration_11: currentState.baselineDuration11,
        avg_match_duration_15: currentState.baselineDuration15,
        avg_match_duration_21: currentState.baselineDuration21,
      });

      // 0.5. 破壊的クリーンアップ（現在の合宿・部の試合を「物理的に全削除」）
      console.log('[トーナメント生成] 破壊的クリーンアップ開始:', {
        campId: camp.id,
        tournamentType: currentState.tournamentType,
        division: division
      });

      // 種目に関係なく、現在の合宿・部の全試合を削除（古いランダムIDも含む）
      const cleanupQuery = query(
        collection(db, "matches"),
        where("campId", "==", camp.id),
        where("tournament_type", "==", currentState.tournamentType),
        where("division", "==", division)
      );
      const cleanupSnapshot = await safeGetDocs(cleanupQuery);

      if (!cleanupSnapshot.empty) {
        console.log(`[トーナメント生成] 削除対象: ${cleanupSnapshot.size}件`);
        const CLEANUP_BATCH_SIZE = 500;

        // 500件ごとにバッチ削除
        for (let i = 0; i < cleanupSnapshot.docs.length; i += CLEANUP_BATCH_SIZE) {
          const cleanupBatch = writeBatch(db);
          const chunk = cleanupSnapshot.docs.slice(i, i + CLEANUP_BATCH_SIZE);

          chunk.forEach(docSnapshot => {
            console.log(`[トーナメント生成] 削除: ${docSnapshot.id}`);
            cleanupBatch.delete(docSnapshot.ref);
          });

          await cleanupBatch.commit();
          console.log(`[トーナメント生成] バッチ削除完了 (${chunk.length}件) ✅`);
        }

        console.log(`[トーナメント生成] 全削除完了: ${cleanupSnapshot.size}件 ✅`);
      } else {
        console.log('[トーナメント生成] 削除対象データなし');
      }

      // 1. 現在の合宿に参加している選手のみを取得
      const playersRef = collection(db, "players");
      const q = query(
        playersRef,
        where("campId", "==", camp.id), // 👈 ここで合宿IDによるフィルタリング
        where("is_active", "==", true)  // 棄権していない選手のみ
      );

      const snapshot = await safeGetDocs(q);
      const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));

      console.log('[トーナメント生成] 選手データ取得:', {
        total: players.length,
        campId: camp.id,
        players: players.map(p => ({ name: p.name, gender: p.gender, division: p.division }))
      });

      if (players.length < 4) {
        console.error('[トーナメント生成] エラー: 選手不足', players.length);
        throw new Error("選手が足りません（最低4名必要です）");
      }

      // 2. 性別・レベルでフィルタリング
      // 種目に応じた性別フィルタ
      const targetGender =
        currentState.tournamentType.includes("womens") ? "female" :
          currentState.tournamentType.includes("mens") ? "male" :
            "mixed";

      // レベルでフィルタリング
      let targetPlayers = players.filter(p => p.division === division);

      console.log('[トーナメント生成] レベルフィルタ後:', {
        division,
        count: targetPlayers.length,
        players: targetPlayers.map(p => p.name)
      });

      // 性別でフィルタリング（厳格なチェック）
      if (targetGender !== "mixed") {
        targetPlayers = targetPlayers.filter(p => {
          const playerGender = p.gender?.toString().toLowerCase().trim();
          return playerGender === targetGender;
        });
      }

      console.log('[トーナメント生成] 性別フィルタ後:', {
        targetGender,
        count: targetPlayers.length,
        players: targetPlayers.map(p => ({ name: p.name, gender: p.gender }))
      });

      if (targetPlayers.length < 4) {
        console.error('[トーナメント生成] エラー: 条件不一致', {
          total: players.length,
          filtered: targetPlayers.length,
          targetGender,
          division
        });
        throw new Error(`条件に合う選手がいません (${players.length}名中、対象${targetPlayers.length}名)\n種目: ${getTournamentName(currentState.tournamentType)}, レベル: ${division}部`);
      }

      // 3. ペア/選手生成
      let pairs: ([Player, Player] | [Player, Player, Player])[] = [];
      let singlePlayers: Player[] = [];
      let pairErrors: string[] = [];

      if (currentState.tournamentType.includes("singles")) {
        // シングルス: 個人戦として1名ずつ登録
        const singlesResult = generateSinglesMatches(targetPlayers, currentState.tournamentType, division);
        singlePlayers = singlesResult.players;
        pairErrors = singlesResult.errors;

        if (singlePlayers.length === 0) {
          throw new Error(`選手を生成できませんでした: ${pairErrors.join(", ")}`);
        }
      } else if (currentState.tournamentType === "mixed_doubles") {
        // 混合ダブルス
        const mixResult = generateMixedPairs(targetPlayers, division);
        pairs = mixResult.pairs;
        pairErrors = mixResult.errors;

        if (pairs.length === 0) {
          throw new Error(`ペアを生成できませんでした: ${pairErrors.join(", ")}`);
        }
      } else {
        // 男女ダブルス
        const randomResult = generateRandomPairs(targetPlayers, currentState.tournamentType, division);
        pairs = randomResult.pairs;
        pairErrors = randomResult.errors;

        if (pairs.length === 0) {
          throw new Error(`ペアを生成できませんでした: ${pairErrors.join(", ")}`);
        }
      }

      // 4. トーナメント設定を使用
      const groupCount = currentState.groupCount;
      const qualifiersPerGroup = currentState.qualifiersPerGroup;
      const pointsByRound: Record<number, number> = currentState.pointsByRound;
      const defaultPoints: number = currentState.pointsPerGame;

      // 5. Firestore保存用のデータ構築
      const matchesRef = collection(db, "matches");

      // formatによって生成ロジックを分岐
      if (currentState.format === 'group-stage-knockout') {
        // ===== 予選リーグ + 決勝トーナメント =====

        // 予選グループの試合を生成（3人ペアも含む）
        const groupMatches = generateGroupStageMatches(
          pairs,
          groupCount,
          camp.id,
          currentState.tournamentType,
          division,
          defaultPoints
        );

        // 決勝トーナメントの枠を生成（プレースホルダー）
        const qualifierCount = groupCount * qualifiersPerGroup;
        const bracket = generateTournamentBracket(qualifierCount);

        let knockoutMatches: MatchData[] = [];
        let matchNumber = groupMatches.length + 1; // 予選の後から番号を継続

        for (let round = 1; round <= bracket.rounds; round++) {
          const matchesInRound = bracket.matchesPerRound[round - 1];
          const pointsForRound = pointsByRound[round] || defaultPoints;

          for (let m = 0; m < matchesInRound; m++) {
            knockoutMatches.push({
              campId: camp.id,
              tournament_type: currentState.tournamentType,
              division: division,
              round: round,
              match_number: matchNumber++,
              phase: 'knockout' as const,
              status: 'waiting',
              court_id: null,
              player1_id: '', // 予選後に決定
              player2_id: '', // 予選後に決定
              player3_id: '', // ダブルスの場合
              player4_id: '', // ダブルスの場合
              score_p1: 0,
              score_p2: 0,
              winner_id: null,
              start_time: null,
              end_time: null,
              points_per_match: pointsForRound,
            });
          }
        }

        // 3位決定戦を追加（準決勝が2試合以上ある場合）
        const semiFinalRound = bracket.rounds - 1; // 準決勝のラウンド番号
        const semiFinalMatches = bracket.matchesPerRound[semiFinalRound - 1];

        if (semiFinalMatches >= 2) {
          const pointsFor3rdPlace = pointsByRound[bracket.rounds] || pointsByRound[bracket.rounds - 1] || defaultPoints;

          knockoutMatches.push({
            campId: camp.id,
            tournament_type: currentState.tournamentType,
            division: division,
            round: bracket.rounds, // 決勝と同じラウンド（3位決定戦）
            match_number: matchNumber++,
            phase: 'knockout' as const,
            status: 'waiting',
            court_id: null,
            player1_id: '', // 準決勝敗者1
            player2_id: '', // 準決勝敗者2
            player3_id: '', // ダブルスの場合
            player4_id: '', // ダブルスの場合
            score_p1: 0,
            score_p2: 0,
            winner_id: null,
            start_time: null,
            end_time: null,
            points_per_match: pointsFor3rdPlace,
          });

          console.log('[トーナメント生成] 3位決定戦を追加しました');
        }

        // すべての試合をFirestoreに保存（500件ごとにバッチ分割）
        const allMatches = [...groupMatches, ...knockoutMatches];
        const BATCH_SIZE = 500;

        console.log('[トーナメント生成] Firestore保存開始:', {
          totalMatches: allMatches.length,
          batches: Math.ceil(allMatches.length / BATCH_SIZE)
        });

        for (let i = 0; i < allMatches.length; i += BATCH_SIZE) {
          const batchChunk = writeBatch(db);
          const chunk = allMatches.slice(i, i + BATCH_SIZE);

          console.log(`[トーナメント生成] バッチ ${Math.floor(i / BATCH_SIZE) + 1} 保存中...`, {
            start: i,
            end: Math.min(i + BATCH_SIZE, allMatches.length),
            count: chunk.length
          });

          chunk.forEach(matchData => {
            const docRef = doc(matchesRef);
            batchChunk.set(docRef, {
              ...matchData,
              id: docRef.id,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp(),
            });
          });

          await batchChunk.commit();
          console.log(`[トーナメント生成] バッチ ${Math.floor(i / BATCH_SIZE) + 1} 保存完了 ✅`);
        }

        console.log('[トーナメント生成] 全バッチ保存完了 ✅');

        // Firestoreの物理的書き込み完了を確実に待機
        console.log('[トーナメント生成] Firestoreの物理的書き込み完了を待機中...');
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[トーナメント生成] Firestore書き込み完了確認 ✅');

        // State更新を一度にまとめて実行
        setState(prev => ({
          ...prev,
          loading: false,
          result: {
            matchCount: allMatches.length,
            roundCount: bracket.rounds
          }
        }));

        // 生成成功時のコールバック（await後に実行）
        if (onGenerateSuccess) {
          await new Promise(resolve => setTimeout(resolve, 500));
          onGenerateSuccess();
        }

      } else {
        // ===== シングル/ダブルエリミネーション（2の累乗スロット方式） =====
        console.log('[トーナメント生成] 2の累乗スロット方式');

        // シングルスの場合は選手、ダブルスの場合はペアを準備
        const isDoubles = !currentState.tournamentType.includes("singles");
        const participants = isDoubles ? pairs : singlePlayers;

        console.log('[トーナメント生成] 参加者数:', participants.length);

        // 2の累乗ブラケットを生成
        const bracket = generatePowerOf2Bracket(participants as (Player | [Player, Player])[], isDoubles);

        console.log('[トーナメント生成] ブラケット生成完了:', {
          totalSlots: bracket.totalSlots,
          totalRounds: bracket.totalRounds,
          totalMatches: bracket.slots.length,
          participantCount: bracket.participantCount
        });

        // バッチ処理用
        const BATCH_SIZE = 500;
        let currentBatch = writeBatch(db);
        let batchCount = 0;

        // 各スロットを試合データに変換してFirestoreに保存
        for (const slot of bracket.slots) {
          const pointsForRound = pointsByRound[slot.roundNumber] || defaultPoints;

          // ドキュメントIDの強制固定: getFinalMatchId()を使用
          const matchDocId = getFinalMatchId(
            camp.id,
            currentState.tournamentType,
            division,
            slot.roundNumber,
            slot.matchNumber
          );
          const matchDocRef = doc(matchesRef, matchDocId);

          console.log(`[トーナメント生成] 保存: matches/${matchDocId}`);

          let matchData: MatchData = {
            id: matchDocId,
            campId: camp.id,
            tournament_type: currentState.tournamentType,
            division: division,
            round: slot.roundNumber,
            match_number: slot.matchNumber,
            phase: 'knockout' as const,
            status: "waiting",
            court_id: null,
            score_p1: 0,
            score_p2: 0,
            winner_id: null,
            start_time: null,
            end_time: null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
            points_per_match: pointsForRound,
          };

          // 選手を配置（Byeの場合は空文字列）
          if (isDoubles) {
            matchData.player1_id = slot.player1?.id || "";
            matchData.player2_id = slot.player2?.id || "";
            matchData.player3_id = slot.player3?.id || "";
            matchData.player4_id = slot.player4?.id || "";

            // 3人ペアの場合、5人目と6人目も配置
            if (slot.player5) {
              matchData.player5_id = slot.player5.id || "";
              console.log(`[3人ペア] Match ${matchData.id}: player5_id = ${slot.player5.name}`);
            }
            if (slot.player6) {
              matchData.player6_id = slot.player6.id || "";
              console.log(`[3人ペア] Match ${matchData.id}: player6_id = ${slot.player6.name}`);
            }
          } else {
            // シングルス: player3_id, player4_id は省略（undefinedを避ける）
            matchData.player1_id = slot.player1?.id || "";
            matchData.player2_id = slot.player2?.id || "";
            // player3_id, player4_id はフィールド自体を含めない
          }

          // Byeの処理（片方の選手がいない場合は自動勝利）
          const isByeMatch = (slot.player1 && !slot.player2) || (!slot.player1 && slot.player2);
          let byeWinner: Player | undefined;

          if (slot.player1 && !slot.player2) {
            matchData.status = "completed";
            matchData.winner_id = slot.player1.id;
            byeWinner = slot.player1;
          } else if (!slot.player1 && slot.player2) {
            matchData.status = "completed";
            matchData.winner_id = slot.player2.id;
            byeWinner = slot.player2;
          }

          // 次の試合への参照
          if (slot.nextMatchId) {
            // nextMatchIdは "round_matchNumber" 形式（例: "2_1"）なので分解する
            const [nextRound, nextMatchNumber] = slot.nextMatchId.split('_').map(Number);
            const nextMatchDocId = getFinalMatchId(
              camp.id,
              currentState.tournamentType,
              division,
              nextRound,
              nextMatchNumber
            );
            matchData.next_match_id = nextMatchDocId;

            // 勝者が次の試合のどちら側に入るかを決定
            // 現在のmatchNumberが奇数なら次の試合のposition 1（上側）
            // 偶数ならposition 2（下側）
            const nextPosition = (slot.matchNumber % 2 === 1) ? 1 : 2;
            matchData.next_match_position = nextPosition;

            // Byeの場合、次の試合に勝者を即座に設定
            if (isByeMatch && byeWinner) {
              const nextMatchRef = doc(db, 'matches', nextMatchDocId);

              // 次の試合のデータを準備（位置に応じて設定）
              // ※ この updateDoc は実際には実行されない（第2ループで処理する）
              const isByeWinnerTeamA = byeWinner === slot.player1;
              const byePartner = isByeWinnerTeamA ? slot.player3 : slot.player4;
              const nextMatchUpdate: any = {};
              if (nextPosition === 1) {
                nextMatchUpdate.player1_id = byeWinner.id;
                if (isDoubles && byePartner) {
                  nextMatchUpdate.player3_id = byePartner.id;
                }
              } else {
                nextMatchUpdate.player2_id = byeWinner.id;
                if (isDoubles && byePartner) {
                  nextMatchUpdate.player4_id = byePartner.id;
                }
              }

              // バッチに追加（次の試合が既に存在する前提で更新）
              // ※ トーナメント生成は順序通りなので、次の試合は後で作成されるため、
              // ※ ここでは一旦スキップし、生成完了後に別途更新する方が安全
              // ※ 代わりに、Bye試合のステータスをcompletedにすることで、
              // ※ firestore-helpers.tsのupdateMatchResult相当の処理が後で実行される
              console.log(`[Bye進出] Match ${matchData.id} の勝者 ${byeWinner.name} → 次の試合 ${nextMatchDocId} (position ${nextPosition})`);
            }
          }

          currentBatch.set(matchDocRef, matchData);
          batchCount++;

          // 500件ごとにバッチをコミット
          if (batchCount >= BATCH_SIZE) {
            console.log(`[トーナメント生成] バッチコミット (${BATCH_SIZE}件)`);
            await currentBatch.commit();
            console.log('[トーナメント生成] バッチコミット完了 ✅');
            currentBatch = writeBatch(db);
            batchCount = 0;
          }
        }

        // 残りのバッチをコミット
        if (batchCount > 0) {
          console.log(`[トーナメント生成] 最終バッチコミット (${batchCount}件)`);
          await currentBatch.commit();
          console.log('[トーナメント生成] 最終バッチコミット完了 ✅');
        }

        // Firestoreの物理的書き込み完了を確実に待機
        console.log('[トーナメント生成] Firestoreの物理的書き込み完了を待機中...');
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[トーナメント生成] Firestore書き込み完了確認 ✅');

        // Bye試合の勝者を次の試合に自動設定
        console.log('[Bye処理] Bye試合の勝者を次の試合に進出させます...');
        const byeMatches = bracket.slots.filter(slot => {
          const isBye = (slot.player1 && !slot.player2) || (!slot.player1 && slot.player2);
          return isBye && slot.nextMatchId;
        });

        for (const byeSlot of byeMatches) {
          const byeWinner = byeSlot.player1 || byeSlot.player2;
          if (!byeWinner || !byeSlot.nextMatchId) continue;

          const [nextRound, nextMatchNumber] = byeSlot.nextMatchId.split('_').map(Number);
          const nextMatchDocId = getFinalMatchId(
            camp.id,
            currentState.tournamentType,
            division,
            nextRound,
            nextMatchNumber
          );

          const nextPosition = (byeSlot.matchNumber % 2 === 1) ? 1 : 2;
          const nextMatchRef = doc(db, 'matches', nextMatchDocId);

          const nextMatchUpdate: any = {
            updated_at: Timestamp.now(),
          };

          // byeWinner がどちらのチームか（Team A = player1 側、Team B = player2 側）で
          // パートナーと3人目を正しく選択する
          const isByeWinnerTeamA = byeWinner === byeSlot.player1;
          const byePartner = isByeWinnerTeamA ? byeSlot.player3 : byeSlot.player4;
          const byeThirdMember = isByeWinnerTeamA ? byeSlot.player5 : byeSlot.player6;

          if (nextPosition === 1) {
            nextMatchUpdate.player1_id = byeWinner.id;
            if (isDoubles && byePartner) {
              nextMatchUpdate.player3_id = byePartner.id;
            }
            if (isDoubles && byeThirdMember) {
              nextMatchUpdate.player5_id = byeThirdMember.id;
              console.log(`[Bye進出] 3人ペアの3人目(→player5): ${byeThirdMember.name}`);
            }
          } else {
            nextMatchUpdate.player2_id = byeWinner.id;
            if (isDoubles && byePartner) {
              nextMatchUpdate.player4_id = byePartner.id;
            }
            if (isDoubles && byeThirdMember) {
              nextMatchUpdate.player6_id = byeThirdMember.id;
              console.log(`[Bye進出] 3人ペアの3人目(→player6): ${byeThirdMember.name}`);
            }
          }

          await updateDoc(nextMatchRef, nextMatchUpdate);
          console.log(`[Bye進出] ${byeWinner.name} → ${nextMatchDocId} (position ${nextPosition})`);
        }
        console.log(`[Bye処理] ${byeMatches.length}件の進出処理完了 ✅`);

        console.log('[トーナメント生成] 成功 🎉', {
          matchCount: bracket.slots.length,
          roundCount: bracket.totalRounds
        });

        // State更新を一度にまとめて実行
        setState(prev => ({
          ...prev,
          loading: false,
          result: {
            matchCount: bracket.slots.length,
            roundCount: bracket.totalRounds
          }
        }));

        // 生成成功時のコールバック（await後に実行）
        if (onGenerateSuccess) {
          await new Promise(resolve => setTimeout(resolve, 500));
          onGenerateSuccess();
        }
      } // else句を閉じる

    } catch (err) {
      // 🔍 詳細なエラーログ出力
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[トーナメント生成エラー] 詳細情報:');
      console.error('エラーオブジェクト:', err);
      
      if (err && typeof err === 'object') {
        const errorObj = err as any;
        console.error('エラーコード:', errorObj.code || '(なし)');
        console.error('エラーメッセージ:', errorObj.message || '(なし)');
        console.error('エラー名:', errorObj.name || '(なし)');
        
        // Firestoreエラーの詳細
        if (errorObj.code) {
          console.error('Firestoreエラーコード:', errorObj.code);
          
          if (errorObj.code === 'permission-denied') {
            console.error('❌ 権限エラー: Firestoreセキュリティルールで書き込みが拒否されました');
            console.error('→ Firebase Console でセキュリティルールを確認してください');
          }
        }
        
        // スタックトレース
        if (errorObj.stack) {
          console.error('スタックトレース:', errorObj.stack);
        }
      }
      
      console.error('接続先プロジェクト:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '(未設定)');
      console.error('合宿ID:', camp?.id || '(なし)');
      console.error('部:', division);
      console.error('種目:', currentState.tournamentType);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      let errorMessage = "トーナメント生成に失敗しました";

      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Firestoreエラーの場合、より詳細な情報を追加
        const errorObj = err as any;
        
        if (errorObj.code === 'permission-denied' || err.message.includes('Missing or insufficient permissions')) {
          errorMessage = '❌ 権限エラー: Firestoreへの書き込みが拒否されました\n\n' +
                        '考えられる原因:\n' +
                        '1. Firestoreセキュリティルールで書き込みが許可されていない\n' +
                        '2. 認証されていないユーザーによるアクセス\n' +
                        '3. プロジェクトIDが間違っている\n\n' +
                        '対処方法:\n' +
                        '→ Firebase Console でセキュリティルールを確認\n' +
                        '→ ブラウザのコンソールでプロジェクトIDを確認\n' +
                        `→ 現在の接続先: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '(未設定)'}`;
        } else if (err.message.includes('FAILED_PRECONDITION')) {
          errorMessage += '\n→ Firestoreのインデックスが必要です\n→ Firebase Console でインデックスを作成してください';
        } else if (err.message.includes('quota')) {
          errorMessage += '\n→ Firestoreの無料枠を超過しています\n→ Firebase Console で使用状況を確認してください';
        } else if (errorObj.code === 'not-found') {
          errorMessage += '\n→ 指定されたドキュメントが見つかりません';
        } else if (errorObj.code === 'unavailable') {
          errorMessage += '\n→ Firestoreサービスが一時的に利用できません\n→ しばらく待ってから再試行してください';
        }
      }

      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
    }
  };

  const renderDivisionCard = (division: Division) => {
    const state = division === 1 ? division1State : division2State;
    const setState = division === 1 ? setDivision1State : setDivision2State;

    // 固定のクラス名（Tailwindの動的クラスは使えないため）
    const cardBorderClass = division === 1 ? "border-t-sky-400" : "border-t-violet-400";
    const titleColorClass = division === 1 ? "text-sky-700" : "text-violet-700";
    const buttonClass = division === 1
      ? "w-full h-11 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
      : "w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-semibold";

    return (
      <Card className={`border-t-4 ${cardBorderClass}`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 ${titleColorClass}`}>
            <Trophy className="w-5 h-5" />
            {division}部トーナメント
          </CardTitle>
          <CardDescription>
            {division}部の選手でトーナメント表を生成します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Users className="w-4 h-4" />
                種目
              </label>
              <Select
                value={state.tournamentType}
                onValueChange={(v: TournamentType) => setState(prev => ({ ...prev, tournamentType: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
                  <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
                  <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
                  <SelectItem value="mens_singles">男子シングルス</SelectItem>
                  <SelectItem value="womens_singles">女子シングルス</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                トーナメント形式
              </label>
              <Select
                value={state.format}
                onValueChange={(v: TournamentFormat) => setState(prev => ({ ...prev, format: v }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single-elimination">シングルエリミネーション</SelectItem>
                  <SelectItem value="double-elimination">ダブルエリミネーション</SelectItem>
                  <SelectItem value="round-robin">総当たりリーグ戦</SelectItem>
                  <SelectItem value="group-stage-knockout">予選リーグ + 決勝トーナメント</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {state.format === 'group-stage-knockout' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">グループ数</label>
                  <Select
                    value={state.groupCount.toString()}
                    onValueChange={(v) => setState(prev => ({ ...prev, groupCount: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2グループ</SelectItem>
                      <SelectItem value="4">4グループ</SelectItem>
                      <SelectItem value="8">8グループ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">予選通過人数/グループ</label>
                  <Select
                    value={state.qualifiersPerGroup.toString()}
                    onValueChange={(v) => setState(prev => ({ ...prev, qualifiersPerGroup: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1位のみ</SelectItem>
                      <SelectItem value="2">2位まで</SelectItem>
                      <SelectItem value="3">3位まで</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Settings2 className="w-4 h-4" />
                基本点数設定
              </label>
              <Select
                value={state.pointsPerGame.toString()}
                onValueChange={(v) => setState(prev => ({ ...prev, pointsPerGame: parseInt(v) }))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="11">11点</SelectItem>
                  <SelectItem value="15">15点</SelectItem>
                  <SelectItem value="21">21点</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center gap-2 p-2 rounded hover:bg-slate-50">
              <span className="group-open:rotate-90 transition-transform">▶</span>
              AI予測基準値設定（試合時間）
            </summary>
            <div className="mt-3 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-700 mb-3">
                各点数での平均試合時間を設定します。この値はAI予測の初期値として使用されます。
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">11点マッチの平均時間（分）</label>
                <Input
                  type="number"
                  min="3"
                  max="30"
                  value={state.baselineDuration11}
                  onChange={(e) => setState(prev => ({ ...prev, baselineDuration11: parseInt(e.target.value) || 8 }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">15点マッチの平均時間（分）</label>
                <Input
                  type="number"
                  min="3"
                  max="30"
                  value={state.baselineDuration15}
                  onChange={(e) => setState(prev => ({ ...prev, baselineDuration15: parseInt(e.target.value) || 12 }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">21点マッチの平均時間（分）</label>
                <Input
                  type="number"
                  min="3"
                  max="30"
                  value={state.baselineDuration21}
                  onChange={(e) => setState(prev => ({ ...prev, baselineDuration21: parseInt(e.target.value) || 15 }))}
                  className="h-9"
                />
              </div>
            </div>
          </details>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 flex items-center gap-2 p-2 rounded hover:bg-slate-50">
              <span className="group-open:rotate-90 transition-transform">▶</span>
              ラウンド別点数設定（詳細）
            </summary>
            <div className="mt-3 space-y-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-600 mb-3">
                特定のラウンドで異なる点数を設定できます（例: 準決勝以降は21点）
              </p>
              {[1, 2, 3, 4, 5].map(round => (
                <div key={round} className="flex items-center gap-3">
                  <label className="text-xs w-20 text-slate-600">ラウンド {round}:</label>
                  <Select
                    value={state.pointsByRound[round]?.toString() || 'none'}
                    onValueChange={(v) => {
                      setState(prev => {
                        const updated = { ...prev.pointsByRound };
                        if (v === 'none') {
                          delete updated[round];
                        } else {
                          updated[round] = parseInt(v);
                        }
                        return { ...prev, pointsByRound: updated };
                      });
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="基本設定を使用" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">基本設定を使用</SelectItem>
                      <SelectItem value="11">11点</SelectItem>
                      <SelectItem value="15">15点</SelectItem>
                      <SelectItem value="21">21点</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </details>

          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Badge variant="outline" className="text-xs">
              {getTournamentName(state.tournamentType)}
            </Badge>
            <span className="text-xs text-slate-500">×</span>
            <Badge variant="outline" className="text-xs">
              {getFormatName(state.format)}
            </Badge>
            <span className="text-xs text-slate-500">×</span>
            <Badge variant="secondary" className="text-xs">
              {state.pointsPerGame}点
            </Badge>
          </div>

          <Button
            onClick={() => handleGenerate(division)}
            disabled={state.loading || readOnly}
            className={buttonClass}
          >
            {state.loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />生成中...</>
            ) : (
              <><Trophy className="w-4 h-4 mr-2" />トーナメントを生成</>
            )}
          </Button>

          {state.error && (
            <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-sm">生成エラー</AlertTitle>
              <AlertDescription className="text-xs">{state.error}</AlertDescription>
            </Alert>
          )}

          {state.result && (
            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-sm font-semibold">生成完了！</AlertTitle>
              <AlertDescription className="text-xs">
                <strong>{state.result.roundCount}ラウンド</strong>、合計<strong>{state.result.matchCount}試合</strong>を作成しました。
                <br /><span className="opacity-80 mt-1 block">「結果入力」タブで試合を確認・進行してください。</span>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  };

  const getFormatName = (format: TournamentFormat): string => {
    const names: Record<TournamentFormat, string> = {
      'single-elimination': 'シングルエリミネーション',
      'double-elimination': 'ダブルエリミネーション',
      'round-robin': '総当たりリーグ戦',
      'group-stage-knockout': '予選リーグ + 決勝トーナメント',
    };
    return names[format];
  };

  if (!camp) return <div>合宿データを選択してください</div>;

  return (
    <div className="space-y-6">
      {/* ステップインジケーター */}
      <div className="flex items-center justify-center gap-4 mb-6">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                currentStep === step
                  ? 'bg-blue-500 text-white ring-4 ring-blue-200'
                  : currentStep > step
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {currentStep > step ? <Check className="w-5 h-5" /> : step}
            </div>
            {step < 3 && (
              <div
                className={`w-16 h-1 ${
                  currentStep > step ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">
          {currentStep === 1 && 'Step 1: 種目設定'}
          {currentStep === 2 && 'Step 2: 参加者選択（ペア設定）'}
          {currentStep === 3 && 'Step 3: ドロー生成'}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {currentStep === 1 && '種目とトーナメント形式を選択してください'}
          {currentStep === 2 && '手動でペアを組むか、ランダム生成を選択してください'}
          {currentStep === 3 && '設定を確認してトーナメントを生成します'}
        </p>
      </div>

      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderDivisionCard(1)}
            {renderDivisionCard(2)}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setCurrentStep(2)} className="bg-blue-600 hover:bg-blue-700">
              次へ進む
            </Button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                ペア設定は現在開発中です。自動ランダムペアリングで進めてください。
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  戻る
                </Button>
                <Button onClick={() => setCurrentStep(3)} className="bg-blue-600 hover:bg-blue-700">
                  ランダムペアで次へ
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {renderDivisionCard(1)}
            {renderDivisionCard(2)}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              戻る
            </Button>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <p className="font-medium mb-1">💡 使い方</p>
        <ul className="list-disc list-inside space-y-1 text-slate-500">
          <li>ステップごとに設定を進めてトーナメントを作成します</li>
          <li>生成された試合は現在の合宿 ({camp.title}) に紐付きます</li>
          <li>各ステップで「戻る」ボタンから前の設定に戻れます</li>
        </ul>
      </div>
    </div>
  );
}

function getTournamentName(type: TournamentType): string {
  switch (type) {
    case "mens_doubles": return "男子ダブルス";
    case "womens_doubles": return "女子ダブルス";
    case "mixed_doubles": return "混合ダブルス";
    case "mens_singles": return "男子シングルス";
    case "womens_singles": return "女子シングルス";
    default: return "団体戦";
  }
}

function getTournamentEventType(type: TournamentType): import("@/types").EventType {
  switch (type) {
    case "mens_doubles": return "MD";
    case "womens_doubles": return "WD";
    case "mixed_doubles": return "XD";
    case "mens_singles": return "MS";
    case "womens_singles": return "WS";
    case "team_battle": return "TEAM";
    default: return "MD";
  }
}