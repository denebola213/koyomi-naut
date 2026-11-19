---
name: koyomi-naut
description: koyomi-naut の実装ルールを確認する。通信・表示・デプロイ方針。
version: 0.4.0
author: denebola213, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [koyomi-naut, offline, astro, pwa, rules]
    related_skills: []
---

# koyomi-naut 開発ルール

koyomi-naut への実装・修正を行うときの共通ルール。`AGENTS.md` の要点を
skill としてまとめたもの。

## Overview

計算（太陽・月の位置、出没・薄明・南中、月齢・四大相・遠近）はすべて端末内
（`astro.js` の Meeus 低精度式）で行う。第三者への通信・データ送信はしない。
静的サイトでビルドなし。開発は **branch → PR → Cloudflare Pages プレビュー →
squash merge → `main` 本番デプロイ**（`main` 直接 push 禁止、手順は `DEPLOY.md`）。

## When to Use

- koyomi-naut の `app.js` / `astro.js` / `index.html` / `sw.js` を編集するとき
- 新しい表示項目（時刻・ラベル・ポップアップ等）を追加するとき
- 通信・外部リソースの要否を判断するとき

Don't use for: デプロイ手順そのもの（`DEPLOY.md` / `terraform/pages.tf` 参照）。

## 通信ポリシー

- アセットは同一オリジンの静的ファイルのみ（相対パス参照）。
- **外部URLの直読み込み禁止**（フォント・ライブラリ・解析・CDN等）。
- 外部データが必要な場合は**全データを端末内ファイルとして内包**する。
- `fetch` / `WebSocket` / `XMLHttpRequest` による**第三者ホストへの通信はしない**。
- Service Worker の `fetch` は自サイト配下の GET のみ。第三者URLを対象にしない。
- GPS（`navigator.geolocation`）の結果は `localStorage` のみ保存し、外部送信しない。

- 通信の追加が必要な場合は提案 → ユーザー承認が先。通信先・取得データ・使用目的を明示し、
  承認後に最小限に実装（同一オリジン優先）。オフライン・フォールバックを残す。
- `README.md` の「計算は端末内で完結し、第三者への通信・データ送信はありません」を維持する。
- 表記で「外部通信は一切ありません」等の過剰な表現は避ける（配信元との通信は別）。

## 表示ポリシー

| 表示項目 | 実装 | 単位・書式 |
|---|---|---|
| 月齢 | `moonAge()`（新月基準） | 日数（小数1位） |
| 月距離 | `moonEcliptic().dist` | アラビア数字 + `km` のみ（千・万表記なし） |
| 四大相（新月・上弦・満月・下弦） | `moonPhaseName(date)`（黄経差で交差時刻を探索） | 交差時刻 ±0.5 日の日に月齢横に括弧書き。それ以外は非表示 |
| 距離の遠近 | `distanceRatioPct(m.dist)` | 近点 363,300 km=0%、遠点 405,500 km=100% で正規化表示。`?` ボタンで説明ポップアップ |

- 中間相名（「三日月〜半月」等）は表示しない。
- 時間窓は指定日 00:00 〜 翌日日の出（`dayEvents()` の `windowEvents`）。
- 新時刻を追加する場合は `{ time, label, cls }` を `windowEvents` に追加し時刻順ソート
  （例: 月の南中は 24.8h 周期で窓内に 1〜2 回出ても2行表示）。

## キャッシュ・SW

- `sw.js` の `CACHE = 'skypwa-vN'` は全変更で上げる（現在 v20）。
- `/sw.js` と静的アセットは `_headers` で no-cache 設定済み。
- SW の責務はオフライン互換（ネットワーク優先・失敗時はキャッシュ）のみで、
  第三者へのデータ送信はしない。

## 開発ワークフロー（branch → PR → プレビュー → merge）

- `main` への直接 push は禁止（ブランチ保護: PR 必須）。作業は `<type>/<short-desc>`
  ブランチで行い、PR を作る。詳細は `DEPLOY.md`。
- PR ごとに Cloudflare Pages がプレビュー専用デプロイを自動発行する
  （`preview_deployment_setting = "all"`）。プレビュー URL を確認し、
  ユーザーの OK が出た場合のみ squash merge する（先行マージ禁止）。
- マージで `main` が進むと本番（`koyomi-naut.pages.dev`）が自動デプロイされる。
  マージ成功だけでなく本番 URL / `sw.js` の新バージョンを `curl` で確認する。
- リポジトリは squash merge のみ可（merge commit / rebase は不可）。

## 検証

- `node --check app.js astro.js`
- Node で数値テスト: `require('./astro.js')`（`module.exports` あり）。
- 四大相のラベルは月齢ではなく黄経差の交差時刻で判定する。

## Pitfalls

- 「表示だけ増やす」つもりでも、事実間違えたラベル・表記（例: 「（満ちる）」等）を
  持ち込まない。不要な中間名は廃止済み。
- 離角（`elong`）では上弦と下弦を区別できない（90° と 270°）。黄経差（0〜360°）で判定する。
