# 赤色テーマ（夜間の天体観測用）

夜間の天体観測で目に優しい赤系テーマ。`html` 要素の `data-theme` で切り替える。
タイムラインアイコンの色分けは `timeline-icon.md`、ゾーン構造は `ui-structure.md` 参照。

## 実装

- 切替ボタン `themeToggle` はヘッダー（`.top`）に置く。結果ゾーンに置くと
  `scripts/verify-dom.py` が「結果ゾーンに入力控件が漏れている」と検出する。
- 実装は `<html data-theme="red">` + `localStorage 'skypwa-theme'`。
  `index.html` の `<head>` に先行適用する小スクリプトを入れてフラッシュを防ぎ、
  `app.js` の `init()` でボタン状態を同期、切替時に `render()` で Canvas を描き直す。
- `applyTheme()` で `meta theme-color`（赤時 `#120202`／ダーク `#12100e`／ライト `#f4efe7`）も切り替える。

## パレット

`:root[data-theme="red"]`:

| 変数 | 値 |
|---|---|
| `--paper` | `#120202` |
| `--ink` | `#eec2c2` |
| `--dim` | `#c67f7f` |
| `--line` | `#5f1f1f` |
| `--accent` | `#de6b6b` |
| `--sun` | `#e07a5a` |
| `--moon` | `#d9a0a0` |
| `--astro` | `#d95f5f` |

- `color-scheme: dark`。
- 対 `#120202` のコントラストは本文 12.7／補助文 6.5／accent 6.2（WCAG 4.5 以上を確認済み）。
  accent は従来 `#ff4d4d`（HSL 彩度 100%）から `#de6b6b`（彩度 64%）へくすませ、
  `--sun`（彩度 68%）・`--astro`（彩度 62%）と揃えた。明度は従来通りでコントラストは不変。
- 全テーマ共通で「地を落として眩しさを下げる」方針（前景の濃さを変えず地を暗く／くすませる）。
  ライト地 `#f4efe7`、ダーク地 `#12100e`（暖かみのある黒）。canvas 描画色も `styles.css` の
  変数値に合わせてくすませてある（特に月相の照部・天の川の alpha を下げる）。
- チェックボックスと時刻スライダーは `accent-color` に頼らずパレット変数で全面カスタムする
  （`accent-color` だけだと Firefox でスライダー未選択側が白・つまみが灰色、チェック未選択が
  灰色・記号が白のままになり、配色全体が適用されたようには見えない）。チェック記号は地色
  （`--paper`）で、赤／ダークでも白く眩しくしない。スライダーの WebKit 選択側は
  `--range-fill`（`paintTimeSlider()` が値から設定）を `linear-gradient` で塗る。
- 太陽＝実線、月＝破線を維持して赤同士でも区別する。

## Canvas

- 色は `drawMoonPhase()` / `drawTrajectory()` で赤テーマ分岐を追加する
  （`isRedTheme()` で判定。OS ダーク判定 `matchMedia` のみに頼ると赤テーマで通常色が残る）。
