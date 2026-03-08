"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initializeCourts, initializeConfig, getDocument, updateDocument, deleteAllPlayers, deleteAllMatches, getAllDocuments, deleteDocument, safeGetDocs } from "@/lib/firestore-helpers";
import { autoDispatchAll } from "@/lib/dispatcher";
import { auth, db, app } from "@/lib/firebase";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, query, terminate, clearIndexedDbPersistence, where, doc, setDoc, Timestamp } from "firebase/firestore";
import TournamentGenerator from "@/components/admin/TournamentGenerator";
import AutoDispatchEngine from "@/components/AutoDispatchEngine";
import MatchResultInput from "@/components/admin/MatchResultInput";
import ResultsTab from "@/components/admin/ResultsTab";
import PlayerManager from "@/components/admin/PlayerManager";
import AdminGuard from "@/components/admin/AdminGuard";
import TournamentTypeControl from "@/components/admin/TournamentTypeControl";
import VisualBracket from "@/components/admin/VisualBracket";
import PairSeedManager from "@/components/admin/PairSeedManager";
import GroupRankingManager from "@/components/admin/GroupRankingManager";
import TournamentDebug from "@/components/admin/TournamentDebug";
import SafetyTab from "@/components/admin/SafetyTab";
import AdvancedAnalytics from "@/components/admin/AdvancedAnalytics";
import TeamTournamentGenerator from "@/components/admin/TeamTournamentGenerator";
import type { Config, Team, TeamBattle as TeamBattleData, TournamentConfig, Match, TournamentType, Division } from "@/types";
import { ShieldAlert, Activity, Settings, Users, Trophy, Play, BarChart3, Shield, Home, Menu, ArrowLeft, LogOut, HelpCircle, MessageCircle, Lock } from "lucide-react";
import { useCamp } from "@/context/CampContext";
import CampManager from "@/components/admin/CampManager";
import MessageManager from "@/components/admin/MessageManager";
import { Toaster } from "sonner";
import { toastSuccess, toastError, toastInfo } from "@/lib/toast";
import StatusBar from "@/components/admin/StatusBar";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import UserGuide from "@/components/common/UserGuide";
import NotificationBar, { MatchAnnouncement } from "@/components/NotificationBar";
import OperationalAdvisor from "@/components/admin/OperationalAdvisor";
import { getRoundName } from "@/lib/formatters";
import { subscribeToCollection, getPlayerById } from "@/lib/firestore-helpers";
import type { Court, Player } from "@/types";

const GUIDE_SEEN_KEY = 'focs_guide_seen';

