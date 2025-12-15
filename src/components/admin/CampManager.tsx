"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createCamp, getAllCamps, activateCamp, setupCampCourts } from "@/lib/firestore-helpers";
import { useCamp } from "@/context/CampContext";
import type { Camp } from "@/types";
import { Plus, Play, Settings, CheckCircle, Calendar, ArrowRight } from "lucide-react";

export default function CampManager() {
    const { refreshCamp, setManualCamp } = useCamp();

    const [camps, setCamps] = useState<Camp[]>([]);
    const [newTitle, setNewTitle] = useState("");
    const [courtCount, setCourtCount] = useState(6);
    const [loading, setLoading] = useState(false);

    // 一覧を読み込む
    const loadCamps = async () => {
        const data = await getAllCamps();
        setCamps(data);
    };

    useEffect(() => {
        loadCamps();
    }, []);

    // 新規作成
    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setLoading(true);

        // 合宿データ作成
        const newId = await createCamp(newTitle, courtCount);

        if (newId) {
            setNewTitle("");
            await loadCamps(); // リスト更新
        }
        setLoading(false);
    };

    // 「この合宿を開催する」ボタン (Activeにする)
    const handleActivate = async (campId: string, courts: number) => {
        if (!confirm("この合宿を「開催中」にしますか？\n参加者の画面がこの合宿に切り替わります。")) return;

        setLoading(true);
        // 1. 合宿をActiveに
        await activateCamp(campId);
        // 2. コート数をセットアップ（物理コートの上書き）
        await setupCampCourts(courts);
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

    return (
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
                            onClick={handleCreate}
                            disabled={loading || !newTitle}
                            className="bg-sky-500 hover:bg-sky-600 text-white w-full md:w-auto"
                        >
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
                    {camps.map((camp) => (
                        <Card key={camp.id} className={`transition-all hover:shadow-md ${camp.status === 'active' ? 'border-emerald-400 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">

                                {/* 情報部分 */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-slate-900">{camp.title}</h3>
                                        {camp.status === 'active' ? (
                                            <Badge className="bg-emerald-500 hover:bg-emerald-600">開催中</Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-slate-500">準備中</Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        コート数: {camp.court_count}面 | ID: {camp.id.slice(0, 8)}...
                                    </p>
                                </div>

                                {/* ボタン部分 */}
                                <div className="flex gap-2 w-full md:w-auto">
                                    {/* Activeにするボタン */}
                                    {camp.status !== 'active' && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleActivate(camp.id, camp.court_count)}
                                            disabled={loading}
                                            className="flex-1 md:flex-none border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                        >
                                            <Play className="w-4 h-4 mr-1" />
                                            これを開催する
                                        </Button>
                                    )}

                                    {/* 管理画面に入るボタン */}
                                    <Button
                                        onClick={() => handleEnter(camp)}
                                        className="flex-1 md:flex-none bg-slate-800 text-white hover:bg-slate-700"
                                    >
                                        管理画面へ
                                        <ArrowRight className="w-4 h-4 ml-1" />
                                    </Button>
                                </div>

                            </CardContent>
                        </Card>
                    ))}

                    {camps.length === 0 && (
                        <div className="text-center py-10 bg-slate-50 rounded-lg text-slate-400">
                            まだ合宿が作成されていません
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}