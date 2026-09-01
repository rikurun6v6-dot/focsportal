# HANDOFF.md — 変更引き継ぎログ（追記専用）

> **ルール**
> - すべての変更は、このファイルの**末尾に新しいエントリを追記**すること。
> - **既存エントリの編集・削除は禁止**（追記のみ）。
> - 1 つの変更（PR）につき 1 エントリ。
> - 詳細ルールは [`CLAUDE.md`](./CLAUDE.md) を参照。

---

## エントリ・テンプレート（コピーして使う）

```
## YYYY-MM-DD — <変更タイトル>
- 担当者: <GitHubユーザー名>
- ブランチ / PR: <branch名> / #<PR番号>
- 変更内容: <何をしたか>
- 変更理由: <なぜ必要か>
- 影響範囲: <触ったファイル・機能。データ構造変更の有無>
- 注意点 / 引き継ぎ事項: <次の人が知るべきこと。なければ「なし」>
- オーナー承認: <承認者 / 承認日>
```

---

# 変更ログ

## 2026-06-11 — ガバナンス体制の導入（共同編集ルール策定）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/governance-rules / （初期セットアップ）
- 変更内容: 共同編集のための厳格ルールを導入。`CLAUDE.md`（最上位ルール）、`HANDOFF.md`（本ファイル・追記専用ログ）、`.github/CODEOWNERS`、PR テンプレート、`CONTRIBUTING.md` を追加。`master` ブランチ保護ルールセット（PR 必須・オーナー承認必須・直接 push 禁止・force push 禁止）を GitHub 側に設定。
- 変更理由: 友人との共同編集にあたり、オーナーの承諾なしにコードが書き換えられない仕組みを厳格に整備するため。
- 影響範囲: リポジトリ運用ルールのみ。アプリのソースコード（`src/`）への変更なし。
- 注意点 / 引き継ぎ事項: 今後 **master への直接 push は不可**。全変更は作業ブランチ → PR → オーナー承認 → マージの順。各変更時にこの `HANDOFF.md` への追記が必須。
- オーナー承認: rikurun6v6-dot / 2026-06-11

## 2026-06-11 — 機能3: 1日目/2日目で異なるコート数を設定可能に
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/court-per-day / #1
- 変更内容: 合宿（Camp）に開催日の概念を新設。1日目・2日目それぞれのコート数を設定し、「開催日」をボタンで切り替えると、その日のコート数でコートを再初期化する。
  - `types/index.ts`: `Camp` に `court_count_day1?`, `court_count_day2?`, `active_day?: 1|2` を追加（`court_count` は現在有効なコート数として後方互換維持）。
  - `lib/firestore-helpers.ts`: `getCampCourtCountForDay`（指定日のコート数取得・未設定なら court_count にフォールバック）、`saveCampDayCourtCounts`（日別コート数保存）、`switchCampDay`（日切替＋コート再初期化＋court_count/active_day更新）を追加。既存の `setupCampCourts`（余剰コート無効化対応済み）を再利用。
  - `components/admin/CampManager.tsx`: 編集UIを単一「コート数」から「1日目/2日目」の2入力に変更。開催中の合宿カードに開催日トグル（1日目/2日目ボタン、面数表示、確認ダイアログ、ロック連動）を追加。
- 変更理由: 大会が2日開催で日ごとに使えるコート面数が異なるケースに対応するため。
- 影響範囲: Camp スキーマに任意フィールド追加（後方互換あり・既存合宿はフォールバックで動作）。コート初期化フロー。`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項: 日切替はコートを再初期化するため、コートの current_match_id（進行中割り当て）はリセットされる。試合データ・結果（matches コレクション）は保持される。日切替は試合進行中でないタイミングで行う想定。3日目以降が必要になったら active_day と UI を配列化する。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — 機能2: 表彰結果（表彰台）まとめ機能を追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/awards-podium / #2
- 変更内容: 順位確定後に各種目・部門の優勝/準優勝/3位をまとめて表示する「表彰」タブを追加。画像エクスポート対応。
  - `lib/awards.ts`（新規）: `computeCategoryPodium` / `computeAllPodiums` で決勝トーナメント試合から表彰台を算出。優勝＝決勝勝者、準優勝＝決勝敗者、3位＝3位決定戦(bronze)勝者、なければ準決勝敗者で共同3位。ダブルスはペア名、団体戦はチーム名（preview の sideName と同じ規約）。
  - `components/admin/AwardsTab.tsx`（新規）: 表彰台カードのグリッド表示＋html-to-image で画像保存（VisualBracket と同方式）。未確定種目は「進行中」として別表示。
  - `app/admin/page.tsx`: サイドナビに「表彰」(value=awards, Medalアイコン) と TabsContent を追加。
- 変更理由: 表彰式の進行をしやすくするため、確定した上位結果を一画面にまとめて出力できるようにする。
- 影響範囲: 新規ファイル2点＋admin画面のタブ追加のみ。既存ロジック・データ構造の変更なし（読み取りのみ）。`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項: 表彰台は「決勝トーナメント(knockout)」の試合から算出する。予選リーグのみで決勝がない種目は表示されない。winner_id は player1_id/player2_id 規約に依存。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — UX改善: 管理者導線の非表示＋管理タブの4グループ集約
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/ux-admin-hide-tabs / #3
- 変更内容:
  - `app/page.tsx`: トップページから「管理者」カードを削除し、参加者カードのみ中央表示に。参加者に管理者導線を見せない。管理者は `/admin` 直接アクセス（AdminGuard の PIN は従来どおり）。未使用アイコン import (Shield/Activity) を整理。
  - `app/admin/page.tsx`: サイドバーの14タブを4グループ（準備/進行/結果/設定・その他）に集約。`NAV_GROUPS` 定数＋`openGroups` 開閉state を追加。展開時はグループ見出し（クリックで開閉、アクティブタブを含むグループは常時表示）、折りたたみ時は全アイコンをグループ区切り線付きで表示。既定で「設定・その他」のみ閉。
- 変更理由: 参加者に管理導線が見えていた／タブが多すぎて操作性が低い、という UI/UX 課題の改善。
- 影響範囲: 画面のナビゲーションUIのみ。タブの中身（各コンポーネント）やデータ構造は不変。`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項: タブの値(value)は従来と同一なので各 TabsContent はそのまま動作。グループ分けは `NAV_GROUPS` を編集すれば変更可能。トップから管理リンクを消したので、運営は `/admin` をブックマーク推奨。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — 機能3追補: 合宿「新規作成」フォームでも日別コート数を入力可能に
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/camp-create-day-courts / #4
- 変更内容: `components/admin/CampManager.tsx` の新規作成フォームを、単一「コート数」入力から「1日目 / 2日目」2入力に変更。作成時に `createCamp`（初期 court_count=1日目）＋`saveCampDayCourtCounts(newId, day1, day2)` で日別コート数を保存。状態 `courtCount` を `newDay1`/`newDay2` に置き換え。
- 変更理由: 機能3で日別コート数の「編集」は可能になったが、合宿を新規作成する時点で日別に入力できなかったため。
- 影響範囲: CampManager の作成フォームと handleCreate のみ。データ構造は機能3で追加済みの Camp フィールドを利用（追加変更なし）。`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項: 既定値は両日とも6面。1日目の値が初期の有効コート数（court_count）になる。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — パフォーマンス改善: 永続キャッシュ＋タブkeep-alive＋ナビ4グループ既定閉
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/perf-cache-keepalive / #5
- 変更内容:
  - `lib/firebase.ts`: Firestore に `persistentLocalCache`（IndexedDB・`persistentMultipleTabManager`）を有効化。画面切替時の再取得を高速化＋オフライン対応。SSR/ビルド時は `typeof window` ガードでキャッシュ設定を付けない。
  - `app/admin/page.tsx`: タブのkeep-alive を実装。`mountedTabs` セット＋`selectTab`＋各 `TabsContent` に `forceMount={keepMounted(value)}` を付与。一度開いたタブはアンマウントされず、再表示が即時に（Radix Tabs の既定アンマウントを回避）。
  - ナビ: グループを既定で全閉に変更。サイドバー折りたたみ時はグループ代表アイコン4個のみ表示（クリックで展開＋当該グループを開く）、展開時はグループ見出し4個（既定閉）。「バーガー時もタブ4個」の要望に対応。
