"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CourtGrid from "@/components/CourtGrid";
import MyMatchesView from "@/components/MyMatchesView";
import ActiveMatchesView from "@/components/ActiveMatchesView";
import { searchPlayerByName, calculateTournamentETA } from "@/lib/eta";
import type { TournamentETAByType } from "@/lib/eta";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, limit, onSnapshot, doc } from "firebase/firestore";
import { safeGetDocs } from "@/lib/firestore-helpers";
import type { ETAResult, Player, Match, Camp } from "@/types";
import { Search, Clock, Activity, User, MapPin, LogOut, Sparkles, Bell, BellOff, AlertTriangle, HelpCircle, MessageCircle, Home, Trophy, ChevronUp } from "lucide-react";
import { useCamp } from "@/context/CampContext";
import UserGuide from "@/components/common/UserGuide";
import ChatWindow from "@/components/ChatWindow";
import ChatNotification from "@/components/ChatNotification";
import VisualBracket from "@/components/admin/VisualBracket";
import { getSettings, subscribeToMessages, savePushSubscription } from "@/lib/firestore-helpers";
import type { Settings, Message } from "@/types";

const isPlayerInMatch = (match: Match, playerId: string) => {
    return (
        match.player1_id === playerId ||
        match.player2_id === playerId ||
        match.player3_id === playerId ||
        match.player4_id === playerId
    );
};

