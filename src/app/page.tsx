"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-4xl w-full space-y-8">
                {/* ヘッダー */}
                <div className="text-center space-y-4">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <Image
                            src="/new-logo_transparent.png"
                            alt="Foc's Portal Logo"
                            width={48}
                            height={48}
                            className="object-cover brightness-130 saturate-170"
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
                            </CardContent>
                        </Card>
                    </Link>
                </div>

                {/* フッター */}
                <div className="text-center text-sm text-slate-700 pt-5">
                    <p>© 2026 Foc's Portal | The 4th executive team</p>
                </div>
            </div>
        </div>
    );
}