- 変更理由: ページ（タブ）切替が遅い、参加者向けに導線を整理、という UX/パフォーマンス改善要望。
- 影響範囲: Firestore 初期化とナビUI／タブのマウント挙動。各タブの中身は不変。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: keep-alive により訪問済みタブの onSnapshot リスナーは保持される（メモリ・リスナー増は許容範囲）。さらなる高速化案として `experimentalForceLongPolling`→`experimentalAutoDetectLongPolling` への切替、重いタブの dynamic import、ポーリング(5秒間隔)の onSnapshot 化などが候補。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — モニター(preview)の自動ページ送り間隔をページ数で可変に
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/preview-page-interval / #6
- 変更内容: `app/preview/page.tsx` の固定 8秒切替を、ページ数に応じた可変 `pageIntervalMs` に変更。4ページ以上=4秒 / 3ページ=5秒 / それ未満=8秒。進捗バーのアニメーション時間も連動。
- 変更理由: コート数（ページ数）が多いと一巡が長すぎるため、多いほど速く回す。
- 影響範囲: preview 画面のページ送りタイミングのみ。`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項: 閾値は totalPages = ceil(activeCourts/3) 基準。COURTS_PER_PAGE=3。
- オーナー承認: rikurun6v6-dot / 2026-06-11（オーナー本人の変更のため即マージ）

## 2026-06-11 — HOTFIX: タブが切替できない不具合を修正（keep-alive撤去）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: hotfix/remove-broken-keepalive / #8
- 不具合: PR#5で入れたタブ keep-alive（Radix TabsContent への forceMount）が原因で、Radix が `hidden: !present` を常に false にするため、訪問済みタブのコンテンツが全て重なって表示され、タブ切替が機能しなくなった（本番影響）。
- 変更内容: `app/admin/page.tsx` から forceMount/keepMounted/mountedTabs/selectTab を撤去し、通常の setActiveTab による切替に戻した。永続キャッシュ（firebase.ts）とナビ4グループは維持。
- 変更理由: 本番でタブが反応しない重大リグレッションの復旧。
- 影響範囲: 管理画面のタブ切替挙動のみ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: Radix Tabs は forceMount を付けると常時表示になり keep-alive 用途には使えない。再挑戦する場合は「Radix外で全パネルを描画し activeTab で表示制御」等の別実装にし、必ず Preview で検証すること。
- オーナー承認: rikurun6v6-dot / 2026-06-11（本番復旧のため即マージ）

## 2026-06-11 — [検証中] 管理ナビ操作性改善＋スマホUI（ドロワー化）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/admin-mobile-nav / #9（★Previewで検証後にマージ）
- 変更内容（`app/admin/page.tsx`）:
  - アクティブなタブを含むグループを自動展開（現在地が見える・同セクション内は1クリック切替）。操作性低下（2〜3クリック問題）の改善。
  - スマホ: サイドバーをオーバーレイのドロワー化。ヘッダー左にハンバーガー（md:hidden）、背景タップ/タブ選択で閉じる。本文はスマホで全幅(ml-0)、デスクトップは従来オフセット(md:ml-16/64)。
  - ナビを「グループ一覧（ラベル付き・モバイル常時/デスクトップ展開時）」と「アイコンレール（デスクトップ折りたたみ時のみ）」の2系統に整理（Tailwind の md: と isExpanded の併用で出し分け）。
  - z-index: ドロワー z-[120] / 背景 z-[110] をヘッダー z-[100] より上に。
- 変更理由: 「操作性が悪い（クリック数が多い）」「スマホ未対応」の改善要望。
- 影響範囲: 管理画面のナビ/レイアウトのみ。タブの中身・データは不変。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★リスク配慮で**本番マージ前に Vercel Preview（特にスマホ実機）で検証**する。上部固定領域 pt-[136px] の縦圧迫（項目4）は未対応・別途。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-11 — [検証中] スマホ横はみ出し＆ステータスバー位置の修正
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/mobile-overflow / #12（★Previewでスマホ確認後マージ）
- 不具合: iOS Safari でページが横にはみ出し、コンテンツが左右に収まらない／`fixed` のステータスバー(StatusBar)がはみ出し領域の右端に張り付いて変な位置に見える。
- 原因/対応:
  - `app/globals.css`: `html, body { overflow-x: clip; max-width: 100% }` を追加。clip は overflow:hidden と違い sticky/fixed を壊さずに横はみ出しのみ抑制。これで横スクロールが消え、StatusBar も正位置に固定される。
  - トースト(sonner)の `min-width: 320px / 400px` 固定をレスポンシブ化（`min(…, calc(100vw - 2rem))`）。スマホ幅超過によるはみ出し誘発を防止。
- 影響範囲: 全ページのbody overflow挙動とトースト幅。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★Previewをスマホ実機で確認後にマージ。overflow-x: clip により万一はみ出す要素があれば右側がクリップされる（その場合は該当要素を個別にレスポンシブ化する）。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-11 — [最適化A] Firestore通信を AutoDetect long polling に変更
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/firestore-autodetect-polling / #7
- 変更内容: `lib/firebase.ts` の `experimentalForceLongPolling: true` を `experimentalAutoDetectLongPolling: true` に変更。通常はWebChannelで高速、必要な回線でのみロングポーリングへ自動フォールバック。
- 変更理由: 常時ロングポーリングが通信を遅くしていたため、全体高速化（最適化A）。
- 影響範囲: Firestore の通信方式のみ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: 特定回線/プロキシ環境で接続が不安定になる場合は revert（ForceLongPolling に戻す）。
- オーナー承認: rikurun6v6-dot / 2026-06-11（即マージ指示）

## 2026-06-11 — [最適化B] 合宿リストをポーリング→onSnapshot化
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/camp-realtime-v2 / #10
- 変更内容: `lib/firestore-helpers.ts` に `subscribeToCamps`（onSnapshot購読）を追加。`components/admin/CampManager.tsx` の5秒ポーリングをリアルタイム購読に置換（getAllCamps import 撤去）。
- 変更理由: 無駄な再取得の削減・即時反映（最適化B）。
- 影響範囲: 合宿リスト画面のデータ取得方式のみ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: 空スナップショットでの上書き防止ガードは維持。
- オーナー承認: rikurun6v6-dot / 2026-06-11（即マージ指示）

## 2026-06-11 — [最適化D] 重い/低頻度タブの遅延読み込み（dynamic import）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/lazy-load-tabs / #13
- 変更内容: `app/admin/page.tsx` で 9コンポーネント（VisualBracket/AwardsTab/PairSeedManager/GroupRankingManager/PreliminaryGroupEditor/SafetyTab/AdvancedAnalytics/TeamTournamentGenerator/MessageManager）を `next/dynamic`（ssr:false, loading=読み込み中…）で遅延読み込みに変更。初回表示の setup/control/results/players は即時のまま。
- 変更理由: 初回ロードのJSを削減し、管理画面の表示を軽くする（最適化D）。
- 影響範囲: 管理画面の各タブの読み込みタイミングのみ（初回開いた時に該当チャンクを取得・一瞬「読み込み中…」表示）。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: 対象は全て default export。ssr:false は admin が "use client" のため可。さらに減らすなら他タブも同様に変換可能。
- オーナー承認: rikurun6v6-dot / 2026-06-11（即マージ指示）

## 2026-06-11 — [検証中] アプリアイコン/ブランドロゴを新ロゴに刷新
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/new-app-icon / #14（★Previewで見た目確認後マージ）
- 変更内容: 新ロゴ（キツネ＋シャトルの濃紺ラウンドタイル）を全アイコンに適用。
  - sharp で `public/icon-192.png` / `icon-512.png` / `apple-touch-icon.png`(180) / `app-icon.png`(256・アプリ内用) を生成。
  - アプリ内ロゴ参照を `new-logo_transparent.png` → `app-icon.png` に変更（サイドバー/トップ/ユーザー画面）。古い色補正フィルタ(brightness/saturate)を除去し `rounded-*`＋影で“なじむ”小タイル表示に。
  - 通知アイコン（`user/page.tsx`・`public/sw.js`）を `icon-192.png` に統一。
- 変更理由: アプリアイコンとアプリ内ロゴを新ブランドに統一したい（なじむ形で）。
- 影響範囲: アイコン画像とロゴ参照のみ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★Previewで見た目（特に白背景上のロゴのなじみ）を確認後にマージ。`src/app/favicon.ico` は旧アイコンのまま（タブ表示は metadata の icon-192 が使われる）。アプリ内を「キツネのマークのみ・透過」にしたい場合は元画像の透過版が必要。
- オーナー承認: （Preview確認→承認待ち）

## 2026-06-12 — [検証中] コート割り当てロジック修正（コート稼働優先＋部門バランス二重計上バグ）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/dispatcher-fixes / #15（★Previewで実データ確認後マージ）
- 不具合/分析: ①最小ラウンドの試合がブロック中(busy/休息)でも上位ラウンドを出さず、コートが空いたまま待機していた（`minRoundByGroup` を全待機 `waitingMatches` から計算していたため）。②部門バランスの隣接ペナルティが「Firestore再取得分」と「batchAssignedDivisions分」で二重計上され過剰に効いていた。
- 変更内容（`lib/dispatcher.ts`）:
  - ①[コート稼働優先] `minRoundByGroup` の基準を `waitingMatches` → `restFilteredMatches`（今すぐ出せる試合）に変更。最小ラウンドがブロック中なら出せる次ラウンドを解放。水平進行はやや崩れるが対戦の正しさ（選手確定）は保たれる。
  - ②二重計上を撤去。`adjacentCourtDivisions` は Firestore 再取得分のみ（awaited write 反映済みで唯一の真実）。`batchAssignedDivisions` の仕組み（autoDispatchAll の追跡・引数）を削除。
- 影響範囲: 自動コート割り当ての選択順のみ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★実データ（進行中の大会）で「コートが空かない」「部門の偏りが自然」を Preview で確認後マージ。未対応の発見（休息3系統の整理・getAdjacentCourtDivisionsの命名・divisionPreference係数の綱引き・finalsWaitMode遊休）は別途。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-12 — [検証中] コート割り当てロジック整理（休息/命名/部門バランス/決勝遊休）＋全貌ドキュメント
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/dispatcher-cleanup / #16（★Previewで実データ確認後マージ）
- 変更内容:
  - (a) 休息モデル整理: `updatePlayersRestTime` に player5/6 を追加（3人組の休息が効かないバグ修正）＋dispatcher に休息モデル（available_at=明示 / last_match_finished_at=自動2段階）の明確化コメント。
  - (b) `getAdjacentCourtDivisions` → `getActiveCourtDivisions` に改名（実態は全コート対象）＋未使用の courtNumber 引数を削除。
  - (c) 部門バランスの綱引き解消: コート別 divisionPreference(+150) があるコートは隣接ペナルティを適用しない（排他）。ない場合のみ隣接ペナルティ。
  - (d) 決勝センターコートの遊休回避: 優先コート待ちの決勝を `return null` で遊ばせる代わりに「候補から除外」し、非優先コートは別試合を取れるように。
  - `docs/court-dispatch-logic.md` 新規: 割り当てロジックの全貌（パイプライン/スコアリング/休息/部門/ラウンド/決勝/団体戦/混合/config）。
- 影響範囲: 自動割り当ての選定挙動（dispatcher.ts）＋休息記録（firestore-helpers.ts）＋ドキュメント。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★実データで「部門の散らばり」「決勝でコートが遊ばない」「3人組の休息が効く」を Preview 確認後マージ。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-12 — [検証中] 決勝T 同一ラウンド順を bracket_order（正規化最大60点）ベースに
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/bracket-order / #17（★Previewで実データ確認後マージ）
- 背景: 同一ラウンドのタイブレークが `-match_number` だったが、match_number のスケールが生成パスで食い違う（シンプルブラケット=ラウンド内小／グループ予選→決勝=グローバル大）ため挙動が不安定だった。
- 変更内容:
  - `types/index.ts`: `Match` に `bracket_order?`（ラウンド内 0始まり・上→下）、`bracket_order_count?`（そのラウンドの試合数）を追加。
  - `lib/matchScoring.ts`: `calcBracketOrderBonus` を追加。`bracket_order` を「ラウンド内順位0〜1」に正規化し最大 `BRACKET_ORDER_BONUS_MAX=60` のボーナスに。Phase C のタイブレークを `-match_number` → これに変更。規模に依らず最大差60で一定、ラウンド境界100は超えない。旧データは match_number 極小フォールバック。
  - `components/admin/TournamentGenerator.tsx`: 両 knockout 生成パス（グループ予選→決勝／シンプルブラケット）で `bracket_order`(=pos-1 or slot.matchNumber-1)・`bracket_order_count`(そのラウンドの試合数) を保存。ローカル MatchData 型にも追加。
  - `docs/court-dispatch-logic.md`: Phase C を更新。
- 変更理由: 「同一ラウンド内は表の自然な順（左上→左下→右上→右下）で出したい」要望。固定倍率だと規模依存になるため正規化方式を採用。
- 影響範囲: 決勝T のスコアリングと knockout 生成（bracket_order の保存）。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★既存の生成済み大会には bracket_order が無い→旧フォールバック（match_number極小）で動作。新規生成分から正規化が効く。実データで「同ラウンドが表の順で出るか」「ラウンド優先・休息が壊れないか」を Preview 確認。team_battle は未対応（必要なら別途）。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-12 — [検証中] 種目ごとの部(1部/2部)の例外設定（division_overrides）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/per-event-division / #18（★Previewで確認後マージ）
- 変更内容:
  - `types/index.ts`: `Player.division_overrides?: Partial<Record<TournamentType, Division>>` を追加（既定は `Player.division`、種目ごとに上書き）。
  - `lib/tournament-generator.ts`: `getEffectiveDivision(player, type)` を追加（override 優先・なければ division）。
  - `components/admin/TournamentGenerator.tsx`: 生成時の選手フィルタを `p.division === division` → `getEffectiveDivision(p, type) === division` に変更（単発・一括の両方をカバー。L364の1箇所で両対応）。
  - `components/admin/PlayerManager.tsx`: 各選手行に「種目別の部（例外）」ボタン＋件数バッジを追加。ダイアログで性別別の対象種目（S/D/混合）ごとに 既定/1部/2部 を選択。既定と同じ値は保存しない。
- 変更理由: 同一人物が種目ごとに 1部/2部 を変えたい（例外）要望。
- 影響範囲: 選手データ（任意フィールド追加・後方互換）／大会生成の選手選別／PlayerManager UI。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★Previewで「例外を設定→その種目だけ実効部が変わって生成されるか」を確認。team_battle は対象外。CSV では未対応（UIのみ）。マッチの division は種目の部のまま（実効部で選別された選手がその部の試合に入る）。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-12 — UI微修正: 管理ダッシュボードヘッダーの Shield アイコンを削除
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/remove-header-shield / #19
- 変更内容: `app/admin/page.tsx` ダッシュボードヘッダーの「Foc's Portal」左にあった Shield（盾）アイコンを削除。合宿選択画面ヘッダーの Shield は維持（import も継続使用）。
- 変更理由: 「Foc's Portal の左の縦みたいなアイコンを消して」との要望。
- 影響範囲: 管理画面ヘッダーの見た目のみ。`npm run build` 成功。
- オーナー承認: rikurun6v6-dot / 2026-06-12（即マージ）

## 2026-06-12 — 修正: 団体戦チームの合宿分離＋管理ヘッダー盾削除(adminも)
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/team-camp-isolation / #20
- 不具合: `teams` コレクションを campId 無しで全合宿取得していた3箇所（`ResultsTab`/`preview`/`AwardsTab`）があり、前の合宿の団体戦チームが現在の合宿に混入していた。
- 変更内容:
  - `components/admin/ResultsTab.tsx` / `app/preview/page.tsx` / `components/admin/AwardsTab.tsx`: teams 取得に `where('campId','==', camp.id/campId)` を追加し当該合宿のチームのみに限定。preview/ResultsTab は依存配列も campId/camp に修正＋ガード。
  - `app/admin/page.tsx`: 合宿選択画面ヘッダー「Foc's Portal Admin」左の Shield アイコンも削除（未使用になった Shield import も除去）。
- 変更理由: 「団体戦の結果が前の合宿のが入る」「adminの盾も消して」。
- 影響範囲: 団体戦チーム名の取得スコープ／ヘッダー見た目。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: 団体戦タブ(TeamBattle)・team_battles は元々 campId 済み。今回は teams 名前マップの混入を解消。なお ResultsTab の maxRoundByType は全合宿 matches から算出している箇所が残る（ラベル用・別途検討）。
- オーナー承認: rikurun6v6-dot / 2026-06-12（即マージ）

## 2026-06-12 — 修正(本命): 団体戦が前の合宿の結果を表示する不具合
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/team-tournament-camp-reset / #21
- 不具合: `TeamTournamentGenerator`（団体戦タブ）が、新しい合宿に `team_tournament_states/{camp.id}` の保存が無いとき、**合宿スコープでない単一 localStorage キー `ttg_state_v1` から前合宿の状態（チーム/対戦/結果）を読み込んで表示**していた（クロス合宿リーク）。前回の teams 名前マップ修正(#20)とは別の真因。
- 変更内容: `components/admin/TeamTournamentGenerator.tsx`:
  - `resetState()` を追加（全 persist 状態をデフォルトに戻す）。
  - ロード時、当該合宿の保存が無い（または取得失敗）の場合は `loadFromLocalStorage()` フォールバックを廃止し `resetState()` で初期化。未使用になった `loadFromLocalStorage` を削除。
- 変更理由: 「団体戦の結果が前の合宿のが勝手に入ってる」。
- 影響範囲: 団体戦タブの状態ロードのみ。保存は引き続き FS(`team_tournament_states/{camp.id}`) が真実。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: localStorage(`ttg_state_v1`)への保存処理自体は残置（読み込まないので無害）。永続キャッシュにより通常 getDocument は当該合宿のキャッシュを返すため、saved=null は「本当に未作成の合宿」を意味する。
- オーナー承認: rikurun6v6-dot / 2026-06-12（即マージ）

## 2026-06-14 — UI: トップ(ロール選択)に小さな「運営者ログイン」導線を追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/landing-admin-link / #22
- 変更内容: `app/page.tsx` の参加者カード下・フッター上に、小さく目立たない「運営者ログイン」リンク（ghostボタン・鍵アイコン）を追加。/admin へ遷移（PIN保護は従来どおり）。
- 変更理由: 管理者カードを以前消した(導線非表示)が、運営者用に控えめな導線を下部に出したいとの要望。
- 影響範囲: トップページの見た目のみ。`npm run build` 成功。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — 団体戦の「種目構成設定」UIを削除
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/remove-team-match-config / #23
- 変更内容: `TeamTournamentGenerator` から `TeamMatchConfigEditor`（団体戦の種目構成=games 編集UI）を削除。構成は既定 `DEFAULT_CONFIG`（MD/WD/XD/MS/WS 各1＝5サブマッチ）で固定。`config`/`setConfig` 自体は buildGameSlots・保存ロードで継続使用。
- 変更理由: 「団体戦の種目構成設定はいらない」との要望。
- 影響範囲: 団体戦タブの設定UIのみ。生成ロジックは既定構成を使用。`npm run build` 成功。
- 注意点: TeamMatchConfigEditor.tsx ファイル自体は残置（参照無し）。既定構成を変えたい場合は DEFAULT_CONFIG を編集。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — UI: 通知バーの表示時間を延長（見逃し防止）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/notif-longer / #24
- 変更内容: `components/NotificationBar.tsx` の自動消去時間を延長。`playing`(試合中)通知 10秒→30秒、新着ハイライト(fresh) 5秒→10秒。`calling`(呼び出し)は従来どおり自動消去なし（手動Xまで残る）。`info` は30秒据え置き。
- 変更理由: 「トップの通知バーが短くて見逃す」との要望。
- 影響範囲: 通知バーの表示時間のみ。`npm run build` 成功。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — 団体戦の種目ラベルを汎用「第N試合」に変更（種目固定をやめる）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/team-generic-games / #25
- 変更内容: `components/admin/TeamEncounterCard.tsx` のサブ試合ラベルを、種目（男D/女D/混D/男S/女S）から汎用「第N試合」に変更。`GAME_TYPE_LABEL` 定義を削除。点数入力の文言も「各種目」→「各試合」に。
- 変更理由: 「種目とか固定しなくていい・なんでもいい」との要望。サブ試合の type は元々ラベル表示のみで選手の縛りではない（勝者1/2を記録するだけ）。
- 影響範囲: 団体戦の対戦カード表示のみ。内部の slot id（MD_1等）や勝敗集計は不変。`npm run build` 成功。
- 注意点: DEFAULT_CONFIG の games（5試合）はそのまま（type は slot id 用の内部値として残るが画面非表示）。試合数を変えたい場合は DEFAULT_CONFIG.games を編集。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — UI: 新しく割り当てられたコートのふちをハイライト（管理/ユーザー両方）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/court-assigned-highlight / #26
- 変更内容: コートの試合が `calling`（割り当て直後・選手待ち）の間、コートカードのふちをアンバーで点滅ハイライト。`globals.css` に `@keyframes court-assigned-pulse` ＋ `.court-assigned` を追加。`components/CourtGrid.tsx`（ユーザー画面）と `components/admin/ResultsTab.tsx`（コート別結果）の両方でカードに `isCalling` 時 `border-amber-400 ring-2 ring-amber-300 court-assigned` を付与。playing になると解除。
- 変更理由: 「新しく試合が割り当てられたらコートのふちがハイライトして気づけるように」。
- 影響範囲: コートカードの見た目のみ。`npm run build` 成功。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — 改善: コート新規割り当てハイライトを「ステータス依存」→「current_match_id変化検知」に
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/court-highlight-transition / #27
- 背景: 直前の #26 は match.status==='calling' で判定したが、matchesCache のステータスが即時更新されない（特に CourtGrid は取得1回キャッシュ）ためハイライトが正しく消えない懸念があった。
- 変更内容: `CourtGrid.tsx`・`ResultsTab.tsx` の両方で、ライブな court データの `current_match_id` の変化を検知し、新規割り当てコートを **8秒間**だけ `.court-assigned`（アンバー点滅＋ring）でハイライト。初回ロード時の既存割り当ては「新規」として光らせない（courtInitedRef ガード）。
- 影響範囲: コートカードの見た目のみ。`npm run build` 成功。
- オーナー承認: rikurun6v6-dot / 2026-06-14（即マージ）

## 2026-06-14 — [検証中] コート別結果の入力を最速化（スコア常時表示＋Enter確定）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/quick-win-result / #29（★Previewで確認後マージ）
- 変更内容: `components/admin/ResultsTab.tsx` のアクティブ試合カードで、従来「結果入力」ボタンを押して展開→スコア入力→確定だったのを、**スコア入力欄を最初から表示**に変更。展開タップ廃止。p1→Enterでp2にフォーカス、p2→Enterで即確定。補助操作（コート変更/休憩/フリー/上下WO）はコンパクト行に常時表示。点数は従来どおり入力・管理可能（勝者タップで点数を捨てる方式は不採用）。
- 変更理由: 「結果入力を最速化」かつ「点数は管理したい」。
- 影響範囲: コート別結果のアクティブ試合カードUIのみ。旧 showInputFor 展開ブランチは未使用化（残置・無害）。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★主要画面のため Preview で実機確認後にマージ。team_battle は勝利数入力(0-5)のまま常時表示。未対応の要望: タブ移動の多さ・自動割当/進行制御の分かりやすさ（別途）。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-14 — [検証中] 「進行中」1画面に集約（自動割当ON/OFF＋コート結果）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/live-dashboard / #30（★Previewで確認後マージ）
- 変更内容: `app/admin/page.tsx`。従来の「コート結果(results)」タブを「進行中(live)」に昇格し、上部に**自動割り当てON/OFFバー**（状態表示＋開始/停止ボタン）を追加、その下に `<ResultsTab/>`（コート＋結果入力）を表示。普段はこの1タブで〔自動割当の制御＋全コートの状況＋結果入力〕が完結。既定タブを setup→live に変更。操作(control)タブは順次進行/休息/一時停止/種目有効化などの詳細設定として残置。
- 変更理由: 「タブ移動が多い」「自動割当・進行制御が分かりにくい」の改善（1画面集約）。
- 影響範囲: 管理ナビの構成と既定タブ。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★既定タブ変更＋集約のため Preview で確認後マージ。ResultsTab は live タブ内のみで描画（results タブは廃止）。
- オーナー承認: （Preview検証→承認待ち）

## 2026-06-14 — [検証中] トーナメント表から「次に優先してコート割り当て」
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/priority-dispatch / #31（★Previewで実データ確認後マージ）
- 変更内容:
  - `types/index.ts`: `Match.priority_dispatch?: boolean` を追加。
  - `lib/dispatcher.ts`: `dispatchToEmptyCourt` で validMatches のうち priority_dispatch 付きを最優先で割り当て（ラウンド順・性別・部の制約を無視）。割り当て後にフラグをクリア。複数あればスコア最大を選択。
  - `components/admin/KnockoutTree.tsx`: `priorityMode` / `onPrioritize` props を追加。優先モード時、待機中（両選手あり）の試合タップで onPrioritize 発火。優先指定済み(priority_dispatch)はアンバー枠表示。
  - `components/admin/VisualBracket.tsx`: 「⚡ 優先割り当て」トグルを追加。`handlePrioritize`= 空きコートがあれば即割り当て（calling+court_id+push）、無ければ priority_dispatch=true を付与（dispatcherが次に空いたコートへ最優先で割当）。ヒントバナー表示。
- 変更理由: 「トーナメント表から試合を選んで次に優先してコートに割り当て」の要望。空き無し時は予約して空き次第割当（ユーザー選択）。
- 影響範囲: dispatcher の割当順とトーナメント表UI。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★dispatcher変更のため実データで Preview 検証後マージ。優先はラウンド/性別/部を無視するが、選手が出場中（busy）の場合は割り当てない（validMatchesに残らない）。enabled_tournaments で無効な種目は対象外。auto-dispatch OFF かつ空きコート無しの場合、空くまで保留（次のdispatch cycleで割当=auto-dispatch ON 前提）。
- オーナー承認: rikurun6v6-dot / 2026-06-16

## 2026-06-16 — 進行制御の拡充＋通知の合宿スコープ修正＋結果訂正の2モード化
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/admin-run-control-and-result-fix / #32
- 変更内容:
  - 通知の合宿切替リセット（`app/admin/page.tsx`）: 試合アナウンス監視 useEffect の先頭で `matchAnnouncements` と `prevMatchStatusesRef`/`completedPrelimDivisionsRef` をリセット。別の終わった合宿の「予選ブロック完了」等の通知が残り続ける不具合を修正。
  - 全コート中断（時間指定なし）: `types/index.ts` に `Config.dispatch_suspended?` を追加。`AutoDispatchEngine.tsx` が立っている間は新規割り当てをスキップ（進行中の試合はそのまま）。`app/admin/page.tsx` の一時中断カード上部に「全コート中断/再開」トグルを追加（状態・ハンドラ `toggleDispatchSuspend`）。
  - コート別「次から割り当て停止」: `firestore-helpers.ts` に `stopCourtAfterCurrent`（現在の試合を残したまま `manually_freed=true`）。`ResultsTab.tsx` の進行中コートに「次から割り当て停止（今の試合は継続）」ボタン＋停止中表示＋解除（既存 `unfreeCourtManually` 再利用）。
  - 編集アイコン統一: `CampManager.tsx` の合宿名・コート数編集アイコンを常に鉛筆（Pencil）に。
  - 結果訂正の2モード化（`firestore-helpers.ts` + `VisualBracket.tsx`）: `analyzeCorrectionImpact`（影響分析・プレビュー用）、`applyRenameChain`（モードB=名前だけ修正・下流結果は保持）、`applyCorrectionWithReplay`（モードA=訂正＋次戦以降を再試合に戻す）、`cancelMatchResultChain`（取り消しを下流チェーン全体リセットに強化）。VisualBracketの結果編集で進出側が入れ替わり下流が消化/進行中のとき、影響プレビュー付きモード選択ダイアログを表示。進行中の下流があるとき再試合/取り消しはブロック、名前修正は許可。
- 変更理由: ①他合宿の通知混入の修正、②昼休憩以外の時間指定なし中断や特定コートだけ止めたい要望、③スコア誤記で誤った進出が起きた際に「再試合」か「名前だけ修正」を選べるようにするため。
- 影響範囲: `Config` に任意フィールド `dispatch_suspended` を追加（後方互換）。`Court` の既存 `manually_freed` を流用（スキーマ変更なし）。結果訂正系は既存フィールドのみ使用。`tsc --noEmit` 通過・`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★`types/index.ts`（Config）への追加は保護対象のためオーナー承認必須。結果訂正の「名前だけ修正」は“実際に正しい人が対戦済み”である前提（誤選択すると結果が誤ラベルになる）。再試合・取り消しは進行中の下流があるとブロック。本番は master マージ＝自動デプロイのため Preview 検証推奨。
- オーナー承認: rikurun6v6-dot / 2026-06-16

## 2026-06-16 — [hotfix] スマホで合宿カードのボタン/タイトルが右にはみ出して見切れる不具合
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/mobile-camp-card-layout / #（PR作成後）
- 変更内容: `components/admin/CampManager.tsx`。合宿カードの操作ボタン群がスマホ幅で横並びのまま縮まず（Buttonは whitespace-nowrap）画面外に見切れていた問題を修正。
  - 操作ボタンの2行（開催/アーカイブ/管理画面へ、削除/完全削除）を `grid grid-cols-1 sm:grid-cols-2 md:flex` に変更（スマホ=全幅1列、sm=2列、md以上=従来の横並び）。
  - タイトル行を `flex flex-wrap` に、合宿名 `<h3>` に `break-words`、情報コンテナに `min-w-0` を付与して折り返し可能に。
  - 開催日トグル行も `flex-wrap` 付与。
- 変更理由: スマホ実機で「合宿が消えた」ように見えるとの報告（実際はデータ正常・PCでは正常表示。ボタン/バッジが右端で見切れる横はみ出しが原因）。
- 影響範囲: CampManager の表示（レイアウトのみ・ロジック/データ変更なし）。`npm run build` 成功。デスクトップ(md+)の見た目は不変。
- 注意点 / 引き継ぎ事項: 既存の `flex` を `grid ... md:flex` に変えたためボタンは md 未満でグリッドセル幅に整列。Button の whitespace-nowrap は維持。
- オーナー承認: rikurun6v6-dot / 2026-06-16

