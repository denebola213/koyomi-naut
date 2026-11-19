# koyomi-naut

GPS または市町村・座標入力から、日の出・日の入り、月の出・月の入り、天文薄明、
南中、太陽と月の軌道を表示する、オフライン対応の静的 PWA。

- 本番: https://koyomi-naut.st-albireo.net/
- リポジトリ: https://github.com/denebola213/koyomi-naut

## Step 1（実装済み）

- GPS 取得、または市町村・大字・町丁目・小字（字）検索（漢字・かな）から緯度経度を `{度} {分} {秒}` 表示
- その座標と日付から日の出・日の入り、月の出・月の入り、天文薄明開始・終了を表示
- 太陽と月の南中時刻を表示
- 月齢（日数）と月相イメージ図を表示
- 太陽と月の軌道を方位×高度の図で表示

## Step 2（予定）

- 全天図の表示を時間指定可能に
- 水星・金星・火星・木星・土星の位置表示
- 88 星座の結びだけ表示、表示/非表示切り替え

## 使い方

1. 市町村・大字・町丁目・小字を検索して選択、または「GPS で取得」、または緯度・経度を手入力
2. 日付を選ぶ
3. 出没・薄明の時刻と軌道図が表示される（計算は端末内で完結、通信不要）

画面は「入力」（場所・日付の指定）と「結果」（確定した条件・出没・薄明・軌道）の
2ゾーンに分かれる。確定した条件（場所・緯度・経度・日付）は結果ゾーン先頭に自動表示される。

## 開発・配信

ビルド不要の静的サイト。リポジトリ直下をそのまま配信する。

### Cloudflare Pages（Terraform 管理）

- Pages プロジェクト: `koyomi-naut`
- Production branch: `main`（**PR 経由のみ**。`main` 直接 push 禁止）
- 開発ワークフロー: branch → PR → プレビュー URL で確認 → ユーザー OK →
  squash merge → 本番デプロイ（詳細は [`DEPLOY.md`](DEPLOY.md)）
- Build command: `exit 0`（ビルドなし）/ Build output directory: `/`（リポジトリ直下）
- 定義: [`terraform/pages.tf`](terraform/pages.tf) / 手順: [`DEPLOY.md`](DEPLOY.md)

`_headers` で Service Worker の `Cache-Control: no-cache` 等を設定済み。

### ローカル確認

```bash
python3 -m http.server 8000
# http://localhost:8000 を開く
```

Service Worker・PWA インストールは HTTPS（または localhost）でのみ有効。

## 計算について

- 太陽・月の位置は Meeus の低精度式（誤差 ~0.3° 程度）
- 出没・薄明は指定日のローカル時刻を走査し、地平交差を二分探索で求める
- 精密な観測計画には国立天文台等の暦情報で確認してください

## データ・ライセンス

- 市町村データ（`municipalities.js`）: [code4fukui/localgovjp](https://github.com/code4fukui/localgovjp)（CC BY）
- 大字・町丁目・小字データ（`oaza.js`）: [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses)（CC BY 4.0。国土交通省「大字・町丁目レベル位置参照情報」等を基に毎月更新）。緯度経度は大字・町丁目の代表点で、小字（字）ごとの座標ではない。データ更新は `node scripts/build-oaza.mjs`（ビルド時に一度だけ取得し、実行時通信なし）
- コード: MIT（`LICENSE` 参照）
