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
