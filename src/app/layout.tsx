import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { CampProvider } from "@/context/CampContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Foc's Portal | 大会運営システム",
  description: "Zero-Downtime, Max-Playtime",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Foc's Portal",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        suppressHydrationWarning={true}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CampProvider>
          {children}
        </CampProvider>
        <Script id="register-sw" strategy="afterInteractive">
          {`
            // 🧹 開発環境: 古いService Workerを強制解除（デバッグ用）
            // localhost または開発サーバーでのみ実行
            const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

            if ('serviceWorker' in navigator && isDev) {
              navigator.serviceWorker.getRegistrations().then((registrations) => {
                if (registrations.length > 0) {
                  console.warn('[DEBUG] 🧹 開発モード: Service Worker を強制解除します');
                  registrations.forEach((registration) => {
                    registration.unregister();
                    console.log('[DEBUG] Service Worker 解除:', registration.scope);
                  });
                }
              });
            }

            // Service Worker 登録（本番環境のみ）
            if ('serviceWorker' in navigator && !isDev) {
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                  .then((reg) => console.log('[SW] 登録成功:', reg.scope))
                  .catch((err) => console.error('[SW] 登録失敗:', err));
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
