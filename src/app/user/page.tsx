"use client";

import { useState, useEffect, type ChangeEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CourtGrid from "@/components/CourtGrid";
import { searchPlayerByName } from "@/lib/eta";
import type { ETAResult } from "@/types";
import { Search, Clock, Activity, ArrowLeft, User, Info, MapPin, Home, CheckCircle2, ChevronRight, Sparkles, HelpCircle } from "lucide-react";

// ▼ 初回説明用のコンポーネント (チュートリアル画面)
function TutorialScreen({ onComplete }: { onComplete: () => void }) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-300">

                {/* ヘッダー部分 */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-100 text-sky-600 mb-4 ring-8 ring-sky-50">
                        <Sparkles className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">ようこそ Foc's Portalへ</h1>
                    <p className="text-slate-500">
                        合宿を快適に過ごすための<br />3つの機能を紹介します
                    </p>
                </div>

                {/* 機能紹介カード */}
                <div className="space-y-4">
                    <Card className="border-l-4 border-l-emerald-500 shadow-sm">
                        <CardContent className="p-4 flex gap-4 items-start">
                            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 shrink-0">
                                <User className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">1. ステータス確認</h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    自分が「試合中」か「待機中」か、ひと目で確認できます。
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-sky-500 shadow-sm">
                        <CardContent className="p-4 flex gap-4 items-start">
                            <div className="p-2 bg-sky-100 rounded-lg text-sky-600 shrink-0">
                                <Activity className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">2. コート状況</h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    どのコートが空いているか、リアルタイムで把握できます。
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-violet-500 shadow-sm">
                        <CardContent className="p-4 flex gap-4 items-start">
                            <div className="p-2 bg-violet-100 rounded-lg text-violet-600 shrink-0">
                                <Clock className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800">3. Smart ETA (待ち時間)</h3>
                                <p className="text-sm text-slate-600 mt-1">
                                    名前を検索すると、次の試合までの目安時間をAIが予測します。
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* スタートボタン */}
                <Button
                    onClick={onComplete}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold h-12 text-lg shadow-md transition-all active:scale-95"
                >
                    利用を開始する
                    <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
            </div>
        </div>
    );
}

