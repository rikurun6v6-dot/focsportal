"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bug, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCamp } from "@/context/CampContext";
import type { Player } from "@/types";

interface DebugStats {
  male_div1: number;
  male_div2: number;
  female_div1: number;
  female_div2: number;
  invalid: Array<{ name: string; gender: string; division: number }>;
}

export default function TournamentDebug() {
  const { camp } = useCamp();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DebugStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDebug = async () => {
    if (!camp) {
      setError("合宿が選択されていません");
      return;
    }

    setLoading(true);
    setError(null);
    setStats(null);

    try {
      // 選手データ取得
      const playersRef = collection(db, 'players');
      const q = query(
        playersRef,
        where('campId', '==', camp.id),
        where('is_active', '==', true)
      );

      const snapshot = await getDocs(q);

      if (snapshot.size === 0) {
        setError("選手が登録されていません");
        setLoading(false);
        return;
      }

      // 選手の属性を集計
      const debugStats: DebugStats = {
        male_div1: 0,
        male_div2: 0,
        female_div1: 0,
        female_div2: 0,
        invalid: []
      };

      snapshot.forEach(doc => {
        const data = doc.data() as Player;
        const gender = data.gender?.toString().toLowerCase().trim();
        const division = data.division;

        if (gender === 'male' && division === 1) debugStats.male_div1++;
        else if (gender === 'male' && division === 2) debugStats.male_div2++;
        else if (gender === 'female' && division === 1) debugStats.female_div1++;
        else if (gender === 'female' && division === 2) debugStats.female_div2++;
        else debugStats.invalid.push({ name: data.name, gender: gender || 'unknown', division: division || 0 });
      });

      setStats(debugStats);
    } catch (err) {
      console.error('デバッグエラー:', err);
      setError(err instanceof Error ? err.message : "デバッグに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (count: number, minRequired: number = 4) => {
    return count >= minRequired ? (
      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    ) : (
      <AlertCircle className="w-4 h-4 text-rose-500" />
    );
  };

  return (
    <Card className="border-t-4 border-t-purple-400">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-700">
          <Bug className="w-5 h-5" />
          トーナメント生成デバッグ
        </CardTitle>
        <CardDescription>
          選手データを確認して生成可能な種目を判定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={runDebug}
          disabled={loading || !camp}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              診断中...
            </>
          ) : (
            <>
              <Bug className="w-4 h-4 mr-2" />
              デバッグ実行
            </>
          )}
        </Button>

        {!camp && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              合宿を選択してください
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {stats && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                📊 選手の内訳
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">男性1部</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{stats.male_div1}名</span>
                    {getStatusIcon(stats.male_div1)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">男性2部</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{stats.male_div2}名</span>
                    {getStatusIcon(stats.male_div2)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">女性1部</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{stats.female_div1}名</span>
                    {getStatusIcon(stats.female_div1)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">女性2部</span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{stats.female_div2}名</span>
                    {getStatusIcon(stats.female_div2)}
                  </div>
                </div>
              </div>
            </div>

            {stats.invalid.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">属性が不正な選手が {stats.invalid.length}名 います：</div>
                  <ul className="list-disc list-inside text-xs space-y-1">
                    {stats.invalid.map((p, i) => (
                      <li key={i}>
                        {p.name}: gender="{p.gender}", division={p.division}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
              <h3 className="font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                💡 生成可能な種目
              </h3>
              <div className="space-y-2 text-sm">
                {stats.male_div1 >= 4 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    男子ダブルス/シングルス 1部
                  </div>
                )}
                {stats.male_div2 >= 4 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    男子ダブルス/シングルス 2部
                  </div>
                )}
                {stats.female_div1 >= 4 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    女子ダブルス/シングルス 1部
                  </div>
                )}
                {stats.female_div2 >= 4 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    女子ダブルス/シングルス 2部
                  </div>
                )}
                {stats.male_div1 >= 2 && stats.female_div1 >= 2 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    混合ダブルス 1部
                  </div>
                )}
                {stats.male_div2 >= 2 && stats.female_div2 >= 2 && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    混合ダブルス 2部
                  </div>
                )}
                {stats.male_div1 < 4 && stats.male_div2 < 4 &&
                 stats.female_div1 < 4 && stats.female_div2 < 4 && (
                  <div className="flex items-center gap-2 text-rose-700">
                    <AlertCircle className="w-4 h-4" />
                    生成可能な種目がありません（各カテゴリ4名以上必要）
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
