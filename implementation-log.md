# Badmin-Ops 実装記録

## プロジェクト概要
バドミントン合宿大会運営システム（60名・2日間・6面コート対応）
Next.js + Firebase構成

---

## 実装済み機能

### 1. 基盤インフラ
- [x] Next.js 16.0.8 セットアップ
- [x] Firebase統合
- [x] Tailwind CSS + shadcn/ui
- [x] TypeScript型定義完備 (src/types.ts)

### 2. UI構造
- [x] ホームページ (src/app/page.tsx)
- [x] 管理者画面 (src/app/admin/page.tsx)
- [x] 参加者画面 (src/app/user/page.tsx)
- [x] レスポンシブデザイン

### 3. データ管理
- [x] Firestore初期化機能
  - `initializeCourts()` - 6面コート作成
  - `initializeConfig()` - システム設定作成
- [x] CSVインポート (src/components/CSVImport.tsx)
  - 参加者一括登録
- [x] トーナメント生成 (src/components/TournamentGenerator.tsx)

### 4. UIコンポーネント
- [x] Button, Card, Dialog, Input, Select, Table, Tabs
- [x] Alert, Badge (追加済み)

---

## 未実装機能（優先度順）

### Phase 1: コア機能
- [x] Auto-Dispatch Engine ✓
  - 待機試合 → 空きコート自動割り当て ✓
  - 性別優先度考慮（M→1-3番, F→4-6番） ✓
  - dispatcher.ts完全実装 ✓
  - 管理画面でON/OFF切り替え ✓
  - 手動実行ボタン ✓
  - 5秒毎の自動実行 ✓

- [x] リアルタイムコート表示 ✓
  - CourtGrid完全実装 ✓
  - Firestore Realtime Listener ✓
  - 試合状況（空き/試合中）表示 ✓
  - 選手名表示（シングル/ダブルス対応） ✓

- [x] 試合結果入力UI ✓
  - 管理者画面「結果入力」タブ ✓
  - スコア入力 → Match更新 ✓
  - コート解放（次試合自動割り当てはAuto-Dispatchで自動実行） ✓
  - リアルタイム進行中試合一覧 ✓

### Phase 2: Smart機能
- [x] ETA計算エンジン ✓
  - eta.ts完全実装 ✓
  - 試合時間データ学習（移動平均） ✓
  - 待ち時間予測アルゴリズム ✓
  - 参加者画面で名前検索 ✓
  - リアルタイム結果表示 ✓

- [ ] ポイント管理システム (src/lib/points.ts)
  - TournamentConfig活用
  - ランキング算出
  - PlayerRanking表示 (src/components/admin/PlayerRanking.tsx)

### Phase 3: 安全機能
- [ ] Undo機能
  - Operation記録 → 1ステップ戻す
- [ ] Walkover処理
  - 不戦勝入力
- [ ] Substitute機能
  - 選手交代処理

### Phase 4: チーム戦
- [ ] チーム戦トーナメント生成 (src/lib/team-battle.ts)
- [ ] 5本勝負入力UI
- [ ] 予選ラウンドロビン → 決勝トーナメント

---

## 本セッション実装完了

### ✓ Phase 1実装完了（コア機能）
1. Auto-Dispatch Engine
   - 自動割り当てロジック完成
   - 管理画面制御UI実装
   - 手動実行機能追加

2. リアルタイムコート表示
   - 6面コート状況可視化
   - 試合詳細（選手名）表示
   - Firestore Realtime Listener

3. 試合結果入力UI
   - 進行中試合一覧
   - スコア入力→結果確定
   - コート自動解放

### ✓ Phase 2実装完了（Smart機能）
1. ETA計算エンジン
   - 試合時間学習機能
   - 待ち時間予測
   - 参加者向け検索UI

### 技術的修正完了
- types.ts型定義補完（Gender, Division, MatchStatus, TournamentType, TeamGroup, Timestamp）
- firestore-helpers.tsにgetDocument/updateDocument追加
- dispatcher.ts性別判定ロジック修正

---

## 次回実装候補

**Phase 3**: 安全機能
- Undo機能（Operation記録）
- Walkover/Substitute処理

**Phase 4**: ポイント管理
- TournamentConfig連携
- ランキング表示

**Phase 5**: チーム戦
- 5本勝負入力UI
- 予選→決勝トーナメント

---

## 技術メモ