## 2026-06-29 — [mobile] 操作タブの長文ボタン行がスマホで横はみ出す箇所を修正
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/mobile-admin-button-rows / #（PR作成後）
- 変更内容: `app/admin/page.tsx`。「3位決定戦を作成」「決勝戦の開始タイミング(待機中/通常通り)」の各 `flex gap-2` ボタン2個並びを `flex flex-col sm:flex-row gap-2` に変更（スマホ=縦積み、sm+=横並び）。Button は whitespace-nowrap で長文（"1部 - 3位決定戦を作成"）が縮まず横にはみ出していたため。
- 変更理由: スマホ幅でボタンが画面外に見切れる（CampManager と同種の flex 非折り返し問題）。
- 影響範囲: 操作タブの該当2カードの表示のみ。grid系（コート結果の3/4列）はモバイルで court カードが grid-cols-1（全幅1列）のため内側グリッドは収まり変更不要。StatusBar ピルも text-xs で収まるため変更なし。`npm run build` 成功。
- 注意点 / 引き継ぎ事項: なし。
- オーナー承認: rikurun6v6-dot / 2026-06-29

## 2026-06-29 — [security] App Check の土台を導入（休眠状態・現状維持）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/appcheck-foundation / #（PR作成後）
- 変更内容:
  - `src/lib/firebase.ts`: Firebase App Check（reCAPTCHA v3）の初期化を追加。`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` が設定されている時のみ有効化（未設定なら何もしない＝現状どおり動作）。開発時はデバッグトークンを発行。
  - `firestore.rules`（新規・バージョン管理化）: 内容は現状維持（read: if true / write: if true）。書き込み制限の実体は Console 側の App Check enforcement で行う。
  - `firebase.json`（新規）: firestore の rules / indexes を指定（`firebase deploy --only firestore` 用）。
- 変更理由: 現状ルールが `write: if true` で全世界から書き込み・削除可能（公開リポジトリ＋公開Firebase設定）。大会データ破壊を防ぐため、ログインを増やさず「本物のアプリからの書き込みのみ許可」する App Check を導入する。
- 影響範囲: サイトキー未設定なら挙動不変。`tsc --noEmit` 通過・`npm run build` 成功。
- 注意点 / 引き継ぎ事項: ★有効化手順（順守必須・順番を誤ると全書き込み停止）:
  1) このコードを配信（休眠）
  2) reCAPTCHA v3 サイトキー取得 → Vercel と .env.local に `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` を設定 → 再デプロイ
  3) Firebase Console → App Check でアプリ登録、Console指標で「検証済みリクエスト」が流れているか確認
  4) reCAPTCHA に本番ドメイン＋Vercel Preview ドメインを登録
  5) 最後に App Check の enforcement（Firestore）を有効化。まず Preview で書き込み可否を検証してから本番。
  - App Check は「本物のアプリか否か」を見るだけで「誰か」は区別しない（サークルメンバー本人の書込は防げない）。
- オーナー承認: rikurun6v6-dot / 2026-06-29

## 2026-06-29 — [fix] ユーザー画面が無限「読み込み中...」で開けない不具合
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/user-infinite-loading / #（PR作成後）
- 変更内容:
  - `src/lib/firestore-helpers.ts` `safeGetDocs`: 最終フォールバックの `getDocs(q)` にタイムアウトが無く、オフライン＋キャッシュ無し等で解決も拒否もせず固まる→呼び出し元が無限待ちになっていた。`Promise.race([getDocs(q), 5秒タイムアウト])` を追加し、固まらず空結果にフォールバックするように。
  - `src/app/user/page.tsx`: 初回の合宿取得 useEffect に安全タイマー（8秒）を追加。取得が固まっても必ずローディングを解除して画面を表示（finally で clearTimeout＋クリーンアップ）。
- 変更理由: 「ユーザー画面がずっとロードして開けないときがある」報告。`loading` が true のまま固定される（fetchCamps の await が settle しない）のが原因。
- 影響範囲: `safeGetDocs`（全画面の取得に影響するが、変更は既に失敗しているパスに上限を足すだけで安全）／ユーザー画面のローディング解除。`tsc`・`npm run build` 通過。
- 注意点 / 引き継ぎ事項: 8秒経過で表示した場合、合宿が空表示になることがある（その場合は再読み込みで回復）。根本のオフライン耐性は別途改善余地。
- オーナー承認: rikurun6v6-dot / 2026-06-29

## 2026-07-23 — [ui] ヒューマンインタフェースの原則に基づく指摘8件の修正
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/hi-usability-fixes / #（PR作成後）
- 変更内容: 大学のヒューマンインタフェース講義（藤波先生）の原則で現行UIを点検し、優先度上位10件のうち8件を修正。
  1. **同点スコアで player2 が自動的に勝者になる不具合**（最重要）
     - `src/lib/score-validation.ts`（新規）: `validateMatchScore()` を追加。未入力・負値・同点・勝者未登録を確定前に弾き、問題なければ勝者IDを返す。
     - 従来は `p1 === 0 && p2 === 0` だけを弾き、勝者を `p1 > p2 ? player1 : player2` で決めていたため、`15-15` のような打ち間違いが**黙って player2 の勝ちとして確定**し、次ラウンドの進出者まで伝播していた。
     - 適用先: `MatchResultInput.tsx`（確定・修正）、`ResultsTab.tsx`（確定・結果修正）、`VisualBracket.tsx`（結果編集。元から同点チェックはあったが共通化）。エラーは alert ではなく toastError で表示。
  2. **退出（ログアウト）の誤タップ対策**: `app/user/page.tsx`。ヘッダーのアイコンボタンを 40px→44px、間隔 2px→4px に拡大。「退出」の前に区切り線と余白を入れて他ボタンから離した。押下時に確認ダイアログを表示（従来は確認なしで即 localStorage 削除＋リロード＝取り消し不能）。
  3. **検索結果の言い分け**: `lib/eta.ts` に `playerExistsByName()` を追加。`searchPlayerByName()` は「選手がいない」「待機中の試合がない」の両方で null を返すため区別できず、通信失敗まで含めて全部「現在、待機中の試合はありません」と表示していた。「該当者なし」「待機中の試合なし」「通信失敗」を別文言・別色で表示するよう変更。
  4. **接続表示を同期状態に変更**: `app/user/page.tsx`。`navigator.onLine` ベースの "Online/Offline" は回線の有無しか見ておらず、購読が落ちても緑のまま＝**「Online なのに表示が古い」**状態が起きていた。onSnapshot の成功で `lastSyncAt` を更新・エラーで `syncError` を立て、ピルに「同期 ○秒前 / 接続中 / オフライン / 同期エラー」を表示。オフライン・同期エラー時は画面上部に帯を出す（従来は console.error のみ）。宣言だけされて未使用だった `getRelativeTime` / `lastUpdate` をこの表示に接続した。
  5. **極小フォントの廃止**: `text-[8px]` `text-[9px]` を全廃（17箇所→11px）。とくに CourtGrid の「次に控えている（次の試合の相手・あと何分）」が 8〜9px で、いちばん行動を促す情報がいちばん読めない状態だった。対象: `CourtGrid.tsx` `app/user/page.tsx` `PreliminaryGroup.tsx` `ResultsTab.tsx` `TeamEncounterCard.tsx` `TeamPreliminaryGroup.tsx`。
  6. **アイコンのみボタンのラベル付け**: `aria-label` を追加（user 画面のホーム/通知/チャット/退出/ヘルプ/ステータスピル/モーダル閉じる、admin の編集・並べ替え・ヘルプ等）。状態を `title` だけに預けていた通知トグルは、スマホで title が出ないため「通知ON / 通知OFF」を文字で表示するよう変更。
  7. **用語の統一**: 参加者向け画面の「合宿 / イベント / 大会」を**「大会」**に統一（`app/user/page.tsx` `CourtGrid.tsx`）。コート表記を **「コートN」** に統一（「第Nコート」を廃止。`app/user/page.tsx` `MyMatchesView.tsx` `ActiveMatchesView.tsx` `AdvancedAnalytics.tsx` `ResultsTab.tsx` `VisualBracket.tsx`）。
  8. **管理サイドバーに固定タブ**: `app/admin/page.tsx` に `PINNED_ITEMS`（進行中・操作）を新設し、ナビ最上段に常時表示（折りたたみ時のアイコンレールにも表示）。大会中に最も叩く2つがグループの中に埋まっていて、開く操作が1つ余分に挟まっていた。
- 変更理由: 上記1は誤った試合結果がトーナメント表まで確定してしまう実害。2〜8 は運営中・プレー中の誤操作と誤解を減らすため。
- 影響範囲: データ構造（`types/index.ts` の Match / Camp / Player）の変更なし。Firestore のルール・インデックス変更なし。追加した関数は既存関数を壊さない追加のみ（`searchPlayerByName` の戻り値契約は不変）。`npm run build` 成功。`validateMatchScore` は 21-0 / 0-21 / 21-19 → 勝者判定、15-15 / 0-0 / 負値 / 勝者未登録 → 拒否を実行して確認済み。
- 注意点 / 引き継ぎ事項:
  - **同点スコアはもう保存できない**。これまで同点で確定していた既存データがあれば、勝者は player2 側として記録されているので結果一覧で要確認。
  - user 画面ヘッダーは 44px×4個＋区切り線で、幅 320px の端末でもぎりぎり収まる計算だが、ボタンを増やす場合は横並びの限界を超えるので折り返しか集約を検討すること。
  - 今回見送った項目（別PR）: **(1) 「呼出中」と「試合中」が同じラベルで色だけの区別**（`CourtGrid.tsx` の status 表示。色覚配慮としても要対応）、**(7) 点滅（animate-ping 12箇所）の整理と `prefers-reduced-motion` 対応**。
  - 用語統一は参加者向け画面のみ。管理画面は運営側の語として「合宿」を残している（`CampManager` など）。揃えるかは要判断。
  - 検索は完全一致のまま（部分一致・あいまい一致は未対応）。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の変更・指示により即マージ）

## 2026-07-23 — [team] 団体戦モードのUI改善と順位判定の設定化
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/team-battle-ui / #（PR作成後）
- 変更内容:
  **順位判定**
  - `lib/tournament-logic.ts`: 予選順位の判定基準を **設定可能** にした。`TeamRankCriterion`（`wins` / `headToHead` / `gameDiff` / `gamesWon` / `janken`）と既定順 `DEFAULT_TEAM_RANK_ORDER = 勝利数 → 直接対決 → 得失ゲーム差 → 得ゲーム数 → じゃんけん` を追加。`rankTeamGroup` / `getNeedJankenPairs` が順序を受け取る。
  - 比較器の連鎖をやめ、**同順位ブロックを段階的に割る方式**（`splitIntoRankBlocks`）に変更。理由は **直接対決を「2チームが並んだときだけ」適用する**ため。3チーム以上が並ぶ（三つ巴以上）と A>B, B>C, C>A が成立しうるので直接対決では決着せず、その場合はこの基準を飛ばして次の基準（得失ゲーム差など）で決める。
  - 集計を変更: **勝敗は決着した対戦のみ**、**取ったゲーム数・得失ゲーム差は入力済みの試合をその都度集計**（未決着の対戦も途中経過として反映）。従来は未決着の対戦を丸ごと無視していた。
  - `TeamRankEntry` に `gamesWon` / `gamesLost` を追加。使われていなかった `pointDiff` を削除。
  - `normalizeTeamRankOrder()` で、保存データが欠けていても必ず全基準がそろった順序になるようにした。
  **得点入力の廃止**
  - 「得点入力（得失点差用）」は、入力しても画面に表示されず順位にも一切影響していなかった（`pointDiff` が計算されるだけでソートに使われていなかった）ため、UI ごと削除。`TeamGame.score1/score2` と `recordTeamGameResult` のスコア引数も廃止（既存の保存データに残っていても無視する）。
  **結果入力（`TeamEncounterCard.tsx` 全面書き換え）**
  - 勝者ボタンを「1」「2」から **チーム名表示** に変更。チーム名の文字色（青=team1 / 赤=team2）をボタンの色と揃えた。従来はチーム名が `title` にしか無く、スマホ・タブレットでは何も出なかった。
  - ボタンを 28px → 44px に拡大。1行1試合の縦並びにして、種目名（男子D・女子Dなど）を併記（従来は「第N試合」だけで種目が分からなかった）。
  - **入力の取り消しを追加**。`recordTeamGameResult` が `winner: null` を受け付けるようにし、同じボタンの再タップ／取り消しボタンのどちらでも未入力に戻せる。従来は押し間違えると元に戻せなかった。
  - 「3本先取」「決着済み」を明示。
  **データが消える経路をふさぐ**
  - 「設定を編集」中に出る「予選グループを開始」で、入力済みの予選結果が無確認で消えていた。進行中は文言を「対戦表を作り直す（予選結果は消えます）」に変え、消える対戦数を出した確認ダイアログを挟むようにした。
  - 「← 予選に戻る」が順位決定戦・決勝トーナメントの結果を無確認で破棄していた。**フェーズ移動だけに変更し結果は保持**。予選側からは「順位決定戦を開く」「決勝トーナメントを開く」で戻れる。作り直しは確認付き。
  - リセットが素の `window.confirm` 1回だった。`useConfirmDialog` の**二重確認**にし、置き場所も「設定を編集」の真横から、設定パネル最下部に移動。Firestore の削除に失敗したらトーストで知らせる（従来は握りつぶし）。
  - 保存が `catch { /* ignore */ }` で黙って落ちていた。**保存中／保存済み／保存できていません** を進行中ヘッダーに表示し、失敗時は説明の帯を出す。読み込み失敗時は同じ合宿の localStorage から復帰を試みる。
  - localStorage のキーが `ttg_state_v1` の単一キーで別の合宿と混ざる状態だった。`ttg_state_v1_{campId}` に変更。
  **入力欄のフォーカス落ち**
  - `SetupPanel` が `TeamTournamentGenerator` の中で定義され `<SetupPanel />` として使われていたため、レンダーのたびに別コンポーネント扱いになり、**チーム名を1文字打つごとに入力欄が作り直されてフォーカスが外れていた**。`TeamSetupPanel.tsx` として独立させて解消。
  **開始前チェック**
  - 空のグループがあると対戦が作られないのに開始できた。空グループ・チーム数不足・通過チーム数がグループのチーム数を超える場合を**開始前にブロック**し、1チームだけのグループは警告として出す。
  **表示**
  - 順位表に「得（取ったゲーム数）」列を追加し、見出しの「試」を「差」に変更。`title` 属性でしか説明が無かったので、凡例と現在の判定順を表の下に明記。
  - 新規: `TeamSetupPanel.tsx`、`TeamRankOrderEditor.tsx`（順位基準の並べ替えUI）。
  **不要コードの削除**
  - `components/admin/TeamBattle.tsx`（375行）、`lib/team-battle.ts`（121行）、`components/admin/TeamMatchConfigEditor.tsx`（103行）を削除。いずれもどこからも import されておらず、`teams` / `team_battles` という別コレクションを使う旧世代の実装が丸ごと残っていた。現行は `TeamTournamentGenerator` ＋ `team_tournament_states`。
- 変更理由: 団体戦モードの UI 改善依頼。入力の取り消し不能・無確認でのデータ消失・順位に効かない入力欄など、運営中に事故る箇所が複数あった。
- 影響範囲: 団体戦タブのみ。`Match` / `Camp` / `Player` のスキーマ変更なし。Firestore のルール・インデックス変更なし。`TeamRankEntry`（実行時に計算するだけの型）と `TeamGame` を変更。`npm run build` 成功・`tsc --noEmit` 通過・対象ファイルの eslint エラー 0。
- 注意点 / 引き継ぎ事項:
  - **試合構成は 男子D・女子D・混合D・男子S・女子S の5試合固定**（3本先取）。可変にする UI は今回入れていない（`TeamMatchConfigEditor` は未接続のまま削除した）。変えたくなったら `DEFAULT_CONFIG` を編集する。
  - 順位の判定順は合宿ごとに保存される。既存データには `rankOrder` が無いので、開くと既定順（勝利数→直接対決→得失ゲーム差→得ゲーム数→じゃんけん）が入る。
  - **三つ巴以上では直接対決を使わない**仕様。2チームだけが並んだときにのみ効く。それでも決まらない場合は順位表の▲▼で手動調整できる（従来どおり）。
  - 検証: 4チームで勝利数が並ぶケースで直接対決が効くこと、三つ巴では飛ばして得失ゲーム差で決まること、判定順を入れ替えると結果が変わること、じゃんけん要求ペアが正しく出ること、取り消しで決着が解除されることを実行して確認済み。
  - 旧 `teams` / `team_battles` コレクションに残っているデータは、今回削除したコードからしか読み書きされていなかった。参照する画面はもう無い。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [team] 予選の進行表と同時対戦数の設定、順位決定戦のガード
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/team-battle-schedule / #（PR作成後）
- 変更内容:
  **対戦の並び順（サーキット法）**
  - `lib/tournament-logic.ts` に `generateRoundRobinRounds()` を追加。総当たりを「同時に進められるラウンド」に分ける。
  - 従来の予選対戦生成は二重ループ（A-B, A-C, A-D, …）で、**同じチームが連続で試合に入る並び**だった。そのままでは進行表として使えない。サーキット法なら1ラウンド内に同じチームは1回しか出ず、奇数チームなら毎ラウンドちょうど1チームが休む（休みの回数も全チーム均等）。
  - `TeamEncounter.round` に1始まりのラウンド番号が入るようになった（従来は予選で常に0）。
  **進行表**
  - `lib/team-schedule.ts`（新規）: 対戦・同時対戦数・面数から「ブロック」を組み立てる。1ブロック = 同時に進める対戦の集まり。1対戦あたりの面数、5試合を何波で消化するか、所要時間の目安を出す。
  - `components/admin/TeamScheduleView.tsx`（新規）: 予選フェーズに進行表を表示。ブロックごとの対戦・休みチーム・経過時刻。
  - 1試合15分・転換5分で計算（`GAME_MINUTES` / `TURNOVER_MINUTES`）。
  **同時対戦数とコート面数の設定**
  - 「1グループあたり同時に進める対戦数」を選べるようにした。選択肢ごとに **同時にコートへ入るチーム数・1対戦あたりの面数・波の数・1チームが同時に出す試合数** を並べて比較できる。
  - コート面数も設定（4/6/8/10/12/16）。合宿ごとに保存。
  - 1対戦は5試合しかないので、6面割り当てても実際に使うのは5面。面数の表示はこれを差し引いた実使用数にしている。
  **順位決定戦のガード**
  - `generateTeamPlacementEncounters` は `groups.length < 2` で空配列を返し、3グループ以上でも先頭2グループしか見ない。UI 側は何も言わずに空画面になっていた。
  - 「順位決定戦」を選べるのは**グループ数がちょうど2のときだけ**に制限（それ以外は開始をブロックして理由を表示）。1グループなら総当たりの結果がそのまま最終順位である旨を出す。
  - グループのチーム数が違う場合、多い側の下位チームは相手がいないため順位決定戦に出られない。これを設定画面で事前に警告する。
  - 順位決定戦の内容（1位決定戦・3位決定戦・5位決定戦…）を設定画面に先出しするようにした。
