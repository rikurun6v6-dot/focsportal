# Badmin-Ops - バドミントン大会運営システム

Zero-Downtime, Max-Playtime

## 概要

Badmin-Ops は、バドミントン大会をスムーズに運営するためのリアルタイム管理システムです。

## 機能

- リアルタイムコート管理
- 自動試合割り当て
- トーナメント進行管理
- PWA 対応（オフライン動作）
- マルチキャンプ対応

## 開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Firebase 設定

`.env.local.example` をコピーして `.env.local` を作成し、Firebase の認証情報を設定してください。

```bash
cp .env.local.example .env.local
```

Firebase Console から以下の情報を取得して設定：
- API Key
- Auth Domain
- Project ID
- Storage Bucket
- Messaging Sender ID
- App ID

### 3. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 でアプリケーションが起動します。

## Vercel へのデプロイ

### 環境変数の設定

Vercel ダッシュボードで以下の環境変数を設定してください：

```
NEXT_PUBLIC_FIREBASE_API_KEY=<your_api_key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your_auth_domain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your_project_id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your_storage_bucket>
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your_sender_id>
NEXT_PUBLIC_FIREBASE_APP_ID=<your_app_id>
```

### デプロイ手順

1. Vercel アカウントに GitHub リポジトリを接続
2. プロジェクトをインポート
3. 環境変数を設定（上記参照）
4. デプロイを実行

Vercel は自動的に：
- ビルドコマンド `npm run build` を実行
- 本番環境用に最適化
- CDN にデプロイ

### 本番環境の最適化

- 不要な `console.log` は削除済み
- エラーハンドリングは `console.error` のみ保持（トラッキング用）
- Service Worker による PWA 対応
- Firestore オフラインキャッシュ有効化

## 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **UI**: React 19, Tailwind CSS, Radix UI
- **バックエンド**: Firebase (Firestore, Auth)
- **デプロイ**: Vercel
- **PWA**: Service Worker, Workbox

## プロジェクト構造

```
badmin-ops/
├── src/
│   ├── app/           # Next.js App Router ページ
│   ├── components/    # React コンポーネント
│   ├── lib/          # ユーティリティ関数
│   ├── context/      # React Context
│   └── types/        # TypeScript 型定義
├── public/           # 静的ファイル
└── firestore.indexes.json  # Firestore インデックス設定
```

## ライセンス

MIT
