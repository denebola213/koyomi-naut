"use strict";
/* app.js の表示整形ヘルパーを DOM なしで検証する。
 * dayKeyOf は「翌」表示の判定に使う日付キー（#29）。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const astro = require('../astro.js');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} が見つからない`);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error(`${name} の終端が見つからない`);
}

function loadDayKeyOf() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${extractFunction(appSrc, 'dayKeyOf')}\n;globalThis.dayKeyOf = dayKeyOf;`, sandbox, { filename: 'app.js' });
  return sandbox.dayKeyOf;
}

test('dayKeyOf: YYYY-MM-DD をゼロ埋めで返す', () => {
  const dayKeyOf = loadDayKeyOf();
  assert.equal(dayKeyOf(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
  assert.equal(dayKeyOf(new Date(2026, 10, 30, 23, 59)), '2026-11-30');
  assert.equal(dayKeyOf(new Date(2026, 11, 1, 4, 20)), '2026-12-01');
});

test('dayKeyOf: 月跨ぎ・年跨ぎでも翌日判定が成立する (#29)', () => {
  const dayKeyOf = loadDayKeyOf();
  // 月末 23:xx と翌月1日 04:xx は「日の数字」では 30 vs 1 だが、
  // 11/1 と 12/1 のように日の数字が同じでも別日になるケースを文字列比較で正しく扱う
  assert.notEqual(dayKeyOf(new Date(2026, 10, 1, 12)), dayKeyOf(new Date(2026, 11, 1, 12)));
  assert.notEqual(dayKeyOf(new Date(2026, 11, 31, 23)), dayKeyOf(new Date(2027, 0, 1, 4)));
  // 同じ日なら一致（＝「翌」を付けない）
  assert.equal(dayKeyOf(new Date(2026, 10, 30, 0, 5)), dayKeyOf(new Date(2026, 10, 30, 23, 55)));
});

test('翌日判定: 2026-11-30 の出没窓は 12/1 のイベントだけを「翌」にする (#29)', () => {
  const dayKeyOf = loadDayKeyOf();
  const ev = astro.dayEvents(35.6812, 139.7671, '2026-11-30');
  const items = ev.windowEvents.filter(e => e.time);
  assert.ok(items.length > 3, `イベント数=${items.length}`);
  const nextDay = items.filter(e => dayKeyOf(e.time) !== '2026-11-30');
  assert.ok(nextDay.length > 0, '12/1 のイベントが窓に含まれていない');
  for (const e of nextDay) {
    assert.equal(dayKeyOf(e.time), '2026-12-01', `窓が翌日以外に伸びている: ${dayKeyOf(e.time)}`);
  }
  // 旧実装（日の数値比較）は 12/1 の日の出を「翌」にできたが、
  // 11/1 と 12/1 を区別できなかった。文字列比較では日付が一意になる。
  assert.ok(items.some(e => dayKeyOf(e.time) === '2026-11-30'), '当日のイベントが無い');
});

test('fmtTime: 時刻のみを返す（死んだ翌日式が復活していない） (#29)', () => {
  assert.equal(astro.fmtTime(new Date(2026, 11, 1, 4, 20)), '04:20');
  assert.equal(astro.fmtTime(new Date(2026, 10, 30, 23, 5)), '23:05');
  assert.equal(astro.fmtTime(null), '—');
});
