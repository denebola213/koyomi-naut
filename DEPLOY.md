# 開発ワークフロー（branch → PR → プレビュー確認 → squash merge → 本番）

`main` への直接 push は禁止（ブランチ保護で PR 経由必須）。通常の変更は
**ブランチで作業し、PR を作り、Cloudflare Pages のプレビュー URL で確認してから
squash merge する**。マージした `main` だけが本番デプロイの対象になる。

## 手順

1. **ブランチ作成**（`main` から）

   ```bash
   git fetch origin
   git checkout -b <type>/<short-desc> origin/main
   # 例: feat/timeline-icon, fix/moon-phase, docs/pr-preview-workflow
   ```

2. **作業＋検証**（`AGENTS.md` の検証節）

   ```bash
   node --check app.js astro.js
   ```

   表示・計算に触れる場合は `require('./astro.js')` の数値テストも実施する。
   `sw.js` の `CACHE = 'skypwa-vN'` は全変更で上げる（PR 内で完結させる）。

3. **PR 作成**

   ```bash
   git push -u origin <type>/<short-desc>
   gh pr create --base main --title "<type>: <内容>" --body "..."
   ```

   PR 本文には「何を変更したか / 検証結果 / 注意点」を書く
   （テンプレート: `.github/pull_request_template.md`）。

4. **ステージング（プレビュー）確認**

   - Cloudflare Pages の Git 連携が PR ごとにプレビュー専用デプロイを自動発行する
     （`preview_deployment_setting = "all"`、対象は全ブランチ）。
   - プレビュー URL は PR への Cloudflare コメント、および
     Pages の Deployments 一覧（`https://<hash>.koyomi-naut.pages.dev`）で確認できる。
   - エージェントはデプロイ成功（Deployments API の `latest_stage.status = success`）と
     プレビュー URL の 200 を確認し、URL を PR / 作業報告に載せる。
   - ユーザーがプレビュー URL で見た目・動作を確認する。

5. **レビュー OK → squash merge**

   ユーザーの OK が出た場合のみマージする（エージェントが先行してマージしない）。

   ```bash
   gh pr merge <PR番号> --squash --delete-branch
   ```

   リポジトリ設定上 squash のみ可（merge commit / rebase は不可）。
   マージ後はブランチは自動削除される。

6. **本番確認**

   - マージで `main` が進み、本番デプロイ（`koyomi-naut.pages.dev`）が自動発行される。
   - エージェントは Deployments API で success を確認し、
     本番 HTML / `sw.js`（新しい `skypwa-vN`）を `curl` で確認する。
     `git push` / merge の成功だけでは本番反映を証明できない。

## 運用ルール

- `main` への直接 push・force push はしない（ブランチ保護で拒否される）。
  緊急時のみ、リポジトリ管理者が保護を一時解除して対応する。
- マージは squash のみ。1 PR = 1 変更内容・1 コミット（`skypwa-vN` 追跡が綺麗になる）。
- 承認（レビュー）は必須ではない（保護設定: 承認数 0）。ただし
  **マージ実行はユーザーの OK 後**に限る。
- プレビューはブランチ別 URL（固定 staging ドメインは持たない）。
  URL はブランチ名に依存するため、PR を閉じるとプレビューも消える。

## Cloudflare Pages 設定（Terraform 管理）

`terraform/pages.tf` で管理する。現行値（本番・プレビューとも反映済み）:

- Production branch: `main`、Build command: `exit 0`（ビルドなし）、出力: `/`
- `preview_deployment_setting = "all"`（全ブランチでプレビュー発行）
- `pr_comments_enabled = true`（PR にプレビュー URL をコメント）

```bash
export CLOUDFLARE_API_TOKEN=<トークン>   # Pages Read/Edit 権限
terraform -chdir=terraform init
terraform -chdir=terraform apply -var="cf_account_id=<アカウントID>"
```

state を失った場合は新規作成せず import する（重複プロジェクトになるため）:

```bash
terraform -chdir=terraform import -var="cf_account_id=<アカウントID>" \
  cloudflare_pages_project.koyomi_naut "<アカウントID>/koyomi-naut"
```

GitHub 連携（Pages → Settings → GitHub integration）はダッシュボードで一度接続済み。
`gh api repos/denebola213/koyomi-naut/hooks` が空でも、Pages 側の Git 連携が
webhook を管理しているため push / PR でデプロイされる（実績で確認済み）。
