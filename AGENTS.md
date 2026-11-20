# koyomi-naut AGENT.md

オフライン対応 PWA（日の出・日の入り・月の出・月の入り・天文薄明・南中・太陽と月の軌道）。
計算は端末内で完結し、**第三者への通信・データ送信はしない**。静的サイトでビルドなし。

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面構造（入力ゾーン／結果ゾーンの2タブ: 出没・薄明・星空のようす） |
| `app.js` | DOM 描画・イベント・localStorage 保存・GPS 取得 |
| `astro.js` | 天文計算（Meeus 低精度）・出没・薄明・南中・月齢・四大相・遠近 |
| `municipalities.js` | 市町村データ（code4fukui/localgovjp, CC BY） |
| `oaza.js` | 大字・町丁目＋小字（字）データ（Geolonia 住所データ, CC BY 4.0）。`node scripts/build-oaza.mjs` で再生成 |
| `styles.css` | UI スタイル |
| `sw.js` | Service Worker（ネットワーク優先・失敗時はキャッシュ） |
| `manifest.webmanifest` | PWA マニフェスト |
| `terraform/pages.tf` | Cloudflare Pages プロジェクト定義 |

リポジトリ用ルール・スキルは `.agents/skills/koyomi-naut/`。

## 新しい見せ方を追加する前に

オンライン部分（CDN 通信・API 取得・第三者解析等）の要否は**提案 → ユーザー承認**が前提。
豊富な表現が必要ならまず方針提案を受け、承認を得てから実装する。

### 通信ポリシー（再徹底）

- アセットは同一オリジンの静的ファイルのみ（相対パス参照）。
- **外部URLの直読み込み禁止**（フォント・ライブラリ・解析・アフィリエイト等のベンダーCDN禁止）。
- もし外部データが必要な場合は、**全データを端末内ファイルとして内包**する（CSV/JSON等）。
- `fetch` / `WebSocket` / `XMLHttpRequest` による**第三者ホストへの通信はしない**。
- Service Worker の `fetch` は自サイト配下の GET のみ（現状）。第三者URLを対象にしない。
- GPS（`navigator.geolocation`）の結果は `localStorage` のみ保存し、外部送信しない。
- `README.md` の「計算は端末内で完結し、第三者への通信・データ送信はありません」を維持。

### 通信の追加が必要な場合は

1. 提案として通信先・取得データ・使用目的を明記
2. ユーザー承認を受けた上で最小限に実装（同一オリジン優先）
3. オフラインフォールバック（SWキャッシュ等）を必ず残す

## 実装方針

### 表示・データ

- 月齢は `moonAge()`。月の距離は距離近似式（`moonEcliptic().dist`）で数値表示（`km` のみ）。
- 四大相（新月・上弦・満月・下弦）ラベルは **黄経差で交差時刻を探索**し（`moonPhaseName(date)`）、
  正午が交差時刻から ±0.5 日以内なら月齢横に括弧書き。それ以外の日は非表示。
- 距離の「遠近」は近点 363,300 km=0%・遠点 405,500 km=100% で正規化表示（`distanceRatioPct()`）。
  「？」ボタンで説明ポップアップ（`<dialog>`）。
- 時間窓は指定日 00:00 〜 翌日日の出（`dayEvents()` の `windowEvents`）。南中は窓内での極大値探索。
- 結果ゾーンはタブで「出没・薄明」（既定）と「星空のようす」（全天図）の2ビューに分ける。
- ビューの表示名を変えるときは、タブ・見出し・`aria-label`・説明ダイアログ・`README.md`・
  `.agents/skills/` の表記を同時に揃える。内部 ID（`tab-sky` / `panel-sky` / `skyChart`）・
  ハッシュ（`#sky`）・`localStorage` キーは安定側なので変えない。

### キャッシュ・デプロイ

- 初回に全データ（`oaza.js` を含む）を取得してオフラインで完結させるのが仕様。
  `sw.js` の `ASSETS` から `oaza.js` を外す最適化（遅延ロード・プリキャッシュからの除外）はしない。
- 容量・転送量の改善はプリキャッシュ対象を削るのではなく、install の耐性（部分失敗の許容）と
  読み込み順序で行う。
- この方針は README「計算は端末内で完結」と AGENTS.md の通信ポリシーと同格に扱う。
- `sw.js` の `CACHE = 'skypwa-vN'` は全変更で上げる（現在の世代は `sw.js` 先頭の値を参照。
  ドキュメントに数字を固定しない——すぐ古くなるため）。
- Service Worker は `/sw.js` を no-cache で返す（`_headers`）。
- デプロイは Cloudflare Pages（Git 連携）。`main` への直接 push は禁止——
  **branch → PR → プレビュー URL で確認 → ユーザー OK → squash merge → 本番**。
  手順の詳細は `DEPLOY.md`。`main` はブランチ保護（PR 必須・承認数 0・直接 push 禁止）。
- ローカル確認: `python3 -m http.server 8000`。

### タイムライン追加

- `dayEvents()` の `windowEvents` に `{ time, label, cls }` を追加し、時刻順ソート。
  既存の `renderTimeline()` が描画。
- 新時刻（2回あり得る場合は2行表示、例: 月の南中は 24.8h 周期で窓長により 1〜2 回）。

## 開発ワークフロー

- 作業は `<type>/<short-desc>` ブランチ（例: `feat/...`, `fix/...`, `docs/...`）で行い、PR を作る。
- PR ごとに Cloudflare Pages がプレビュー専用デプロイを自動発行する
  （`preview_deployment_setting = "all"`、URL は PR コメントにも貼られる）。
- **ステージURL は PR 本文の「ステージURL」に貼る**。PR 作成直後は未発行のため、
  デプロイ成功と 200 を確認した後に `gh pr edit <番号> --body-file <本文>` で
  本文を更新して実 URL を記入し、`gh pr view` で確認する（手順は `DEPLOY.md`）。
- **マージはユーザーの OK が出た場合のみ**実行する（先行マージ禁止）。
  リポジトリは squash merge のみ可（`gh pr merge <n> --squash --delete-branch`）。
- マージで `main` が進むと本番デプロイが自動発行される。push / merge 成功だけでなく
  本番 URL と `sw.js` の新バージョンを `curl` で確認する。
- 手順の正本は `DEPLOY.md`。

## 検証

- `npm run check`（`node --check` 群）
- `npm test`（`node --test`、依存ゼロ。CI で自動実行。詳細は `.agents/skills/koyomi-naut/references/testing.md`）
- `npm run verify-dom`（`scripts/verify-dom.py`）
- Node での数値テストは `require('./astro.js')`（`module.exports` あり）。
- ラベル表示（四大相）は月齢±0.5 日ではなく黄経差の交差時刻で判定。

## 参照

- 本番: https://koyomi-naut.st-albireo.net/
- リポジトリ: https://github.com/denebola213/koyomi-naut（PR 経由で本番公開。`main` 直接 push 禁止）