- 変更理由: 次回夏合宿は2グループ・10チーム・12面の想定で、同時に何対戦入れるか（4チーム同時か8チーム同時か）を当日決めたいという要望。あわせて、予選の対戦順が進行に使えない並びだった点と、順位決定戦の空振りを直した。
- 影響範囲: 団体戦タブのみ。`Match` / `Camp` / `Player` のスキーマ変更なし。`TeamEncounter` の既存フィールド `round` の使い方が変わる（予選で0以外が入る）。`npm run build` 成功・`tsc --noEmit` 通過・対象ファイルの eslint エラー 0。
- 注意点 / 引き継ぎ事項:
  - **既存の進行中データは `round` が全て0**。進行表はラウンド単位で組むので、作り直すまでは1ブロックに全対戦が入る形で表示される。進行中の大会があるなら、進行表は参考程度に見ること。
  - 検証（10チーム・2グループ・12面）: 対戦数20・総試合100試合。1グループ1対戦＝4チーム同時/1対戦5面/10面使用/10ブロック/3時間15分。1グループ2対戦＝8チーム同時/1対戦3面/12面使用/2波/5ブロック/3時間15分。**所要時間は同じで、同時に動くチーム数が変わる**（コート時間の総量が同じため）。同一ブロック内でのチーム重複0件を確認済み。
  - 所要時間に休憩は含めていない。奇数チームなら毎ラウンド1チームが休むので、それが実質の休憩になる。
  - 1試合15分は固定値。実測に合わせたくなったら `lib/team-schedule.ts` の `GAME_MINUTES` を変える。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [team] 予選入力画面の縦長を解消し、順位表を最上部へ
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/team-card-compact / #（PR作成後）
- 変更内容:
  - `TeamEncounterCard.tsx`: `collapsible` を追加。折りたたみ時は「チーム名 対 チーム名 / スコア / 決着状況」の1行サマリだけを出し、タップで5試合の入力欄を開く。
    - 開いた状態で始まるのは**入力途中の対戦だけ**（1試合以上入力済みかつ未決着）。決着済みと未着手は畳む。決着すると自動的に畳まれる。
    - サマリに「入力2/5」を出して、畳んだままでも進み具合が分かるようにした。
    - カード内の余白と取り消しボタンの幅を詰めた（p-3→p-2.5、w-9→w-8、試合ラベルを「第1試合」→「1」に短縮して種目名を残す）。
  - `TeamPreliminaryGroup.tsx`:
    - **順位表を列の最上部に移動**（従来は対戦カード全部の下にあり、10対戦ぶんスクロールしないと見えなかった）。
    - 順位表 → じゃんけん入力 → 対戦一覧 の順に変更。じゃんけんは順位が並んだときに出るので順位表の直下が自然。
    - 対戦一覧を**ラウンド（巡）ごとにまとめ**、見出しに「第N巡」と「決着数/対戦数」を表示。`round` を持たない古いデータは1つのかたまりにまとまる。
    - グループ列を w-64 → w-72 に（折りたたみサマリで両チーム名を1行に出すため）。
  - 順位決定戦・決勝トーナメントの表示（`TeamPlacementView` / `TeamKnockoutTree`）は対戦数が少ないので折りたたまない（`collapsible` を渡していない＝従来どおり常時展開）。
- 変更理由: 直前の変更（1試合1行・44pxボタン）でカード1枚が約300pxになり、5チーム（10対戦）のグループ列が3000px超になって実用に耐えなくなっていた。あわせて、順位表が最下部にあって見えないという指摘に対応。
- 影響範囲: 団体戦の予選表示のみ。ロジック・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過・対象ファイルの eslint エラー 0。
- 注意点 / 引き継ぎ事項:
  - 高さの見込み: 折りたたみ時1枚あたり約64px（従来約316px）。10対戦のグループ列で概算 3400px → 950px 程度。実測ではなく構成からの見積もり。
  - 入力途中の対戦は自動で開くので、通常の運営操作（対戦を開く→5試合入れる→決着したら畳まれる）でタップが増えるのは「最初に開く1回」だけ。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [user] 名前を選ばずに見られる「観戦モード」を追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/spectator-mode / #（PR作成後）
- 変更内容:
  - `src/app/user/page.tsx`: 参加者画面の入口を2つにした。従来は `if (!myPlayer) return <LoginScreen/>` で、**大会選択＋名前選択を通らないと何も見えなかった**。
    - 「利用を開始する」（従来どおり・名前を選ぶ）
    - 「名前を選ばずに見る」（大会だけ選んで入る）
  - 観戦モードで**見られるもの**: コート状況 / トーナメント表 / 結果 / 他の選手の待ち時間検索 / 終了予想時刻 / 同期状態。
  - 観戦モードで**出さないもの**: ステータスヒーローカード（自分の状態）、「自分の試合」タブ、呼び出し通知トグル、チャット。いずれも名前が無いと成立しない機能なので、制限のための制限ではなく自然に落ちる形にしている。
  - 代わりに「名前を選ばずに見ています／名前を選べば呼び出しを受け取れます」の案内カードを出し、**ヘッダーと案内カードの両方に「名前を選ぶ」導線**を置いた。入り直しをさせないため。
  - 観戦モードの状態は `focs_spectator` として localStorage に保存。次回から素通りで入れる。名前を選ぶとフラグは消える。
  - 観戦モードの「戻る」は失うものが無いので確認ダイアログを出さない（名前を選んでいる場合の「退出」は従来どおり確認あり）。
  - `src/app/page.tsx`: 参加者カードに「結果や試合状況を見るだけなら、名前を選ばずに入れます」の一文を追加（入口の発見性）。
- 変更理由: 待ち時間を知りたい人は名前を選ぶ方が便利だが、「結果だけ知りたい」「誰が出ているか見たい」人にとって名前選択は重く、使われない導線になっていたため。
- 影響範囲: 参加者画面（`/user`）とホーム（`/`）のみ。データ構造・Firestore の変更なし。`npm run build` 成功・`tsc --noEmit` 通過・新規の eslint エラーなし（残る2件の `react/no-unescaped-entities` は "Foc's Portal" によるもので従来から存在）。
- 注意点 / 引き継ぎ事項:
  - 用語は「ゲスト」ではなく**「名前を選ばずに見る」**にした。ゲストだと部外者向けに読めるが、実際に使うのは参加者本人（まだ試合がない人・終わった人・応援している人）が中心のため。
  - 観戦モードでも大会の状態（開始前・終了）は反映される。
  - 会場のモニターに映す `/preview`（`?campId=` 必須）とは別物。混ぜていない。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [team] 結果入力を「勝者＋本数」の1タップに変更、順位表を参加者画面にも
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/team-card-layout2 / #（PR作成後）
- 変更内容:
  **決着の判定を変更（先取制をやめた）**
  - `computeEncounterWinner`: 過半数（3本）で決着していたのを、**全試合を入力してから勝ち数の多い方**に変更。5本必ず消化する運用のため、3-0時点で決着扱いにすると残りの入力欄が畳まれ、順位判定に使う得ゲーム数を取りこぼしていた。試合数が偶数で同数のときは決着しない（順位表の手動並べ替えで対応）。
  **結果入力を「勝者＋本数」に**
  - `recordTeamEncounterScore(enc, winnerSide, winnerGames)` / `clearTeamEncounterScore()` / `listWinnerGameCounts()` を追加。
  - 5試合を1つずつ入力する形をやめ、**5-0 / 4-1 / 3-2 の行に勝ったチームのボタンを置いて1タップ**で確定するようにした（種目を固定していないため、どの試合を誰が取ったかは追わない）。内部の `games` 配列は本数に合わせて機械的に埋める。順位判定は本数しか見ないのでこれで足りる。
  - 種目名（男子D・混合D…）の表示を廃止。
  **カードのタップ目標**
  - 折りたたみ時は矢印だけでなく**カード上部の帯すべて**がタップ目標（`min-h-[56px]`・全幅）。従来は矢印周辺しか反応しなかった。
  **じゃんけんの出し方**
  - 「予選結果を確定」ボタンを追加。押すまではじゃんけん入力を出さない。押して同着が残っていれば、そこで初めてじゃんけん欄が出る。
  - 結果を入力・取り消しすると確定は解除される（順位が変わるため）。
  - 次フェーズへ進めるのは「全対戦入力済み ＋ 確定済み ＋ じゃんけん解消済み」のときだけ。
  **順位表**
  - `components/TeamStandingsTable.tsx`（新規）として切り出し、文字とセルを大きくした（text-xs → text-sm、行の高さも拡大、1位に色）。
  - **参加者画面（`/user`）に「団体戦」タブを追加**し、`team_tournament_states/{campId}` を `onSnapshot` で購読してリアルタイム表示。運営の手動並べ替えとじゃんけん結果も反映する。読み取り専用。
  - `lib/firestore-helpers.ts` に `subscribeToTeamTournamentState()` を追加。
  - 団体戦のデータが無い大会ではタブ自体を出さない。
  **レイアウト**
  - グループが3つまでなら横スクロールをやめ、画面幅で割り付ける（2グループなら `md:grid-cols-2`）。4つ以上は従来どおり横スクロール。
- 変更理由: 実際に触っての指摘（縦長・順位表の位置と大きさ・種目未定・先取ではない・タップ目標が小さい・じゃんけんが常時出ている・参加者にも順位を見せたい）への対応。
- 影響範囲: 団体戦（運営）と参加者画面。`Match` / `Camp` / `Player` のスキーマ変更なし。`TeamGame.winner` の意味が「その試合の勝者」から「本数を表すための埋め草」に変わった点に注意。`npm run build` 成功・`tsc --noEmit` 通過・新規 eslint エラー 0（master と同数）。
- 注意点 / 引き継ぎ事項:
  - **既存データとの互換**: 3-0 で決着済みになっている対戦は `completed=true` のまま残る。新しい判定では「全5試合入力済み」でないと決着にならないので、入力し直すと挙動が変わる。進行中の大会があるなら確認すること。
  - `TeamGame.type`（MD/WD/…）はデータには残っているが画面には出していない。種目を固定する運用に戻すなら表示を復活させる。
  - 参加者画面の団体戦タブは予選順位のみ。順位決定戦・決勝トーナメントの表示は入れていない。
  - 検証: 5試合で選べる本数 [5,4,3]、A 3-2 → 3-2決着・勝者A、B 5-0 に訂正 → 0-5決着・勝者B、取り消し → 未入力に戻る。4チーム総当たりで本数を含む順位が正しく並ぶことを確認済み。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [user] 「名前を選ばずに見る」を色付きのボックスに
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/spectator-box / #（PR作成後）
- 変更内容: `src/app/user/page.tsx` のログイン画面。「名前を選ばずに見る」がテキストリンク調で、もう一つの入口だと分かりにくかったため、薄い青の面（`bg-sky-50` ＋ `border-sky-200` ＋ `rounded-xl`）にした。見出しを `text-base` に上げ、説明文の色も青系に揃えた。区切り線は面が出たので削除。
- 変更理由: 「利用を開始する」と並ぶ2つ目の入口なのに、装飾のないテキストで沈んでいたため。
- 影響範囲: ログイン画面の見た目のみ。`npm run build` 成功・`tsc --noEmit` 通過・eslint エラー数は master と同数。
- 注意点 / 引き継ぎ事項: なし。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [team] 結果入力を「勝ったチーム→本数」の2段階に、進行表は既定で閉じる
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/team-input-two-step / #（PR作成後）
- 変更内容:
  - `TeamEncounterCard.tsx`: 結果入力を2段階にした。
    1. 勝ったチーム（チーム名の2ボタン）
    2. 本数（5-0 / 4-1 / 3-2）— 勝ったチームを選ぶまで出さず、選ぶまでは「勝ったチームを選ぶと本数を選べます」と出す
    - 2段目の見出しに「本数（○○ の勝ち）」と選択済みのチーム名を入れて、どちらの勝ちを入れているのかを明示。
    - 本数ボタンの色は選んだチーム側（青／赤）に合わせる。
    - 「結果を取り消す」で1段目の選択も戻す。
    - 直前は 5-0/4-1/3-2 の各行にチーム名ボタンを置く1タップ方式だったが、指示により2段階に変更。
  - `TeamScheduleView.tsx`: 進行表を既定で閉じた状態にした（従来は開きっぱなし）。普段見るのは順位表と対戦カードなので、まず場所を空ける。
- 変更理由: 入力の指示（勝ったチーム→スコアの順）と、進行表が常時開いていて場所を取るため。
- 影響範囲: 団体戦の入力カードと進行表の初期状態のみ。ロジック・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過・eslint エラー 0。
- 注意点 / 引き継ぎ事項:
  - 既に結果が入っている対戦を開くと、1段目は記録済みの勝者が選ばれた状態で開く。相手チームを押しても、本数を選ぶまでは記録は書き換わらない（誤タップで結果が消えないようにするため）。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [results] 結果発表用のまとめページを追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/results-page / #（PR作成後）
- 変更内容:
  - `src/app/results/page.tsx`（新規・ルート `/results`）: **各種目の1〜3位** と **団体戦の全順位** を1ページにまとめた。結果発表のときに画面を行き来しなくて済むようにするのが目的。
    - 各種目は既存の `lib/awards.ts` の `computeAllPodiums()` をそのまま使う（優勝／準優勝／3位、共同3位にも対応）。確定していない種目は「進行中」として名前だけ出す。
    - 団体戦は `team_tournament_states/{campId}` を `onSnapshot` で購読し、運営の入力がそのまま反映される。予選のグループ順位も併せて表示。
    - 種目の結果は Firestore の一括取得なので、30秒ごとの自動再取得と手動の「更新」ボタンを置いた（発表中に最後の種目が終わることがあるため）。「◯◯:◯◯ 時点」も出す。
  - `src/lib/team-results.ts`（新規）: 団体戦の最終順位を保存状態から組み立てる。
    - 順位決定戦がある場合: `placement_rank` から 1位・2位（1位決定戦）、3位・4位（3位決定戦）… と全順位を作る。運営画面の順位決定戦ビューが内部に持っていた計算をここへ出して、発表ページと運営画面で同じ結果が出るようにした。
    - 決勝トーナメントの場合: 決勝と3位決定戦から1〜4位まで。それ以降は決勝Tでは決まらないので埋めない。
    - どちらも無ければ予選のグループ順位のみ返す。
  - `src/app/user/page.tsx`: ヘッダーに「結果」ボタンを追加（`/results` へ）。
  - `src/app/page.tsx`: ホームに「結果発表」の導線を追加（薄い琥珀のボックス）。
- 変更理由: 結果発表のときに、種目ごとの表彰と団体戦の順位が別画面に散っていて不便という指摘への対応。
- 影響範囲: 新規ルート1つと、参加者画面・ホームへのリンク追加のみ。既存のロジック・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過・新規 eslint エラー 0（残る2件は "Foc's Portal" のアポストロフィで従来から存在）。
- 注意点 / 引き継ぎ事項:
  - `/results` は `CampContext` の合宿を使う（`lastCampId` → アクティブ合宿の順）。参加者が普通に開けば直前に見ていた大会が出る。合宿が特定できないときは参加者画面への導線だけ出す。
  - 認証は掛けていない（結果は参加者全員に見せるものなので）。
  - 団体戦の順位決定戦が途中なら、決まっている順位だけ出して「まだ全順位が確定していません」と添える。
  - 検証: 10チーム2グループの順位決定戦（1/3/5/7/9位決定戦）から 1〜10位が重複なく出ること、3本だけ入力した途中状態では6順位ぶんだけ出て確定にならないことを実行して確認。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [team] 団体戦のコート面数を合宿のコート設定から自動算出
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/team-auto-courts / #（PR作成後）
- 変更内容:
  - `TeamTournamentGenerator.tsx`: `subscribeToCourts()` でその合宿のコートを購読し、使える面数を数えるようにした。
    - `is_active` = その日使う面（`setupCampCourts` がコート数を超える面を `is_active: false` にする）
    - `manually_freed` = 運営が手動で止めている面（`freeCourtManually` / `stopCourtAfterCurrent`）
    - **使える面数 = is_active の数 − そのうち manually_freed の数**
  - 面数の設定を「自動 / 手動」の2択にした。既定は自動。
    - 自動: 「今の使用コートから自動 6面（使用中 6面 − 停止中 0面）」のように内訳も出す
    - 手動: 団体戦だけ別の面数で回したいとき用。従来の 4/6/8/10/12/16 から選ぶ
    - コートが未初期化（自動で数えられない）ときは自動を選べないようにし、手動に倒す
    - 「以下の計算には ◯面 を使います」と、実際に使う値を明示
  - 進行中ヘッダーにも使用面数を表示（`10チーム / 2グループ / 予選 / 12面`）。
  - コートを止める・戻すと購読経由で面数が変わり、進行表の所要時間や波の数も追従する。
- 変更理由: 面数を手で入れ直すのは二度手間で、当日コートを止めたときに設定と実態がずれるため。
- 影響範囲: 団体戦タブのみ。コート側のデータは読むだけで書き換えない。`npm run build` 成功・`tsc --noEmit` 通過・eslint エラー 0。
- 注意点 / 引き継ぎ事項:
  - `courtCountMode`（'auto' | 'manual'）を合宿ごとに保存する。既存データには無いので、開くと自動（既定）になる。
  - 自動の値が0面（コート未初期化）のときは手動値にフォールバックする。
  - 団体戦が他の種目と同時進行していて、全面を団体戦に使えるわけではない場合は手動指定を使うこと。自動は「その合宿で使えるコート面数」であって「団体戦に割ける面数」ではない。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [admin/help] メニューを全項目常時表示に、ヘルプを整理して更新
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/admin-nav-and-help / #（PR作成後）
- 変更内容:
  **管理メニュー（`app/admin/page.tsx`）**
  - **重複の解消**: 固定タブに出している「進行中」「操作」が `NAV_GROUPS` の「進行」グループにも入っていて、同じ項目が画面に2回並んでいた（固定タブを追加したときの作り込み漏れ）。「進行」グループを削除。
  - **アコーディオンを廃止し、全項目を常時表示**。14項目程度なら階層に畳んでも選択は速くならず、開閉の操作ぶんだけ遅くなるため。`openGroups` の状態とアクティブグループの自動展開も削除。
  - **折りたたみアイコンレールを廃止**。`Settings` が「準備」と「初期設定」、`Users` が「選手」と「団体戦」、`BarChart3` が「予選順位」と「結果一覧」で重複していて、アイコンだけでは区別できなかった。サイドバーはデスクトップで常に `w-64`（モバイルはドロワーのまま）。`isExpanded` の状態と展開トグルを削除。
  - **見出しの強化**: グループ見出しを `text-xs text-slate-400 uppercase tracking-wide` から `text-sm font-bold text-slate-700` に。項目は左に一段下げて階層を出す。固定タブは `text-base font-bold` で他より大きく。
  **ヘルプ**
  - サイドバーのヘルプは常に「ヘルプ」の文字を出す（従来は展開時のみ）。背景を付けて押せる場所だと分かるようにした。
  - 参加者画面の丸いヘルプボタンにも「ヘルプ」の文字を追加（アイコンのみだった）。
  **ヘルプの中身（`components/common/UserGuide.tsx`）**
  - **セクションの絵文字アイコンを全廃**（16個）。目次と見出しの両方の描画も削除し、`icon` フィールドと型も削除。本文中の装飾絵文字も削除。矢印（→）やチェック（✓）などのテキスト記号は残した。
  - **団体戦セクションを全面的に書き直し**。旧内容は「リーグ編成タブでブロック分け」「コート結果タブでチーム勝利数を入力」など、現在存在しない手順を説明していた。現行の手順（設定 → コート面数と同時対戦数 → 進行表 → 勝ったチームと本数で入力 → 予選結果を確定とじゃんけん → 最終順位）に差し替え、注意点（対戦表の作り直し・リセット・保存状態）と参加者側の見え方を追記。
  - **結果発表ページのセクションを新設**。
  - **参加者向けガイドを更新**: 観戦モード（名前を選ばずに見る）、「自分の試合」への名称修正（旧「マイ試合」）、団体戦タブ、結果発表への導線、同期状態の見方を追加。全5ステップに。
