"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initializeCourts, initializeConfig, getDocument, updateDocument, deleteAllPlayers, deleteAllMatches, getAllDocuments, deleteDocument } from "@/lib/firestore-helpers";
import { autoDispatchAll } from "@/lib/dispatcher";
import CSVImport from "@/components/CSVImport";
import TournamentGenerator from "@/components/TournamentGenerator";
import AutoDispatchEngine from "@/components/AutoDispatchEngine";
import MatchResultInput from "@/components/admin/MatchResultInput";
import PlayerManager from "@/components/admin/PlayerManager";
import TournamentSetup from "@/components/admin/TournamentSetup";
import TeamBattle from "@/components/admin/TeamBattle";
import PlayerRanking from "@/components/admin/PlayerRanking";
import AdminGuard from "@/components/admin/AdminGuard";
import type { Config, Team, TeamBattle as TeamBattleData, TournamentConfig } from "@/types";
// 👇 Import追加
import { ShieldAlert, Activity, Settings, Users, Trophy, Play, BarChart3, Shield, Home, Menu, ArrowLeft, LogOut } from "lucide-react";
import { useCamp } from "@/context/CampContext";
import CampManager from "@/components/admin/CampManager";

export default function AdminDashboard() {
  // 👇 Contextから合宿情報を取得
  const { camp, setManualCamp } = useCamp();

  const [initializing, setInitializing] = useState(false);
  const [message, setMessage] = useState("");
  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(false);
  const [dispatching, setDispatching] = useState(false);

  const handleInitializeCourts = async () => {
    setInitializing(true);
    setMessage("");

    const success = await initializeCourts();

    if (success) {
      setMessage("✓ コートを初期化しました（6面）");
    } else {
      setMessage("✗ エラーが発生しました");
    }

    setInitializing(false);
  };

  const handleInitializeSystem = async () => {
    setInitializing(true);
    setMessage("");

    const courtsSuccess = await initializeCourts();
    const configSuccess = await initializeConfig();

    if (courtsSuccess && configSuccess) {
      setMessage("✓ システムを初期化しました");
    } else {
      setMessage("✗ 初期化に失敗しました");
    }

    setInitializing(false);
  };

  const handleCSVSuccess = (count: number) => {
    setMessage(`✓ ${count}名の参加者を登録しました`);
  };

  const handleCSVError = (errors: string[]) => {
    setMessage(`✗ CSVインポートでエラーが発生しました（${errors.length}件）`);
  };

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getDocument<Config>('config', 'system');
      if (config) {
        setAutoDispatchEnabled(config.auto_dispatch_enabled);
      }
    };
    loadConfig();
  }, []);

  const toggleAutoDispatch = async () => {
    try {
      const newValue = !autoDispatchEnabled;
      await updateDocument('config', 'system', { auto_dispatch_enabled: newValue });
      setAutoDispatchEnabled(newValue);
      setMessage(newValue ? "✓ Auto-Dispatchを有効にしました" : "✓ Auto-Dispatchを無効にしました");
    } catch (error) {
      setMessage("✗ エラーが発生しました");
    }
  };

  const handleManualDispatch = async () => {
    setDispatching(true);
    setMessage("");
    try {
      const count = await autoDispatchAll();
      setMessage(`✓ ${count}試合を割り当てました`);
    } catch (error) {
      setMessage("✗ 割り当てに失敗しました");
    }
    setDispatching(false);
  };

  const handleHardReset = async () => {
    if (!confirm('本当に全データを削除してもよろしいですか? この操作は取り消せません。')) return;
    if (!confirm('最終確認: すべての選手、試合、チーム、設定が削除されます。')) return;

    setInitializing(true);
    setMessage("");

    try {
      await deleteAllPlayers();
      await deleteAllMatches();
      const teams = await getAllDocuments<Team>('teams');
      for (const team of teams) await deleteDocument('teams', team.id);
      const battles = await getAllDocuments<TeamBattleData>('team_battles');
      for (const battle of battles) await deleteDocument('team_battles', battle.id);
      const configs = await getAllDocuments<TournamentConfig>('tournament_configs');
      for (const config of configs) await deleteDocument('tournament_configs', config.id);
      await initializeCourts();
      await initializeConfig();

      setMessage("✓ Hard Reset完了: すべてのデータを削除しました");
    } catch (error) {
      setMessage("✗ Hard Resetに失敗しました");
    }

    setInitializing(false);
  };

  // ==========================================
  // 👇 ここが重要な変更点
  // ==========================================

  // 1. 合宿が選択されていない場合 → CampManager (合宿選択画面) を表示
  if (!camp) {
    return (
      <AdminGuard>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          {/* ヘッダー */}
          <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
            <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-sky-500 shrink-0" />
                <h1 className="text-lg md:text-2xl font-bold text-slate-800">Foc's Portal Admin</h1>
              </div>
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-slate-500 hover:bg-slate-100">
                  <Home className="w-4 h-4 mr-1" />ホーム
                </Button>
              </Link>
            </div>
          </header>

          <main>
            {/* 合宿選択・作成コンポーネント */}
            <CampManager />
          </main>
        </div>
      </AdminGuard>
    );
  }

  // 2. 合宿が選択されている場合 → いつもの管理ダッシュボードを表示
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        {autoDispatchEnabled && <AutoDispatchEngine />}

        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
          <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-500 shrink-0" />
              <div className="flex flex-col md:flex-row md:items-end md:gap-2 leading-none">
                <h1 className="text-lg md:text-2xl font-bold text-slate-800">
                  Foc's Portal
                </h1>
                <span className="text-xs md:text-sm text-slate-500 font-medium md:mb-1">
                  {/* 👇 選択中の合宿名を表示 */}
                  {camp.title}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {/* 👇 合宿選択に戻るボタン */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManualCamp(null as any)} // nullを渡して選択解除
                className="bg-white border-slate-300 text-slate-600 h-9 px-3 text-xs md:text-sm hover:bg-slate-50"
              >
                <LogOut className="w-4 h-4 md:mr-1" />
                <span className="hidden md:inline">合宿選択へ</span>
              </Button>

              <Link href="/user">
                <Button variant="outline" size="sm" className="bg-white border-slate-300 text-slate-600 hover:text-sky-600 hover:bg-sky-50 h-9 px-3 text-xs md:text-sm">
                  <span className="md:hidden">参加者</span>
                  <span className="hidden md:inline">参加者ビュー</span>
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6 md:py-8 max-w-6xl">
          {message && (
            <div className={`mb-6 p-4 rounded-lg flex items-center text-sm md:text-base shadow-sm ${message.startsWith("✓")
              ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
              : "bg-rose-50 border border-rose-200 text-rose-700"
              }`}>
              {message}
            </div>
          )}

          <Tabs defaultValue="setup" className="w-full">
            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-sm mb-6 overflow-x-auto sticky top-[60px] z-10 md:static md:top-auto">
              <TabsList className="flex w-max md:w-full md:grid md:grid-cols-8 bg-transparent p-0 h-auto">
                <TabsTrigger value="setup" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">初期設定</TabsTrigger>
                <TabsTrigger value="players" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">選手</TabsTrigger>
                <TabsTrigger value="tournament" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">設定</TabsTrigger>
                <TabsTrigger value="control" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">操作</TabsTrigger>
                <TabsTrigger value="results" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">結果</TabsTrigger>
                <TabsTrigger value="team" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">団体戦</TabsTrigger>
                <TabsTrigger value="ranking" className="px-3 py-2 data-[state=active]:bg-sky-100 data-[state=active]:text-sky-700">順位</TabsTrigger>
                <TabsTrigger value="safety" className="px-3 py-2 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">安全</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="setup" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Settings className="w-5 h-5 text-sky-500" /> システム初期化
                    </CardTitle>
                    <CardDescription>Firestoreにコートとシステム設定を作成</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                        <Button
                          onClick={handleInitializeCourts}
                          disabled={initializing}
                          variant="outline"
                          className="w-full border-slate-300 hover:bg-slate-50"
                        >
                          {initializing ? "初期化中..." : "コートを初期化（6面）"}
                        </Button>
                        <Button
                          onClick={handleInitializeSystem}
                          disabled={initializing}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                        >
                          {initializing ? "初期化中..." : "システム全体を初期化"}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-400">
                        ※ 初回のみ実行してください。
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Users className="w-5 h-5 text-sky-500" /> 参加者CSVインポート
                    </CardTitle>
                    <CardDescription>60名の参加者データを一括登録</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CSVImport onSuccess={handleCSVSuccess} onError={handleCSVError} />
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-slate-800 text-lg">トーナメント生成</CardTitle>
                  <CardDescription>ペアをランダムに生成してトーナメント表を作成</CardDescription>
                </CardHeader>
                <CardContent>
                  <TournamentGenerator />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="control" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5 text-sky-500" /> Auto-Dispatch 設定
                  </CardTitle>
                  <CardDescription>自動割り当てエンジンのON/OFF</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={`flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 border rounded-lg transition-colors ${autoDispatchEnabled
                    ? "bg-sky-50 border-sky-200"
                    : "bg-slate-50 border-slate-200"
                    }`}>
                    <div>
                      <p className={`font-bold text-lg ${autoDispatchEnabled ? "text-sky-700" : "text-slate-700"}`}>
                        Auto-Dispatch: {autoDispatchEnabled ? "ON" : "OFF"}
                      </p>
                      <p className="text-sm text-slate-500 mt-1">
                        {autoDispatchEnabled
                          ? "現在、空きコートに自動で試合を割り当てています"
                          : "自動割り当ては停止中です"}
                      </p>
                    </div>
                    <Button
                      onClick={toggleAutoDispatch}
                      variant={autoDispatchEnabled ? "destructive" : "default"}
                      className={`w-full md:w-auto ${autoDispatchEnabled ? "bg-rose-500 hover:bg-rose-600" : "bg-sky-500 hover:bg-sky-600"}`}
                    >
                      {autoDispatchEnabled ? "停止する" : "開始する"}
                    </Button>
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 bg-white border border-slate-200 rounded-lg">
                    <div>
                      <p className="font-semibold text-slate-800">手動割り当て (Manual Trigger)</p>
                      <p className="text-sm text-slate-500 mt-1">
                        待機中の試合を今すぐ空きコートに割り当てます
                      </p>
                    </div>
                    <Button
                      onClick={handleManualDispatch}
                      disabled={dispatching}
                      variant="outline"
                      className="w-full md:w-auto border-sky-200 text-sky-700 hover:bg-sky-50"
                    >
                      {dispatching ? "割り当て中..." : "今すぐ実行"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="players" className="space-y-6">
              <PlayerManager />
            </TabsContent>

            <TabsContent value="tournament" className="space-y-6">
              <TournamentSetup />
            </TabsContent>

            <TabsContent value="results" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-green-400">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                    <Play className="w-5 h-5 text-green-500" /> 試合結果入力
                  </CardTitle>
                  <CardDescription>進行中の試合のスコアを入力して結果を確定</CardDescription>
                </CardHeader>
                <CardContent>
                  <MatchResultInput />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="team" className="space-y-6">
              <TeamBattle />
            </TabsContent>

            <TabsContent value="ranking" className="space-y-6">
              <PlayerRanking />
            </TabsContent>

            <TabsContent value="safety" className="space-y-6">
              <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-amber-400">
                <CardHeader>
                  <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                    <ShieldAlert className="w-5 h-5 text-amber-500" /> 安全機能・管理
                  </CardTitle>
                  <CardDescription>誤操作の救済とシステムリセット</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h3 className="font-bold mb-2 text-amber-800">⚠️ Hard Reset (全データ削除)</h3>
                      <p className="text-sm text-amber-700 mb-4">
                        すべての選手、試合、チーム、トーナメント設定を完全に削除し、初期状態に戻します。<br />
                        この操作は取り消せません。
                      </p>
                      <Button
                        variant="destructive"
                        onClick={handleHardReset}
                        disabled={initializing}
                        className="w-full bg-red-500 hover:bg-red-600"
                      >
                        {initializing ? "削除中..." : "Hard Reset を実行"}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {["Undo", "Walkover", "Substitute"].map((action) => (
                        <div key={action} className="p-3 bg-slate-50 border border-slate-200 rounded-lg opacity-60">
                          <h3 className="font-semibold mb-1 text-slate-700 text-sm">{action}（予定）</h3>
                          <Button variant="outline" disabled className="w-full mt-1 bg-white h-8 text-xs">実行不可</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </AdminGuard>
  );
}