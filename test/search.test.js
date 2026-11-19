"use strict";
/* app.js の searchPlaces を DOMなしで検証する。
 * app.js 全体は document に依存するので、関数だけを抽出して vm で評価するを
 * municipalities.js (実データ) と接続して使う。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} が見つからない`);
  let depth = 0, i = src.indexOf('{', start), j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${name} の終端が見つからない`);
}

function loadSearchPlaces() {
  const muniSrc = fs.readFileSync(path.join(root, 'municipalities.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const fn = extractFunction(appSrc, 'searchPlaces');
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // municipalities.js は const MUNICIPALITIES = [...] なので、後に参照できるよう公開する
  vm.runInContext(`${muniSrc}\n;globalThis.MUNICIPALITIES = MUNICIPALITIES;`, sandbox, { filename: 'municipalities.js' });
  vm.runInContext(`${fn}\n;globalThis.searchPlaces = searchPlaces;`, sandbox, { filename: 'app.js' });
  return sandbox.searchPlaces;
}

test('searchPlaces: 空クエリは空配列を返す', () => {
  const s = loadSearchPlaces();
  // vm 隔離コンテキストの配列は別 realm なので length で判定する
  assert.equal(s('').length, 0);
  assert.equal(s('   ').length, 0);
});

test('searchPlaces: 漢字で市町村を検索できる', () => {
  const s = loadSearchPlaces();
  const r = s('千代田区');
  assert.ok(r.length >= 1);
  assert.ok(r.some(x => x.label.includes('千代田区')));
  for (const x of r) {
    assert.ok(typeof x.lat === 'number' && x.lat >= -90 && x.lat <= 90);
    assert.ok(typeof x.lon === 'number' && x.lon >= -180 && x.lon <= 180);
    assert.ok(typeof x.label === 'string' && x.label.length > 0);
  }
});

test('searchPlaces: ひらがな・カタカナでも検索できる', () => {
  const s = loadSearchPlaces();
  assert.ok(s('ちよだく').length >= 1);
  assert.ok(s('チヨダク').length >= 1, 'カタカナ入力がひらがなに正規化されてヒットしない');
});

test('searchPlaces: 前方一致が部分一致より先に返る', () => {
  const s = loadSearchPlaces();
  // 「大阪市」は前方一致、「大阪市…」以外の部分一致より先に出る
  const r = s('大阪市');
  assert.ok(r.length >= 1);
  assert.ok(r[0].label.includes('大阪市'));
});

test('searchPlaces: 存在しない地名は空配列を返す', () => {
  const s = loadSearchPlaces();
  assert.equal(s('存在しない地名zzzqqq').length, 0);
});

test('searchPlaces: 結果は最大30件', () => {
  const s = loadSearchPlaces();
  const r = s('市');
  assert.ok(r.length <= 30);
  assert.ok(r.length > 0);
});
