"use strict";
/* 地名候補リストの ARIA 構造とキーボード操作（#25）を DOM スタブで検証する。 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function sliceBlock(startMarker, endMarker) {
  const start = appSrc.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} が見つからない`);
  const end = appSrc.indexOf(endMarker, start);
  assert.ok(end > start, `${endMarker} が見つからない`);
  return appSrc.slice(start, end);
}

function makeEl(tag) {
  let html = '';
  return {
    tagName: tag, id: '', className: '', textContent: '', hidden: false,
    children: [], attrs: {}, dataset: {}, focused: false, scrolled: false,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { (this.events = this.events || {})[type] = fn; },
    scrollIntoView() { this.scrolled = true; },
    focus() { this.focused = true; },
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; if (v === '') this.children.length = 0; },
  };
}

function load() {
  const list = makeEl('div'), box = makeEl('input'), note = makeEl('p'), status = makeEl('p');
  const ids = { placeResults: list, placeSearch: box, placeSearchNote: note, placeStatus: status };
  let picked = null;
  const sandbox = {
    console,
    document: { createElement: t => makeEl(t), activeElement: box },
    setPlace: (lat, lon, label) => { picked = { lat, lon, label }; },
    $: id => ids[id] || null,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const block = sliceBlock('/* ---------- 地名候補リスト', 'function placeKeydown(e) {')
    + sliceBlock('function placeKeydown(e) {', '\nfunction '); // placeKeydown 本体を含める
  vm.runInContext(block + `
    ;globalThis.renderPlaceResults = renderPlaceResults;
    globalThis.setPlaceActive = setPlaceActive;
    globalThis.selectPlaceResult = selectPlaceResult;
    globalThis.placeKeydown = placeKeydown;
    globalThis.__state = () => ({ count: placeResults.length, active: placeActive });
  `, sandbox, { filename: 'app.js' });
  return { sb: sandbox, list, box, note, status, picked: () => picked };
}

const RES = [
  { label: '東京都 千代田区', sub: 'ちよだく', lat: 35.69, lon: 139.75 },
  { label: '東京都 千代田', sub: 'ちよだ', lat: 35.68, lon: 139.76 },
  { label: '東京都 千代田区 霞が関', sub: 'かすみがせき', lat: 35.67, lon: 139.75 },
];

test('renderPlaceResults: 候補は div[role=option]、listbox の子として正しい (#25)', () => {
  const { sb, list, box } = load();
  sb.renderPlaceResults(RES);
  assert.equal(list.children.length, 3);
  for (const [i, o] of list.children.entries()) {
    assert.equal(o.tagName, 'div', 'button のままだと listbox の子として不正');
    assert.equal(o.getAttribute('role'), 'option');
    assert.equal(o.getAttribute('aria-selected'), 'false');
    assert.equal(o.id, `place-opt-${i}`);
    assert.equal(o.textContent, `${RES[i].label}（${RES[i].sub}）`);
  }
  assert.equal(box.getAttribute('aria-expanded'), 'true');
  assert.equal(box.getAttribute('aria-activedescendant'), undefined);
});

test('renderPlaceResults: 空にすると閉じ、live region も空になる (#25)', () => {
  const { sb, list, box, status } = load();
  sb.renderPlaceResults(RES);
  assert.equal(status.textContent, '地名の候補 3 件');
  sb.renderPlaceResults([]);
  assert.equal(list.children.length, 0);
  assert.equal(box.getAttribute('aria-expanded'), 'false');
  assert.equal(status.textContent, '');
});

test('placeKeydown: ↓↑ で aria-activedescendant が移動し、Enter で決定する (#25)', () => {
  const { sb, list, box, picked } = load();
  sb.renderPlaceResults(RES);
  const ev = key => ({ key, prevented: false, preventDefault() { this.prevented = true; } });

  let e = ev('ArrowDown');
  sb.placeKeydown(e);
  assert.equal(box.getAttribute('aria-activedescendant'), 'place-opt-0');
  assert.equal(list.children[0].getAttribute('aria-selected'), 'true');
  assert.ok(e.prevented, '既定のスクロールを抑止していない');

  sb.placeKeydown(ev('ArrowDown'));
  assert.equal(box.getAttribute('aria-activedescendant'), 'place-opt-1');
  assert.equal(list.children[1].getAttribute('aria-selected'), 'true');
  assert.equal(list.children[0].getAttribute('aria-selected'), 'false');

  // 末尾で止まる（はみ出さない）
  sb.placeKeydown(ev('ArrowDown'));
  sb.placeKeydown(ev('ArrowDown'));
  sb.placeKeydown(ev('ArrowDown'));
  assert.equal(box.getAttribute('aria-activedescendant'), 'place-opt-2');

  // ↑ で戻る。先頭で止まる
  sb.placeKeydown(ev('ArrowUp'));
  assert.equal(box.getAttribute('aria-activedescendant'), 'place-opt-1');
  sb.placeKeydown(ev('ArrowUp'));
  sb.placeKeydown(ev('ArrowUp'));
  assert.equal(box.getAttribute('aria-activedescendant'), 'place-opt-0');

  e = ev('Enter');
  sb.placeKeydown(e);
  assert.ok(e.prevented);
  const p = picked();
  assert.deepEqual({ ...p }, { lat: RES[0].lat, lon: RES[0].lon, label: RES[0].label });
});

test('選択後: 入力欄にフォーカスが戻り、候補は閉じる（body に落ちない） (#25)', () => {
  const { sb, list, box } = load();
  sb.renderPlaceResults(RES);
  sb.setPlaceActive(2);
  sb.selectPlaceResult(2);
  assert.ok(box.focused, '入力欄にフォーカスが戻っていない');
  assert.equal(box.value, '');
  assert.equal(list.children.length, 0);
  assert.equal(box.getAttribute('aria-expanded'), 'false');
});

test('placeKeydown: Escape で候補を閉じ、候補が無いときの矢印キーは何もしない (#25)', () => {
  const { sb, list, box } = load();
  sb.renderPlaceResults(RES);
  sb.setPlaceActive(1);
  const e = { key: 'Escape', prevented: false, preventDefault() { this.prevented = true; } };
  sb.placeKeydown(e);
  assert.ok(e.prevented);
  assert.equal(list.children.length, 0);
  assert.equal(box.getAttribute('aria-expanded'), 'false');

  // 候補ゼロのときは ArrowDown で例外を出さず、preventDefault もしない
  const e2 = { key: 'ArrowDown', prevented: false, preventDefault() { this.prevented = true; } };
  sb.placeKeydown(e2);
  assert.equal(e2.prevented, false);
  assert.equal(sb.__state().active, -1);
});

test('候補の mousedown は既定動作を止める（フォーカスを奪わない） (#25)', () => {
  const { sb, list } = load();
  sb.renderPlaceResults(RES);
  const e = { prevented: false, preventDefault() { this.prevented = true; } };
  list.children[0].events.mousedown(e);
  assert.ok(e.prevented);
});

test('runSearch: 読込中は候補ではなく注記に出す（listbox の子を option 以外にしない） (#25)', () => {
  const start = appSrc.indexOf('function runSearch()');
  assert.ok(start >= 0);
  const segment = appSrc.slice(start, start + 900);
  assert.ok(segment.includes("renderPlaceResults([], '大字・小字データを読込中"), '読込中を注記側に出していない');
  assert.ok(!segment.includes('list.appendChild'), 'listbox に p 要素を足している');
  assert.ok(segment.indexOf('searchPlaces(q)') > segment.indexOf('読込中'), '読込中の return より後に検索が無い');
});
