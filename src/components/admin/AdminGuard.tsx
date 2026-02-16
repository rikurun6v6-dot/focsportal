"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

// 環境変数からPINコードを取得（設定がなければデフォルト'0000'）
const CORRECT_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "0000";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState("");
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // 初回ロード時にセッションを確認
    useEffect(() => {
        const sessionAuth = sessionStorage.getItem("admin_auth");
        if (sessionAuth === "true") {
            setIsAuthenticated(true);
        }
        setIsLoading(false);
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === CORRECT_PIN) {
            setIsAuthenticated(true);
            setError(false);
            sessionStorage.setItem("admin_auth", "true");
        } else {
            setError(true);
            setPin("");
        }
    };

    if (isLoading) return null;

    if (isAuthenticated) {
        return <>{children}</>;
    }

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
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Input
                                type="password"
                                placeholder="PINコード (例: 1234)"
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