- 変更理由: メニューが見にくいという指摘と、ヘルプのアイコン過多・内容の陳腐化への対応。
- 影響範囲: 管理画面のサイドバー、参加者画面のヘルプボタン、ヘルプの内容。ロジック・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過・eslint エラー数は master と同数。
- 注意点 / 引き継ぎ事項:
  - サイドバーは常時 `w-64` を占める。コンテンツ側は `md:ml-64` 固定。狭い画面での折りたたみが必要になったら、ドロワー化（モバイルと同じ挙動）を検討すること。アイコンレールは戻さない方がよい（アイコンが重複していて区別できないため）。
  - 絵文字の一括削除で「スーパーシード（👑）」が「スーパーシード（）」になっていたのを手で直した。同種の取りこぼしが見つかったら同様に直すこと。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-07-23 — [admin] メニューの名称変更と団体戦の移動
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/rename-nav-labels / #（PR作成後）
- 変更内容:
  - 固定タブの名称変更: **「進行中」→「コート状況」**、**「操作」→「種目設定」**（`value` は `live` / `control` のまま変えていない）。
  - **「団体戦」を「準備」グループから「結果」グループへ移動**。
  - 旧名称を指していた文言をすべて追随させた。
    - `ResultsTab.tsx` の進行制御トースト2件（「操作タブで種目を有効に」→「「種目設定」タブで種目を有効に」）
    - `UserGuide.tsx` のクイックスタート、セクション見出し「Auto-Dispatch・操作タブ」、本文の「「操作」タブの Auto-Dispatch スイッチ」、トラブルシューティングの「「操作」タブで種目制御が全停止していないか」
    - 自動割り当てのスイッチは実際には `live` タブ（＝コート状況）にあるので、ガイドの記述もそちらに直した。
- 変更理由: タブ名が中身と合っていなかったため。
- 影響範囲: 表示文言とメニューの並びのみ。`value`（`activeTab` のキー）は変えていないので、保存済みの状態や他所からのタブ切り替えに影響はない。`npm run build` 成功・`tsc --noEmit` 通過・eslint エラー数は master と同数。
- 注意点 / 引き継ぎ事項:
  - タブの内部キーは `live` / `control` のまま。今後コードを読むときは「live = コート状況」「control = 種目設定」と読み替えること。名前を揃えたい場合は `activeTab` の既定値・`PINNED_ITEMS`・`TabsContent` の3箇所を同時に変える必要がある。
- オーナー承認: rikurun6v6-dot / 2026-07-23（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [tournament] 案B（3部制・男女別ダブルスのみブロック戦）で運営できるようにする
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/plan-b-3divisions / #（PR作成後）
- 変更内容:
  **① 3部以上の部門に対応（`lib/divisions.ts` 新規）**
  - 部門の扱いを `DEFAULT_DIVISIONS`（既定 1〜3部）/ `isValidDivision` / `getDivisionsInUse` / `getDivisionOptions` に集約。
  - `PlayerManager`: レベル選択が 1部・2部の2択固定で、**3部の選手を画面から登録できなかった**。選択肢を可変にした（CSV 取り込みは元から 1〜99 を通していた）。種目別の部の例外（`division_overrides`）の判定 `(v === 1 || v === 2)` も `isValidDivision` に置き換え。
  - `GroupRankingManager`: 部門選択が2択固定で、**3部はブロック戦をやっても決勝Tに進出させる手段がなかった**（「全グループ1位のみ決勝Tへ」はこの画面にしかない）。その種目に実際に試合がある部門を出すようにした。
  - `TournamentGenerator`: `division1State` / `division2State` の2つしか状態を持たず、`division === 1 ? ... : ...` で分岐していたため、3部を渡すと2部の状態を壊していた。`Record<number, TournamentGeneratorState>` に変更し、部門カードと一括生成の一覧を `divisionOptions` から描画する。カードの配色は4色を循環。
  - `TournamentSetup` / `PreliminaryGroupEditor` / `VisualSeedingEditor` / `SafetyTab`: 同じ2択固定を可変に。
  **② 部門バランスの計算を部門数に依存しない形に**
  - `matchScoring.buildScoreContext`: 1部/2部の進行率2値で `preferredDivision` を決めていたのを、全部門の進行率から「最も遅れている部」と「最速との差」を出す方式に変更。`ScoreContext.preferredDivision` の型を `1 | 2` → `Division`。
  - `dispatcher.autoDispatchAll`: コート別の部優先が「先頭コート=1部・末尾コート=2部・中間=試合数の多い部」だったため、**3部がどのコートの優先にもならなかった**。待機試合が多い部の順に並べ、コート番号順に総当たりで配る方式に変更（隣接コートが別の部になる）。2部門のときの挙動も `1,2,1,2…` に変わる。
  - `AdvancedAnalytics` / `api/ai-diagnose`: `div1*` / `div2*` の固定フィールドを `divisions[]` のリストに変更。画面の見出しも「1部 / 2部 進行バランス」→「部門別 進行バランス」。
  **③ 3位決定戦の生成を修正**
  - 予選リーグ+決勝Tで `has3rdPlace = totalRounds >= 2` としていたため、**3ペア通過（4枠ブラケット + BYE1）のとき準決勝が実質1試合しかないのに3位決定戦が作られ、敗者が1組しか出ず埋まらなかった**。準決勝が2試合とも実試合になる場合のみ作るよう修正。
  - 通常トーナメント（シングル/ダブルエリミネーション）には3位決定戦が生成されず、毎回手作業だった。空のスロットを自動生成するようにした（準決勝終了後に既存の「3位決定戦を作成」で敗者を流し込む運用は同じ）。
  **④ 点数を「自動」既定にする（`lib/match-points.ts` 新規）**
  - 種目設定・トーナメント生成の点数欄に **「自動（推奨）」** を追加し、既定値にした。「ラウンド別点数設定（詳細）」は削除。
  - ブロックの人数で点数を変える運用（4人ブロックだけ11点）が設定では表現できなかったため、自動時は構造から導出する。全試合を同じ点数にしたい場合は 11/15/21 を選べば上書きできる。
    - 4人以上のブロックの総当り → 11点 / 3人ブロックの総当り → 15点
    - 決勝T 準々決勝より前 → 15点 / 準決勝・決勝・3位決定戦 → 21点
  - `eta.getMatchPoints`: 試合の `points_per_match` を最優先で見るようにした（従来は `tournament_config_id` 経由で TournamentConfig を引いていたが、生成側が `tournament_config_id` を設定していないため実際には常にフォールバックの旧ロジックに落ちていた）。
- 変更理由: 2026年夏合宿のバド大会を「案B（3部制・男女別ダブルス1〜3部のみブロック戦、他種目は通常トーナメント）」で実施するため。現状のコードは 1部/2部 の2部門を前提に組まれており、3部の選手登録すらできなかった。
- 影響範囲:
  - 新規: `src/lib/divisions.ts`, `src/lib/match-points.ts`
  - 変更: `PlayerManager` `GroupRankingManager` `TournamentGenerator` `TournamentSetup` `PreliminaryGroupEditor` `VisualSeedingEditor` `SafetyTab` `AdvancedAnalytics` `api/ai-diagnose/route.ts` `lib/matchScoring.ts` `lib/dispatcher.ts` `lib/eta.ts`
  - **データ構造の変更なし。** `TournamentConfig.points_per_game` / `points_by_round` はスキーマを残したまま既定値（15 / {}）を書き込む。既存データはそのまま読める。
  - `npm run build` 成功・`tsc --noEmit` 通過。
  - 検算: 自動判定した点数と試合数が、提案資料「バド大会 形式決定：案A vs 案B」の案Bの内訳（男子1部11 / 男子2部16 / 男子3部14 / 女子1部4 / 女子2部10 / 女子3部13 / 混合18・23 / シングルス18、15点77・11点24・21点26・計127試合）と完全に一致することを確認済み。
- 注意点 / 引き継ぎ事項:
  - **部門の既定は 1〜3部**（`DEFAULT_DIVISIONS`）。4部以上を使う場合、`PlayerManager` と `GroupRankingManager` は実データから拾うので自動で出るが、`PreliminaryGroupEditor` / `VisualSeedingEditor` / `SafetyTab` / `TournamentSetup` のプルダウンは `DEFAULT_DIVISIONS` を見ているので、この定数を増やすこと。
  - **コート別の部優先の配り方を変えた**ため、2部門の大会でもコートへの部の割り当て順が変わる。進行の偏りが以前と違って見える場合はここが原因。
  - **点数は「自動」が既定。** 全試合を同じ点数にしたいときは種目設定・生成画面で 11/15/21 を選ぶ。ラウンドごとに細かく変えたい場合は `src/lib/match-points.ts` の定数と関数を直すこと。試合ごとの値は生成時に `matches.points_per_match` に焼き込まれるので、生成済みの試合は再生成しないと変わらない。
  - 何点マッチかは `matches.points_per_match` に必ず入るので、コート状況（`ActiveMatchesView`）と結果入力（`MatchResultInput`）に「N点マッチ」として表示される。試合アナウンス時のコールはこれを見る。
  - 女子1部（4ペア）は案Bでも例外でブロック戦をしない。生成時に **形式=シングルエリミネーション** を選ぶこと。ブロックが1つしか作れず決勝Tが成立しないため。
  - 3位決定戦は空のスロットとして生成されるだけで、選手は自動で入らない。準決勝が両方終わってから管理画面の「3位決定戦を作成」を押す運用は従来どおり。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [tournament] ペア番号で表を先に作り、当日フリガナ検索で流し込む
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/pair-slots-kana / #（PR作成後） ※ `feat/plan-b-3divisions` に積んでいる（先にそちらをマージすること）
- 変更内容:
  **① 番号だけで形を作る（`lib/tournament-generator.ts`）**
  - トーナメント生成に「出場者の決め方」を追加。**登録済みの選手から組む**（従来）と **番号だけで形を作る**（新規）を選べる。
  - 後者は人数（ダブルスは組数）だけ指定すると、選手なしでリーグ表・トーナメント表ができる。各スロットには `pair_no_p1` / `pair_no_p2` だけが入る。
  - 実装: 既存の生成ロジック（`generateGroupStageMatches` / `generatePowerOf2Bracket`）は `Player[]` を受け取る作りなので、**ペア番号を id に埋め込んだダミー Player**（`__pairslot__N`）を流し、Firestore に書く直前に `extractPairSlots()` で「空の player_id + pair_no」に変換している。生成ロジック本体には手を入れていない。
  - 不戦勝（BYE）枠は、ダミーが勝者にならないよう `is_walkover` + `walkover_winner` で持たせ、勝ち上がり先にはペア番号を伝播させる。
  **② ペア割り当て画面（`components/admin/PairAssignManager.tsx` 新規・タブ「ペア割り当て」）**
  - 種目・部を選ぶと、その表にあるペア番号が一覧で出る。番号ごとに選手を入れて「表に反映」を押すと、**その番号を持つ全試合に一括で書き込む**。リーグ戦は同じペアが複数試合に出るので、試合ごとに入れ直さずに済む。
  - 同じ選手が複数の番号に入っている場合は赤く出し、保存を止める。
  - 既に割り当て済みの場合は初期値として読み込むので、あとから差し替えられる。
  **③ フリガナ検索（`lib/kana.ts` 新規）**
  - `Player.name_kana` を追加。選手登録画面に「フリガナ」欄、CSV に `kana` / `フリガナ` / `ふりがな` / `カナ` / `よみ` 列（任意）。エクスポートとサンプルCSVにも追加。
  - 検索は NFKC 正規化 + カタカナ→ひらがな変換で、**ひらがな・カタカナどちらで打っても引ける**。氏名とフリガナの両方、さらに姓・名それぞれでも一致を見る。前方一致を上位に出す。
  - フリガナ未登録の選手は氏名で引ける（漢字を打てば出る）。
  **④ 未割り当ての表示（`lib/pair-label.ts` 新規）**
  - `VisualBracket`（トーナメント表）と `PreliminaryGroup`（予選リーグ表）で、選手が未割り当てのスロットを **「3番ペア」**（シングルスは「3番」）と表示する。割り当て前でも表を印刷・掲示できる。
- 変更理由: 2026年夏合宿のバド大会で、ペアと配置を**当日の割り箸くじ**で決めるため。従来は生成時に実在の選手が必要で、「形だけ先に作る」ができなかった。また当日の入力で漢字変換をするのは現実的でないため、ひらがなで引けるようにした。
- 影響範囲:
  - 新規: `src/lib/kana.ts`, `src/lib/pair-label.ts`, `src/components/admin/PairAssignManager.tsx`
  - 変更: `src/types/index.ts` `lib/tournament-generator.ts` `lib/csv-parser.ts` `components/admin/TournamentGenerator.tsx` `PlayerManager.tsx` `VisualBracket.tsx` `PreliminaryGroup.tsx` `app/admin/page.tsx`
  - **★ データ構造の追加あり（要オーナー承認）**: `Match.pair_no_p1?` / `Match.pair_no_p2?` / `Player.name_kana?`。いずれも**任意フィールドで、既存データ・既存の生成経路には影響しない**（従来モードでは書き込まれない）。
  - `npm run build` 成功・`tsc --noEmit` 通過。
  - 検算: 9ペア・3ブロックの予選リーグを番号だけで生成し、A/B/C 各ブロックが `1-2 / 1-3 / 2-3`・`4-5 / 4-6 / 5-6`・`7-8 / 7-9 / 8-9` の計9試合になること、選手IDが空でペア番号だけが保存されることを確認。フリガナ検索は「やま→山田・山下」「やまし→山下」「すずき／スズキ→鈴木（カタカナ登録）」「田中（フリガナ未登録）」「たろう（名で一致）」の8ケースで確認。
- 注意点 / 引き継ぎ事項:
  - **割り箸の数字＝ペア番号**（同じ数字を引いた2人がペア）という運用前提で作っている。選手ごとに別番号を引く運用に変える場合は、割り当て画面の入力欄の持ち方から作り直しになる。
  - **混合ダブルスは男女別のくじで同番号が組む**前提。割り当て画面は1つ目の欄を「男子」、2つ目を「女子」と表示するが、**男女のチェックはしていない**（人数差で余った同性ペアを入れられるようにするため）。
  - `pair_no` は割り当て後も残る。番号を頼りに再割り当てできる一方、**同じ番号を別の種目・部で使い回してはいけない**（画面は種目・部で絞ってから反映するので実害はないが、データを直接触るときは注意）。
  - 「番号だけで形を作る」で作った表は、割り当て前に自動割り当てが走ると選手不在の試合をコートに載せようとする可能性がある。**当日は割り当てを済ませてから Auto-Dispatch を入れること。**
  - 3人ペア（人数が奇数のとき）は割り当て画面が2人ぶんしか欄を出さない。3人目が必要な場合は従来どおり「ペア・シード」タブで入れること。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [admin] ペアまわりの3タブを1つに統合
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/merge-pair-tabs / #（PR作成後）
- 変更内容:
  - サイドバーの **「ペア割り当て」「ペア・シード」「予選配置編集」の3項目を「ペア割り当て」1つに統合**（`components/admin/PairSetupPanel.tsx` 新規）。中は使う頻度順のサブタブ3つ。
    - **番号で割り当て**（`PairAssignManager`）— 当日くじ用。ふだんはここだけ使う
    - **試合ごとに直す**（`PairSeedManager`）— 1試合だけの差し替え・3人ペア・シード番号
    - **ブロック入れ替え**（`PreliminaryGroupEditor`）— ブロックをまたぐ移動
  - サブタブごとに1行の説明を出し、名前だけでは分からなかった使い分けを画面上で示す。
  - `app/admin/page.tsx`: `pairassign` / `pairseed` / `groupedit` の3タブを `pairsetup` 1つに。3components の `dynamic()` は `PairSetupPanel` 側へ移動。未使用になった `ArrowLeftRight` の import を削除。
  - `UserGuide.tsx`: 統合後のタブ名に追随。クイックスタートの順番を「選手 → 初期設定（生成）→ ペア割り当て」に直し（従来はペアを組んでから生成する順で書かれていた）、当日くじの流れ（番号だけで形を作る → ひらがなで割り当て → 自動割り当てをON）を追記。
- 変更理由: 3つとも「誰がどこに入るか」を触る画面で、名前だけでは使い分けが分からなかった。当日くじ運用ではほぼ「番号で割り当て」しか使わないが、欠席で3人ペアが出たときなどに残り2つが必要になるため、消さずに畳んだ。
- 影響範囲: 管理画面のナビとヘルプのみ。3つのコンポーネントの中身・ロジック・データ構造は変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - タブの内部キーが `pairassign` / `pairseed` / `groupedit` → **`pairsetup`** に変わった。他所からタブを指定している箇所があれば追随が必要（`activeTab` は永続化していないので保存済みの状態は影響なし）。
  - サブタブの状態は `PairSetupPanel` のローカル state。タブを離れると「番号で割り当て」に戻る。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [bracket/pair] トーナメント表の部門タブを3部以上に対応、生成カードのずれとペア反映の不具合を修正
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/bracket-divisions-and-layout / #（PR作成後）
- 変更内容:
  **① トーナメント表タブが3部に対応していなかった（`VisualBracket.tsx`）**
  - 部門タブが `grid-cols-2` で **1部 / 2部 の2つ決め打ち**だったため、3部のトーナメント表が開けなかった。
  - 実際に試合がある部門を `getDivisionsInUse(matches)` から出し、タブの列数も部門数に合わせる（Tailwind は動的クラス名を解決できないので `gridTemplateColumns` を直接指定）。配色は4色を循環。
  - `localStorage` に前回の部門が残っていて、その部門が今の合宿に無い場合、**どのタブも選ばれず表が出ない**状態になっていた。実在する部門の先頭に寄せる `activeDivision` を追加し、フィルタ・タブ・画像書き出しのファイル名をそれに合わせた。
  **② 生成カードでボタンがずれる（`TournamentGenerator.tsx`）**
  - 「出場者の決め方」が、形式で出し分けする「グループ数 / 予選通過人数」より**下**にあったため、形式を「予選リーグ + 決勝トーナメント」に変えると欄が2つ差し込まれてボタンが下にずれた。押そうとした瞬間に動くので誤爆する。
  - 「出場者の決め方」を条件付きの欄より**上**に移し、形式を変えても位置が動かないようにした。
  **③ ペア割り当てが空の番号まで書きに行っていた（`PairAssignManager.tsx`）**
  - 1組しか入れていなくても全ペア番号を対象にしていたため、**まだ決めていない枠に空文字を書き込み**、「1組を9試合に反映しました」という実態と合わない結果になっていた。
  - 1人でも入っている番号だけを対象にし、1件も無ければ保存を止める。完了メッセージに未入力の残り組数を出す。
- 変更理由: 本番の通し確認で見つかった3件。①は3部制（案B）で必須。②③は当日の運用で事故につながる。
- 影響範囲: `VisualBracket.tsx` / `TournamentGenerator.tsx` / `PairAssignManager.tsx`。データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - 部門タブの配色は4色まで。5部以上を使うと色が一巡して繰り返す（動作には影響しない）。
  - ペア割り当ての「表に反映」は、**入力済みの番号だけを上書きする**。空欄にした番号は書き込まれないので、割り当てを消したい場合は「試合ごとに直す」で消すこと。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [ui] alert() をトースト通知に置き換え
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/hi-errors-safety / #（PR作成後）
- 変更内容:
  - 管理画面と参加者画面に残っていた `alert()` を全廃し、トースト通知に置き換えた（`PlayerManager` `TournamentSetup` `CampManager` `MatchResultInput` `ResultsTab` `SafetyTab` `GroupRankingManager` `app/admin/page.tsx` `app/user/page.tsx`）。
  - 文言も揃えた: 失敗系は「〜に失敗しました」＋対処（「通信を確認して、もう一度お試しください」など）の2段。
  - 参加者画面の通知許可ブロック時のメッセージもトースト化。