export default function AdminDashboard() {
  const { camp, setManualCamp } = useCamp();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [initializing, setInitializing] = useState(false);
  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [isSequentialMode, setIsSequentialMode] = useState(false);
  const [finalsWaitMode, setFinalsWaitMode] = useState<{ [key: string]: boolean }>({});
  const [activeTab, setActiveTab] = useState("setup");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [authRetryCount, setAuthRetryCount] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [matchAnnouncements, setMatchAnnouncements] = useState<MatchAnnouncement[]>([]);
  const [defaultRestMinutes, setDefaultRestMinutes] = useState<number>(10);
  const prevMatchStatusesRef = useRef<Map<string, string>>(new Map());

  // 初回表示ロジック: localStorage でガイド表示フラグをチェック
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const guideSeen = localStorage.getItem(GUIDE_SEEN_KEY);
      if (!guideSeen && camp) {
        // 初回アクセス時のみ自動表示
        setIsGuideOpen(true);
      }
    }
  }, [camp]);

  // ガイドを閉じる処理（フラグを保存）
  const handleCloseGuide = () => {
    setIsGuideOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(GUIDE_SEEN_KEY, 'true');
    }
  };

  // ヘルプボタンから再表示
  const handleOpenGuide = () => {
    setIsGuideOpen(true);
  };

  // 匿名認証（指数バックオフでリトライ）
  useEffect(() => {
    const retryAuth = async (attemptCount: number = 0) => {
      try {
        await signInAnonymously(auth);
        setAuthRetryCount(0);
      } catch (error: any) {
        console.error("匿名認証エラー:", error);

        if (error?.code === 'auth/network-request-failed' && attemptCount < 5) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attemptCount), 30000);
          setAuthRetryCount(attemptCount + 1);

          setTimeout(() => {
            retryAuth(attemptCount + 1);
          }, backoffDelay);
        }
      }
    };

    retryAuth();
  }, []);

  // Auth 復帰時のサーバー強制再取得（初期化安定化ガード付き）
  useEffect(() => {
    let initialLoadComplete = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // オフライン時はサーバー取得をスキップ
        if (!window.navigator.onLine) {
          console.log('[AdminDashboard] オフライン検知、サーバー取得をスキップ');
          return;
        }

        // 初回ロード時は500ms待機してFirestoreの初期化を安定させる
        if (!initialLoadComplete) {
          console.log('[AdminDashboard] 初期化安定化のため500ms待機中...');
          await new Promise(resolve => setTimeout(resolve, 500));
          initialLoadComplete = true;
        }

        try {
          console.log('[AdminDashboard] データ同期開始');
          // safeGetDocsでサーバー取得を試み、失敗時はキャッシュにフォールバック
          // 並列実行で初期化を高速化
          await Promise.all([
            safeGetDocs(query(collection(db, 'players'))),
            safeGetDocs(query(collection(db, 'matches'))),
            safeGetDocs(query(collection(db, 'config'))),
            safeGetDocs(query(collection(db, 'courts')))
          ]);
          console.log('[AdminDashboard] データ同期完了 ✓');
        } catch (error: any) {
          // safeGetDocsがオフラインエラーを握りつぶすため、ここに来るのは致命的エラーのみ
          console.log('[AdminDashboard] データ同期エラー（非致命的）:', error?.code || error?.message);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // オフライン検知
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // アーカイブ状態判定
  const isArchived = camp?.status === 'archived';

  // ... (初期化ロジックなどは変更なし) ...
  const handleInitializeCourts = async () => {
    if (!camp) {
      toastError("合宿を選択してください");
      return;
    }
    setInitializing(true);
    const success = await initializeCourts(camp.court_count, camp.id);
    if (success) toastSuccess(`コートを初期化しました（${camp.court_count}面）`);
    else toastError("エラーが発生しました");
    setInitializing(false);
  };

  const handleInitializeSystem = async () => {
    if (!camp) {
      toastError("合宿を選択してください");
      return;
    }
    setInitializing(true);
    const courtsSuccess = await initializeCourts(camp.court_count, camp.id);
    const configSuccess = await initializeConfig();
    if (courtsSuccess && configSuccess) toastSuccess("システムを初期化しました");
    else toastError("初期化に失敗しました");
    setInitializing(false);
  };


  useEffect(() => {
    const loadConfig = async () => {
      const config = await getDocument<Config>('config', 'system');
      if (config) {
        setAutoDispatchEnabled(config.auto_dispatch_enabled);
        setIsSequentialMode(config.is_sequential_mode || false);
        setFinalsWaitMode(config.finals_wait_mode || {});
        setDefaultRestMinutes(config.default_rest_minutes || 10);
      }
    };
    loadConfig();
  }, []);

  // 試合アナウンスの監視と生成
  useEffect(() => {
    if (!camp) return;

    const unsubscribe = subscribeToCollection<Match>(
      'matches',
      async (matches) => {
        const activeMatches = matches.filter(m =>
          m.status === 'calling' || m.status === 'playing'
        );

        const newAnnouncements: MatchAnnouncement[] = [];

        for (const match of activeMatches) {
          const prevStatus = prevMatchStatusesRef.current.get(match.id);

          // 新しくcallingまたはplayingになった試合のみ追加
          if (prevStatus !== match.status &&
              (match.status === 'calling' || match.status === 'playing')) {
            try {
              // コート情報を取得
              const court = match.court_id ? await getDocument<Court>('courts', match.court_id) : null;
              if (!court) continue;

              // 選手情報を取得
              const [p1, p2, p3, p4] = await Promise.all([
                getPlayerById(match.player1_id),
                getPlayerById(match.player2_id),
                match.player3_id ? getPlayerById(match.player3_id) : null,
                match.player4_id ? getPlayerById(match.player4_id) : null,
              ]);

              if (!p1 || !p2) continue;

              const player1Name = p3 ? `${p1.name} / ${p3.name}` : p1.name;
              const player2Name = p4 ? `${p2.name} / ${p4.name}` : p2.name;

              // totalRoundsを計算（同じ種目・部門の試合から）
              const allSameTypeMatches = matches.filter(m =>
                m.tournament_type === match.tournament_type &&
                m.division === match.division
              );
              const maxRound = allSameTypeMatches.length > 0
                ? Math.max(...allSameTypeMatches.map(m => m.round))
                : match.round;

              // ラウンド名を取得
              const roundName = getRoundName(match.round, maxRound);

              // 絶対的な一意性を保証するID生成（crypto.randomUUID()使用）
              const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
                ? `${match.id}-${crypto.randomUUID()}`
                : `${match.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

              newAnnouncements.push({
                id: uniqueId,
                courtNumber: court.number.toString(),
                player1Name,
                player2Name,
                roundName,
                status: match.status as 'calling' | 'playing',
                timestamp: Date.now(),
                tournamentType: match.tournament_type,
                division: match.division,
              });
            } catch (error) {
              console.error('Error creating announcement:', error);
            }
          }
        }

        // 状態マップを更新（useRefを使用）
        prevMatchStatusesRef.current = new Map<string, string>();
        activeMatches.forEach(m => prevMatchStatusesRef.current.set(m.id, m.status));

        // 新しいアナウンスを左端に追加（既存を右へプッシュ）
        if (newAnnouncements.length > 0) {
          setMatchAnnouncements(prev => {
            // 重複排除: 新しいアナウンスに含まれる試合ID+ステータスの組み合わせを抽出
            const newMatchKeys = new Set(
              newAnnouncements.map(a => {
                const matchId = a.id.split('-')[0];
                return `${matchId}-${a.status}`;
              })
            );

            // 既存のアナウンスから、新しいアナウンスと重複するものを除外
            const filteredPrev = prev.filter(a => {
              const matchId = a.id.split('-')[0];
              const key = `${matchId}-${a.status}`;
              return !newMatchKeys.has(key);
            });

            // 新しいアナウンスを左端に、重複排除済みの既存アナウンスを右に配置
            return [...newAnnouncements, ...filteredPrev];
          });
        }
      },
      [where('campId', '==', camp.id)]
    );

    return () => unsubscribe();
  }, [camp]);

  const toggleAutoDispatch = async () => {
    try {
      const newValue = !autoDispatchEnabled;
      await updateDocument('config', 'system', { auto_dispatch_enabled: newValue });
      setAutoDispatchEnabled(newValue);
      toastSuccess(newValue ? "Auto-Dispatchを有効にしました" : "Auto-Dispatchを無効にしました");
    } catch (error) {
      toastError("エラーが発生しました");
    }
  };

  const toggleSequentialMode = async () => {
    try {
      const newValue = !isSequentialMode;
      await updateDocument('config', 'system', { is_sequential_mode: newValue });
      setIsSequentialMode(newValue);
      toastSuccess(newValue ? "順次進行モードを有効にしました" : "順次進行モードを無効にしました");
    } catch (error) {
      toastError("エラーが発生しました");
    }
  };

  const toggleFinalsWait = async (key: string) => {
    try {
      const newMode = { ...finalsWaitMode, [key]: !finalsWaitMode[key] };
      setFinalsWaitMode(newMode);
      await updateDocument('config', 'system', { finals_wait_mode: newMode });
      toastSuccess(newMode[key] ? "決勝戦待機モードを有効化しました" : "決勝戦待機モードを解除しました");
    } catch (error) {
      toastError("エラーが発生しました");
    }
  };
  const handleRestMinutesChange = async (value: string) => {
    try {
      const minutes = parseInt(value);
      setDefaultRestMinutes(minutes);
      await updateDocument('config', 'system', { default_rest_minutes: minutes });
      toastSuccess(`デフォルト休息時間を ${minutes}分 に設定しました`);
    } catch (error) {
      toastError("エラーが発生しました");
    }
  };


  const handleManualDispatch = async () => {
    if (!camp) {
      toastError("合宿が選択されていません");
      return;
    }
    setDispatching(true);
    try {
      const count = await autoDispatchAll(camp.id, defaultRestMinutes);
      toastSuccess(`${count}試合を割り当てました`);
    } catch (error) {
      toastError("割り当てに失敗しました");
    }
    setDispatching(false);
  };

  const create3rdPlaceMatch = async (tournamentType: TournamentType, division: Division) => {
    if (!camp) {
      toastError("合宿が選択されていません");
      return;
    }

    try {
      // Get all matches for this tournament
      const allMatches = await getAllDocuments<Match>('matches', [
        where('campId', '==', camp.id),
        where('tournament_type', '==', tournamentType),
        where('division', '==', division),
        where('phase', '==', 'knockout')
      ]);

      // Check if 3rd place match already exists
      const existingThirdPlace = allMatches.find(m => m.subtitle === "3位決定戦");
      if (existingThirdPlace) {
        toastError("3位決定戦は既に作成されています");
        return;
      }

      // Find max round (finals)
      if (allMatches.length === 0) {
        toastError("トーナメント試合が見つかりません");
        return;
      }

      const maxRound = Math.max(...allMatches.map(m => m.round));

      // Semi-finals = maxRound - 1
      const semiFinals = allMatches.filter(m => m.round === maxRound - 1);

      if (semiFinals.length !== 2) {
        toastError(`準決勝が見つかりません（${semiFinals.length}試合検出）`);
        return;
      }

      // Check if both semi-finals are completed
      const allCompleted = semiFinals.every(m => m.status === 'completed' && m.winner_id);
      if (!allCompleted) {
        toastError("準決勝が全て完了していません");
        return;
      }

      // Get losers from both semi-finals
      const loser1 = semiFinals[0].winner_id === semiFinals[0].player1_id
        ? { p1: semiFinals[0].player2_id, p2: semiFinals[0].player4_id }
        : { p1: semiFinals[0].player1_id, p2: semiFinals[0].player3_id };

      const loser2 = semiFinals[1].winner_id === semiFinals[1].player1_id
        ? { p1: semiFinals[1].player2_id, p2: semiFinals[1].player4_id }
        : { p1: semiFinals[1].player1_id, p2: semiFinals[1].player3_id };

      // Create 3rd place match
      const matchId = `${camp.id}_${tournamentType}_${division}_3rd_place`;
      const matchData: Partial<Match> = {
        id: matchId,
        campId: camp.id,
        tournament_type: tournamentType,
        division: division,
        round: 98, // Special round number above finals
        subtitle: "3位決定戦",
        player1_id: loser1.p1,
        player2_id: loser2.p1,
        player3_id: loser1.p2 || undefined, // Partner for doubles
        player4_id: loser2.p2 || undefined,
        status: 'waiting',
        court_id: null,
        score_p1: 0,
        score_p2: 0,
        winner_id: null,
        start_time: null,
        end_time: null,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        phase: 'knockout'
      };

      await setDoc(doc(db, 'matches', matchId), matchData);
      toastSuccess("3位決定戦を作成しました");
    } catch (error) {
      console.error("Error creating 3rd place match:", error);
      toastError("3位決定戦の作成に失敗しました");
    }
  };

  const handleHardReset = async () => {
    if (!camp) {
      toastError("合宿を選択してください");
      return;
    }

    const firstConfirm = await confirm({
      title: '⚠️ 全データ削除の確認',
      message: '本当に全データを削除してもよろしいですか?\nこの操作は取り消せません。',
      confirmText: '次へ',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!firstConfirm) return;

    const secondConfirm = await confirm({
      title: '🚨 最終確認',
      message: 'すべての選手、試合、チーム、設定が削除されます。\n本当によろしいですか？',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
    });
    if (!secondConfirm) return;

    setInitializing(true);

    try {
      await deleteAllPlayers();
      await deleteAllMatches(camp.id);
      const teams = await getAllDocuments<Team>('teams');
      for (const team of teams) await deleteDocument('teams', team.id);
      const battles = await getAllDocuments<TeamBattleData>('team_battles');
      for (const battle of battles) await deleteDocument('team_battles', battle.id);
      const configs = await getAllDocuments<TournamentConfig>('tournament_configs');
      for (const config of configs) await deleteDocument('tournament_configs', config.id);
      await initializeCourts(camp.court_count, camp.id);
      await initializeConfig();

      toastSuccess("Hard Reset完了: すべてのデータを削除しました");
    } catch (error) {
      toastError("Hard Resetに失敗しました");
    }
    setInitializing(false);
  };

  const handleClearCache = async () => {
    const confirmed = await confirm({
      title: '🗑️ キャッシュクリアの確認',
      message: 'IndexedDBのキャッシュをクリアします。\nページがリロードされます。',
      confirmText: '実行する',
      cancelText: 'キャンセル',
      type: 'warning',
    });
    if (!confirmed) return;

    setClearing(true);

    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
      toastSuccess("キャッシュをクリアしました - リロード中...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("キャッシュクリアエラー:", error);
      toastError("キャッシュクリアに失敗しました");
      setClearing(false);
    }
  };


  // 1. 合宿未選択時
  if (!camp) {
    return (
      <AdminGuard>
        <ConfirmDialog />
        <div className="min-h-screen bg-slate-50 text-slate-900">
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
            <CampManager />
          </main>
        </div>
      </AdminGuard>
    );
  }

  const handleDismissNotification = (id: string) => {
    setMatchAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  // 2. 合宿選択時 (メインダッシュボード)
  return (
    <AdminGuard>
      <ConfirmDialog />
      <Toaster position="top-center" richColors closeButton />
      <StatusBar isOnline={isOnline} />
      <NotificationBar
        announcements={matchAnnouncements}
        onDismiss={handleDismissNotification}
        sidebarExpanded={isExpanded}
      />
      <div className="min-h-screen bg-slate-50 text-slate-900 flex">
        {autoDispatchEnabled && <AutoDispatchEngine />}

        {/* サイドバー */}
        <aside className={`fixed left-0 top-0 h-screen bg-white border-r border-slate-200 shadow-sm transition-all duration-300 z-50 flex flex-col ${isExpanded ? 'w-64' : 'w-16'}`}>
          <div className="p-3 border-b border-slate-200 flex items-center justify-center relative">
            <Image
              src="/new-logo_transparent.png"
              alt="Logo"
              width={40}
              height={40}
              className="object-cover brightness-130 saturate-170"
            />
            {!isOnline && (
              <div
                className="absolute top-12 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-xs px-2 py-1 rounded-md shadow-md whitespace-nowrap"
                title="オフライン動作中（再接続時に同期されます）"
              >
                📡 Offline
              </div>
            )}
            {authRetryCount > 0 && (
              <div
                className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-1 rounded-md shadow-md whitespace-nowrap"
              >
                🔄 認証中 {authRetryCount}/5
              </div>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="m-2 p-3 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>

          <nav className="flex-1 overflow-y-auto py-2">
            {[
              { value: "setup", label: "初期設定", icon: Settings },
              { value: "players", label: "選手", icon: Users },
              { value: "groupranking", label: "予選順位", icon: BarChart3 },
              { value: "control", label: "操作", icon: Play },
              { value: "results", label: "コート結果", icon: Activity },
              { value: "results-list", label: "結果一覧", icon: BarChart3 },
              { value: "bracket", label: "トーナメント表", icon: Trophy },
              { value: "pairseed", label: "ペア・シード", icon: Settings },
              { value: "messages", label: "メッセージ", icon: MessageCircle },
              { value: "team_battle", label: "団体戦", icon: Users },
              { value: "safety", label: "安全", icon: ShieldAlert },
              { value: "advanced", label: "応用", icon: Lock },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.value;
              return (
                <button
                  key={item.value}
                  onClick={() => setActiveTab(item.value)}
                  className={`w-full px-3 py-3 flex items-center gap-3 transition-all ${isActive
                    ? 'bg-indigo-100 text-indigo-700 border-r-4 border-indigo-600'
                    : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-indigo-600' : ''}`} />
                  {isExpanded && (
                    <span className={`text-sm font-medium whitespace-nowrap overflow-hidden transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* メインコンテンツ */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
          <header className="bg-white border-b border-slate-200 sticky top-0 z-[100] shadow-sm">
            <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-sky-500 shrink-0" />
                <div className="flex flex-col md:flex-row md:items-end md:gap-2 leading-none">
                  <h1 className="text-lg md:text-2xl font-bold text-slate-800">
                    Foc's Portal
                  </h1>
                  <span className="text-xs md:text-sm text-slate-500 font-medium md:mb-1">
                    {camp.title}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {/* AIアドバイザー（インライン配置） */}
                {!isArchived && <OperationalAdvisor />}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManualCamp(null)}
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

          <main className="container mx-auto px-4 pt-[136px] pb-6 md:pb-8 max-w-6xl">
            {isArchived && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-amber-900">アーカイブモード</p>
                    <p className="text-sm text-amber-700">この合宿はアーカイブされています。閲覧のみ可能で、編集はできません。</p>
                  </div>
                </div>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* 各タブのコンテンツ */}
              <TabsContent value="setup" className="space-y-6">
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
                          disabled={initializing || isArchived}
                          variant="outline"
                          className="w-full border-slate-300 hover:bg-slate-50 bg-white"
                        >
                          {initializing ? "初期化中..." : "コートを初期化（6面）"}
                        </Button>
                        <Button
                          onClick={handleInitializeSystem}
                          disabled={initializing || isArchived}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-white"
                        >
                          {initializing ? "初期化中..." : "システム全体を初期化"}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-400">※ 初回のみ実行してください。</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-800 text-lg">トーナメント作成・設定</CardTitle>
                    <CardDescription>種目、トーナメント形式、点数設定を行いトーナメント表を作成</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TournamentGenerator readOnly={isArchived} onGenerateSuccess={() => setActiveTab("bracket")} />
                  </CardContent>
                </Card>

                <TournamentDebug />
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
                        disabled={isArchived}
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
                        disabled={dispatching || isArchived}
                        variant="outline"
                        className="w-full md:w-auto border-sky-200 text-sky-700 hover:bg-sky-50 bg-white"
                      >
                        {dispatching ? "割り当て中..." : "今すぐ実行"}
                      </Button>
                    </div>

                    <div className={`flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 border rounded-lg transition-colors ${isSequentialMode
                      ? "bg-purple-50 border-purple-200"
                      : "bg-slate-50 border-slate-200"
                      }`}>
                      <div>
                        <p className={`font-semibold text-slate-800`}>
                          種目完遂型・順次進行: {isSequentialMode ? "ON" : "OFF"}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          {isSequentialMode
                            ? "現在の種目が残り1試合（決勝戦）以下になるまで、次の種目を自動開始しません"
                            : "複数の種目が並行して進行します（フェードイン許可）"}
                        </p>
                        <p className="text-xs text-purple-600 mt-1 font-medium">
                          {isSequentialMode && "※ 男子・女子グループは独立して進行します"}
                        </p>
                      </div>
                      <Button
                        onClick={toggleSequentialMode}
                        disabled={isArchived}
                        variant={isSequentialMode ? "default" : "outline"}
                        className={`w-full md:w-auto ${isSequentialMode ? "bg-purple-500 hover:bg-purple-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                      >
                        {isSequentialMode ? "解除する" : "有効にする"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      休息時間設定
                    </CardTitle>
                    <CardDescription>試合呼び出し時のデフォルト休息時間</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 gap-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-800">デフォルト休息時間</p>
                        <p className="text-sm text-slate-500 mt-1">
                          試合終了後、選手が次の試合に呼び出されるまでの最低休息時間
                        </p>
                      </div>
                      <div className="w-full md:w-48">
                        <Select
                          value={defaultRestMinutes.toString()}
                          onValueChange={handleRestMinutesChange}
                          disabled={isArchived}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="休息時間を選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0分（即時）</SelectItem>
                            <SelectItem value="5">5分</SelectItem>
                            <SelectItem value="10">10分</SelectItem>
                            <SelectItem value="15">15分</SelectItem>
                            <SelectItem value="20">20分</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Play className="w-5 h-5 text-emerald-500" /> 種目ごとの進行制御
                    </CardTitle>
                    <CardDescription>Auto-Dispatchが割り当てる種目を選択</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TournamentTypeControl readOnly={isArchived} />
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Trophy className="w-5 h-5 text-amber-500" /> 3位決定戦
                    </CardTitle>
                    <CardDescription>準決勝終了後、3位決定戦を作成します（ブラケット表には非表示）</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { type: 'mens_doubles' as TournamentType, label: '男子ダブルス' },
                      { type: 'womens_doubles' as TournamentType, label: '女子ダブルス' },
                      { type: 'mixed_doubles' as TournamentType, label: 'ミックスダブルス' },
                      { type: 'mens_singles' as TournamentType, label: '男子シングルス' },
                      { type: 'womens_singles' as TournamentType, label: '女子シングルス' }
                    ].map(({ type, label }) => (
                      <div key={type} className="flex flex-col gap-2">
                        <p className="font-semibold text-slate-700">{label}</p>
                        <div className="flex gap-2">
                          {[1, 2].map(div => (
                            <Button
                              key={div}
                              onClick={() => create3rdPlaceMatch(type, div as Division)}
                              variant="outline"
                              size="sm"
                              disabled={isArchived}
                              className="border-amber-200 text-amber-700 hover:bg-amber-50"
                            >
                              {div}部 - 3位決定戦を作成
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Trophy className="w-5 h-5 text-purple-500" /> 決勝戦の開始タイミング
                    </CardTitle>
                    <CardDescription>
                      待機モードでは、種目内の全試合終了後にセンターコートで決勝戦を開始します
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { type: 'mens_doubles' as TournamentType, label: '男子ダブルス' },
                      { type: 'womens_doubles' as TournamentType, label: '女子ダブルス' },
                      { type: 'mixed_doubles' as TournamentType, label: 'ミックスダブルス' },
                      { type: 'mens_singles' as TournamentType, label: '男子シングルス' },
                      { type: 'womens_singles' as TournamentType, label: '女子シングルス' }
                    ].map(({ type, label }) => (
                      <div key={type} className="flex flex-col gap-2">
                        <p className="font-semibold text-slate-700">{label}</p>
                        <div className="flex gap-2">
                          {[1, 2].map(div => {
                            const key = `${type}_${div}`;
                            const isWaiting = finalsWaitMode[key] || false;
                            return (
                              <Button
                                key={div}
                                onClick={() => toggleFinalsWait(key)}
                                variant={isWaiting ? "default" : "outline"}
                                size="sm"
                                disabled={isArchived}
                                className={isWaiting
                                  ? "bg-purple-500 hover:bg-purple-600 text-white"
                                  : "border-purple-200 text-purple-700 hover:bg-purple-50"}
                              >
                                {div}部 - {isWaiting ? "待機中" : "通常通り"}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 他のタブも背景色(bg-white)を確保しているため、既存コンポーネントの表示が改善されます */}
              <TabsContent value="players" className="space-y-6">
                <PlayerManager readOnly={isArchived} />
              </TabsContent>

              <TabsContent value="groupranking" className="space-y-6">
                <GroupRankingManager />
              </TabsContent>

              <TabsContent value="results" className="space-y-6">
                <ResultsTab />
              </TabsContent>

              <TabsContent value="results-list" className="space-y-6">
                <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
                  <CardHeader>
                    <CardTitle className="text-slate-800 flex items-center gap-2 text-lg">
                      <Play className="w-5 h-5 text-sky-500" /> 試合結果一覧
                    </CardTitle>
                    <CardDescription>進行中・完了済みの試合をリスト形式で管理</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MatchResultInput readOnly={isArchived} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bracket" className="space-y-6">
                <VisualBracket />
              </TabsContent>

              <TabsContent value="pairseed" className="space-y-6">
                <PairSeedManager readOnly={isArchived} />
              </TabsContent>

              <TabsContent value="messages" className="space-y-6">
                <MessageManager readOnly={isArchived} />
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
                          disabled={initializing || isArchived}
                          className="w-full bg-red-500 hover:bg-red-600 text-white"
                        >
                          {initializing ? "削除中..." : "Hard Reset を実行"}
                        </Button>
                      </div>

                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="font-bold mb-2 text-blue-800">🗑️ キャッシュクリア（デバッグ）</h3>
                        <p className="text-sm text-blue-700 mb-4">
                          オフラインキャッシュ（IndexedDB）をクリアしてページをリロードします。<br />
                          「Primary Lease」エラーや古いキャッシュが残っている場合に実行してください。
                        </p>
                        <Button
                          variant="outline"
                          onClick={handleClearCache}
                          disabled={clearing}
                          className="w-full border-blue-300 text-blue-700 hover:bg-blue-50 bg-white"
                        >
                          {clearing ? "クリア中..." : "キャッシュをクリア"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 安全機能（Undo、Walkover、Subtitle） */}
                <SafetyTab />
              </TabsContent>

              <TabsContent value="team_battle" className="space-y-6">
                <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-violet-400">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Trophy className="w-5 h-5 text-violet-500" />
                      団体戦
                    </CardTitle>
                    <CardDescription>
                      チームを設定し、予選グループ→順位決定戦を進行します
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TeamTournamentGenerator />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6">
                <AdvancedAnalytics campId={camp.id} />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      {/* ヘルプボタン（左下固定） */}
      <button
        onClick={handleOpenGuide}
        className="fixed bottom-4 left-4 z-[90] bg-sky-500 hover:bg-sky-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110 active:scale-95"
        title="使い方ガイドを表示"
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* ユーザーガイドモーダル */}
      <UserGuide isOpen={isGuideOpen} onClose={handleCloseGuide} isAdmin={true} />
    </AdminGuard>
  );
}