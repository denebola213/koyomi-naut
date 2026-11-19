"use strict";
/* planets.js 単体テスト。planets.js は astro.js の julianDay/altAz 等に依存するため
 * astro.js と連結して同一 vm コンテキストで評価する。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');

function loadPlanets() {
  const astroSrc = fs.readFileSync(path.join(root, 'astro.js'), 'utf8');
  const planetsSrc = fs.readFileSync(path.join(root, 'planets.js'), 'utf8');
  const sandbox = { console, module: { exports: {} }, exports: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(astroSrc, sandbox, { filename: 'astro.js' });
  vm.runInContext(planetsSrc, sandbox, { filename: 'planets.js' });
  return sandbox.module.exports;
}

test('planets: 水星〜土星の5惑星を返す', () => {
  const p = loadPlanets();
  assert.equal(p.PLANETS.length, 5);
  // vm 隔離コンテキストの配列は別 realm なので deepEqual ではなく join で比較する
  assert.equal(p.PLANETS.map(x => x.name).join(','), '水星,金星,火星,木星,土星');
});

test('planetEcliptic/planetAltAz: 存在しない惑星は null', () => {
  const p = loadPlanets();
  const t = new Date(2026, 0, 1, 12, 0, 0);
  assert.equal(p.planetEcliptic('冥王星', t), null);
  assert.equal(p.planetAltAz('冥王星', t, 35.68, 139.76), null);
});

test('planetsAltAz: 全惑星が有限の数値を返す', () => {
  const p = loadPlanets();
  const t = new Date(2026, 5, 21, 21, 0, 0); // 東京の夜
  const all = p.planetsAltAz(t, 35.6812, 139.7671);
  assert.equal(all.length, 5);
  for (const item of all) {
    assert.ok(typeof item.name === 'string' && item.name.length > 0);
    assert.ok(item.dist > 0 && item.dist < 60, `${item.name} dist=${item.dist}`);
    assert.ok(item.alt >= -90 && item.alt <= 90);
    assert.ok(item.az >= 0 && item.az < 360);
    assert.ok(item.ra >= 0 && item.ra < 360, `${item.name} ra=${item.ra}`);
    assert.ok(item.dec >= -90 && item.dec <= 90);
    const g = p.planetEcliptic(item.name, t);
    assert.ok(g.lon >= 0 && g.lon < 360 && g.lat >= -90 && g.lat <= 90);
  }
});

test('keplerEcliptic: 有限の直交座標を返す', () => {
  const p = loadPlanets();
  const T = 0.26; // 2026年頃
  for (const el of p.PLANETS) {
    const v = p.keplerEcliptic(el, T);
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), el.name);
    const r = Math.hypot(v.x, v.y, v.z);
    assert.ok(Math.abs(r - el.a) / el.a < 0.25, `${el.name} r=${r} a=${el.a}`);
  }
});
