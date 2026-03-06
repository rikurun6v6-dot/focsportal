"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createCamp, getAllCamps, activateCamp, setupCampCourts, archiveCamp, unarchiveCamp, deleteCamp, deleteCompleteCampData } from "@/lib/firestore-helpers";
import { auth } from "@/lib/firebase";
import { useCamp } from "@/context/CampContext";
import type { Camp } from "@/types";
import { Plus, Play, Settings, CheckCircle, Calendar, ArrowRight, Archive, ArchiveRestore, Trash2, AlertTriangle, Lock, Unlock } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toastSuccess, toastError } from "@/lib/toast";

export default function CampManager() {
    const { refreshCamp, setManualCamp } = useCamp();
    const { confirm, ConfirmDialog } = useConfirmDialog();

    const [camps, setCamps] = useState<Camp[]>([]);
    const [newTitle, setNewTitle] = useState("");
    const [courtCount, setCourtCount] = useState(6);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // パスワードロック
    const LOCK_PASSWORD = '1203';
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [showLockModal, setShowLockModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

    const requireUnlock = (action: () => void) => {
        if (isUnlocked) {
            action();
            return;
        }
        setPendingAction(() => action);
        setPasswordInput('');
        setPasswordError('');
        setShowLockModal(true);
    };

    const handlePasswordSubmit = () => {
        if (passwordInput === LOCK_PASSWORD) {
            setIsUnlocked(true);
            setShowLockModal(false);
            if (pendingAction) {
                pendingAction();
                setPendingAction(null);
            }
        } else {
            setPasswordError('パスワードが違います');
        }
    };

    // 認証ユーザーを取得
    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                setCurrentUserId(user.uid);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('[CampManager] 🔐 認証ユーザー情報');
                console.log('[CampManager]   UID:', user.uid);
                console.log('[CampManager]   Email:', user.email || '(匿名)');
                console.log('[CampManager]   表示名:', user.displayName || '(未設定)');
                console.log('[CampManager]   匿名ログイン:', user.isAnonymous ? 'YES' : 'NO');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }
        });
        return () => unsubscribe();
    }, []);

    // 一覧をリアルタイム購読
    useEffect(() => {
        const loadCamps = async () => {
            try {
                const data = await getAllCamps(currentUserId || undefined);
                
                // データ蒸発防止: 空データでの上書きを防ぐ
                if (data.length === 0 && camps.length > 0) {
                    console.log('[CampManager] 空データを検知、既存データを保持');
                    return; // 既存のcampsを維持
                }
                
                // データがある場合、または初回読み込みの場合は更新
                setCamps(data);
                console.log('[CampManager] 合宿リスト更新:', data.length, '件');
            } catch (error) {
                console.error('[CampManager] 合宿リスト取得エラー:', error);
                // エラー時は既存データを維持（上書きしない）
            }
        };

        // 初回読み込み
        loadCamps();

        // 5秒ごとに再読み込み（リアルタイム更新）
        const interval = setInterval(() => {
            loadCamps();
        }, 5000);

        return () => clearInterval(interval);
    }, [currentUserId, camps.length]);

    // 新規作成
    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setLoading(true);

        // 合宿データ作成（owner_idを渡す）
        const newId = await createCamp(newTitle, courtCount, currentUserId || undefined);

        if (newId) {
            setNewTitle("");
            // リストは自動更新されるため、手動更新は不要
        }
        setLoading(false);
    };

    // 「この合宿を開催する」ボタン (Activeにする)
    const handleActivate = async (campId: string, courts: number) => {
        const confirmed = await confirm({
            title: '🎯 合宿を開催中にする',
            message: 'この合宿を「開催中」にしますか？\n参加者の画面がこの合宿に切り替わります。',
            confirmText: '開催する',
            cancelText: 'キャンセル',
            type: 'info',
        });
        if (!confirmed) return;

        setLoading(true);
        // 1. 合宿をActiveに
        await activateCamp(campId);
        // 2. コート数をセットアップ（Camp専用コートを作成）
        await setupCampCourts(courts, campId);
        // 3. アプリ全体のContextを更新
        await refreshCamp();

        setLoading(false);
        // リロードして反映させる
        window.location.reload();
    };

    // 「管理画面へ」ボタン (Activeにせず、中身だけ見る)
    const handleEnter = (camp: Camp) => {
        setManualCamp(camp);
    };

    // アーカイブ
    const handleArchive = async (campId: string) => {
        const confirmed = await confirm({
            title: '📦 合宿をアーカイブ',
            message: 'この合宿をアーカイブしますか？\nアーカイブ後は閲覧専用になります。',
            confirmText: 'アーカイブする',
            cancelText: 'キャンセル',
            type: 'warning',
        });
        if (!confirmed) return;
        setLoading(true);
        await archiveCamp(campId);
        setLoading(false);
    };

    // アーカイブ解除
    const handleUnarchive = async (campId: string) => {
        const confirmed = await confirm({
            title: '📂 アーカイブを解除',
            message: 'この合宿のアーカイブを解除しますか？',
            confirmText: '解除する',
            cancelText: 'キャンセル',
            type: 'info',
        });
        if (!confirmed) return;
        setLoading(true);
        await unarchiveCamp(campId);
        setLoading(false);
    };

    // 通常削除（Camp本体のみ）
    const handleDelete = async (campId: string) => {
        const confirmed = await confirm({
            title: '🗑️ 合宿を削除',
            message: 'この合宿を削除しますか？\nこの操作は取り消せません。',
            confirmText: '削除する',
            cancelText: 'キャンセル',
            type: 'danger',
        });
        if (!confirmed) return;
        setLoading(true);
        await deleteCamp(campId);
        setLoading(false);
    };

    // 完全削除（全関連データ含む）
    const handleCompleteDelete = async (campId: string, campTitle: string) => {
        const firstConfirm = await confirm({
            title: '⚠️ 警告: 完全削除の実行',
            message: `合宿「${campTitle}」に紐づく以下のデータをすべて削除します：\n\n• 選手データ\n• 試合データ\n• コートデータ\n• トーナメント設定\n• 合宿本体\n\nこの操作は取り消せません。本当に実行しますか？`,
            confirmText: '次へ',
            cancelText: 'キャンセル',
            type: 'danger',
        });
        if (!firstConfirm) return;

        const secondConfirm = await confirm({
            title: '🚨 最終確認',
            message: 'すべてのデータが完全に削除されます。\n本当によろしいですか？',
            confirmText: '完全削除する',
            cancelText: 'キャンセル',
            type: 'danger',
        });
        if (!secondConfirm) return;

        setDeleting(campId);
        try {
            const result = await deleteCompleteCampData(campId);

            if (result.success) {
                alert(`✓ 削除完了\n\n削除件数：\n• 選手: ${result.deletedCounts.players}件\n• 試合: ${result.deletedCounts.matches}件\n• コート: ${result.deletedCounts.courts}件\n• トーナメント設定: ${result.deletedCounts.tournamentConfigs}件`);
            } else {
                alert(`⚠️ 削除中にエラーが発生しました\n\n${result.errors.join('\n')}`);
            }

            await refreshCamp();
            window.location.reload();
        } catch (error) {
            alert(`✗ 予期せぬエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
        }
        setDeleting(null);
    };

    return (
        <>
            <ConfirmDialog />

            {/* パスワードモーダル */}
            {showLockModal && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowLockModal(false)}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-center gap-2">
                            <Lock className="w-5 h-5 text-slate-500" />
                            <h3 className="font-bold text-slate-800">管理者パスワード</h3>
                        </div>
                        <p className="text-sm text-slate-500">
                            合宿の作成・開催・アーカイブ操作にはパスワードが必要です。
                        </p>
                        <Input
                            type="password"
                            placeholder="パスワードを入力..."
                            value={passwordInput}
                            onChange={(e) => {
                                setPasswordInput(e.target.value);
                                setPasswordError('');
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordSubmit(); }}
                            autoFocus
                        />
                        {passwordError && (
                            <p className="text-xs text-red-500">{passwordError}</p>
                        )}
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setShowLockModal(false)}
                                className="flex-1"
                            >
                                キャンセル
                            </Button>
                            <Button
                                onClick={handlePasswordSubmit}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                            >
                                解除する
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <div className="container mx-auto px-4 py-8 max-w-4xl space-y-8">

                {/* ヘッダー */}
                <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold text-slate-800">合宿管理メニュー</h1>
                <p className="text-slate-500">
                    新しい合宿を作成するか、管理する合宿を選択してください
                </p>
            </div>

            {/* 新規作成フォーム */}
            <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-800">
                        <Plus className="w-5 h-5 text-sky-500" /> 新しい合宿を作成
                        {isUnlocked
                            ? <Unlock className="w-4 h-4 text-emerald-500 ml-1" />
                            : <Lock className="w-4 h-4 text-slate-400 ml-1" />
                        }
                    </CardTitle>
                    <CardDescription>
                        合宿名と使用コート数を設定して箱を作ります
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="w-full md:flex-1 space-y-2">
                            <label className="text-sm font-medium text-slate-700">合宿名 (例: 2025夏合宿)</label>
                            <Input
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="名称を入力..."
                            />
                        </div>
                        <div className="w-full md:w-32 space-y-2">
                            <label className="text-sm font-medium text-slate-700">コート数</label>
                            <Input
                                type="number"
                                value={courtCount}
                                onChange={(e) => setCourtCount(Number(e.target.value))}
                                min={1}
                                max={20}
                            />
                        </div>
                        <Button
                            onClick={() => requireUnlock(handleCreate)}
                            disabled={loading || !newTitle}
                            className="bg-sky-500 hover:bg-sky-600 text-white w-full md:w-auto"
                        >
                            {!isUnlocked && <Lock className="w-3.5 h-3.5 mr-1.5" />}
                            作成する
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* 合宿リスト */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5" /> 作成済みの合宿リスト
                </h2>

                <div className="grid gap-4">
                    {camps.length === 0 ? (
                        <Card className="border-slate-200">
                            <CardContent className="p-8 text-center space-y-3">
                                <Calendar className="w-12 h-12 mx-auto text-slate-300" />
                                <p className="text-slate-600 font-medium">合宿がまだ作成されていません</p>
                                <p className="text-sm text-slate-500">上のフォームから新規作成してください</p>
                            </CardContent>
                        </Card>
                    ) : (
                        camps.map((camp) => (
                        <Card key={camp.id} className={`transition-all hover:shadow-md ${camp.status === 'active' ? 'border-emerald-400 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

                                {/* 情報部分 */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-slate-900">{camp.title}</h3>
                                        {camp.status === 'active' ? (
                                            <Badge className="bg-emerald-500 hover:bg-emerald-600">開催中</Badge>
                                        ) : camp.status === 'archived' ? (
                                            <Badge variant="outline" className="text-amber-600 border-amber-300">アーカイブ済み</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-500">準備中</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        コート数: {camp.court_count}面 | ID: {camp.id.slice(0, 8)}...
                                    </p>
                                </div>

                                {/* ボタン部分 */}
                                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                                    <div className="flex gap-2">
                                        {/* Activeにするボタン */}
                                        {camp.status === 'setup' && (
                                            <Button
                                                variant="outline"
                                                onClick={() => requireUnlock(() => handleActivate(camp.id, camp.court_count))}
                                                disabled={loading || deleting === camp.id}
                                                className="flex-1 md:flex-none border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                            >
                                                {isUnlocked ? <Play className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                                                これを開催する
                                            </Button>
                                        )}

                                        {/* アーカイブボタン */}
                                        {camp.status === 'archived' ? (
                                            <Button
                                                variant="outline"
                                                onClick={() => requireUnlock(() => handleUnarchive(camp.id))}
                                                disabled={loading || deleting === camp.id}
                                                className="flex-1 md:flex-none border-amber-200 text-amber-700 hover:bg-amber-50"
                                            >
                                                {isUnlocked ? <ArchiveRestore className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                                                解除
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                onClick={() => requireUnlock(() => handleArchive(camp.id))}
                                                disabled={loading || deleting === camp.id}
                                                className="flex-1 md:flex-none border-slate-300 text-slate-600 hover:bg-slate-50"
                                            >
                                                {isUnlocked ? <Archive className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                                                {camp.status === 'active' ? '合宿を終了' : 'アーカイブ'}
                                            </Button>
                                        )}

                                        {/* 管理画面に入るボタン */}
                                        <Button
                                            onClick={() => handleEnter(camp)}
                                            disabled={deleting === camp.id}
                                            className="flex-1 md:flex-none bg-slate-800 text-white hover:bg-slate-700"
                                        >
                                            {camp.status === 'archived' ? '閲覧する' : '管理画面へ'}
                                            <ArrowRight className="w-4 h-4 ml-1" />
                                        </Button>
                                    </div>

                                    {/* 削除ボタン（アクティブでない場合のみ） */}
                                    {camp.status !== 'active' && (
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                onClick={() => handleDelete(camp.id)}
                                                disabled={loading || deleting === camp.id}
                                                className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                                            >
                                                <Trash2 className="w-4 h-4 mr-1" />
                                                削除
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                onClick={() => handleCompleteDelete(camp.id, camp.title)}
                                                disabled={loading || deleting === camp.id}
                                                className="flex-1 bg-red-600 hover:bg-red-700"
                                            >
                                                {deleting === camp.id ? (
                                                    "削除中..."
                                                ) : (
                                                    <>
                                                        <AlertTriangle className="w-4 h-4 mr-1" />
                                                        完全削除
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}
                                </div>

                            </CardContent>
                        </Card>
                        ))
                    )}
                </div>
            </div>
            </div>
        </>
    );
}