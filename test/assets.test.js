"use strict";
/* オフライン PWA の完全性テスト:
 * - sw.js の ASSETS にあるファイルが実在すること (初回キャッシュ漏れ検出)
 * - index.html の <script src> が ASSETS に含まれていること
 * - municipalities.js の行形状が妥当であること */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

function swAssets() {
  const sw = read('sw.js');
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js に ASSETS が見つからない');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('sw.js: ASSETS の全ファイルが実在する', () => {
  const assets = swAssets();
  assert.ok(assets.length >= 10, `ASSETS 数=${assets.length}`);
  for (const a of assets) {
    if (a === './') continue;
    assert.ok(fs.existsSync(path.join(root, a)), `ASSETS にあるが実在しない: ${a}`);
  }
});

test('sw.js: CACHE バージョンが skypwa-vN 形式', () => {
  const sw = read('sw.js');
  assert.match(sw, /const CACHE = 'skypwa-v\d+';/);
});

test('index.html: 参照する JS は ASSETS に含まれている', () => {
  const html = read('index.html');
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 5, `script 数=${srcs.length}`);
  const assets = swAssets();
  for (const s of srcs) {
    assert.ok(assets.includes(s), `index.html の ${s} が ASSETS に無い`);
  }
});

test('municipalities.js: 全行が [pref, city, kana, lat, lon] 形状で座標範囲内', () => {
  const src = read('municipalities.js');
  const m = src.match(/const MUNICIPALITIES = (\[[\s\S]*\]);/);
  assert.ok(m, 'MUNICIPALITIES が見つからない');
  const data = JSON.parse(m[1]);
  assert.ok(data.length >= 1500, `件数=${data.length}`);
  for (const row of data) {
    assert.ok(Array.isArray(row) && row.length === 5, `行形状: ${JSON.stringify(row)}`);
    const [pref, city, kana, lat, lon] = row;
    assert.ok(typeof pref === 'string' && pref.length > 0);
    assert.ok(typeof city === 'string' && city.length > 0);
    assert.ok(typeof kana === 'string' && kana.length > 0);
    assert.ok(lat >= -90 && lat <= 90, `lat=${lat} (${pref} ${city})`);
    assert.ok(lon >= -180 && lon <= 180, `lon=${lon} (${pref} ${city})`);
  }
  // 千代田区が含まれ、東京都の代表点として妥当な範囲にある
  const chiyoda = data.find(r => r[1] === '千代田区');
  assert.ok(chiyoda, '千代田区が無い');
  assert.ok(chiyoda[3] > 35 && chiyoda[3] < 36 && chiyoda[4] > 139 && chiyoda[4] < 140);
});