- 変更理由: `alert()` はモーダルなので、押すまで他の操作が止まる。運営が急いでいる場面（CSV取り込み・結果入力）で毎回止まるのは実害がある。加えて、ブラウザ自動操作や一部の埋め込み環境ではモーダルが画面を固めるため、当日の確認作業の妨げにもなる。
- 影響範囲: 通知の出し方と文言のみ。処理の流れ・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - `confirm()` 系（削除の確認など）は元から `useConfirmDialog` を使っており、今回は触っていない。
  - `src` 配下に `alert(` は残っていない。今後追加しないこと（`toastSuccess` / `toastError` / `toastInfo` を使う）。
## 2026-08-29 — [safety] 棄権が自動割り当てに効かない不具合の修正と、試合IDの手入力の廃止
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/withdrawal-and-match-picker / #（PR作成後）
- 変更内容:
  **① 棄権にしても試合が呼ばれ続ける（`firestore-helpers.ts` / `PlayerManager.tsx`）**
  - `dispatcher.ts` の候補フィルタ `validMatches` は、選手IDの有無・重複・休息・予約コート・決勝待機は見ているが、**選手の `is_active` を一切見ていない**。`toggleActive` も `is_active` を反転するだけだった。
  - つまり **棄権にしても、その選手の試合はコートに呼ばれ続ける**。当日キャンセルで確実に事故る。
  - `withdrawPlayerAndForfeit(playerId, campId)` を追加。棄権と同時に、その選手の未消化の試合を**相手の不戦勝**として確定させ、呼び出し中だったコートも解放し、`propagateByePlayerChange` で次ラウンドへ勝ち上がりを反映する。
  - **進行中（playing）の試合には手を付けない。** コート上で起きていることを勝手に確定させるのは危険なので、件数だけ返して運営の判断に委ねる（結果は通常どおり入力してもらう）。
  - 相手が未確定（`player1_id` / `player2_id` が空）の試合も触らず、件数を返す。
  - 復帰させるときは確認ダイアログを出し、「不戦勝として確定させた試合は元に戻らない」ことを明示する。
  - 確認用に `countMatchesWithInactivePlayers(matches, players)` も追加（未使用。棄権選手が残る試合の検知に使える）。
  **② 安全タブの試合IDを手入力させていた（`SafetyTab.tsx`）**
  - 「結果の取り消し」「不戦勝」「補足表示」「欠場処理」の4つが、`camp123_MD_1_1_1` のような**試合IDを手で打たせていた**。当日これを打つのは現実的でない。
  - `MatchPicker.tsx`（選手名・コート・種目で検索して選ぶ部品）が**完成済みなのにどこからも使われていなかった**ので、4箇所すべてに配線した。用途に応じて候補の状態を絞る（取り消し=完了済み / 不戦勝=未完了 / 欠場=待機・呼出中）。
- 変更理由: 本番の通し確認と、当日トラブル（入力ミス・当日キャンセル）への備えの洗い出しで見つかった。①は運営が止まる致命的な問題。
- 影響範囲: `src/lib/firestore-helpers.ts`（関数2つ追加）、`src/components/admin/PlayerManager.tsx`（棄権処理）、`src/components/admin/SafetyTab.tsx`（入力UI）、`src/components/admin/MatchPicker.tsx`（新規配線）。既存のデータ構造・割り当てロジックの変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **dispatcher 側には `is_active` チェックを入れていない。** 入れると、棄権選手を含む試合が候補から外れたまま残り、`minRoundByGroup` のラウンドロックでそのグループ全体が進まなくなる（デッドロック）。棄権は「試合を確定させて前に進める」方向で解決するのが正しい。
  - 棄権処理は取り消せない。誤って棄権にした場合、復帰させても不戦勝は残るので「安全」タブの「結果の取り消し」で個別に戻すこと。
  - `countMatchesWithInactivePlayers` は未使用。棄権選手が残っている試合を管理画面で警告表示したくなったら使える。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [day-of] 当日運用の穴を3件修正（結果保存の無言・参加者画面の陳腐化・棄権の取り残し）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/day-of-hardening / #（PR作成後） ※ `fix/withdrawal-and-match-picker`（#59）に積んでいる
- 変更内容:
  **① 結果を保存しても何も出ない（`MatchResultInput.tsx`）**
  - `handleSubmit` は成功時に**通知を一切出していなかった**。保存できたのか分からないまま次に進むことになり、二重入力や入力漏れの原因になる。
  - 勝者名とスコアを添えた成功トーストを出し、あわせて「間違えたら『結果を修正』から直せる」ことを伝える。失敗時も `alert` ではなくトーストにした。
  **② 参加者画面が保存済みの選手情報を検証していなかった（`app/user/page.tsx`）**
  - `localStorage` の `focs_user` をそのまま復元しており、**削除された選手・棄権した選手の画面がそのまま残り続ける**。棄権した人に「まだ自分の試合がある」ように見えるのは混乱のもと。
  - 復元後に Firestore で存在と `is_active` を確認し、居なければ保存を消して名前選択に戻す。ついでに最新の氏名で上書きするので、**運営が名前を直した場合も追従する**。
  - 通信できないときは黙って保存された内容のまま表示する（オフラインで締め出さない）。
  **③ 棄権した選手が残ったままの試合に気づけない（`InactivePlayerWarning.tsx` 新規）**
  - 「選手」タブの棄権ボタンを使えば未消化の試合は自動で不戦勝になるが、直接データを触った場合や処理が途中で失敗した場合には取り残しが出る。取り残されたままだと、その試合はコートに呼ばれて来ない選手を待つことになる。
  - `countMatchesWithInactivePlayers`（#59 で追加済み・未使用だった）を使い、コート状況タブの先頭に件数と対処方法を出す。0件のときは何も出さない。60秒ごとに確認。
- 変更理由: 当日トラブル（入力ミス・当日キャンセル）への備えの洗い出し。
- 影響範囲: `MatchResultInput.tsx` / `app/user/page.tsx` / `app/admin/page.tsx` / `InactivePlayerWarning.tsx`（新規）。データ構造・割り当てロジックの変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **調査の結果、訂正の導線は問題なかった。** `MatchResultInput`（コート状況）に「結果を修正」と「取り消し」が既にあり、`ResultsTab`（結果一覧）と `VisualBracket`（トーナメント表）にも同等の手段がある。足りていなかったのは「保存できたという通知」だけ。
  - `app/user/page.tsx` に `toastError` の import を足している。`fix/hi-errors-safety`（#58）でも同じ import を足しているので、マージ順によっては1行の衝突が出る（両方残す／片方消すだけ）。
## 2026-08-29 — [admin] 開催日の切り替えをダッシュボードのヘッダーに追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/dashboard-day-switcher / #（PR作成後）
- 変更内容:
  - `components/admin/CampDaySwitcher.tsx`（新規）: 開催日（1日目 / 2日目）を切り替えるボタン。管理ダッシュボードのヘッダー右側、AIアドバイザーの左に置いた。
  - 切り替えの中身は `CampManager` の `handleSwitchDay` と同じ（確認ダイアログ →`switchCampDay`→ `refreshCamp` → トースト）。面数もボタンに出す。
  - 開催中（`status === 'active'`）の合宿でだけ表示する。アーカイブ時は `readOnly` で押せない。
- 変更理由: この操作は合宿一覧（`CampManager`）にしかなく、**大会中ずっといるダッシュボードからは「合宿選択へ」で一覧に戻らないと切り替えられなかった**。2日目の朝に必ず使う操作なので、運営が見ている画面に置いた。
- 影響範囲: 管理ダッシュボードのヘッダーのみ。`CampManager` 側のトグルはそのまま残している（合宿を選ぶ前でも切り替えられるため）。データ構造・切り替えロジックの変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **ヘッダーの高さを変えないよう、既存の右側ボタン群の中に収めている。** `main` の `pt-[136px]` がヘッダー高さの決め打ちなので、ここに行を足すと本文がヘッダーに潜り込む。今後この付近を触るときは注意。
  - 画面幅で表示を段階的に削っている（lg未満で「開催日」ラベル、md未満で「（N面）」を隠す）。ボタン自体は常に出る。
  - 切り替えるとコートが再初期化され、**進行中の割り当てはリセットされる**（従来と同じ）。試合データ・結果は保持される。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-29 — [safety] 棄権後の予選順位に「不明」行が出る不具合の修正と、棄権ダイアログの案内追加
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/withdraw-dialog-guidance / #（PR作成後）
- 変更内容:
  **① 棄権・欠場の後、予選順位表に架空の「不明」行が出る（`lib/group-ranking.ts`）**
  - 欠場処理と棄権処理は、抜けた側の `player1_id`（または `player2_id`）を**空文字にして**試合を完了させる。
  - `calculateGroupStandings` はその空の側もそのまま集計対象にしていたため、**キーが空・氏名が「不明」の行**が順位表に作られていた。
  - 居る側だけを順位表に登録し、相手の勝敗はきちんと数えるようにした。不戦勝が得失点に加算されない挙動は従来どおり。
  - 検算: 3ペアのブロックで1ペアが棄権（2試合が不戦勝）した状態で、行数2・「不明」なし・2勝0敗/1勝1敗・得失G ±5 になることを確認。
  **② 棄権ダイアログに「代わりを立てる」選択肢を明示（`PlayerManager.tsx`）**
  - ダブルスで1人が抜けた場合、棄権にすると**ペアごと**相手の不戦勝になる。代わりの人を立てられる場合には過剰で、一度確定させると戻すのが面倒。
  - 確認ダイアログの冒頭に「代わりに出られる人がいる場合は、棄権にせず『ペア割り当て』で選手を差し替えてください」を追加した。
- 変更理由: #59 の棄権処理を通しで見直していて見つかった。①は順位表の見た目だけでなく、予選通過者の判断を誤らせうる。
- 影響範囲: `src/lib/group-ranking.ts` / `src/components/admin/PlayerManager.tsx`。データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - 「不明」行は**今回入れたものではなく、以前からある「欠場処理」でも同じことが起きていた**。この修正で表示し直せば消える。データの作り直しは不要。
  - 片側が空の試合は、`rankStandings` の直接対決比較でも対象外になる（順位表に載らないため）。
  **③ 選んでいる部がその種目に無いと「試合がありません」と出る（`PairAssignManager` / `GroupRankingManager`）**
  - どちらも部の既定値が 1部 で、選択肢は実データから作っている。3部しか無い合宿を開くと**選択が空欄になり、「この種目・部にペア番号付きの試合がありません」「予選リーグの試合がありません」と表示される**。表は作られているのに、作られていないように見える。
  - 本番のテスト合宿で実際に踏んだ。`VisualBracket` では #56 で直したのと同じ問題で、この2画面に入れ忘れていた。
  - 読み込み時に、選んでいる部が実在しなければ実際に試合がある部の先頭に寄せるようにした。
- オーナー承認: rikurun6v6-dot / 2026-08-29（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [user] 参加者画面の名前一覧に棄権した選手が出ていた
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/login-exclude-withdrawn / #（PR作成後）
- 変更内容:
  - 参加者画面のログイン（`app/user/page.tsx` の `LoginScreen`）が、選手一覧を `is_active` で絞らずに全員出していた。**棄権した選手が名前を選んで入れてしまい、「自分の試合」が見えてしまう。**
  - 一覧から `is_active !== false` の選手だけを出すようにした。
- 変更理由: 本番のテスト合宿で通し確認をしていて見つかった。棄権処理（#59）で選手を棄権にした直後に、その選手が名前選択に残っていた。
- 影響範囲: 参加者画面のログイン一覧のみ。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - #60 で入れた「保存済みの選手の検証」は**すでにログイン済みの人**を締め出すもので、**一覧そのもの**は絞っていなかった。両方そろって初めて塞がる。
  - `is_active !== false` としているのは、古いデータで `is_active` が未設定の選手を除外しないため（未設定は参加中とみなす）。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [display] 予選リーグの試合に「準決勝」などの決勝トーナメント用ラウンド名が付く
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/preliminary-round-label / #（PR作成後）
- 変更内容:
  - `ResultsTab.getRoundLabel`（管理画面のコート状況・結果一覧）が **`phase` を見ずに** `getRoundName(match.round, maxRound)` を呼んでいた。予選リーグのラウンドは総当りの巡目であって、決勝までの残り段数ではないため、**予選の試合に「準決勝」「決勝」などが付いていた**。
  - `CourtGrid.getRoundLabel`（参加者画面のコート稼働状況）も同じで、予選の試合が「3回戦」などと出ていた。
  - どちらも `phase === 'preliminary'` のときは `予選 A組`（グループ不明なら `予選`）を返すようにした。
- 変更理由: 本番のテスト合宿で自動割り当てを動かしたところ、予選ブロックの試合がコート上で **「男子D / 準決勝 / 3部」** と表示された。通知バーは正しく「予選ブロック」と出ていたので、表示側だけの食い違い。
- 影響範囲: 表示ラベルのみ。`ResultsTab.tsx` / `CourtGrid.tsx`。ロジック・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - `lib/tournament-logic.ts` に `getUnifiedRoundName` があり、これは `phase` を正しく扱う。ただし予選のとき `予選リーグ Group A 第N試合` と長く、バッジには収まらないので今回は使っていない。**新しくラウンド名を出す箇所を作るときは、まず `getUnifiedRoundName` を検討すること。**
  - `maxRoundByType` は種目・部ごとに全試合から最大 `round` を取る作りで、予選と決勝Tの `round` が混ざった値になる。決勝T側のラベルは従来どおりこれを使っているが、正確さが要るなら決勝Tだけで最大を取り直すべき。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [admin] コート別結果入力のボタンを畳んだ
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/court-card-collapse / #（PR作成後）
- 変更内容:
  - 進行中のコートカードに操作が7つ並んでいた（結果を確定 / コート変更 / 休憩 / フリー / 上側WO / 下側WO / 次から割り当て停止）。ふだん使うのは結果の確定だけなので、それ以外を **「⋯ その他の操作」** に畳んだ。見える操作は 7つ → 3つ。
  - **「⏹ 試合終了後、割り当て停止」の帯は畳まずに常に出す。** これはボタンではなく状態の告知で、隠すと「なぜ次が来ないのか」が分からなくなる。「解除」もその帯の中に残した。
  - 「次から割り当て停止」ボタンは、まだ停止していないときだけ「その他の操作」の中に出す。
- 変更理由: ボタンが多すぎるという指摘。当日いちばん押すのはスコア入力と「結果を確定」で、それ以外は例外対応。並べておくと押し間違えるし、目的のものを探す時間もかかる。
- 影響範囲: `ResultsTab.tsx` の表示のみ。処理・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - 展開状態は `showMoreFor`（試合IDを持つローカル state）。コートごとに独立して開閉する。画面を離れると閉じる。
  - コート変更・休憩のダイアログは「その他の操作」の外に出しているので、開いたあとに畳んでもダイアログは残る。
  - 空きコートのカード（女子の試合を許可 / 強制アサイン）は2つだけなので触っていない。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [admin] 種目ごとの操作を横並びにし、ペア割り当てを3人ペアに対応
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/event-rows-and-three-person / #（PR作成後）
- 変更内容:
  **① 種目設定の「3位決定戦」「決勝戦の開始タイミング」を横並びに（`app/admin/page.tsx`）**
  - どちらも種目名を1行、その下にボタンを並べる縦積みで、5種目ぶんで縦に長かった。種目名を左に固定幅で置き、部門ボタンを右に横並びにした。1行ずつ区切り線を入れて読みやすくした。
  - ボタンの文言も短くした（「1部 - 3位決定戦を作成」→「1部」、「1部 - 通常通り」→「1部 通常」）。カードの見出しで文脈は分かる。
  - **あわせて `[1, 2]` の決め打ちを `DEFAULT_DIVISIONS` に変更。** この2箇所に3部対応の入れ忘れが残っていて、3部の3位決定戦が作れず、決勝待機も設定できなかった。
  **② ペア割り当てが3人ペアに対応（`PairAssignManager.tsx`）**
  - 番号ごとに **「＋ 3人目」** を押すと入力欄が1つ増える。もう一度押すと外れる。3枠のときは3列表示に切り替わる。
  - 読み込み時、既に3人入っているペア（`player5_id` / `player6_id` がある）は3枠で読む。
  - 保存時、3人目は**常に書く**（外したときに `player5_id` / `player6_id` が空になる）。以前は値があるときだけ書いていたため、3人目を外せなかった。
  - 「確定」の判定は先頭2つ（シングルスは1つ）が埋まっているかで見る。3人目は任意。
  - ヘルプの3人ペアの説明を、この新しい手順に差し替えた。
- 変更理由: ボタンが縦に長くて読みにくいという指摘と、3人ペアへの対応要望。案Bは全部門が偶数で割り切れるが、**当日の欠席で奇数になったときに3人組が必要になる**。
- 影響範囲: `app/admin/page.tsx` / `PairAssignManager.tsx` / `UserGuide.tsx`。データ構造の変更なし（`player5_id` / `player6_id` は既存フィールド）。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **#54 の申し送り「3人ペアは『ペア・シード』タブで入れること」は、この変更で不要になった。** ペア割り当てから直接足せる。
  - 3人目を外して保存すると `player5_id` / `player6_id` が空になる。「試合ごとに直す」（ペア・シード）で入れた3人目も、ペア割り当てで保存すると同じ扱いになるので注意。
  - 混合ダブルスの3人目にラベルは「3人目」と出るだけで、男女のチェックはしていない（従来どおり）。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [admin] 空きコートのボタンも「その他の操作」に畳んだ
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/free-court-collapse / #（PR作成後）
- 変更内容:
  - 空きコートのカードに「〇子の試合を許可」「⚡ 強制アサイン」が常時出ており、8面だと**14個のボタン**が視界に入っていた。どちらも例外操作なので「⋯ その他の操作」に畳んだ。
  - **状態の告知は畳まない。**「🔒 自動割り当て無効」＋「▶️ 割り当て再開」、「〇子専用 · 空きN分」、「✓ 〇子の試合を許可中」＋「取り消す」はそのまま出す。隠すと、なぜそのコートに試合が入らないのかが分からなくなる。
  - 畳んだのは「まだ許可していないときの許可ボタン」と「強制アサイン」の2つだけ。
- 変更理由: 進行中コートのボタン整理（#64）と同じ趣旨。当日いちばん見るコート状況の下半分がボタンで埋まっていた。
- 影響範囲: `ResultsTab.tsx` の表示のみ。処理・データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - 展開状態は `showCourtMoreFor`（コートIDを持つ）。進行中コートの `showMoreFor`（試合IDを持つ）とは別。
  - 強制アサインの試合一覧は折りたたみの内側にあるので、開いた状態で畳むと一覧も隠れる。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [pair] ペア割り当ての「表に反映」が完了した試合まで書き換えていた
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/pair-assign-skip-completed / #（PR作成後）
- 変更内容:
  - `PairAssignManager` の「表に反映」が、対象を `division` だけで絞っており **`status` を見ていなかった**。そのため、既に終わった試合（結果入力済み・棄権や不戦勝で確定済み）の選手欄まで上書きしていた。
  - 未実施の試合だけを対象にした（`status !== 'completed'`）。反映できる試合が無いときのメッセージにも「終わった試合は書き換えません」と添えた。