function LoginScreen({ onLogin }: { onLogin: (player: Player, camp: Camp) => void }) {
    const [loading, setLoading] = useState(true);
    const [camps, setCamps] = useState<Camp[]>([]);
    const [selectedCampId, setSelectedCampId] = useState<string>("");
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");

    useEffect(() => {
        const fetchCamps = async () => {
            try {
                const q = query(collection(db, 'camps'), orderBy('created_at', 'desc'), limit(5));
                const snapshot = await safeGetDocs(q);
                const campList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Camp));

                setCamps(campList);
                if (campList.length > 0) {
                    setSelectedCampId(campList[0].id);
                }
            } catch (error) {
                console.error("Failed to fetch camps", error);
            } finally {
                setLoading(false);
            }
        };
        fetchCamps();
    }, []);

    useEffect(() => {
        if (!selectedCampId) return;

        const q = query(collection(db, 'players'), where('campId', '==', selectedCampId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const playerList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
            playerList.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
            setPlayers(playerList);
        }, (err) => {
            console.error(err);
        });

        return () => unsubscribe();
    }, [selectedCampId]);

    const handleStart = () => {
        const player = players.find(p => p.id === selectedPlayerId);
        const camp = camps.find(c => c.id === selectedCampId);
        if (player && camp) {
            onLogin(player, camp);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500 bg-slate-50">読み込み中...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <Link href="/" className="mb-4">
                <Button variant="ghost" size="sm" className="text-slate-500">
                    <Activity className="w-4 h-4 mr-1" />ホームに戻る
                </Button>
            </Link>
            <Card className="w-full max-w-md shadow-lg border-t-4 border-t-sky-500 bg-white">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mb-2">
                        <User className="w-6 h-6 text-sky-600" />
                    </div>
                    <CardTitle className="text-xl text-slate-800">Foc's Portal ログイン</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">1. 合宿を選択</label>
                        <Select value={selectedCampId} onValueChange={setSelectedCampId}>
                            <SelectTrigger className="bg-white text-slate-900 border-slate-300">
                                <SelectValue placeholder="合宿を選択" />
                            </SelectTrigger>
                            {/* ▼ 背景色を白(bg-white)に明示的に指定 */}
                            <SelectContent className="bg-white border-slate-200 shadow-xl text-slate-900 z-50">
                                {camps.map(camp => (
                                    <SelectItem key={camp.id} value={camp.id} className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100">
                                        {camp.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-500">2. あなたの名前を選択</label>
                        <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                            <SelectTrigger className="bg-white text-slate-900 border-slate-300" disabled={!selectedCampId}>
                                <SelectValue placeholder="名前を選択してください" />
                            </SelectTrigger>
                            {/* ▼ 背景色を白(bg-white)に明示的に指定 */}
                            <SelectContent className="max-h-[200px] bg-white border-slate-200 shadow-xl text-slate-900 z-50">
                                {players.map(player => (
                                    <SelectItem key={player.id} value={player.id!} className="cursor-pointer hover:bg-slate-100 focus:bg-slate-100">
                                        {player.name} <span className="text-xs text-slate-400 ml-2">({player.gender === 'male' ? '男' : '女'})</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        className="w-full h-12 text-lg font-bold bg-sky-500 hover:bg-sky-600 text-white mt-4"
                        onClick={handleStart}
                        disabled={!selectedPlayerId}
                    >
                        利用を開始する
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

export default function UserDashboard() {
    const { camp, setManualCamp } = useCamp();
    const [myPlayer, setMyPlayer] = useState<Player | null>(null);
    const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
    const [searchName, setSearchName] = useState("");
    const [etaResult, setEtaResult] = useState<ETAResult | null>(null);
    const [searching, setSearching] = useState(false);
    const previousMatchStatusRef = useRef<string | null>(null);
    const [myEta, setMyEta] = useState<string | null>(null);
    const [etaLoading, setEtaLoading] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [estimatedEndTime, setEstimatedEndTime] = useState<Date | null>(null);
    const [estimatedMinutes, setEstimatedMinutes] = useState(0);
    const [etaByType, setEtaByType] = useState<TournamentETAByType[]>([]);
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isChatEnabled, setIsChatEnabled] = useState(false);
    const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
    const [players, setPlayers] = useState<Player[]>([]);
    const [restTimeRemaining, setRestTimeRemaining] = useState<number | null>(null);
    const [campStatus, setCampStatus] = useState<'setup' | 'active' | 'archived' | null>(null);
    const [notifEnabled, setNotifEnabled] = useState(false);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
    const [isIOSNotPWA, setIsIOSNotPWA] = useState(false);
    const [showIOSGuide, setShowIOSGuide] = useState(false);
    const prevUnreadCount = useRef<number>(0);
    const notifEnabledRef = useRef(false); // onSnapshot コールバック内でステールにならないよう ref で管理

    const USER_GUIDE_KEY = 'user_guide_completed';
    const NOTIF_KEY = 'focs_notifications';

    // 選手IDから選手情報を取得するヘルパー関数
    const getPlayerById = (playerId: string | undefined): Player | null => {
        if (!playerId) return null;
        return players.find(p => p.id === playerId) || null;
    };

    // OSレベルの通知を表示（ServiceWorker経由でバックグラウンド対応）
    const showOSNotification = async (title: string, body: string, tag: string) => {
        if (!notifEnabledRef.current || !('Notification' in window) || Notification.permission !== 'granted') return;
        const opts: NotificationOptions = {
            body,
            icon: '/new-logo_transparent.png',
            tag,
            requireInteraction: tag === 'match-calling',
        };
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.ready;
                await reg.showNotification(title, opts);
            } else {
                new Notification(title, opts);
            }
        } catch { /* silent */ }
    };

    // Web Push サブスクリプションを登録して Firestore に保存
    const subscribeToPush = async (playerId: string) => {
        if (!('serviceWorker' in navigator) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            const sub = existing ?? await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            });
            await savePushSubscription(playerId, sub.toJSON());
        } catch { /* silent */ }
    };

    // Web Push サブスクリプションを解除して Firestore から削除
    const unsubscribeFromPush = async (playerId: string) => {
        if (!('serviceWorker' in navigator)) return;
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            await sub?.unsubscribe();
            await savePushSubscription(playerId, null);
        } catch { /* silent */ }
    };

    // 通知許可トグル
    const handleNotifToggle = async () => {
        if (!('Notification' in window)) return;
        if (notifPermission === 'denied') {
            alert('ブラウザの設定から通知を許可してください');
            return;
        }
        if (notifPermission === 'default') {
            const result = await Notification.requestPermission();
            setNotifPermission(result);
            if (result === 'granted') {
                setNotifEnabled(true);
                notifEnabledRef.current = true;
                localStorage.setItem(NOTIF_KEY, 'true');
                if (myPlayer) await subscribeToPush(myPlayer.id);
            }
            return;
        }
        // granted → on/off toggle
        const next = !notifEnabled;
        setNotifEnabled(next);
        notifEnabledRef.current = next;
        localStorage.setItem(NOTIF_KEY, next ? 'true' : 'false');
        if (myPlayer) {
            if (next) {
                await subscribeToPush(myPlayer.id);
            } else {
                await unsubscribeFromPush(myPlayer.id);
            }
        }
    };

    // iOS + PWA 未インストール検知
    useEffect(() => {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        setIsIOSNotPWA(isIOS && !isStandalone);
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

    // 10秒ごとに最終更新時刻を更新
    useEffect(() => {
        const interval = setInterval(() => {
            setLastUpdate(new Date());
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    // AI予想終了時刻（30秒ごと）
    useEffect(() => {
        if (!camp) return;
        const fetchETA = async () => {
            const eta = await calculateTournamentETA(camp.id);
            setEstimatedEndTime(eta.estimatedEndTime);
            setEstimatedMinutes(eta.estimatedMinutesRemaining);
            setEtaByType(eta.byType);
        };
        fetchETA();
        const t = setInterval(fetchETA, 30000);
        return () => clearInterval(t);
    }, [camp?.id]);

    useEffect(() => {
        const storedUser = localStorage.getItem("focs_user");
        const storedCamp = localStorage.getItem("focs_camp");
        const guideCompleted = localStorage.getItem(USER_GUIDE_KEY);

        if (storedUser && storedCamp) {
            const player = JSON.parse(storedUser);
            const campData = JSON.parse(storedCamp);
            setMyPlayer(player);
            setManualCamp(campData);
            setCampStatus(campData.status ?? null);

            // 初回アクセス時のみガイドを表示
            if (!guideCompleted) {
                setIsGuideOpen(true);
            }
        }
    }, [setManualCamp]);

    // 通知許可状態をローカルストレージから復元 + Push購読を再登録
    useEffect(() => {
        if (!('Notification' in window)) return;
        setNotifPermission(Notification.permission);
        const stored = localStorage.getItem(NOTIF_KEY);
        const enabled = stored === 'true' && Notification.permission === 'granted';
        setNotifEnabled(enabled);
        notifEnabledRef.current = enabled;
        // 既に許可済みの場合、Push購読を再登録（サブスクリプション失効対策）
        if (enabled && myPlayer) {
            subscribeToPush(myPlayer.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myPlayer]);

    // notifEnabled が変わるたびに ref を同期
    useEffect(() => { notifEnabledRef.current = notifEnabled; }, [notifEnabled]);

    // チャット機能の有効/無効を確認
    useEffect(() => {
        const checkChatEnabled = async () => {
            if (!camp) return;
            const settings = await getSettings(camp.id);
            setIsChatEnabled(settings?.isChatEnabled ?? true);
        };
        checkChatEnabled();
    }, [camp]);

    // 未読メッセージのチェック
    useEffect(() => {
        if (!camp || !myPlayer) return;

        const unsubscribe = subscribeToMessages(
            camp.id,
            (messages: Message[]) => {
                // 自分宛の未読メッセージをカウント
                const myUnread = messages.filter(
                    (msg) =>
                        !msg.read_by?.includes(myPlayer.id) &&
                        (msg.type === 'broadcast' || msg.recipient_ids?.includes(myPlayer.id))
                );
                const unreadCount = myUnread.length;
                setHasUnreadMessages(unreadCount > 0);

                // 新着メッセージがあればOS通知
                if (unreadCount > prevUnreadCount.current && myUnread.length > 0) {
                    const latest = myUnread[0];
                    showOSNotification(
                        latest.type === 'broadcast' ? '📢 全体アナウンス' : '💬 新着メッセージ',
                        latest.content.slice(0, 80),
                        'message-new'
                    );
                }
                prevUnreadCount.current = unreadCount;
            },
            myPlayer.id
        );

        return () => unsubscribe();
    }, [camp, myPlayer]);

    // 選手データを購読
    useEffect(() => {
        if (!camp) return;

        const q = query(
            collection(db, 'players'),
            where('campId', '==', camp.id)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
                setPlayers(playersList);
            },
            (error) => {
                console.error('[onSnapshot Error] 選手データ監視エラー:', error);
            }
        );

        return () => unsubscribe();
    }, [camp]);

    // 大会ステータスのリアルタイム購読
    useEffect(() => {
        if (!camp) return;

        const campRef = doc(db, 'camps', camp.id);
        const unsubscribe = onSnapshot(
            campRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setCampStatus(data.status as 'setup' | 'active' | 'archived');
                }
            },
            (error) => {
                console.error('[onSnapshot Error] 合宿ステータス監視エラー:', error);
            }
        );

        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camp?.id]);

    useEffect(() => {
        if (!myPlayer || !camp) return;
        const q = query(
            collection(db, 'matches'),
            where('campId', '==', camp.id)
        );

        // エラーハンドリング付きonSnapshot（モバイル対応強化）
        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
                const myActiveMatch = matches.find(m =>
                    isPlayerInMatch(m, myPlayer.id!) &&
                    (m.status === 'calling' || m.status === 'playing')
                );

                const currentStatus = myActiveMatch?.status || null;
                const previousStatus = previousMatchStatusRef.current;

                if (currentStatus === 'calling' && previousStatus !== 'calling') {
                    // 音声通知（モバイル対応強化）
                    try {
                        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFA==');
                        audio.play().catch(e => console.log('Audio play failed:', e));
                    } catch (e) {
                        console.log('Audio creation failed:', e);
                    }

                    // バイブレーション（スマホ触覚フィードバック）
                    if ('vibrate' in navigator) {
                        navigator.vibrate([400, 100, 400, 100, 400]);
                    }

                    // OS通知（ServiceWorker経由 → バックグラウンドでも届く）
                    await showOSNotification(
                        '🏸 試合呼び出し！',
                        'あなたの試合が始まります！コートへお越しください',
                        'match-calling'
                    );
                }

                previousMatchStatusRef.current = currentStatus;
                setCurrentMatch(myActiveMatch || null);

                // 休息時間チェック
                const playerData = players.find(p => p.id === myPlayer.id);
                if (playerData?.last_match_finished_at && !myActiveMatch) {
                    const lastFinished = playerData.last_match_finished_at.toMillis();
                    const minRestInterval = 10 * 60 * 1000; // 10分（ミリ秒）
                    const timeSinceLastMatch = Date.now() - lastFinished;
                    const remainingRest = minRestInterval - timeSinceLastMatch;

                    if (remainingRest > 0) {
                        setRestTimeRemaining(Math.ceil(remainingRest / 60000)); // 分単位
                    } else {
                        setRestTimeRemaining(null);
                    }
                } else {
                    setRestTimeRemaining(null);
                }

                // 待ち時間予測を計算
                if (!myActiveMatch && !restTimeRemaining) {
                    setEtaLoading(true);
                    const result = await searchPlayerByName(myPlayer.name);
                    if (result === null) {
                        setMyEta(null);
                    } else if (result.matches_before === 0 && result.minutes <= 1) {
                        setMyEta('まもなく呼び出されます');
                    } else if (result.matches_before === 0) {
                        setMyEta(`約${result.minutes}分後（次の試合です）`);
                    } else {
                        setMyEta(`約${result.minutes}分後（前に${result.matches_before}試合）`);
                    }
                    setEtaLoading(false);
                } else if (myActiveMatch) {
                    setMyEta(null);
                }
            }, (error) => {
                // onSnapshotエラーハンドリング（モバイル接続切れ対応）
                console.error('[onSnapshot Error] 試合監視エラー:', error);
                console.log('[onSnapshot Error] 自動再接続を試みています...');
            });
        return () => unsubscribe();
    }, [myPlayer, camp]);

    // 1分ごとにETA予測を再計算
    useEffect(() => {
        if (!myPlayer || !camp) return;

        const recalculateETA = async () => {
            // 試合中や休息中は再計算しない
            if (currentMatch || restTimeRemaining) return;

            setEtaLoading(true);
            try {
                const result = await searchPlayerByName(myPlayer.name);
                if (result === null) {
                    setMyEta(null);
                } else if (result.matches_before === 0 && result.minutes <= 1) {
                    setMyEta('まもなく呼び出されます');
                } else if (result.matches_before === 0) {
                    setMyEta(`約${result.minutes}分後（次の試合です）`);
                } else {
                    setMyEta(`約${result.minutes}分後（前に${result.matches_before}試合）`);
                }
            } catch (error) {
                console.error("ETA recalculation error:", error);
                setMyEta(null);
            }
            setEtaLoading(false);
        };

        // 1分ごとに再計算
        const interval = setInterval(recalculateETA, 60000);

        return () => clearInterval(interval);
    }, [myPlayer, camp, currentMatch, restTimeRemaining]);

    // Page Visibility API: バックグラウンドから復帰時に強制更新（モバイル対応）
    useEffect(() => {
        if (!myPlayer || !camp) return;

        const handleVisibilityChange = async () => {
            if (!document.hidden) {
                // ページがアクティブになった時、最新のマッチ状態を取得
                console.log('[モバイル対応] ページがアクティブになりました。最新状態を取得中...');
                try {
                    const q = query(
                        collection(db, 'matches'),
                        where('campId', '==', camp.id)
                    );
                    const snapshot = await safeGetDocs(q);
                    const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
                    const myActiveMatch = matches.find(m =>
                        isPlayerInMatch(m, myPlayer.id!) &&
                        (m.status === 'calling' || m.status === 'playing')
                    );

                    if (myActiveMatch) {
                        console.log('[モバイル対応] アクティブな試合を検出:', myActiveMatch.status);
                        setCurrentMatch(myActiveMatch);

                        // calling状態なら音声を再生
                        if (myActiveMatch.status === 'calling') {
                            try {
                                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFApGn+DyvmwhBjiP1PLIdigFJHfH8N2RQAoUXrTp66hVFA==');
                                audio.play().catch(e => console.log('Audio play failed:', e));
                            } catch (e) {
                                console.log('Audio creation failed:', e);
                            }
                        }
                    }
                } catch (error) {
                    console.error('[モバイル対応] 状態取得エラー:', error);
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [myPlayer, camp]);

    const handleLogin = (player: Player, camp: Camp) => {
        localStorage.setItem("focs_user", JSON.stringify(player));
        localStorage.setItem("focs_camp", JSON.stringify(camp));
        setMyPlayer(player);
        setManualCamp(camp);
    };

    const handleLogout = () => {
        localStorage.removeItem("focs_user");
        localStorage.removeItem("focs_camp");
        setMyPlayer(null);
        window.location.reload();
    };

    const handleCloseGuide = () => {
        setIsGuideOpen(false);
        localStorage.setItem(USER_GUIDE_KEY, 'true');
    };

    const handleOpenGuide = () => {
        setIsGuideOpen(true);
    };

    const handleSearch = async () => {
        if (!searchName.trim()) return;
        setSearching(true);
        setEtaResult(null);
        try {
            const result = await searchPlayerByName(searchName.trim());
            setEtaResult(result);
        } catch (error) {
            setEtaResult(null);
        }
        setSearching(false);
    };

    if (!myPlayer) {
        return <LoginScreen onLogin={handleLogin} />;
    }

    let statusColor = "emerald";
    let statusTitle = "待機中";
    let statusMessage = "次の試合までお待ちください";
    let alertComponent = null;

    // 休息中の表示
    if (restTimeRemaining && restTimeRemaining > 0) {
        statusColor = "blue";
        statusTitle = "休息中";
        statusMessage = `あと約${restTimeRemaining}分で次の試合が組まれます`;
    }

    if (currentMatch) {
        const courtIdParts = String(currentMatch.court_id).split('_');
        const courtNumber = courtIdParts[courtIdParts.length - 1];
        if (currentMatch.status === 'calling') {
            statusColor = "orange";
            statusTitle = "試合中！";
            statusMessage = `第${courtNumber}コートに集合してください！`;

            // Neon Glassmorphism デザインの通知
            alertComponent = (
                <div className="bg-slate-900/90 backdrop-blur-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] border-l-4 border-emerald-400 p-6 animate-in slide-in-from-top-10 duration-500">
                    {/* 上段: LIVE + 試合番号 */}
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="text-emerald-400 text-xs font-bold tracking-wider">LIVE</span>
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                        </div>
                        <span className="text-emerald-400 text-xs font-medium">第{currentMatch.match_number || '?'}試合</span>
                    </div>

                    {/* 中段: 選手名 */}
                    <div className="text-center mb-4 space-y-1">
                        <p className="text-white text-2xl md:text-3xl font-black leading-tight">
                            {getPlayerById(currentMatch.player1_id)?.name || '未定'}
                            {currentMatch.player3_id && getPlayerById(currentMatch.player3_id) && (
                                <span> / {getPlayerById(currentMatch.player3_id)?.name}</span>
                            )}
                        </p>
                        <p className="text-emerald-400 text-sm font-bold tracking-widest">vs</p>
                        <p className="text-white text-2xl md:text-3xl font-black leading-tight">
                            {currentMatch.is_walkover && !currentMatch.player2_id ? 'シード（不戦勝）' : (getPlayerById(currentMatch.player2_id)?.name || '未定')}
                            {currentMatch.player4_id && getPlayerById(currentMatch.player4_id) && (
                                <span> / {getPlayerById(currentMatch.player4_id)?.name}</span>
                            )}
                        </p>
                    </div>

                    {/* 下段: コート案内 */}
                    <div className="flex items-center justify-center gap-2">
                        <span className="text-2xl"></span>
                        <p className="text-slate-300 text-lg font-medium">
                            「第{courtNumber}コート」へお越しください！
                        </p>
                    </div>
                </div>
            );
        } else if (currentMatch.status === 'playing') {
            statusColor = "blue";
            statusTitle = "試合進行中";
            statusMessage = `第${courtNumber}コートで試合中です`;
        }
    }

    const getRelativeTime = (date: Date) => {
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diff < 60) return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
        return `${Math.floor(diff / 3600)}時間前`;
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 relative">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                <div className="container mx-auto px-3 py-2 flex flex-nowrap items-center justify-between gap-1">
                    {/* 左: ロゴ + プレイヤー名 */}
                    <div className="flex items-center gap-1.5 min-w-0 flex-shrink">
                        <Image
                            src="/new-logo_transparent.png"
                            alt="Logo"
                            width={28}
                            height={28}
                            className="object-cover brightness-140 saturate-180 flex-shrink-0"
                        />
                        <div className="min-w-0">
                            <h1 className="text-[10px] font-bold text-slate-400 leading-none mb-0.5 whitespace-nowrap">Foc's Portal</h1>
                            <p className="text-xs font-bold text-slate-800 leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-[110px] sm:max-w-none">{myPlayer.name} さん</p>
                        </div>
                    </div>
                    {/* 右: アイコン群（1行固定） */}
                    <div className="flex flex-nowrap items-center gap-0.5 flex-shrink-0">
                        {/* ホームボタン */}
                        <Link href="/">
                            <button
                                className="flex flex-col items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors gap-0.5"
                                title="ホームに戻る"
                            >
                                <Home className="w-4 h-4 text-slate-600" />
                                <span className="text-[9px] text-slate-500 leading-none font-medium">ホーム</span>
                            </button>
                        </Link>

                        {/* 通知トグル */}
                        <button
                            onClick={() => {
                                if (isIOSNotPWA) {
                                    setShowIOSGuide(prev => !prev);
                                } else {
                                    handleNotifToggle();
                                }
                            }}
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors gap-0.5"
                            title={
                                isIOSNotPWA ? 'ホーム画面に追加すると通知が使えます'
                                    : notifPermission === 'denied' ? 'ブラウザ設定から通知を許可してください'
                                        : notifEnabled ? '通知ON（タップでOFF）'
                                            : '通知OFF（タップして許可）'
                            }
                        >
                            {isIOSNotPWA
                                ? <BellOff className="w-4 h-4 text-orange-300" />
                                : notifPermission === 'denied'
                                    ? <BellOff className="w-4 h-4 text-slate-300" />
                                    : notifEnabled
                                        ? <Bell className="w-4 h-4 text-amber-400" />
                                        : <Bell className="w-4 h-4 text-slate-400" />
                            }
                            <span className="text-[9px] text-slate-500 leading-none font-medium">通知</span>
                        </button>

                        {/* チャットボタン */}
                        {isChatEnabled && (
                            <button
                                onClick={() => setIsChatOpen(true)}
                                className="relative flex flex-col items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors gap-0.5"
                                title="メッセージを開く"
                            >
                                <div className="relative">
                                    <MessageCircle className="w-4 h-4 text-sky-500" />
                                    {hasUnreadMessages && (
                                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                        </span>
                                    )}
                                </div>
                                <span className="text-[9px] text-slate-500 leading-none font-medium">チャット</span>
                            </button>
                        )}

                        {/* ログアウト */}
                        <button
                            onClick={handleLogout}
                            className="flex flex-col items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors gap-0.5"
                            title="ログアウト"
                        >
                            <LogOut className="w-4 h-4 text-slate-400" />
                            <span className="text-[9px] text-slate-500 leading-none font-medium">退出</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* iOS PWA ガイドモーダル */}
            {showIOSGuide && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                    onClick={() => setShowIOSGuide(false)}
                >
                    <div
                        className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                <Bell className="w-5 h-5 text-orange-400" />
                                通知を受け取るには
                            </h3>
                            <button
                                onClick={() => setShowIOSGuide(false)}
                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xl"
                            >✕</button>
                        </div>
                        <ol className="space-y-3 text-sm text-slate-700">
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xs">1</span>
                                <span>Safariのアドレスバー付近にある右上の <strong>「共有」ボタン（□から↑が出ているアイコン）</strong> をタップ</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xs">2</span>
                                <span>出てきたメニューを下にスクロールするか、<strong>「…その他」</strong> をタップして <strong>「ホーム画面に追加」</strong> を選ぶ</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-xs">3</span>
                                <span>追加後、ホーム画面のアイコンからアプリを開き直して通知をONにする</span>
                            </li>
                        </ol>
                        <p className="text-xs text-slate-400 border-t pt-3">
                            iPhoneでは、ホーム画面から起動した場合のみ通知が利用できます
                        </p>
                    </div>
                </div>
            )}

            {alertComponent && (
                <div className="px-0">
                    {alertComponent}
                </div>
            )}

            <main className="container mx-auto px-3 py-3 max-w-4xl space-y-3">

                {campStatus === 'archived' ? (
                    <Card className="border-t-4 border-t-slate-400 bg-white shadow-sm">
                        <CardContent className="py-16 text-center space-y-4">
                            <Trophy className="w-12 h-12 mx-auto text-slate-300" />
                            <h2 className="text-xl font-bold text-slate-600">この大会は終了しました</h2>
                            <p className="text-sm text-slate-500">ご参加ありがとうございました。</p>
                        </CardContent>
                    </Card>
                ) : campStatus === 'setup' ? (
                    <Card className="border-t-4 border-t-amber-400 bg-white shadow-sm">
                        <CardContent className="py-16 text-center space-y-4">
                            <Clock className="w-12 h-12 mx-auto text-amber-300" />
                            <h2 className="text-xl font-bold text-slate-600">大会はまだ開始されていません</h2>
                            <p className="text-sm text-slate-500">管理者が開催するまでしばらくお待ちください。</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* ステータス ヒーローカード */}
                        <div className={`rounded-2xl shadow-lg overflow-hidden relative ${
                            currentMatch?.status === 'calling'
                                ? 'bg-gradient-to-br from-orange-500 via-red-500 to-rose-600'
                                : currentMatch?.status === 'playing'
                                    ? 'bg-gradient-to-br from-blue-700 via-indigo-600 to-blue-900'
                                    : restTimeRemaining
                                        ? 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700'
                                        : 'bg-gradient-to-br from-blue-600 via-indigo-500 to-sky-400'
                        }`}>
                            {/* 装飾: 右上の光彩サークル */}
                            <div className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                            <div className="pointer-events-none absolute bottom-0 left-0 w-24 h-24 rounded-full bg-black/10 blur-xl" />

                            <div className="relative px-4 pt-4 pb-3">
                                {/* ヘッダー行 */}
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="bg-white/20 rounded-full p-1.5 ring-1 ring-white/30">
                                        {currentMatch?.status === 'calling'
                                            ? <AlertTriangle className="w-4 h-4 text-white" />
                                            : restTimeRemaining
                                                ? <Clock className="w-4 h-4 text-white" />
                                                : <Sparkles className="w-4 h-4 text-white" />
                                        }
                                    </div>
                                    <span className="text-white/90 text-xs font-semibold tracking-widest uppercase">現在のステータス</span>
                                </div>
                                {/* ステータスタイトル */}
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="text-white text-2xl font-black tracking-tight drop-shadow-sm">{statusTitle}</span>
                                    {currentMatch?.status === 'calling' && (
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-white/90 text-sm font-semibold leading-snug drop-shadow-sm">{statusMessage}</p>
                            </div>

                            {/* 待ち時間予測 */}
                            {!currentMatch && (myEta || etaLoading) && (
                                <div className="bg-blue-950/70 mx-3 mb-3 rounded-xl p-3 border border-white/10">
                                    {etaLoading ? (
                                        <p className="text-slate-500 text-xs text-center">予測中...</p>
                                    ) : myEta && (
                                        <>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Clock className="w-3.5 h-3.5 text-sky-300" />
                                                <span className="text-sky-200 text-xs font-bold">待ち時間予測</span>
                                            </div>
                                            <p className="text-white font-black text-xl leading-tight">{myEta}</p>
                                            <p className="text-white/50 text-[10px] mt-1.5">※ AIによる予測のため前後することがあります</p>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <Tabs defaultValue="courts" className="w-full">
                            <TabsList className="w-full grid grid-cols-3 bg-slate-200/80 rounded-xl p-1 gap-0.5 h-auto">
                                <TabsTrigger
                                    value="courts"
                                    className="rounded-lg text-xs font-semibold py-2 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                >
                                    コート状況
                                </TabsTrigger>
                                <TabsTrigger
                                    value="my-matches"
                                    className="rounded-lg text-xs font-semibold py-2 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                >
                                    自分の試合
                                </TabsTrigger>
                                <TabsTrigger
                                    value="bracket"
                                    className="rounded-lg text-xs font-semibold py-2 text-slate-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm transition-all"
                                >
                                    トーナメント表
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="courts" className="mt-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-sky-500" /> コート稼働状況
                                    </h2>
                                    <CourtGrid />
                                </div>
                            </TabsContent>

                            <TabsContent value="my-matches" className="mt-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                        <User className="w-5 h-5 text-sky-500" /> 自分の試合一覧
                                    </h2>
                                    {camp && <MyMatchesView playerId={myPlayer.id!} campId={camp.id} />}
                                </div>
                            </TabsContent>

                            <TabsContent value="bracket" className="mt-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                        <Trophy className="w-5 h-5 text-sky-500" /> トーナメント表
                                    </h2>
                                    <VisualBracket readOnly={true} />
                                </div>
                            </TabsContent>
                        </Tabs>

                        <Card className="border-t-4 border-t-violet-400 bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
                                    <Clock className="w-5 h-5 text-violet-500" />
                                    他の人の状況を検索
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="名前で検索（フルネーム）..."
                                        value={searchName}
                                        onChange={(e) => setSearchName(e.target.value)}
                                        className="bg-white text-slate-900 border-slate-300"
                                    />
                                    <Button onClick={handleSearch} disabled={searching} className="bg-sky-500 hover:bg-sky-600 text-white font-bold">
                                        検索
                                    </Button>
                                </div>

                                {etaResult && (
                                    <div className="p-4 bg-violet-50 rounded-lg border border-violet-100">
                                        <p className="font-bold text-violet-900">{etaResult.detail}</p>
                                        {etaResult.next_court && (
                                            <p className="text-sm text-violet-700 mt-1 flex items-center gap-1">
                                                <MapPin className="w-4 h-4" /> 予定: {String(etaResult.next_court).replace('court_', 'コート')}
                                            </p>
                                        )}
                                    </div>
                                )}
                                {searching && (
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-sm text-slate-500">検索中...</p>
                                    </div>
                                )}
                                {!searching && !etaResult && searchName.trim() && (
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-sm text-slate-600">現在、待機中の試合はありません</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </main>

            {/* ヘルプボタン（左下固定） */}
            <button
                onClick={handleOpenGuide}
                className="fixed bottom-4 left-4 z-50 bg-sky-500 hover:bg-sky-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg hover:shadow-xl transition-all hover:scale-110 active:scale-95"
                title="使い方ガイドを表示"
            >
                <HelpCircle className="w-6 h-6" />
            </button>

            {/* ステータスバー（右下固定） */}
            <div className="fixed bottom-4 right-4 z-50">
                {/* ポップオーバー */}
                {isStatusOpen && (
                    <div className="absolute bottom-full mb-2 right-0 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-4 min-w-[260px] animate-in slide-in-from-bottom-2 duration-200">
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">AI予想終了時刻</h3>

                            {/* 全体 */}
                            <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-md">
                                    <Sparkles className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-slate-700">全体終了予想</div>
                                    {estimatedEndTime ? (
                                        <div className="mt-1">
                                            <div className="text-sm font-bold text-purple-700">
                                                {estimatedEndTime.getHours().toString().padStart(2, '0')}:{estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                                            </div>
                                            <div className="text-xs text-slate-500">残り約 <span className="font-semibold text-blue-600">{estimatedMinutes}</span> 分</div>
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-500 mt-1">全試合終了</div>
                                    )}
                                </div>
                            </div>

                            {/* 種目別 */}
                            {etaByType.length > 0 && (
                                <div className="bg-gradient-to-r from-purple-50 to-blue-50 -mx-4 -mb-4 p-4 rounded-b-2xl border-t border-purple-100/50">
                                    <div className="text-xs font-semibold text-slate-700 mb-2">種目別予想</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {etaByType.map((t) => (
                                            <div key={t.tournamentType} className="bg-white/80 rounded-lg p-2 shadow-sm border border-purple-100/50">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-bold text-slate-700">{t.label}</span>
                                                    <span className="text-[10px] text-slate-400">{t.remainingMatches + t.activeMatches}試合</span>
                                                </div>
                                                {t.estimatedEndTime ? (
                                                    <>
                                                        <div className="text-xs font-bold text-purple-600">
                                                            {t.estimatedEndTime.getHours().toString().padStart(2, '0')}:{t.estimatedEndTime.getMinutes().toString().padStart(2, '0')}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500">残り{t.estimatedMinutesRemaining}分</div>
                                                    </>
                                                ) : (
                                                    <div className="text-xs text-slate-500">終了</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ピル */}
                <button
                    onClick={() => setIsStatusOpen(o => !o)}
                    className="bg-slate-100/95 backdrop-blur-sm border border-slate-300 rounded-full px-4 py-2 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                >
                    <div className="flex items-center gap-3 text-slate-600">
                        {/* 接続状況 */}
                        <div className="flex items-center gap-1.5">
                            {isOnline ? (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    <span className="text-xs font-medium text-emerald-600">Online</span>
                                </>
                            ) : (
                                <>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    <span className="text-xs font-medium text-amber-600">Offline</span>
                                </>
                            )}
                        </div>

                        {/* セパレーター */}
                        <div className="w-px h-4 bg-slate-300" />

                        {/* 予想終了時刻 */}
                        <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                            {estimatedEndTime ? (
                                <span className="text-xs font-bold text-purple-700">
                                    {estimatedEndTime.getHours().toString().padStart(2, '0')}:{estimatedEndTime.getMinutes().toString().padStart(2, '0')} 終了予想
                                </span>
                            ) : (
                                <span className="text-xs font-medium text-slate-500">計算中...</span>
                            )}
                        </div>

                        {/* 展開アイコン */}
                        <ChevronUp className={`w-3.5 h-3.5 transition-transform duration-200 ${isStatusOpen ? '' : 'rotate-180'}`} />
                    </div>
                </button>
            </div>

            {/* ユーザーガイドモーダル */}
            <UserGuide isOpen={isGuideOpen} onClose={handleCloseGuide} />

            {/* チャットウィンドウ */}
            <ChatWindow
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                player={myPlayer}
            />

            {/* チャット通知 */}
            {isChatEnabled && myPlayer && (
                <ChatNotification
                    player={myPlayer}
                    onOpenChat={() => setIsChatOpen(true)}
                />
            )}
        </div>
    );
}