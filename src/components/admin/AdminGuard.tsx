"use client";

// 管理画面のPINロック。
//
// 一度撤去したが、迷い込んだ参加者が触れてしまうため戻した。
// ただし以前は sessionStorage だったので、タブを開き直すたび・端末を変えるたびに
// 入力が必要で、当日の進行が止まっていた。
//
// いまは localStorage に「解除した時刻」を持ち、同じ端末なら30日間は聞かない。
// 当日は最初の1回だけ入れれば、以後どのタブでも通る。
//
// ※ これは「迷い込み防止」であって、データを守る仕組みではない。
//   Firestore のルールが `allow write: if true` のままなので、
//   プロジェクトIDを知っていれば管理画面を通らずに読み書きできる。
//   本当に守るなら Google ログイン + ルール変更が要る（大会後の課題）。

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const CORRECT_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "0000";

const STORAGE_KEY = "admin_auth_until";
/** 解除を覚えておく期間 */
const REMEMBER_DAYS = 30;

function readUnlocked(): boolean {
    try {
        const until = Number(localStorage.getItem(STORAGE_KEY) || 0);
        return until > Date.now();
    } catch {
        // プライベートウィンドウなどで localStorage が使えないときは毎回聞く
        return false;
    }
}

function writeUnlocked() {
    try {
        localStorage.setItem(STORAGE_KEY, String(Date.now() + REMEMBER_DAYS * 86400_000));
    } catch {
        // 覚えられないだけ。認証自体は通す
    }
}

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 以前の sessionStorage 版で解除済みの端末は、そのまま通して覚え直す
        let legacy = false;
        try {
            legacy = sessionStorage.getItem("admin_auth") === "true";
        } catch { /* 使えない環境では無視 */ }

        if (readUnlocked() || legacy) {
            if (legacy) writeUnlocked();
            setIsAuthenticated(true);
        }
        setIsLoading(false);
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === CORRECT_PIN) {
            setIsAuthenticated(true);
            setError(false);
            writeUnlocked();
        } else {
            setError(true);
            setPin("");
        }
    };

    if (isLoading) return null;
    if (isAuthenticated) return <>{children}</>;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <Card className="w-full max-w-md shadow-xl bg-white">
                <CardHeader className="text-center space-y-2">
                    <div className="mx-auto bg-sky-100 w-12 h-12 rounded-full flex items-center justify-center mb-2">
                        <Lock className="w-6 h-6 text-sky-600" />
                    </div>
                    <CardTitle className="text-2xl font-bold text-slate-800">管理者認証</CardTitle>
                    <CardDescription>
                        運営用PINコードを入力してください
                        <br />
                        <span className="text-xs text-slate-400">
                            この端末では{REMEMBER_DAYS}日間、次回から聞きません
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                inputMode="numeric"
                                placeholder="PINコード"
                                value={pin}
                                onChange={(e) => {
                                    setPin(e.target.value);
                                    setError(false);
                                }}
                                className="text-center text-lg tracking-widest bg-white"
                                autoFocus
                            />
                            {error && (
                                <p className="text-sm text-red-500 text-center font-medium">
                                    PINコードが間違っています
                                </p>
                            )}
                        </div>
                        <Button type="submit" className="w-full size-lg text-lg bg-sky-600 hover:bg-sky-700 text-white">
                            ロック解除
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
