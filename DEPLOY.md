# Cloudflare Pages へのデプロイ設定（main push で自動デプロイ）

`main` への push で Cloudflare Pages が自動デプロイする Git 連携を設定するには、
次のいずれかが必要です（どちらも Cloudflare アカウントの認証が必須）。

## A. ダッシュボードで接続（推奨・数分）

1. [Cloudflare ダッシュボード](https://dash.cloudflare.com/) → Workers & Pages → Create → Pages → Connect to Git
2. GitHub を認証し、`denebola213/koyomi-naut` を選択
3. 設定値:
   - Production branch: `main`
   - Build command: `exit 0`（ビルドなし）
   - Build output directory: `/`（リポジトリ直下）
4. Save and Deploy

以降、`main` への push ごとに本番デプロイ、PR ごとにプレビュー URL が自動発行されます。

## B. Terraform（IaC）で管理

`terraform/pages.tf` に Pages プロジェクト定義があります。

```bash
# 1) Cloudflare で API トークン発行（Pages Read/Edit 権限）
export CLOUDFLARE_API_TOKEN=<トークン>
# 2) アカウント ID を用意
terraform -chdir=terraform init
terraform -chdir=terraform apply -var="cf_account_id=<アカウントID>"
```

注意: Cloudflare 側で GitHub 連携（Pages → Settings → GitHub integration）を
有効化しておく必要があります。また provider v5 の `source` 書き込みには
既知の不具合があるため、作成後に動作確認してください。

## C. Wrangler で直結したい場合

Git 連携が不要なら `wrangler pages deploy` でもデプロイできますが、
「main push で自動デプロイ」には Git 連携（A か B）が必要です。