- 変更理由: 本番のテスト合宿で、棄権により不戦勝が確定した②番ペアに別の選手を割り当てようとしたところ、**確定済みの2試合にその選手が書き込まれる**ことに気づいた。棄権の記録が壊れる。
- 影響範囲: `PairAssignManager.tsx` の保存対象の絞り込みのみ。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **終わった試合の選手を直したい場合は、この画面ではできない。**「安全」タブの「結果の取り消し」で未実施に戻してから割り当てるか、「試合ごとに直す」を使うこと。
  - 選手の氏名を直しただけなら、試合側は選手IDを持っているので何もしなくてよい（表示は自動で追従する）。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [dispatch] 進行の均等化をスコアからハード制約に、ラウンド規制を厳しめに
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: feat/strict-progress-balance / #（PR作成後）
- 変更内容:
  これまでグループ間・部門間の均等は**スコアの加減点だけ**で行っていた。待機時間は1分1点で伸び続けるため、時間が経つと均等化のペナルティ（グループ -100/試合、部門ボーナス最大50）を押し切ってしまい、偏りが起きうる。**候補そのものを絞るハード制約**に変えた（`matchScoring.ts` に3つの関数を追加し、`dispatcher.ts` の候補パイプラインに挿入）。
  **① `filterByCompletedRound` — ラウンド規制（厳しめ）**
  - そのグループの前のラウンドが**全部 `completed`** になるまで次のラウンドを出さない。
  - 従来は「今すぐ出せる待機試合の最小ラウンド」を見ていたため、前のラウンドがコート上で進行中でも次が始まっていた（コート稼働を優先する意図的な作り）。今回それを覆した。
  - 選手未確定の枠（決勝Tの空きスロット）は「未完了」に数えない。数えると決勝Tが永久に始まらない。
  **② `filterByDivisionBalance` — 部門均等**
  - 同じ種目の中で、**進捗率がいちばん低い部の試合だけ**を残す。部によって総試合数が違うので、消化「数」ではなく「率」で比べる。率の丸め差を吸収するため 0.001 の許容を入れた。
  - 種目が違えば互いに縛らない（男子ダブルスの進み具合が女子ダブルスを止めない）。
  **③ `filterByGroupBalance` — グループ均等**
  - 同じ種目・部の中で、**消化数がいちばん少ないグループの試合だけ**を残す。「Aが2試合目に入る前に、まだ0試合のCを先に出す」を強制する。
  - 判定は**候補（今すぐ出せる試合）に含まれるグループだけ**で行う。休息中で今出せないグループまで待つとコートが空いたままになるため。
  - 決勝トーナメントの試合は対象外（素通し）。
- 変更理由: 「グループAは2試合終わってるのにグループCが始まっていない」「1部は終わってるのに3部がほとんど入っていない」を起こさないため。スコアの重み調整では確実性が担保できない。
- 影響範囲: `src/lib/matchScoring.ts`（関数3つ追加）、`src/lib/dispatcher.ts`（候補パイプライン）。データ構造の変更なし。`npm run build` 成功・`tsc --noEmit` 通過。実関数を読み込んだ検算10ケース通過。
- 注意点 / 引き継ぎ事項:
  - **コートが空く場面は増える。** 前のラウンドが終わるまで次を出さないので、1試合だけ長引くとそのグループは待つ。均等さと稼働率のトレードオフで、今回は均等さを取っている。**当日これが厳しすぎると感じたら、`filterByCompletedRound` を外すのがいちばん効く**（②③は残しても稼働率への影響は小さい）。
  - 進捗率の計算は `campMatches`（その合宿のみ）で行う。`allMatches` は全合宿ぶんなので使ってはいけない。
  - 従来のスコア側の均等化（`groupPenalty` / `divisionBonus`）はそのまま残している。ハード制約で候補が複数残ったときの順位付けに効く。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

## 2026-08-30 — [dispatch] 複数端末での二重割り当てを防ぐ（トランザクション＋担当リース）
- 担当者: rikurun6v6-dot（Claude Code 経由）
- ブランチ / PR: fix/dispatch-race / #（PR作成後） ※ `feat/strict-progress-balance`（#68）に積んでいる
- 変更内容:
  **前提**: 自動割り当てはサーバーではなく**ブラウザ内**で動いている（`AutoDispatchEngine` が5秒ごとに `autoDispatchAll` を呼ぶ）。しかも `admin/page.tsx` に置かれているので、**`/admin` を開いている端末すべてが同時に割り当てを回していた**。
  **① コートと試合を同時に確保（`firestore-helpers.ts`）**
  - 従来は `updateDocument('matches', ...)` → `updateDocument('courts', ...)` の2回書き込みで、トランザクションを使っていなかった。読んでから書くまでの間に別端末が同じコートを取ると、後の書き込みが前を上書きし、**コートに乗らないまま「呼出中」になった試合**が残る。
  - `claimCourtForMatch(courtId, matchId, matchUpdate)` を追加。Firestore のトランザクションで「コートが空いている」「試合がまだ待機中」を確かめてから両方を書く。どちらかが崩れていれば何も書かずに false を返し、呼び出し側はそのコートを諦める。
  - 団体戦の追加コート用に `claimExtraCourt(courtId, matchId)` も追加（試合側は確保済みなのでコートだけ見る）。
  - `dispatcher.ts` の割り当て4箇所（予約試合・優先割り当て・通常・団体戦の追加コート）をすべて置き換えた。
  **② 割り当ての担当を1台に絞る（リース方式）**
  - `Config` に `dispatch_owner_id` / `dispatch_owner_at` を追加。
  - `AutoDispatchEngine` は毎回 `acquireDispatchLease` を呼び、**担当を取れた端末だけ**が割り当てを回す。
  - リースは15秒（ポーリング5秒の3回分）で切れる。担当端末を閉じた・画面が寝た場合は他の端末が引き継ぐので、**「PCを閉じたら大会が止まる」ことはない。**
  - 画面を離れるときは `releaseDispatchLease` で明け渡し、次の端末がすぐ引き継げるようにした。
  - 端末IDは `sessionStorage`。再読み込みしても同じ端末として扱われる。
- 変更理由: iPad での「割り当て承認」機能を検討する中で、そもそも**どの端末が割り当て役なのかが定義されていない**ことが判明した。承認機能の土台としても、既存の不具合としても先に直す必要がある。
- 影響範囲: `src/lib/firestore-helpers.ts`（関数4つ追加）、`src/lib/dispatcher.ts`（割り当て4箇所）、`src/components/AutoDispatchEngine.tsx`、`src/types/index.ts`（**Config にフィールド2つ追加＝保護対象**）。`npm run build` 成功・`tsc --noEmit` 通過。
- 注意点 / 引き継ぎ事項:
  - **1台しか回さなくなるので、担当端末のブラウザが寝ると最大15秒割り当てが止まる。** iPad を割り当て役にする場合は自動ロックを切ること。PCを常時開いておき、iPadは閲覧・入力に使うのが安全。
  - 担当は「先に取った端末」であって選べない。明示的に選びたくなったら、`dispatch_owner_id` を画面から設定できるようにする余地がある。
  - リース取得に失敗したときは**回さない**（二重割り当てより一時停止のほうが安全）という判断にしている。
- オーナー承認: rikurun6v6-dot / 2026-08-30（オーナー本人の指示によりマージ・デプロイ）

---

## 2026-08-30 / Claude Code / fix/balance-baseline

### 変更内容
`filterByDivisionBalance` / `filterByGroupBalance` の「いちばん遅れている部・グループ」を
決める基準を、**候補（いま出せる試合）の中**から**まだ試合が残っている部・グループ全部**に変えた。

- `matchScoring.ts` に `isLiveMatch()` を追加（未完了 かつ 選手が確定している試合）
- `filterByGroupBalance(matches, ctx)` → `filterByGroupBalance(matches, ctx, allMatches)` に引数追加
- `dispatcher.ts` の呼び出しを `campMatches` 付きに更新

### 変更理由
本番検証で、進捗90%の3部が29%の1部・2部を追い越してコートに入った。
1部・2部の選手が全員「試合中／休息中」で候補に残らず、候補が3部だけになった瞬間に
「候補の中の最下位＝3部」と判定されて素通りしていた。
「予選リーグはすべて均等に進める。必ず」という要件を満たせていなかった。

### 影響範囲
- `src/lib/matchScoring.ts`（`isLiveMatch` 追加 / 2関数の基準変更 / 1関数のシグネチャ変更）
- `src/lib/dispatcher.ts`（呼び出し1箇所）
- 自動割り当ての候補選定全体。**遅れている側が全員ふさがっているときは、コートを空けたまま待つ**
  挙動に変わる（以前は進んでいる側で埋めていた）

### 注意点
- 順位待ちで選手が入っていない決勝Tの空きスロットは `isLiveMatch` が false を返すので
  基準に数えない。ここを数えると、順位を確定するまで他の部が永久に出せなくなる
- 消化しきった部・グループも基準から外れる
- ラウンド規制 `filterByCompletedRound` は元から同じ「選手が確定している試合だけ数える」
  判定なので変更なし

---

## 2026-08-30 / Claude Code / fix/diagnostics-sync

### 変更内容
アサイン診断パネルの判定を、割り当て本体とまったく同じ基準に揃えた。

- `matchScoring.ts` に基準値の計算を関数として切り出し、本体と診断の両方がこれを使う
  - `computeDivisionProgress()` — 種目・部ごとの進捗率と、種目ごとの最小進捗率
  - `computeGroupBalance()` — 種目・部ごとの「いちばん消化が少ない組の消化数」
  - `computeMinUnfinishedRound()` — グループごとの「まだ完了していない最小ラウンド」
  - `BALANCE_TOLERANCE` を export
- `filterByDivisionBalance` / `filterByGroupBalance` / `filterByCompletedRound` は上記を呼ぶだけにした（挙動は変えていない）
- `diagnoseWaitingMatches` も上記を使うよう変更。スキップ理由に `division_balance` `group_balance` を追加
- `ResultsTab.tsx` に⚖バッジの配色を追加

### 変更理由
診断パネルが本体の判定を反映しておらず、表示と実際が食い違っていた。

- ラウンド規制: 本体は「前ラウンドが全部 completed」まで止めるが、診断は
  「待機中の試合の最小ラウンド」で判定していた。前ラウンドがコート上で進行中の試合が
  「ロックされていない」と表示されていた
- 部門均等・グループ均等: 診断がそもそも見ていなかった。均等化でコートが空いたまま
  止まっても、理由がどこにも表示されない

### 影響範囲
- `src/lib/matchScoring.ts`（関数抽出。フィルタの挙動は変更なし）
- `src/lib/dispatcher.ts`（`SkipReason` に2種追加 / `diagnoseWaitingMatches` の判定）
- `src/components/admin/ResultsTab.tsx`（バッジ配色のみ）

### 注意点
- 今後、均等化の計算式を変えるときは必ず `matchScoring.ts` の3関数だけを直すこと。
  dispatcher 側で独自計算に戻すと、また表示と実際がズレる
- `diagnoseWaitingMatches` にあった `filteredWaiting` は使われなくなったので削除した

---

## 2026-08-30 / Claude Code / feat/dispatch-approval

### 変更内容
コートが「空いているのに均等化ルールで次を入れられない」状態になったとき、
承認モードONの端末に承認カードを出し、例外で1試合入れられるようにした。

- `types/index.ts`（**保護対象**）
  - `Court` に `stuck_since` / `pending_dispatch` / `dispatch_muted_until` を追加
  - `PendingDispatch` / `PendingDispatchCandidate` を追加
  - `Config` に `approval_stuck_seconds`（既定90）/ `approval_auto_minutes`（既定3）を追加
- `dispatcher.ts`
  - `DispatchBlockInfo` を追加。`dispatchToEmptyCourt` に任意の out 引数として渡すと、
    均等化・ラウンド規制「だけ」で弾かれた候補を理由つきで返す
  - `autoDispatchAll` に `handleStuckCourt()` を追加（詰まり検知・承認待ち作成・自動投入）
  - `approveDispatch()` / `dismissDispatch()` を追加
- `DispatchApprovalCards.tsx`（新規）— 承認カードと端末ごとの承認モード
- `admin/page.tsx` — コート状況に承認カードと「承認 ON/OFF」ボタンを追加

### 変更理由
#70 で均等化を厳しくした結果、遅れている部・組の選手が全員ふさがっているあいだは
コートが空いたまま待つようになった。オーナー判断で「そのときは例外で入れられるようにしたい。
承認制にするとやりやすい」との要望。

### 影響範囲
- 自動割り当て全体。ただし**通常の割り当て経路は変えていない**。
  承認は `match.reserved_court_id` を書くだけで、既存の予約パス
  （`dispatchToEmptyCourt` の先頭、均等化フィルタより前）がそのまま拾う
- Court ドキュメントに書き込みが増える（詰まり開始時と解消時の各1回）

### 注意点
- 端末判定（iPad かどうか）は**使っていない**。iPadOS の Safari は既定で Mac と名乗るため
  判定が壊れる。端末ごとの localStorage トグル（`focs_approval_mode`）にした
- 承認後にそのコートが別経路で埋まると、`reserved_court_id` が試合に残る。
  そのコートが次に空いたときに入る。困る場合は予約を手動で外すこと
- 「空けたままにする」は10分黙るだけ。10分後にまた聞く
- `approval_auto_minutes` を 0 にすると自動投入しなくなる（人が決めるまで入らない）

---

## 2026-08-30 / Claude Code / feat/approval-card-visibility

### 変更内容
確認カードを既定で全端末に出すようにし、止めている理由ごとに文面を分けた。

- `types/index.ts`（**保護対象**）— `PendingDispatchCandidate` に `kind`（`'round' | 'division' | 'group'`）を追加
- `dispatcher.ts` — `reasonFor()` が理由の種類も返す。`DispatchBlockInfo.overridable` に `kind` を追加
- `DispatchApprovalCards.tsx` — 既定 ON（`localStorage` に `'0'` を入れた端末だけ出さない）。
  `kind === 'round'` のときは文面を「前のラウンドがまだ全部終わっていないので、
  次のラウンドは自動では入れません。先に入れていいですか？」に変える
- `admin/page.tsx` — ボタンを「承認 ON/OFF」→「確認カード ON/OFF」に改称
- ラウンド規制だけで止まっているときは `auto_at` を null にする（自動投入しない）

### 変更理由
- オーナー要望「承認モードでないときは、コートが空いていて次ラウンドが入れる場合は、
  その旨を記載したうえで『入れていいですか？』と表示してほしい」
- コートが1面止まっている事実は運営全員が知っているべきもの。特定の端末にしか出さないと、
  他の端末では理由が分からないまま待つことになる
- ラウンド待ちは通常運用で何度も起きる。ここで3分の自動投入を効かせると
  「ラウンド規制を厳しめに」が毎回迂回されてしまうため、人が決めるまで入れない

### 影響範囲
- 確認カードの表示条件（全管理画面）と文面
- ラウンド規制で止まったコートは、承認するまで空いたままになる

### 注意点
- `approval_auto_minutes` はラウンド待ちには効かない。部門・グループの偏りのときだけ効く
- 「確認カード OFF」はその端末だけの設定。モニター表示用の画面などで使う

---

## 2026-09-01 / Claude Code / fix/division-override-3bu

### 変更内容
`getEffectiveDivision()` が種目ごとの部の例外（`division_overrides`）で
3部を受け付けるようにした。`(ov === 1 || ov === 2)` を `isValidDivision(ov)` に変更。

### 変更理由
今回の大会は混合ダブルスを「2部男子 × 1部・2部女子」「3部男女」で組む。
部をまたぐには `division_overrides` で選手の実効部を振り替える必要があるが、
1部・2部にしか振り替えられず、3部を指定しても黙って元の部に落ちていた。

### 影響範囲
- `src/lib/tournament-generator.ts`（1関数）
- トーナメント生成時の対象選手の絞り込み。3部への振り替えが効くようになる
- 1部・2部への振り替えの挙動は変わらない

### 注意点
- 混合ダブルスの当日ペア割り当ては、部でも性別でも候補を絞っていない（棄権者を除くだけ）。
  混合の枠に同性2人を入れても止まらない。ガードは無い
- `getMixedDoublesCourtRestriction()`（dispatcher.ts）はまだ 1部/2部 決め打ち。
  今回は混合が2部・3部なので `div1Remaining === 0` となり制限が効かない（素通し）。
  部門均等がハード制約になった今、この関数自体が不要かもしれない。要判断

---

## 2026-09-01 / Claude Code / fix/all-divisions-and-pair-numbers

### 変更内容
1. **点数を大会要項に合わせた**（`src/lib/match-points.ts`）
   - 男女別ダブルス: 予選15点 / 決勝トーナメントは全ラウンド21点
   - 混合ダブルス・シングルス: 通常15点 / 準決勝以降21点
   - 「4人ブロックだけ11点」を廃止（`POINTS_BLOCK_LARGE` を削除）
   - `pointsForKnockoutMatch` / `resolveKnockoutPoints` に `tournamentType` 引数を追加
   - `TournamentGenerator.tsx` の呼び出し5箇所に種目を渡すよう修正、説明文も更新
2. **ペア・シード設定が3部を表示しない不具合**（`PairSeedManager.tsx`）
   - 1部・2部のブロックを別々にベタ書きしていたため、3部の試合が画面に出なかった
   - 実際に試合がある部をループする形に統一（`getDivisionsInUse`）。配色は `DIVISION_COLOR` 表で持つ
3. **当日くじ待ちの枠に番号を出す**
   - `VisualBracket.tsx`: 「未定」→「3番ペア」（シングルスは「3番」）
   - `MatchPicker.tsx`: 同上（`pairSideLabel` を使用）

### 変更理由
- 要項（`public/2026_Focs_夏合宿_大会要項.pdf`）を読んだところ、実装していた自動点数と
  2箇所食い違っていた（4ペア予選 11点→15点 / 男女別Dの決勝T 15点→21点）
- オーナー報告「トーナメント表で、1部しか見れないところとか多い」
- オーナー要望「ペア未定じゃなくて、何番ペアみたいに出せない？」

### 影響範囲
- **これから生成するトーナメントの点数が変わる**。すでに生成済みの試合は作り直しが必要
- ペア・シード設定タブの表示（3部が出るようになる）
- トーナメント表・試合ピッカーの表示文言

### 注意点
- 点数の手動指定（ドロップダウンで11/15/21を選ぶ）は従来どおり自動より優先される
- `POINTS_BLOCK_LARGE`（11点）は要項で使わなくなったため削除した。戻す場合は git 履歴から
- 検算スクリプトで17ケース確認済み（男女別D・女子1部・混合・シングルス・手動指定）

---

## 2026-09-01 / Claude Code / feat/event-groups

### 変更内容
大会要項の並びに合わせ、種目を「個人戦①／個人戦②」の2つのくくりで扱えるようにした。

- `src/lib/event-groups.ts`（新規）
  - 個人戦① = 男子ダブルス / 女子ダブルス
  - 個人戦② = 混合ダブルス / 男子シングルス / 女子シングルス
  - `buildEventGroups(matches)` が「実際に試合がある 種目 × 部」を部門として並べて返す
- `VisualBracket.tsx`（トーナメント表）
  - 上段: 個人戦①／個人戦② のボタン
  - 下段: その中の部門タブ（「1部 男子ダブルス」「2部 混合ダブルス」など）
  - 種目セレクタ（プルダウン）と部タブの2本立てを廃止
  - 合宿の全試合を購読するよう変更（`subscribeToMatches` を新設）
- `firestore-helpers.ts` に `subscribeToMatches()` を追加

### 変更理由
オーナー要望「男女別ダブルスを個人戦①、混合ダブルスについては個人戦②みたいにして、
1部男子シングルス・2部混合ダブルス・3部混合ダブルスの3部門って感じにして、
トーナメント表のタブとかも変えよう」。

