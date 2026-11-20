"use strict";
/* 地名検索の索引実装（#22）が、素朴な全走査と完全に同じ結果を返すことを検証する。
 * 参照実装（naiveSearchPlaces）をテスト側に持ち、優先順位・並び順・30件上限を固定する。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function sliceFrom(src, marker) {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${marker} が見つからない`);
  const i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${marker} の終端が見つからない`);
}

function loadApp(withOaza) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'municipalities.js'), 'utf8') + '\n;globalThis.MUNICIPALITIES = MUNICIPALITIES;', sandbox, { filename: 'municipalities.js' });
  if (withOaza) {
    vm.runInContext(fs.readFileSync(path.join(root, 'oaza.js'), 'utf8') + '\n;globalThis.OAZA = OAZA; globalThis.OAZA_CITIES = OAZA_CITIES;', sandbox, { filename: 'oaza.js' });
  }
  const blockStart = appSrc.indexOf('/* 地名検索の索引');
  assert.ok(blockStart >= 0, '索引ブロックが見つからない');
  const fnStart = appSrc.indexOf('function searchPlaces(rawQ)');
  assert.ok(fnStart > blockStart, 'searchPlaces が見つからない');
  const block = appSrc.slice(blockStart, fnStart) + sliceFrom(appSrc.slice(fnStart), 'function searchPlaces(rawQ)');
  vm.runInContext(block + '\n;globalThis.searchPlaces = searchPlaces;', sandbox, { filename: 'app.js' });
  return sandbox;
}

/* 参照実装: 索引を使わない全走査（#22 以前の実装と同じ判定順序） */
function naiveSearch(MUNICIPALITIES, OAZA, OAZA_CITIES, rawQ) {
  const q = rawQ.trim();
  if (!q) return [];
  const qK = q.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const buckets = [[], [], []];
  const push = (b, item) => { if (buckets[b].length < 30) buckets[b].push(item); };
  const classify = (name, kana, full, fullK) => {
    if (name.startsWith(q) || kana.startsWith(qK)) return 0;
    if (full.startsWith(q) || fullK.startsWith(qK)) return 1;
    if (full.includes(q) || fullK.includes(qK)) return 2;
    return -1;
  };
  for (const [pref, city, kana, lat, lon] of MUNICIPALITIES) {
    const b = classify(city, kana, pref + ' ' + city, pref + ' ' + kana);
    if (b >= 0) push(b, { label: `${pref} ${city}`, sub: kana, lat, lon });
  }
  if (OAZA && OAZA_CITIES) {
    for (const [ci, oaza, kana, koaza, lat, lon] of OAZA) {
      const [pref, city, cityKana] = OAZA_CITIES[ci];
      const rest = oaza + (koaza ? ' ' + koaza : '');
      const full = `${pref} ${city} ${rest}`;
      const b = classify(rest, kana, full, `${cityKana} ${kana}`);
      if (b >= 0) push(b, { label: full, sub: kana, lat, lon });
    }
  }
  return buckets[0].concat(buckets[1], buckets[2]).slice(0, 30);
}

const key = r => r.map(x => `${x.label}|${x.sub}|${x.lat}|${x.lon}`).join('\n');

const QUERIES = [
  '東京', '千代田', 'ちよだ', 'チヨダ', 'あさひ', 'アサヒ', '旭ケ丘', '一丁目', '市', '区',
  'あ', 'か', 'ケ', 'ヶ', 'が', '札幌', 'さっぽろ', '横浜市', '大阪', 'なごや', '新町',
  '本町', '存在しない地名', '123', '北海道', '京都市', '中之島', '中ノ島', '西新宿', '六本木',
];

test('searchPlaces: 索引実装が全走査の結果と完全に一致する（大字あり） (#22)', () => {
  const sb = loadApp(true);
  const M = vm.runInContext('MUNICIPALITIES', sb);
  const O = vm.runInContext('OAZA', sb);
  const C = vm.runInContext('OAZA_CITIES', sb);
  // 実データから先頭2・3文字のクエリも足す（前方一致・部分一致の境界を広く踏む）
  const extra = [];
  for (let i = 0; i < O.length; i += 29971) {
    extra.push(O[i][1].slice(0, 2), O[i][1].slice(0, 3), O[i][2].slice(0, 2), C[O[i][0]][1].slice(0, 2));
  }
  const queries = QUERIES.concat(extra);
  for (const q of queries) {
    const got = key(sb.searchPlaces(q));
    const want = key(naiveSearch(M, O, C, q));
    assert.equal(got, want, `q=${JSON.stringify(q)}`);
  }
});

test('searchPlaces: 大字データ未ロードでも市町村のみで一致する (#22)', () => {
  const sb = loadApp(false);
  const M = vm.runInContext('MUNICIPALITIES', sb);
  for (const q of QUERIES) {
    assert.equal(key(sb.searchPlaces(q)), key(naiveSearch(M, null, null, q)), `q=${JSON.stringify(q)}`);
  }
});

test('searchPlaces: 大字データが後から来たら索引を作り直す (#22)', () => {
  const sb = loadApp(false);
  const before = sb.searchPlaces('旭ケ丘');
  assert.ok(!before.some(r => r.label.includes('旭ケ丘一丁目')), '大字なしで大字の行が出ている');
  const src = fs.readFileSync(path.join(root, 'oaza.js'), 'utf8');
  vm.runInContext(src + '\n;globalThis.OAZA = OAZA; globalThis.OAZA_CITIES = OAZA_CITIES;', sb, { filename: 'oaza.js' });
  const after = sb.searchPlaces('旭ケ丘');
  assert.ok(after.some(r => r.label.includes('旭ケ丘一丁目')), '索引が作り直されていない');
});
