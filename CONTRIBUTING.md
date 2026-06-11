# CONTRIBUTING — 共同編集の手引き（人間向け）

このプロジェクト（focsportal / バドミントン大会運営システム）に変更を加える人へ。
**正式ルールは [`CLAUDE.md`](./CLAUDE.md) が最上位**です。本書はその要約と手順です。

## 大前提
- オーナーは **@rikurun6v6-dot**。**master への直接 push は禁止**。
- 変更は必ず **作業ブランチ → Pull Request → オーナー承認 → マージ**。
- **オーナーの承諾がない変更はマージされません**（GitHub のブランチ保護で強制）。
- このリポジトリは **PUBLIC（公開）**。秘密情報は絶対にコミットしないこと。

## 環境構築
```bash
git clone https://github.com/rikurun6v6-dot/focsportal.git
cd focsportal
npm install
cp .env.local.example .env.local   # 値はオーナーから受け取る
npm run dev
```

## 変更の手順
```bash
git checkout master && git pull
git checkout -b feat/<内容>        # 例: feat/awards-podium
# ... src/ 配下を編集 ...
# HANDOFF.md の末尾に変更点を追記（必須・追記のみ）
npm run build                       # 通ることを確認
git commit -m "feat: <内容>"
git push -u origin feat/<内容>
# GitHub で Pull Request を作成（base: master）→ オーナーの承認を待つ
```

## やってはいけないこと
- `master` への直接 push / `git push --force` / 履歴の書き換え
- `HANDOFF.md` の過去エントリの編集・削除（**追記のみ**）
- 保護対象（`CLAUDE.md` / 依存関係 / Firebase / 認証 / デプロイ設定）の無断変更
- 秘密情報（`.env*` / APIキー / サービスアカウント JSON）のコミット
- 頼まれていない範囲のリファクタ・依存追加

## Claude Code を使う場合
- クローン直後に Claude Code を起動すれば、`CLAUDE.md` が自動で読み込まれ、上記ルールに従って動作します。
- 迷ったら勝手に進めず、オーナーに確認してください。