個人戦②は種目と部の組み合わせが不揃い（1部だけシングルス、2・3部は混合）なので、
「種目」と「部」を別々に選ばせる作りだと運営の頭の中と合わない。組み合わせを
1つの部門として並べる形にした。

### 影響範囲
- トーナメント表タブの操作方法（従来の localStorage 値からくくりを推測して移行する）
- 全試合を購読するようになるため、読み取り量が種目1つぶん → 合宿全体に増える
  （1大会 130 試合程度なので影響は小さい）

### 注意点
- **予選順位タブは変えていない。** 予選リーグがあるのは個人戦①だけで、
  個人戦②（混合・シングルス）はトーナメント方式のため予選が無い。
  くくりのタブを付けても②が常に空になり、かえって分かりにくい
- 団体戦は `groupOfType()` が 'team' を返し、個人戦のタブには出ない

---

## 2026-09-01 / Claude Code / chore/remove-locks

### 変更内容
管理画面のロックを2つとも撤去した（**保護対象・オーナー指示**）。

- `AdminGuard.tsx` — 管理画面全体のPINロック。素通しにした（ファイルは残す）
- `AdvancedAnalytics.tsx` — 「応用機能」のパスワードロック。画面・state・
  `sessionStorage` の解除フラグごと削除
- **ソースに直書きされていたパスワード `"1203"` を削除**した。
  このリポジトリは公開なので、値が残っていること自体が問題だった

### 変更理由
オーナー指示「PWロックを全部なくしてほしい」。
当日は複数端末・複数の運営が同時に管理画面を開くため、端末やタブを開き直すたびに
入力が要ると進行が止まる。

### 影響範囲
- **`/admin` の URL を知っていれば誰でも操作できる。** 参加者に URL を配らないこと
- `NEXT_PUBLIC_ADMIN_PIN` は参照されなくなった（環境変数は残っていても無害）

### 注意点
- ロックを戻す場合は `AdminGuard.tsx` を git 履歴から復元すれば足りる。
  ただし直書きパスワードは戻さず、環境変数を使うこと

---

## 2026-09-01 / Claude Code / feat/event-group-control

### 変更内容
1. **種目制御に個人戦①／②のワンタッチ切り替えを追加**（`TournamentTypeControl.tsx`）
   - 「個人戦①だけ有効（男女別ダブルス）」「個人戦②だけ有効（混合ダブルス・シングルス）」
     「すべて有効（フィルタなし）」の3ボタン
   - `EVENT_GROUPS`（`src/lib/event-groups.ts`）を共有し、トーナメント表のくくりと定義を1つにした
   - 従来の種目ごとのトグルはそのまま下に残す（細かく直したいとき用）
2. **コート初期化ボタンのラベルが「（6面）」固定だった**（`admin/page.tsx`）
   - 実際は `camp.court_count` の面数で作られるのに、表示だけ6面と嘘をついていた
   - `camp.court_count` を表示するよう修正

### 変更理由
- オーナー要望「種目制御も、個人戦1・個人戦2の方でやりたい」
- DAY1 は前半＝男女別ダブルス、後半＝混合＋1部男子シングルス。切り替えのたびに
  6種目のボタンを個別に押すのは当日の事故のもと
- ラベルの嘘で「この合宿は6面」と誤読した（実際は8面で正しく作成済みだった）

### 影響範囲
- 応用タブの種目制御の見た目と操作
- `config.enabled_tournaments` の書き込み方は従来と同じ（配列を丸ごと置き換え）
- コート初期化の挙動は変更なし（表示のみ修正）

### 注意点
- 団体戦はボタンに含めていない。団体戦は `matches` を作らず `enabled_tournaments` の
  対象外のため、含めても意味がない
- 「すべて有効」は空配列を書き込む＝フィルタなし。これが初期状態

---

## 2026-09-01 / Claude Code / feat/court-gender-split

### 変更内容
コートの性別配分をまとめて切り替える画面を追加した（`CourtGenderSplit.tsx` 新規）。

- 男子専用・女子専用の面数を ± で決め、残りは自動で「指定なし」
- プリセット「男女半々」「全面 共用」
- 番号の若い順に 男子 → 女子 → 指定なし で `preferred_gender` を書き換える
- 性別を変えたコートは `manual_gender_unlock` も一緒に false に戻す
  （個別に付けた例外許可は、配分を変えた時点で意味がなくなるため）
- 置き場所: 種目設定タブ（`control`）の「種目ごとの進行制御」の下

### 変更理由
DAY1 は前半が男女別ダブルス、後半が混合ダブルスと1部男子シングルス。
前半はコートを男女に分けたいが、後半の混合は男女ペアなので性別指定が邪魔になる。
1面ずつ「その他の操作」で外していると、切り替えの瞬間に8回操作することになり事故のもと。

### 影響範囲
- コートの `preferred_gender` / `manual_gender_unlock` を一括更新する
- 自動割り当ての性別ガードはこの値を見ているので、割り当て結果に直結する

### 注意点
- 触るまでは今のコート設定をそのまま表示する（誤って上書きしないように）
- 適用ボタンを押すまで Firestore には書かない
- 当日の想定: 前半「男子5面 / 女子3面」→ 後半「全面 共用」

---

## 2026-09-01 / Claude Code / feat/finals-approval

### 変更内容
決勝戦を「運営が許可するまで出さない」仕組みを追加した。

- `types/index.ts`（**保護対象**）— `Config` に追加
  - `finals_approval_required?: Record<string, boolean>`（キー: `${type}_${division}`）
  - `finals_approved_match_ids?: string[]`
- `matchScoring.ts` に `isFinalsRound(match, allMatches)` を追加
  （その種目・部の最終ラウンド＝決勝と3位決定戦の判定。判定を1か所にまとめた）
- `dispatcher.ts` — `validMatches` の絞り込みに許可チェックを追加。
  許可制ONの種目の決勝は、`finals_approved_match_ids` に入るまで候補に出ない
- `diagnoseWaitingMatches` にスキップ理由 `finals_hold`（🏆 決勝の許可待ち）を追加
- `FinalsApproval.tsx`（新規）— 種目ごとの許可制ON/OFF、試合ごとの「いま入れる」
- 置き場所: 種目設定タブ

### 変更理由
既存の `finals_wait_mode`（決勝戦の開始タイミング）は「種目内の全試合が終わったら
自動で解放」する作りで、勝手に始まってしまう。オーナーの要望は
「決勝はこっちが許可を出したタイミングのみで入れたい」なので、別の仕組みが必要だった。

### 影響範囲
- 許可制をONにした種目・部の決勝と3位決定戦だけが対象。他の試合には影響しない
- 許可は**試合単位**なので、決勝と3位決定戦を別のタイミングで出せる
- `finals_wait_mode` は従来どおり残してある（センターコート寄せに使う）。
  両方ONにすると許可制が先に効く

### 注意点
- 許可を取り消すこともできる（コートに乗る前まで）
- 許可制ONのまま忘れると決勝が永久に始まらない。診断に🏆で理由が出るので、
  当日は「アサイン診断」を見れば気づける

---

## 2026-09-01 / Claude Code / feat/finals-approval-on-court

### 変更内容
1. **「決勝戦の開始タイミング（待機モード）」のカードを削除**（`admin/page.tsx`）
   - 決勝の許可制と役割がダブっていて紛らわしかった
   - 未使用になった `finalsWaitMode` の state・読み込み・`toggleFinalsWait` も削除
   - `config.finals_wait_mode` を書く画面が無くなった（dispatcher 側のコードは残置。
     値が空なら何もしないので無害）
2. **決勝の許可をコート状況タブでも押せるようにした**（`FinalsApproval.tsx`）
   - `mode` プロパティを追加
     - `full`（種目設定タブ）… 種目ごとの許可制ON/OFF＋全部の決勝を一覧
     - `ready-only`（コート状況タブ）… **選手が決まっていて許可待ちの決勝だけ**を出す。
       無ければ何も描画しない
3. **勝ち上がり待ちの決勝は押せないようにした**
   - 以前は全部門が「未定 vs 未定 / 許可待ち / いま入れる」と並び、
     押しても意味がないボタンが9部門ぶん出ていた
   - 選手が未確定なら「勝ち上がり待ち（まだ押せません）」と表示し、ボタンを出さない

### 変更理由
オーナー指摘「ダブってるから下の方消してほしい」「許可ボタンを、コート状況のところでも
操作できる方がいい気がする」。当日ずっと開いているのはコート状況タブなので、
決勝を出すたびに種目設定へ移動するのは無駄。

### 影響範囲
- 種目設定タブから「決勝戦の開始タイミング」が消える
- コート状況タブに、押せる決勝があるときだけ紫のカードが出る

### 注意点
- `finals_wait_mode`（決勝のセンターコート寄せ）は画面から設定できなくなった。
  必要になったら UI を戻すか、Firestore を直接触ること

---

## 2026-09-01 / Claude Code / feat/preliminary-block-table

### 変更内容
トーナメント表タブの予選リーグを、紙と同じ**ブロック表（総当たり表）**に作り替えた
（`PreliminaryGroup.tsx` を全面書き換え。props は変えていないので呼び出し側は無修正）。

```
            ①    ②    ③    勝  順
  ① A/B    ／  15-9   −    1   1
  ② C/D   9-15   ／  15-11 1   2
  ③ E/F     −  11-15  ／   0   3
```

- マスの数字は**行のペアから見た得点**。勝ったマスは黄色
- 対角は斜線、未消化は「−」、進行中は「試合中」
- 右端に**勝数と順位**。順位は要項どおり ①勝利数 ②直接対決 ③得失点差
- 終わったマスをタップで結果の訂正（従来と同じ挙動）
- 編集モードでは行ヘッダのペア名タップで入れ替え（従来と同じ）

### 変更理由
オーナー要望「予選リーグの部分は、対戦表的な感じにしたい。ブロック表的な」。
1試合＝1カードを縦に並べる形だったので、紙のブロック表と照合しづらかった。

### 影響範囲
- トーナメント表タブの予選リーグ表示のみ。データは読むだけで書かない

### 注意点
- ペアの見分けは「選手IDの連結」→ 選手が未確定なら「#くじ番号」の順。
  当日くじ前でも「1番ペア」の行が並ぶ
- 順位はこの画面で独自に集計している（`group-ranking.ts` の
  `calculateGroupStandings` は選手ID前提で、番号だけの状態では使えないため）。
  予選順位タブの数字と食い違ったら、まずこの点を疑うこと
- 集計ロジックは scratchpad の `blk/check.js` で8ケース検証済み

---

## 2026-09-01 / Claude Code / fix/seed-bracket-display

### 変更内容
トーナメント表で、シード（BYE）まわりの表示が壊れていたのを直した（`VisualBracket.tsx`）。

1. **BYE試合の空いている側が「未定」になっていた** → 「シード（不戦勝）」を出す
2. **シードで2回戦に上がるペアが「1回戦 第N試合の勝者」と出て、しかも番号が嘘だった**
   → くじ番号（例「1番ペア」）を出す
3. `getActualMatchNumber()` が採番対象外の試合に生の `match_number` を返していた
   → `null` を返すようにし、`winnerOfLabel()` で番号なしの表現にフォールバック

### 変更理由
オーナー指摘「シードの対戦相手未定になっちゃう？」。本番データ（混合D2部・22ペア／BYE10）で
確認したところ、2回戦の表示が次のようになっていた。

```
第1試合  1回戦 第1試合の勝者 VS 1回戦 第4試合の勝者
第2試合  1回戦 第3試合の勝者 VS 1回戦 第4試合の勝者   ← 第4試合が2箇所
第3試合  1回戦 第5試合の勝者 VS 1回戦 第5試合の勝者   ← 同じ試合が両側
```

原因は2段構え。
- 当日くじ前は BYE 元にも選手が入っていないため、BYE 用の分岐が名前を作れず素通りし、
  末尾の「第N試合の勝者」に落ちていた
- `getActualMatchesInRound(1)` は BYE を除外して採番するのに、
  `getActualMatchNumber()` は見つからないと生の `match_number` を返していたため、
  実戦試合に振り直した番号と衝突していた

### 影響範囲
- トーナメント表の決勝トーナメント部分の表示のみ。データは書き換えない
- 選手が入っている通常運用（くじ後）では従来どおり氏名が出る

### 注意点
- 「シード（不戦勝）」の文言は参加者ビュー（`user/page.tsx`）と揃えた
- 採番できない試合は「1回戦の勝者」と番号なしで出る。嘘の番号を出すよりは良い、という判断

---

## 2026-09-01 / Claude Code / feat/admin-pin-remember

### 変更内容
管理画面のPINロックを戻した（**保護対象・オーナー指示**）。ただし以前と挙動を変えた。

- `sessionStorage` → `localStorage` に変更。解除した端末は **30日間** 聞かれない
- 以前の `sessionStorage` 版で解除済みの端末は、そのまま通して記憶し直す（移行措置）
- `localStorage` が使えない環境（プライベートウィンドウ等）では毎回聞く

### 変更理由
一度撤去したが、`/admin` の URL を知っていれば誰でも操作できる状態が不安との判断。
以前 PIN を外したのは「タブや端末を変えるたびに入力が必要で進行が止まる」ためだったので、
端末ごとに1回で済む形にして両立させた。

### 影響範囲
- `/admin` に PIN 入力画面が戻る。PIN は `NEXT_PUBLIC_ADMIN_PIN`（未設定なら `0000`）

### 注意点（重要）
- **これはデータを守る仕組みではない。** `firestore.rules` が
  `allow write: if true` のままなので、プロジェクトID（公開JSに埋まっている）を知っていれば
  管理画面を通らずに全データを読み書きできる
- `NEXT_PUBLIC_` の値は**クライアントのJSバンドルに埋め込まれる**。PIN はソースを見れば分かる。
  「迷い込み防止」以上の意味はない
- 本当に守るなら Google ログイン + Firestore ルールの変更が必要。大会後の課題

---

## 2026-09-01 / Claude Code / perf/dispatch-shared-reads

### 変更内容
自動割り当ての Firestore 読み込みを、1巡につき1回にまとめた（`dispatcher.ts`）。

- `dispatchToEmptyCourt()` に任意引数 `shared`（config / allMatches / allPlayers / allCourts）を追加
- `autoDispatchAll()` が最初に1回だけ読んで、全コートで使い回す
- 割り当てが決まるたび、`shared.allMatches` の該当試合を `status='calling'` に、
  `shared.allCourts` の該当コートを `current_match_id=...` に**手で進める**
- `shared` を渡さない呼び出しは従来どおり自前で読む（挙動は変わらない）

### 変更理由
テスト合宿でのリハーサル（99名・140試合・8面）で、**空の8面が埋まるまで37秒**かかった。
原因はコート1面ごとに matches / players / courts / config を全件読み直していたこと。

| | 1巡（8面）あたりの全件読み込み |
|---|---|
| これまで | 3 + 4×8 = **35回** |
| これから | **4回** |

DAY1 は 270分で140試合と余裕がないため、複数面が同時に空くたびに30秒以上待つのは無視できない。

### 影響範囲
- 自動割り当ての速度のみ。**割り当ての判断ロジックは1行も変えていない**

### 注意点（重要）
- **共有データを手で進める処理を消さないこと。** 消すと、次のコートが
  「その試合はまだ待機中 / その選手は空いている」と誤認し、
  同じ選手を2面に同時に出してしまう。以前は毎回読み直すことで偶然防げていた
- 二重割り当ての最終防衛線は従来どおり `claimCourtForMatch()` のトランザクション

## fix/dispatch-throttle-guard

- 日付: 2026-09-01
- 担当者: Claude Code（菊池指示）
- ブランチ: `fix/dispatch-throttle-guard`

### 変更内容

`src/components/AutoDispatchEngine.tsx` に3点追加した。

1. 巡回の多重起動ガード（`runningRef`）。前の巡回が終わるまで次を始めない。
2. Wake Lock。画面が見えている間、端末の画面を消させない。戻ってきたら取り直す。
3. 途切れの見張り。30秒以上巡回が途切れたら、画面下に赤い帯で知らせる。

### 変更理由

本番と同じ構成のテスト合宿で通しリハーサルを回したところ、割り当てが止まった。
原因はアプリではなく、ブラウザがバックグラウンドのタブのタイマーを間引くことだった。

- 前面（ウィンドウにフォーカスあり）: 結果入力8件が16秒、空きコート8面が2秒で埋まる
- 裏に回った状態: 結果入力が1件あたり約75秒、進出処理のログも約60秒間隔

さらに、間引かれて溜まった巡回が復帰時に同時に走ると、担当（リース）を取る
トランザクションが互いを弾き合い（`failed-precondition`）、98回連続で全滅していた。
`acquireDispatchLease` は取れなければ回さない作りなので、結果として一件も進まない。
1 の多重起動ガードはこの取り合いそのものを消す。

コートが完了済みの試合を掴んだまま残る現象も確認したが、これは解放の書き込みが
間引きで遅れていただけで、待てば正しく解放された。アプリ側の不具合ではない。

### 影響範囲

- `src/components/AutoDispatchEngine.tsx` のみ
- 割り当てのロジック（`dispatcher.ts` / `matchScoring.ts`）は変更なし
- 画面に赤い帯が出るのは「自動割り当てON かつ 中断なし」で30秒以上途切れたときだけ

### 注意点

- Wake Lock は画面が見えているときしか取れない。他のアプリに切り替えたら効かない。
  当日は「コート状況の画面を出したままにする」運用が前提であることは変わらない。
- 未対応ブラウザでは Wake Lock は黙って何もしない（例外は握りつぶしている）。
- 赤い帯が出たら、その画面を前面に戻せば自動で復帰する（操作は不要）。

## fix/knockout-promote-guard

- 日付: 2026-09-01
- 担当者: Claude Code（菊池指示）
- ブランチ: `fix/knockout-promote-guard`

### 変更内容

`src/components/admin/GroupRankingManager.tsx`

1. 決勝トーナメントへ進出させる前に、進出者の数と枠の数が合っているか確かめる。
   合わなければ書き込まずに止め、理由を出す。
2. ボタンの主従を入れ替えた。要項は「各ブロック1位通過」なので
   「全グループ1位のみ決勝Tへ」を主ボタン、「上位2名」を副ボタンにした。

### 変更理由

進出処理は `Math.min(remTops.length, remBottoms.length, realSlots.length)` で
書き込みループを打ち切っていた。枠が1試合しかない部で「上位2名」を押すと
4組が進出扱いになり、2組が黙って捨てられる。エラーは出ず、決勝が
「A組1位 vs B組2位」になっても当日は気づけない。

2026夏合宿の構成で確認した結果は次のとおり。

| 部 | グループ | 枠 | 上位1名 | 上位2名 |
|---|---|---|---|---|
| 男子D1部 | 2 | 2 | 通る | 止まる |
| 男子D2部 | 3 | 3 | 通る | 止まる |
| 男子D3部 | 3 | 3 | 通る | 止まる |
| 女子D2部 | 2 | 2 | 通る | 止まる |
| 女子D3部 | 2 | 2 | 通る | 止まる |

### 影響範囲

- `src/components/admin/GroupRankingManager.tsx` のみ
- 進出の並べ方（クロスマッチング・スーパーシード）は変更していない
- 枠と数が合っている正しい操作は、これまでどおり通る

### 注意点

- 予選から決勝トーナメントへの進出は自動ではない。**運営が予選順位の画面で押す**。
  押すまで決勝Tの試合には選手が入らず、自動割り当ての対象にならない。
