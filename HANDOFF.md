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
