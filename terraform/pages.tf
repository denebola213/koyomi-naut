# Cloudflare Pages プロジェクト定義（koyomi-naut）
#
# Git 連携 Pages プロジェクトです。開発ワークフローは
# branch → PR → プレビュー（全ブランチ）→ squash merge → main 本番デプロイ
# （手順は DEPLOY.md）。下記の設定により、main 以外のブランチ push / PR ごとに
# プレビュー専用デプロイが自動発行され、PR にプレビュー URL がコメントされます。
# 事前に必要なもの:
#   1. Cloudflare ダッシュボードで GitHub 連携を有効化する
#      （Pages → Settings → GitHub integration で GitHub を接続。
#       これが無いと source.config.owner / repo_name が解決できない）
#   2. トークン発行時に必要な権限:
#      - Account → Pages → Read / Edit
#      - Token を作成したアカウント ID（var.cf_account_id）
#
# 実行手順:
#   1) Cloudflare API トークンを作成（Pages Read/Edit 権限）
#   2) export CLOUDFLARE_API_TOKEN=<トークン>
#   3) terraform init && terraform apply
#      （アカウント ID は terraform.tfvars か -var で渡す）
#
# 注意: provider v5 では source を書けない既知 issue (#5176/#5093) があるため、
#       GitHub 連携プロジェクトは Terraform import かダッシュボードで作るのが安全。
#       下記の source ブロックは provider が受理する範囲の記述。

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "cf_account_id" {
  description = "Cloudflare アカウント ID"
  type        = string
}

variable "github_owner" {
  description = "GitHub リポジトリの所有者"
  type        = string
  default     = "denebola213"
}

variable "github_repo" {
  description = "GitHub リポジトリ名"
  type        = string
  default     = "koyomi-naut"
}

provider "cloudflare" {
  # トークンは環境変数 CLOUDFLARE_API_TOKEN から読む
}

resource "cloudflare_pages_project" "koyomi_naut" {
  account_id        = var.cf_account_id
  name              = "koyomi-naut"
  production_branch = "main"

  build_config = {
    build_command   = "exit 0"
    destination_dir = "/"
    root_dir        = "/"
  }

  source = {
    type = "github"
    config = {
      owner                           = var.github_owner
      repo_name                       = var.github_repo
      production_branch               = "main"
      production_deployments_enabled  = true
      preview_deployment_setting      = "all"
      pr_comments_enabled             = true
    }
  }
}

output "pages_url" {
  value = "https://${cloudflare_pages_project.koyomi_naut.subdomain}"
}
