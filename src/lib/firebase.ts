import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously, Auth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  // Task 2: 通信の安定化 - Long Polling
  // [最適化A] 旧: experimentalForceLongPolling(常時ロングポーリング=低速) →
  //   experimentalAutoDetectLongPolling(必要な回線でのみロングポーリング、通常はWebChannelで高速)
  //   に変更。多くの環境で通信が速くなる。回線によってはロングポーリングへ自動フォールバック。
  // 永続ローカルキャッシュ（IndexedDB）を有効化し、画面切り替え時の再取得を高速化＋オフライン対応。
  // persistentMultipleTabManager で複数タブ（管理画面＋プレビュー等）でもキャッシュを共有。
  // IndexedDB はブラウザ専用のため、SSR/ビルド時（window 不在）はキャッシュ設定を付けない。
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    ...(typeof window !== "undefined"
      ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
      : {}),
  });
} else {
  app = getApp();
  db = getFirestore(app);
}

// App Check: 「本物のこのアプリからのリクエスト」だけに Firestore 書き込みを許可するための土台。
// reCAPTCHA v3 のサイトキー(NEXT_PUBLIC_RECAPTCHA_SITE_KEY)が設定されている時のみ有効化する。
//  - キー未設定なら何もしない（＝現状どおり動く。設定ミスでアプリが壊れない）。
//  - 実際に書き込みをブロックするのは Firebase Console 側の「App Check の enforcement 有効化」。
//    クライアントにトークンを流す→Consoleで検証状況を確認→ドメイン登録→enforcement有効化、の順で安全に移行する。
if (typeof window !== "undefined") {
  const appCheckSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (appCheckSiteKey) {
    // ローカル/開発のみ: デバッグトークンを発行（コンソールに出るトークンを Console に登録して検証）
    if (process.env.NODE_ENV !== "production") {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (e) {
      console.error("App Check 初期化失敗:", e);
    }
  }
}

const auth = getAuth(app);

// Task 1: 起動時に匿名認証を実行し、書き込み権限を確立
if (typeof window !== "undefined") {
  signInAnonymously(auth)
    .then(() => {
      // 認証成功 - 通知なし（UIに表示しない）
    })
    .catch((error) => {
      console.error("認証失敗:", error);
    });
}

export { app, db, auth };