### Firestore構造
```
collections:
  - players/      : Player[]
  - matches/      : Match[]
  - courts/       : Court[]
  - teams/        : Team[]
  - team_battles/ : TeamBattle[]
  - config/       : Config (singleton)
  - tournament_configs/ : TournamentConfig[]
  - match_history/ : MatchHistory[]
```

### イベント種類
- MD/WD/XD: ダブルス（男子/女子/混合）
- MS/WS: シングルス（男子/女子）
- TEAM: チーム戦

### スコア設定
- MD/WD/MS/WS: 初期ラウンド15点、準決勝以降21点
- XD: 全て15点
- TEAM: 全て11点

---

最終更新: 2025-12-14 23:30
実装状況: Phase 1 & 2 完了（コア機能 + Smart機能）

---

## 2025-12-14 パフォーマンス最適化セッション

### 問題点
ウェブサイトが重く、読み込みが遅い問題が発生していた。

### 原因分析
1. **CourtGrid.tsx**
   - useEffectの依存配列が空で、matchesCacheを参照していた
   - 無限ループの可能性があった
   - courtsDataの各コートごとに非同期でgetMatchWithPlayersを呼び出していた
   - Promise.allで並列化されておらず、非効率だった

2. **AutoDispatchEngine.tsx**
   - 5秒ごとにFirestoreからconfigドキュメントを読み取っていた
   - 大量の不要なリクエストが発生していた
   - リアルタイムリスナーを使用していなかった

3. **firestore-helpers.ts**
   - subscribeToDocumentヘルパー関数が存在しなかった

### 実装した修正

#### 1. CourtGrid.tsx 最適化 ✓
- useEffectを2つに分離
  - コートのサブスクリプション専用のeffect
  - 試合データ取得専用のeffect（依存配列を正しく設定）
- loadingMatchesステートを追加して重複リクエストを防止
- Promise.allで試合データを並列取得するように変更
- useCallbackでloadMatchData関数をメモ化

#### 2. AutoDispatchEngine.tsx 最適化 ✓
- subscribeToDocument（新規実装）でconfigをリアルタイム監視
- ポーリング時のFirestore読み取りを削減
- enabledステートでON/OFF状態を管理
- enabledがfalseの時はintervalをクリア

#### 3. firestore-helpers.ts 機能追加 ✓
- subscribeToDocument関数を新規実装
- 単一ドキュメントのリアルタイム監視をサポート
- onSnapshotを使用したリアルタイムリスナー実装
- エラーハンドリング追加

### パフォーマンス改善効果
- Firestore読み取りリクエスト数を大幅削減
- 無限ループリスクを解消
- 試合データ取得の並列化により読み込み速度向上
- リアルタイム性を保ちながら効率化を実現

### 技術的詳細

#### CourtGrid.tsx
```typescript
// Before: 無限ループの可能性
useEffect(() => {
  subscribeToCourts((courtsData) => {
    courtsData.forEach(async (court) => {
      // matchesCacheを参照しているが依存配列が空
    });
  });
}, []);

// After: 適切な依存管理と並列化
useEffect(() => {
  subscribeToCourts(setCourts);
}, []);

useEffect(() => {
  const matchIds = courts.filter(...).map(...);
  loadMatchData(matchIds); // Promise.all使用
}, [courts, matchesCache, loadingMatches, loadMatchData]);
```

#### AutoDispatchEngine.tsx
```typescript
// Before: 5秒ごとにFirestore読み取り
setInterval(async () => {
  const config = await getDocument('config', 'system');
  if (config?.auto_dispatch_enabled) { ... }
}, 5000);

// After: リアルタイムリスナー
subscribeToDocument('config', 'system', (config) => {
  setEnabled(config?.auto_dispatch_enabled);
});

useEffect(() => {
  if (enabled) setInterval(runDispatcher, 5000);
}, [enabled]);
```

### 今後の最適化候補
- MatchResultInput.tsxの試合データ取得も並列化を検討
- matchesCacheの永続化（sessionStorageなど）
- 試合データのプリフェッチ戦略

---

最終更新: 2025-12-14 23:50
実装状況: Phase 1 & 2 完了 + パフォーマンス最適化完了

### ビルド確認 ✓
- npm run build 成功
- TypeScriptエラー修正完了
  - CourtGrid.tsx: オプショナルチェーン追加（player3, player4）
  - firestore-helpers.ts: deleteTournamentConfigの戻り値型修正
  - points.ts: 型ガード追加（filter関数）
- 全ページの静的生成成功

