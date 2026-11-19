// Geolonia 住所データ (CC BY 4.0) から oaza.js を生成する。
//
// 実行時の通信は発生しない: ビルド時に一度だけ latest.csv を取得し、
// 同一オリジンの静的ファイル oaza.js として同梱する。
// 更新手順: node scripts/build-oaza.mjs
//
// 使い方:
//   node scripts/build-oaza.mjs [--src <local latest.csv>] [--out oaza.js]
//   --src を省略すると SRC_URL からダウンロードする。
import { readFileSync, writeFileSync } from "node:fs";

const SRC_URL = "https://geolonia.github.io/japanese-addresses/latest.csv";

const HEADER = `/* 大字・町丁目＋小字（字）データ: Geolonia 住所データ (CC BY 4.0)
 * 元データ: 国土交通省「大字・町丁目レベル位置参照情報」等を基に
 * Geolonia が毎月更新 (https://github.com/geolonia/japanese-addresses)
 * 緯度経度は大字・町丁目の代表点。小字（字）ごとの座標ではない。
 * 再生成: node scripts/build-oaza.mjs
 */
`;

// カタカナ（ァ-ヶ）→ ひらがな。既存 municipalities.js の表記に合わせる
function toHiragana(s) {
  return [...s].map((c) => {
    const code = c.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : c;
  }).join("");
}

// 引用符対応の簡易 CSV パーサー（Geolonia latest.csv 用）。オブジェクト配列を返す。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : def;
  };
  const src = opt("--src", null);
  const out = opt("--out", "oaza.js");

  let csvText;
  if (src) {
    csvText = readFileSync(src, "utf-8");
  } else {
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
    csvText = await res.text();
  }

  const rows = parseCsv(csvText);

  const cities = [];
  const cityIndex = new Map();
  const entries = [];
  for (const r of rows) {
    const oaza = (r["大字町丁目名"] || "").trim();
    const latS = (r["緯度"] || "").trim();
    const lonS = (r["経度"] || "").trim();
    if (!oaza || !latS || !lonS) continue;
    const key = `${r["都道府県名"]}\0${r["市区町村名"]}`;
    if (!cityIndex.has(key)) {
      cityIndex.set(key, cities.length);
      cities.push([r["都道府県名"], r["市区町村名"], toHiragana(r["市区町村名カナ"])]);
    }
    entries.push([
      cityIndex.get(key),
      oaza,
      toHiragana(r["大字町丁目名カナ"]),
      (r["小字・通称名"] || "").trim(),
      Math.round(Number(latS) * 10000) / 10000,
      Math.round(Number(lonS) * 10000) / 10000,
    ]);
  }

  writeFileSync(out, HEADER + "const OAZA_CITIES = " + JSON.stringify(cities) + ";\nconst OAZA = " + JSON.stringify(entries) + ";\n", "utf-8");
  console.log(`${out}: cities=${cities.length} entries=${entries.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
