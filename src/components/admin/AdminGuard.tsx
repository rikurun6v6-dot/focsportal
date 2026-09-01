"use client";

// 管理画面のPINロックは撤去した（オーナー判断）。
//
// 当日は複数の端末・複数の運営が同時に管理画面を開く。PINを挟むと
// 端末を変えるたび、タブを開き直すたびに入力が要り、進行が止まる。
//
// このコンポーネントは素通しにしてあるだけで、消してはいない。
// ロックを戻したくなったら、下の children をそのまま返すのをやめて
// git 履歴から元の実装を復元すれば足りる。
//
// ※ ロックが無いので、/admin の URL を知っていれば誰でも操作できる。
//    URL を参加者に配らないこと。

export default function AdminGuard({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
