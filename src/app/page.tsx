"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Lock } from "lucide-react";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-4xl w-full space-y-8">
                {/* ヘッダー */}
                <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <Image
                            src="/app-icon.png"
                            alt="Foc's Portal Logo"
                            width={56}
                            height={56}
                            className="object-cover rounded-xl shadow-md"
                        />
                        <h1 className="text-4xl md:text-5xl font-black text-slate-800">
                            Foc's Portal
                        </h1>
                    </div>
                    <p className="text-xl text-slate-600 font-medium">
                        大会運営システムへようこそ！🏸
                    </p>
                </div>

                {/* 参加者用カード（管理者導線は非表示。運営は /admin へ直接アクセス） */}
                <div className="max-w-md mx-auto">
                    <Link href="/user">
                        <Card className="hover:shadow-xl transition-all duration-300 cursor-pointer group border-2 border-transparent hover:border-sky-200 h-full">
                            <CardHeader className="text-center pb-4">
                                <div className="mx-auto w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-sky-200 transition-colors">
                                    <User className="w-8 h-8 text-sky-600" />
                                </div>
                                <CardTitle className="text-2xl text-slate-800">
                                    参加者はこちら
                                </CardTitle>
                                <CardDescription className="text-base">
                                    試合状況の確認・待ち時間検索
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-start gap-2">
                                    <span className="text-sky-500 font-bold">✓</span>
                                    <span>自分の試合呼び出し通知</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-sky-500 font-bold">✓</span>
                                    <span>全コートの試合状況</span>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-sky-500 font-bold">✓</span>
                                    <span>他の選手の待ち時間検索</span>
                                </div>
                                <p className="pt-2 mt-1 border-t border-slate-100 text-xs text-slate-500">
                                    結果や試合状況を見るだけなら、名前を選ばずに入れます
                                </p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>

                {/* 結果発表ページ（誰でも見られる） */}
                <div className="max-w-md mx-auto">
                    <Link href="/results">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-center transition-colors hover:bg-amber-100 hover:border-amber-300 cursor-pointer">
                            <span className="block text-base font-bold text-amber-900">結果発表</span>
                            <span className="block text-xs text-amber-800 mt-1">各種目の1〜3位と団体戦の順位をまとめて見られます</span>
                        </div>
                    </Link>
                </div>

                {/* 運営者向けの小さな導線（目立たない・PIN保護あり） */}
                <div className="text-center pt-1">
                    <Link href="/admin">
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600 text-xs gap-1.5">
                            <Lock className="w-3 h-3" />
                            運営者ログイン
                        </Button>
                    </Link>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-slate-700 pt-2">
                    <p>© 2026 Foc's Portal | The 4th executive team</p>
                </div>
            </div>
        </div>
    );
}