// ▼ メインのダッシュボードコンポーネント
export default function UserDashboard() {
    const [searchName, setSearchName] = useState("");
    const [etaResult, setEtaResult] = useState<ETAResult | null>(null);
    const [searching, setSearching] = useState(false);

    const [showTutorial, setShowTutorial] = useState<boolean | null>(null);

    useEffect(() => {
        const hasSeenTutorial = localStorage.getItem("focs_tutorial_seen");
        if (hasSeenTutorial) {
            setShowTutorial(false);
        } else {
            setShowTutorial(true);
        }
    }, []);

    const handleTutorialComplete = () => {
        localStorage.setItem("focs_tutorial_seen", "true");
        setShowTutorial(false);
    };

    // もう一度チュートリアルを表示する関数
    const handleShowTutorialAgain = () => {
        setShowTutorial(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
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

    if (showTutorial === null) return null;

    if (showTutorial) {
        return <TutorialScreen onComplete={handleTutorialComplete} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 animate-in fade-in duration-500">

            <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="container mx-auto px-4 py-3 md:py-4 flex items-center justify-between">

                    <div className="flex items-center gap-2">
                        <User className="w-6 h-6 text-sky-500 shrink-0" />
                        <div className="flex flex-col md:flex-row md:items-end md:gap-2 leading-none">
                            <h1 className="text-lg md:text-2xl font-bold text-slate-800">
                                Foc's Portal
                            </h1>
                            <span className="text-xs md:text-sm text-slate-500 font-medium md:mb-1">
                                参加者ダッシュボード
                            </span>
                        </div>
                    </div>

                    <Link href="/">
                        <Button variant="ghost" size="sm" className="text-slate-500 h-9 w-9 md:w-auto px-0 md:px-3 hover:text-sky-600 hover:bg-sky-50">
                            <Home className="w-5 h-5" />
                            <span className="hidden md:inline ml-1">ホーム</span>
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
                <div className="grid gap-4 md:gap-6">

                    {/* Status Card */}
                    <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-emerald-400">
                        <CardHeader className="pb-2 md:pb-6">
                            <CardTitle className="text-lg md:text-xl text-slate-800 flex items-center gap-2">
                                <User className="w-5 h-5 text-emerald-500" /> あなたのステータス
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-4 md:py-6">
                                <div className="inline-flex items-center gap-2 px-4 py-2 md:px-6 md:py-3 bg-emerald-50 text-emerald-700 rounded-full text-sm md:text-base font-bold mb-3 border border-emerald-100">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                    待機中（フリータイム可）
                                </div>
                                <p className="text-slate-600 font-medium text-sm md:text-base">
                                    次の試合まで <span className="text-lg md:text-xl font-bold text-slate-800">約15分</span>
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Court Status Grid */}
                    <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-sky-400">
                        <CardHeader className="pb-2 md:pb-6">
                            <CardTitle className="text-lg md:text-xl text-slate-800 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-sky-500" /> コート稼働状況
                            </CardTitle>
                            <CardDescription className="text-slate-500 text-xs md:text-sm flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                リアルタイム更新中（5秒ごと）
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-2 md:px-6">
                            <CourtGrid />
                        </CardContent>
                    </Card>

                    {/* ETA Search */}
                    <Card className="bg-white border-slate-200 shadow-sm border-t-4 border-t-violet-400">
                        <CardHeader className="pb-2 md:pb-6">
                            <CardTitle className="text-lg md:text-xl text-slate-800 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-violet-500" /> Smart ETA（待ち時間予測）
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                                        <Input
                                            type="text"
                                            placeholder="名前を入力..."
                                            className="pl-9 border-slate-300 focus:border-sky-500 focus:ring-sky-500 text-base"
                                            value={searchName}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchName(e.target.value)}
                                            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => (e as KeyboardEvent<HTMLInputElement>).key === 'Enter' && handleSearch()}
                                            disabled={searching}
                                            suppressHydrationWarning={true}
                                        />
                                    </div>
                                    <Button
                                        onClick={handleSearch}
                                        disabled={searching}
                                        className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-4 md:px-6"
                                    >
                                        {searching ? '...' : '検索'}
                                    </Button>
                                </div>

                                {etaResult ? (
                                    <div className="p-4 bg-violet-50 border border-violet-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-start gap-3">
                                            <Info className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="font-bold text-violet-900 text-base md:text-lg mb-1">
                                                    {etaResult.detail}
                                                </p>
                                                {etaResult.next_court && (
                                                    <p className="text-sm text-violet-700 flex items-center gap-1">
                                                        <MapPin className="w-4 h-4" />
                                                        予定: <span className="font-semibold">{etaResult.next_court.replace('court_', 'コート')}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    !searching && searchName && etaResult === null && (
                                        <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 text-sm text-center">
                                            該当する選手が見つかりませんでした
                                        </div>
                                    )
                                )}

                                <div className="p-4 bg-sky-50/50 border border-sky-100 rounded-lg mt-4">
                                    <p className="text-sm text-sky-800 font-medium mb-1 flex items-center gap-2">
                                        <Info className="w-4 h-4" /> 検索のヒント
                                    </p>
                                    <p className="text-xs text-slate-500 ml-6">
                                        「山田」「佐藤」など苗字で検索してください。<br />
                                        ※ 過去の試合時間データに基づいて待ち時間をAI予測します。
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 👇 フッター部分: 操作説明をもう一度見るボタン */}
                    <div className="text-center pt-8 pb-12">
                        <Button
                            variant="link"
                            size="sm"
                            onClick={handleShowTutorialAgain}
                            className="text-slate-400 hover:text-sky-600 text-xs font-normal"
                        >
                            <HelpCircle className="w-3 h-3 mr-1" />
                            操作説明をもう一度見る
                        </Button>
                        <p className="text-[10px] text-slate-300 mt-2">
                            Powered by Badmin-Ops
                        </p>
                    </div>

                </div>
            </main>
        </div>
    );
}