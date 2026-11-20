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

function loadDrawMoonPhaseInto(dpr) {
  const sandbox = {
    console,
    isRedTheme: () => false,
    isDarkPair: () => false,
    SYNODIC: 29.530588853,
    window: { devicePixelRatio: dpr },
    Math,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${extractFunction(appSrc, 'drawMoonPhaseInto')}\n;globalThis.drawMoonPhaseInto = drawMoonPhaseInto;`, sandbox, { filename: 'app.js' });
  return sandbox.drawMoonPhaseInto;
}

function canvasStub() {
  const calls = { setTransform: [], clearRect: [] };
  const ctx = new Proxy({
    setTransform: (a, b, c, d, e, f) => calls.setTransform.push([a, b, c, d, e, f]),
    clearRect: (...a) => calls.clearRect.push(a),
  }, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: () => true,
  });
  const cv = { width: 0, height: 0, style: {}, getContext: () => ctx };
  return { cv, calls };
}

test('drawMoonPhaseInto: devicePixelRatio に応じて canvas を高解像度化する (#26)', () => {
  const draw = loadDrawMoonPhaseInto(2);
  const { cv, calls } = canvasStub();
  draw(cv, 14.7, 120);
  assert.equal(cv.width, 240, '大図 width が DPR 倍になっていない');
  assert.equal(cv.height, 240);
  assert.equal(cv.style.width, '120px', 'CSS サイズが変わっている');
  assert.deepEqual(calls.setTransform[0], [2, 0, 0, 2, 0, 0], '描画座標が CSS 画素に戻っていない');
  assert.deepEqual(calls.clearRect[0], [0, 0, 120, 120], 'clearRect が CSS 座標でない');
});

test('drawMoonPhaseInto: 月齢カレンダーの小図（24px）も DPR 対応する (#26)', () => {
  const draw = loadDrawMoonPhaseInto(2);
  const { cv } = canvasStub();
  draw(cv, 3.2, 24);
  assert.equal(cv.width, 48);
  assert.equal(cv.height, 48);
  assert.equal(cv.style.width, '24px', 'セル内のレイアウトサイズが 24px から変わっている');
});

test('drawMoonPhaseInto: DPR は 2 で頭打ち、1 なら等倍 (#26)', () => {
  const draw3 = loadDrawMoonPhaseInto(3);
  const a = canvasStub();
  draw3(a.cv, 20, 120);
  assert.equal(a.cv.width, 240, 'DPR 上限 2 が効いていない');
  assert.deepEqual(a.calls.setTransform[0], [2, 0, 0, 2, 0, 0]);

  const draw1 = loadDrawMoonPhaseInto(1);
  const b = canvasStub();
  draw1(b.cv, 20, 120);
  assert.equal(b.cv.width, 120);
  assert.deepEqual(b.calls.setTransform[0], [1, 0, 0, 1, 0, 0]);
});

