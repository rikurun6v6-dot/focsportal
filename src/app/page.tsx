import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Users } from "lucide-react";

export default function Home() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-800">
            <main className="container mx-auto px-4 py-8 max-w-5xl">

                {/* ヘッダーセクション */}
                <div className="text-center mb-10 space-y-2">
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
                        Foc's Portal
                    </h1>
                    <p className="text-lg md:text-xl font-medium text-sky-600 flex items-center justify-center gap-2">
                        <span>Foc's🦊</span>
                        <span>合宿大会運営システム</span>
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">

                    {/* 1. 参加者用カード (メイン) */}
                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white border-t-4 border-t-sky-400 ring-1 ring-slate-100">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-2xl flex items-center gap-2 text-slate-800">
                                <Users className="w-6 h-6 text-sky-500" />
                                参加メンバー
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                試合順・コート状況はこちら
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-sky-50/50 rounded-lg p-4 mb-6 border border-sky-100">
                                <ul className="space-y-2 text-sm text-slate-600">
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                        リアルタイムのコート状況
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                        自分の次の試合・待ち時間
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                                        試合結果の確認
                                    </li>
                                </ul>
                            </div>

                            <Link href="/user" className="block">
                                <Button className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold h-12 shadow-sm transition-colors">
                                    参加者ダッシュボードへ
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                    {/* 2. 管理者用カード (サブ) */}
                    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bg-slate-50 border-t-4 border-t-slate-300 ring-1 ring-slate-200/50">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-2xl flex items-center gap-2 text-slate-700">
                                <Lock className="w-6 h-6 text-slate-400" />
                                運営・管理者
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                進行管理・結果入力
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-white/50 rounded-lg p-4 mb-6 border border-slate-100">
                                <ul className="space-y-2 text-sm text-slate-500">
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        トーナメント作成・管理
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        試合の自動割り当て (Auto)
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                        合宿設定・データ管理
                                    </li>
                                </ul>
                            </div>

                            <Link href="/admin" className="block">
                                <Button variant="outline" className="w-full border-slate-300 text-slate-600 hover:bg-white hover:text-slate-800 h-12">
                                    管理者ログイン
                                </Button>
                            </Link>

                            <p className="text-xs text-center text-slate-400 mt-3 flex items-center justify-center gap-1">
                                <Lock className="w-3 h-3" />
                                アクセスには管理者PINが必要です
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="text-center mt-12 text-xs text-slate-400">
                    <p>Powered by Badmin-Ops</p>
                </div>
            </main>
        </div>
    );
}