# テスト（単体テストとCI）

`AGENTS.md` の検証節から切り出した詳細。普段の開発では `AGENTS.md` の3コマンド
（`npm run check` / `npm test` / `npm run verify-dom`）だけ押さえればよく、
この文書はテストを新規追加・変更するときに読む。

## 構成

- 依存ゼロ：Node 標準の `node:test` + `node:assert`。`npm install` 不要。
- 実行: `npm test`（= `node --test`。`node --test test/` の trailing slash 付きは
  モジュール解決で落ちるので使わない）。
- CI: `.github/workflows/test.yml` が `npm run check` / `npm test` /
  `npm run verify-dom` を自動実行。`TZ=Asia/Tokyo` 固定。
- `dayEvents()` 等はローカル時刻で走査するため、期待値は `TZ=Asia/Tokyo` で
  確認すること（CI も TZ 固定）。

## テストファイル一覧

| ファイル | 対象 | 主な網 |
|---|---|---|
| `test/astro.test.js` | `astro.js` | 出没・薄明・南中・軌道・月齢・四大相・表示用 |
| `test/planets.test.js` | `planets.js` | 惑星位置の有限性・黄経範囲 |
| `test/search.test.js` | `app.js` の `searchPlaces` | 漢字/かな/カタカナ、前方一致優先、上限30件 |
| `test/assets.test.js` | `sw.js` / `index.html` / `municipalities.js` | ASSETS 実在・参照一致・データ形状 |

## 判定の考え方

- 低精度 Meeus のため時刻は厳密一致でなく許容誤差で判定する
  （東京・春分/夏至/冬至の日の出・日の入りは ±4 分、昼の長さは ±10 分等）。
  厳密化しすぎないこと。
- 四大相ラベルは月齢ではなく黄経差の交差時刻で判定する
  （`moonPhaseName` / `quarterCrossing`）。
- 極昼・極夜（北極付近6月）では日の出/日の入りが `null` になるのが正。
  例外にならないことだけ見る。

## テストを書くときの注意

- `planets.js` は `astro.js` の `julianDay` / `altAz` 等に依存するので、
  同一 vm コンテキストで astro.js と連結して評価する。
- `app.js` 全体は DOM に依存するので、`searchPlaces` のような関数だけを
  抽出して vm で評価し、実データ `municipalities.js` と接続する。
- vm 隔離コンテキストから返った配列は別 realm なので `assert.deepEqual` でなく
  `length` / `join` で比較すること。
- 新しい JS ファイルを追加したら `npm run check`（`package.json` の `check`）の
  対象に足すこと。

## 運用

- テスト追加・変更時は `npm test` と `npm run verify-dom` を通すこと。
- 既存の `verify-dom.py` と併用する（ID一致・入力/結果ゾーン漏れ）。
- 数値の突き合わせは必要に応じて `require('./astro.js')` で直接確認してもよい
  （`module.exports` あり）。
