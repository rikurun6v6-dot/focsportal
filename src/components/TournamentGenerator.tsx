"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle2, Trophy, AlertTriangle } from "lucide-react";
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateRandomPairs, generateMixedPairs, generateTournamentBracket } from "@/lib/tournament-generator";
import { useCamp } from "@/context/CampContext"; // 👈 Contextから合宿情報を取得
import type { Player, TournamentType, Division } from "@/types";

export default function TournamentGenerator() {
  const { camp } = useCamp(); // 👈 現在の合宿を取得

  const [selectedType, setSelectedType] = useState<TournamentType>("mens_doubles");
  const [selectedDivision, setSelectedDivision] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ matchCount: number; roundCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!camp) {
      setError("合宿データが選択されていません");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      // 1. 現在の合宿に参加している選手のみを取得
      const playersRef = collection(db, "players");
      const q = query(
        playersRef,
        where("campId", "==", camp.id), // 👈 ここで合宿IDによるフィルタリング
        where("is_active", "==", true)  // 棄権していない選手のみ
      );

      const snapshot = await getDocs(q);
      const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));

      if (players.length < 4) {
        throw new Error("選手が足りません（最低4名必要です）");
      }

      // 2. 性別・レベルでフィルタリング
      const division = parseInt(selectedDivision) as Division;

      // 種目に応じた性別フィルタ
      const targetGender =
        selectedType.includes("mens") ? "male" :
          selectedType.includes("womens") ? "female" :
            "mixed";

      let targetPlayers = players.filter(p => p.division === division);

      if (targetGender !== "mixed") {
        targetPlayers = targetPlayers.filter(p => p.gender === targetGender);
      }

      if (targetPlayers.length < 4) {
        throw new Error(`条件に合う選手がいません (${players.length}名中、対象${targetPlayers.length}名)`);
      }

      // 3. ペア生成
      let pairs: any[] = [];
      let pairErrors: string[] = [];

      if (selectedType.includes("singles")) {
        throw new Error("シングルス生成は現在準備中です");
      } else if (selectedType === "mixed_doubles") {
        // 混合ダブルス
        const mixResult = generateMixedPairs(targetPlayers, division);
        pairs = mixResult.pairs;
        pairErrors = mixResult.errors;
      } else {
        // 男女ダブルス
        const randomResult = generateRandomPairs(targetPlayers, selectedType, division);
        pairs = randomResult.pairs;
        pairErrors = randomResult.errors;
      }

      if (pairs.length === 0) {
        throw new Error(`ペアを生成できませんでした: ${pairErrors.join(", ")}`);
      }

      // 4. トーナメント表（試合データ）の構造生成
      // ※ generateTournamentBracket は pairs.length (数値) を受け取る実装を想定
      const bracket = generateTournamentBracket(pairs.length);

      // 5. Firestore保存用のデータ構築
      const batch = writeBatch(db);
      const matchesRef = collection(db, "matches");

      let pairIndex = 0;
      let matchCount = 0;

      // ラウンドごとに試合を作成
      for (let round = 1; round <= bracket.rounds; round++) {
        const matchesInRound = bracket.matchesPerRound[round - 1];

        for (let m = 0; m < matchesInRound; m++) {
          const newDocRef = doc(matchesRef); // ID自動生成
          let matchData: any = {
            id: newDocRef.id,
            campId: camp.id, // 👈 試合データに合宿IDをタグ付け (重要)
            tournament_type: selectedType,
            round: round,
            status: "waiting",
            court_id: null,
            score_p1: 0,
            score_p2: 0,
            winner_id: null,
            start_time: null,
            end_time: null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          };

          // 1回戦のみペアを割り当て
          if (round === 1 && pairIndex < pairs.length - 1) {
            const pair1 = pairs[pairIndex];
            const pair2 = pairs[pairIndex + 1];

            matchData.player1_id = pair1[0].id;
            matchData.player3_id = pair1[1].id; // パートナー
            matchData.player2_id = pair2[0].id;
            matchData.player4_id = pair2[1].id; // パートナー

            pairIndex += 2;
          } else if (round === 1) {
            // 奇数の場合のBYE（不戦勝）などはここで処理するか、ループを抜ける
            break;
          } else {
            // 2回戦以降はプレースホルダー（空の試合）
            matchData.player1_id = "";
            matchData.player2_id = "";
          }

          batch.set(newDocRef, matchData);
          matchCount++;
        }
      }

      // 6. 一括保存実行
      await batch.commit();

      setResult({
        matchCount: matchCount,
        roundCount: bracket.rounds
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "トーナメント生成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  if (!camp) return <div>合宿データを選択してください</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-end">
        <div className="w-full md:flex-1 space-y-2">
          <label className="text-sm font-medium text-slate-700">種目</label>
          <Select value={selectedType} onValueChange={(v: any) => setSelectedType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mens_doubles">男子ダブルス</SelectItem>
              <SelectItem value="womens_doubles">女子ダブルス</SelectItem>
              <SelectItem value="mixed_doubles">混合ダブルス</SelectItem>
              <SelectItem value="mens_singles" disabled>男子シングルス (準備中)</SelectItem>
              <SelectItem value="womens_singles" disabled>女子シングルス (準備中)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-32 space-y-2">
          <label className="text-sm font-medium text-slate-700">レベル</label>
          <Select value={selectedDivision} onValueChange={setSelectedDivision}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1部</SelectItem>
              <SelectItem value="2">2部</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full md:w-auto bg-slate-800 text-white hover:bg-slate-700 min-w-[120px]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4 mr-2" />}
          生成する
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>生成エラー</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>生成完了！</AlertTitle>
          <AlertDescription>
            {getTournamentName(selectedType)} ({selectedDivision === "1" ? "1部" : "2部"})<br />
            <strong>{result.roundCount}ラウンド</strong>、合計<strong>{result.matchCount}試合</strong>を作成しました。
            <br /><span className="text-xs opacity-80">「結果入力」タブで試合を確認・進行してください。</span>
          </AlertDescription>
        </Alert>
      )}

      <div className="text-xs text-slate-400 mt-2">
        ※ ランダムペアリングでトーナメント表を作成します。
        作成された試合は現在の合宿 ({camp.title}) に紐付きます。
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