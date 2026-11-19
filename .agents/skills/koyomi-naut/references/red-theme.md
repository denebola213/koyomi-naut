# 赤色テーマ（夜間の天体観測用）

夜間の天体観測で目に優しい赤系テーマ。`html` 要素の `data-theme` で切り替える。
タイムラインアイコンの色分けは `timeline-icon.md`、ゾーン構造は `ui-structure.md` 参照。

## 実装

- 切替ボタン `themeToggle` はヘッダー（`.top`）に置く。結果ゾーンに置くと
  `scripts/verify-dom.py` が「結果ゾーンに入力控件が漏れている」と検出する。
- 実装は `<html data-theme="red">` + `localStorage 'skypwa-theme'`。
  `index.html` の `<head>` に先行適用する小スクリプトを入れてフラッシュを防ぎ、
  `app.js` の `init()` でボタン状態を同期、切替時に `render()` で Canvas を描き直す。
- `applyTheme()` で `meta theme-color`（赤時 `#0f0202`）も切り替える。

## パレット

`:root[data-theme="red"]`:

| 変数 | 値 |
|---|---|
| `--paper` | `#0f0202` |
| `--ink` | `#ffd7d7` |
| `--dim` | `#d98c8c` |
| `--line` | `#5f1f1f` |
| `--accent` | `#ff4d4d` |
| `--sun` | `#ff8a66` |
| `--moon` | `#ffb3b3` |
| `--astro` | `#ff6b6b` |

- `color-scheme: dark`。
- 対 `#0f0202` のコントラストは本文 15.5／補助文 7.9／accent 6.2（WCAG 4.5 以上を確認済み）。
- 太陽＝実線、月＝破線を維持して赤同士でも区別する。

## Canvas

- 色は `drawMoonPhase()` / `drawTrajectory()` で赤テーマ分岐を追加する
  （`isRedTheme()` で判定。OS ダーク判定 `matchMedia` のみに頼ると赤テーマで通常色が残る）。
