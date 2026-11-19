"use strict";
/* Sky PWA step1: 場所・日付 → 緯度経度(DMS) / 出没・薄明 / 太陽・月軌道図 */

const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const state = { lat: 35.6812, lon: 139.7671, place: '東京都 千代田区（既定）', date: '', skyOffsetMin: 180, view: 'events', showPlanets: true, showConstellations: true };
const isRedTheme = () => document.documentElement.dataset.theme === 'red';
const isDarkPair = () => isRedTheme() || matchMedia('(prefers-color-scheme: dark)').matches;

const THEME_KEY = 'skypwa-theme';
function applyTheme(red) {
  document.documentElement.dataset.theme = red ? 'red' : '';
  const toggle = $('themeToggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', red ? 'true' : 'false');
    toggle.textContent = red ? '通常テーマ' : '赤色テーマ';
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = red ? '#0f0202' : '#0b1020';
  try { localStorage.setItem(THEME_KEY, red ? 'red' : 'default'); } catch (e) {}
}

function todayStr() {
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/* ---------- 場所 ---------- */
function setPlace(lat, lon, label) {
  state.lat = lat; state.lon = lon; state.place = label;
  $('latInput').value = lat.toFixed(4);
  $('lonInput').value = lon.toFixed(4);
  $('placeLabel').textContent = label;
  save();
  render();
}
function save() {
  try { localStorage.setItem('skypwa-v1', JSON.stringify({ lat: state.lat, lon: state.lon, place: state.place, date: state.date, skyOffsetMin: state.skyOffsetMin, view: state.view, showPlanets: state.showPlanets, showConstellations: state.showConstellations })); } catch (e) {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('skypwa-v1') || 'null');
    if (s && typeof s.lat === 'number') {
      state.lat = s.lat; state.lon = s.lon; state.place = s.place || ''; state.date = s.date || '';
      if (typeof s.skyOffsetMin === 'number') state.skyOffsetMin = Math.max(-1080, Math.min(1080, s.skyOffsetMin));
      else if (typeof s.time === 'string' && /^\d{2}:\d{2}$/.test(s.time)) {
        // 旧形式（時刻文字列 21:00 等）からの移行: 指定日18時からのオフセットに変換
        const off = (Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3))) - 1080;
        if (off >= -1080 && off <= 1080) state.skyOffsetMin = off;
      }
      if (s.view === 'sky' || s.view === 'events') state.view = s.view;
      if (typeof s.showPlanets === 'boolean') state.showPlanets = s.showPlanets;
      if (typeof s.showConstellations === 'boolean') state.showConstellations = s.showConstellations;
    }
  } catch (e) {}
}

/* 地名検索: 市町村 + 大字・町丁目＋小字（字）。漢字/かな両対応。
 * oaza.js は重い（約28万件）ため、タブを開いた時に遅延ロードする。
 * Service Worker のプリキャッシュにより初回オンライン後はオフライン可。 */
let oazaState = 'idle'; // idle | loading | ready | error
let oazaWaiters = [];
function ensureOaza() {
  if (oazaState === 'ready' || oazaState === 'loading') return;
  oazaState = 'loading';
  const s = document.createElement('script');
  s.src = 'oaza.js';
  s.onload = () => {
    oazaState = 'ready';
    for (const cb of oazaWaiters) cb();
    oazaWaiters = [];
  };
  s.onerror = () => {
    oazaState = 'error';
    oazaWaiters = [];
  };
  document.head.appendChild(s);
}
function onOazaReady(cb) {
  if (oazaState === 'ready') cb();
  else if (oazaState === 'loading') oazaWaiters.push(cb);
  else { ensureOaza(); oazaWaiters.push(cb); }
}

function searchPlaces(rawQ) {
  const q = rawQ.trim();
  if (!q) return [];
  // カナ照合用: カタカナ入力をひらがなに正規化（地名中の「ケ」等の漢字照合は元の q を使う）
  const qK = q.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const buckets = [[], [], []];
  const push = (bucket, item) => { if (buckets[bucket].length < 30) buckets[bucket].push(item); };
  const classify = (name, kana, full, fullK) => {
    if (name.startsWith(q) || kana.startsWith(qK)) return 0;
    if (full.startsWith(q) || fullK.startsWith(qK)) return 1;
    if (full.includes(q) || fullK.includes(qK)) return 2;
    return -1;
  };
  for (const [pref, city, kana, lat, lon] of MUNICIPALITIES) {
    const full = pref + ' ' + city, fullK = pref + ' ' + kana;
    const b = classify(city, kana, full, fullK);
    if (b >= 0) push(b, { label: `${pref} ${city}`, sub: kana, lat, lon });
  }
  if (typeof OAZA !== 'undefined' && typeof OAZA_CITIES !== 'undefined') {
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

/* ---------- 描画 ---------- */
// 空のようすの参照時刻: 指定日18時 + スライダーオフセット（±18時間、5分刻み）
function skyWhen() {
  const base = new Date(`${state.date}T18:00:00`);
  base.setMinutes(base.getMinutes() + (state.skyOffsetMin || 0));
  return base;
}
function fmtSkyWhen(w) {
  const wd = ['日', '月', '火', '水', '木', '金', '土'][w.getDay()];
  return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')} ${String(w.getHours()).padStart(2, '0')}:${String(w.getMinutes()).padStart(2, '0')}（${wd}）`;
}
function updateTimeLabels() {
  const label = fmtSkyWhen(skyWhen());
  setText('timeLabel', label);
  setText('skyTimeLabel', label);
}
function render() {
  const { lat, lon, date } = state;
  $('dmsLat').textContent = toDMS(lat, 'N', 'S');
  $('dmsLon').textContent = toDMS(lon, 'E', 'W');
  $('decLat').textContent = `(${lat.toFixed(4)}°)`;
  $('decLon').textContent = `(${lon.toFixed(4)}°)`;
  // 確定した日付（結果ゾーン）: YYYY-MM-DD（曜）
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(date + 'T12:00:00').getDay()];
  setText('dateLabel', `${date}（${wd}）`);
  updateTimeLabels();

  const ev = dayEvents(lat, lon, date);
  const fmtDur = min => min == null ? '—' : `${Math.floor(min / 60)}時間${Math.round(min % 60)}分`;
  const fmtAstro = t => {
    if (!t) return '—';
    const suffix = t.getDate() !== Number(date.split('-')[2]) ? ' 翌' : '';
    return fmtTime(t) + suffix;
  };
  setText('evDayLength', fmtDur(ev.dayLengthMin));
  setText('evSunMax', ev.sunMaxAlt.toFixed(1) + '°');
  setText('evNightLength', fmtDur(ev.nightLengthMin));
  renderTimeline(ev, fmtAstro);

  const now = new Date(date + 'T12:00:00');
  const m = moonEcliptic(now);
  if (typeof moonAge === 'function') {
    const age = moonAge(now);
    setText('moonAge', age.toFixed(1));
    const quarter = moonPhaseName(now);
    setText('moonQuarter', quarter ? `（${quarter}）` : '');
    drawMoonPhase(age);
  }
  setText('moonInfo', `照度 ${(m.illum * 100).toFixed(0)}%・距離 ${Math.round(m.dist)} km・遠近 ${distanceRatioPct(m.dist)}%`);

  // 見えているパネルだけ描画（hidden 中の canvas は clientWidth=0）
  if (state.view === 'sky') drawSkyChart(lat, lon, skyWhen());
  else drawTrajectory(lat, lon, date);
}

/* 指定日 00:00 から翌日日の出までの全イベントを時刻順に並べる縦タイムライン */
function renderTimeline(ev, fmtAstro) {
  const el = $('timeline');
  if (!el) return;
  const items = (ev.windowEvents || []).slice().sort((a, b) => a.time - b.time);
  el.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'timeline-empty'; p.textContent = 'この範囲に出没・薄明の時刻がありません。';
    el.appendChild(p); return;
  }
  for (const i of items) {
    const row = document.createElement('div');
    row.className = 'timeline-item';
    const icon = document.createElement('span');
    icon.className = `timeline-icon ${i.cls}`;
    // 出没は太い塗り矢印↑↓、南中は塗り丸●、薄明は空欄。色（sun/moon）は cls で付ける。
    const svg = i.kind === 'rise'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 .8 15.2 8.6H11v6.6H5V8.6H.8Z"/></svg>'
      : i.kind === 'set'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15.2.8 7.4H5V.8h6v6.6h4.2Z"/></svg>'
      : i.kind === 'transit'
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4"/></svg>'
      : '';
    if (svg) icon.innerHTML = svg;
    icon.setAttribute('aria-hidden', 'true');
    const time = document.createElement('span');
    time.className = 'timeline-time';
    time.textContent = fmtAstro(i.time);
    const label = document.createElement('span');
    label.className = 'timeline-label';
    label.textContent = i.label;
    row.append(icon, time, label);
    el.appendChild(row);
  }
}

/* 月相イメージ図（北半球: 満ちる=右側が照る） */
function drawMoonPhase(age) {
  const cv = $('moonCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = 120, cx = S / 2, cy = S / 2, r = 52;
  const red = isRedTheme();
  ctx.clearRect(0, 0, S, S);
  // 暗部
  ctx.fillStyle = red ? '#3a0d0d' : (isDarkPair() ? '#3a3f4a' : '#c9ccd4');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // 照部: 行ごとに終端楕円の内側を塗る
  const k = Math.cos(2 * Math.PI * age / SYNODIC);
  const waxing = age < SYNODIC / 2;
  ctx.fillStyle = red ? '#ffb3b3' : (isDarkPair() ? '#f2ead0' : '#e8d98a');
  for (let y = -r; y <= r; y++) {
    const hw = Math.sqrt(Math.max(0, r * r - y * y));
    let x0, x1;
    if (waxing) { x0 = cx + k * hw; x1 = cx + hw; }
    else { x0 = cx - hw; x1 = cx - k * hw; }
    if (x1 > x0) ctx.fillRect(x0, cy + y, x1 - x0, 1);
  }
  ctx.strokeStyle = red ? '#d98c8c' : (isDarkPair() ? '#8a8f9a' : '#9a9da6');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

/* 軌道図: 横=方位(北0→東→南→西→北), 縦=高度(-20〜90) */
function drawTrajectory(lat, lon, date) {
  const cv = $('traj'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 720, H = cv.clientHeight || 360;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const red = isRedTheme();
  const ink = red ? '#ffd7d7' : (isDarkPair() ? '#d8d8d8' : '#222'), dim = red ? '#b05a5a' : (isDarkPair() ? '#666' : '#999'), grid = red ? '#4a1515' : (isDarkPair() ? '#333' : '#ddd');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink; ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.font = '11px system-ui, sans-serif';
  const padL = 34, padR = 10, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const x = az => padL + (az / 360) * iw;
  const y = alt => padT + ih - ((alt + 20) / 110) * ih;
  // グリッド
  for (const alt of [0, 30, 60, 90]) {
    ctx.beginPath(); ctx.moveTo(padL, y(alt)); ctx.lineTo(padL + iw, y(alt)); ctx.stroke();
    ctx.fillStyle = dim; ctx.fillText(alt + '°', 4, y(alt) + 4);
  }
  for (const [az, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']]) {
    ctx.beginPath(); ctx.moveTo(x(az), padT); ctx.lineTo(x(az), padT + ih); ctx.stroke();
    ctx.fillStyle = dim; ctx.textAlign = 'center'; ctx.fillText(lab, x(az), H - 8); ctx.textAlign = 'left';
  }
  // 地平線
  ctx.strokeStyle = dim; ctx.beginPath(); ctx.moveTo(padL, y(0)); ctx.lineTo(padL + iw, y(0)); ctx.stroke();

  const { sun, moon } = trajectory(lat, lon, date);
  function path(pts, color, width, dash) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let prev = null;
    for (const p of pts) {
      if (p.alt < -20) { prev = null; continue; }
      const px = x(p.az), py = y(Math.min(p.alt, 90));
      if (prev && Math.abs(px - prev[0]) > iw / 2) ctx.moveTo(px, py); // 方位 360/0 跨ぎ
      else if (!prev) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      prev = [px, py];
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  path(sun, red ? '#ff8a66' : (isDarkPair() ? '#ffd54d' : '#c49000'), 2);
  path(moon, red ? '#ffb3b3' : (isDarkPair() ? '#b8c7e0' : '#4a6fa5'), 1.6, [5, 3]);
  // 時刻ティック (3時間ごと)
  ctx.fillStyle = ink;
  for (const p of sun) {
    if (p.time.getMinutes() === 0 && p.time.getHours() % 3 === 0 && p.alt >= -20) {
      ctx.beginPath(); ctx.arc(x(p.az), y(Math.min(p.alt, 90)), 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = dim; ctx.fillText(String(p.time.getHours()), x(p.az) - 4, y(Math.min(p.alt, 90)) - 6); ctx.fillStyle = ink;
    }
  }
  ctx.fillStyle = dim;
  ctx.fillText('実線=太陽 / 破線=月（数字は時刻）', padL + 4, padT + 12);
}

/* 空のようす（モック）: 極射円盤。中心=天頂、外周=地平線。北を上・東を左。
 * 画面を上に向けて空と重ねたとき、東西が地図（上から見た図）と左右逆になるため
 * 東を左・西を右に置く（方位090°=東は左、270°=西は右）。
 * 太陽・月は既存 astro.js の sunAltAz/moonAltAz を使用。惑星・星座は後続PR。 */
function drawSkyChart(lat, lon, when) {
  const cv = $('skyChart');
  if (!cv) return;
  if (!(when instanceof Date) || isNaN(when)) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 720, H = cv.clientHeight || 420;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const red = isRedTheme();
  const ink = red ? '#ffd7d7' : (isDarkPair() ? '#d8d8d8' : '#222'), dim = red ? '#b05a5a' : (isDarkPair() ? '#666' : '#999'), grid = red ? '#4a1515' : (isDarkPair() ? '#333' : '#ddd');
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px system-ui, sans-serif';
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 28;
  const xy = (az, alt) => {
    const r = R * (90 - alt) / 90, a = az * Math.PI / 180;
    return [cx - r * Math.sin(a), cy - r * Math.cos(a)];
  };
  // 高度グリッド（30/60）と地平線
  ctx.strokeStyle = grid; ctx.lineWidth = 1;
  for (const alt of [30, 60]) {
    ctx.beginPath(); ctx.arc(cx, cy, R * (90 - alt) / 90, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = dim; ctx.fillText(alt + '°', cx + 4, cy - R * (90 - alt) / 90 + 4);
  }
  ctx.strokeStyle = dim; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = dim;
  for (const [az, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const [x, y] = xy(az, -6);
    ctx.textAlign = 'center'; ctx.fillText(lab, x, y); ctx.textAlign = 'left';
    const [hx, hy] = xy(az, 0);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
  }
  ctx.fillStyle = dim; ctx.fillText('天頂', cx - 12, cy + 4);
  const body = (name, p, color) => {
    if (p.alt < 0) { ctx.fillStyle = dim; ctx.fillText(`${name}: 地平線下`, 10, 18); return; }
    const [x, y] = xy(p.az, p.alt);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(name, x + 8, y + 4);
  };
  body('太陽', sunAltAz(when, lat, lon), red ? '#ff8a66' : (isDarkPair() ? '#ffd54d' : '#c49000'));
  body('月', moonAltAz(when, lat, lon), red ? '#ffb3b3' : (isDarkPair() ? '#b8c7e0' : '#4a6fa5'));
  ctx.fillStyle = dim;
  ctx.fillText(`${fmtSkyWhen(when)}・惑星/星座は準備中（モック）`, 10, H - 10);
}

/* ---------- イベント ---------- */
function init() {
  load();
  // 赤色テーマを復元（head の小スクリプトで先行適用済み、ボタン状態の同期用）
  let saved = 'default';
  try { saved = localStorage.getItem(THEME_KEY) || 'default'; } catch (e) {}
  applyTheme(saved === 'red');
  const toggle = $('themeToggle');
  if (toggle) toggle.addEventListener('click', () => { applyTheme(!isRedTheme()); render(); });
  state.date = state.date || todayStr();
  $('dateInput').value = state.date;
  $('latInput').value = state.lat.toFixed(4);
  $('lonInput').value = state.lon.toFixed(4);
  $('placeLabel').textContent = state.place;

  /* 場所タブ切り替え */
  const tabs = [...document.querySelectorAll('.place-tabs [role="tab"]')];
  function activateTab(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.dataset.panel).hidden = !on;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activateTab(t, false));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      activateTab(tabs[(i + dir + tabs.length) % tabs.length], true);
    });
  });
  activateTab(tabs[0], false);

  /* 結果ビュー切替（出没・薄明 / 空のようす）。場所タブと同型 + ハッシュ保持 */
  const viewTabs = [...document.querySelectorAll('.view-tabs [role="tab"]')];
  function activateView(tab, focus) {
    for (const t of viewTabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.dataset.panel).hidden = !on;
    }
    state.view = tab && tab.dataset.panel === 'panel-sky' ? 'sky' : 'events';
    try { history.replaceState(null, '', state.view === 'sky' ? '#sky' : '#events'); } catch (e) {}
    save();
    if (focus) tab.focus();
    render();
  }
  viewTabs.forEach((t, i) => {
    t.addEventListener('click', () => activateView(t, false));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      activateView(viewTabs[(i + dir + viewTabs.length) % viewTabs.length], true);
    });
  });
  // 初期表示: ハッシュ優先、無ければ保存値（既定=events）
  const hashView = location.hash === '#sky' ? 'sky' : (location.hash === '#events' ? 'events' : state.view);
  activateView(viewTabs.find(t => t.dataset.panel === (hashView === 'sky' ? 'panel-sky' : 'panel-events')) || viewTabs[0], false);

  const box = $('placeSearch'), list = $('placeResults');
  let searchTimer = null;
  function runSearch() {
    const q = box.value;
    if (!q.trim()) { list.innerHTML = ''; return; }
    if (oazaState !== 'ready' && oazaState !== 'error') {
      onOazaReady(runSearch);
      list.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = '大字・小字データを読込中…（市町村はすぐ表示されます）';
      list.appendChild(p);
    }
    const res = searchPlaces(q);
    list.innerHTML = '';
    for (const r of res) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'result';
      b.textContent = r.sub ? `${r.label}（${r.sub}）` : r.label;
      b.addEventListener('click', () => { setPlace(r.lat, r.lon, r.label); box.value = ''; list.innerHTML = ''; });
      list.appendChild(b);
    }
  }
  box.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  });
  box.addEventListener('focus', ensureOaza);
  // 地名タブが開かれたら大字・小字データを先行ロード（SWプリキャッシュでオフライン可）
  tabs[0].addEventListener('click', ensureOaza);

  $('gpsBtn').addEventListener('click', () => {
    $('gpsBtn').textContent = '取得中…'; $('gpsBtn').disabled = true;
    navigator.geolocation.getCurrentPosition(
      p => { setPlace(p.coords.latitude, p.coords.longitude, 'GPS 取得位置'); $('gpsBtn').textContent = 'GPS で取得'; $('gpsBtn').disabled = false; },
      err => { $('gpsBtn').textContent = 'GPS で取得'; $('gpsBtn').disabled = false; alert('GPS を取得できませんでした: ' + err.message); },
      { enableHighAccuracy: true, timeout: 15000 });
  });
  $('applyCoords').addEventListener('click', () => {
    const lat = parseFloat($('latInput').value), lon = parseFloat($('lonInput').value);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { alert('緯度 -90〜90、経度 -180〜180 を入力してください'); return; }
    setPlace(lat, lon, '手入力の座標');
  });
  $('dateInput').addEventListener('change', e => { state.date = e.target.value || todayStr(); save(); render(); });
  $('todayBtn').addEventListener('click', () => { state.date = todayStr(); $('dateInput').value = state.date; save(); render(); });
  $('planetToggle').checked = state.showPlanets;
  $('constellationToggle').checked = state.showConstellations;
  // 空のようすの時刻スライダー: 指定日18時±18時間（-1080〜+1080分、5分刻み）。ドラッグ中も即時再描画
  $('timeSlider').value = state.skyOffsetMin;
  $('timeSlider').addEventListener('input', e => {
    state.skyOffsetMin = Number(e.target.value) || 0;
    save();
    updateTimeLabels();
    if (state.view === 'sky') drawSkyChart(state.lat, state.lon, skyWhen());
  });
  $('planetToggle').addEventListener('change', e => { state.showPlanets = e.target.checked; save(); render(); });
  $('constellationToggle').addEventListener('change', e => { state.showConstellations = e.target.checked; save(); render(); });

  /* 「遠近」説明ポップアップ */
  const moonHelpBtn = $('moonHelpBtn');
  const moonHelpDialog = $('moonHelpDialog');
  if (moonHelpBtn && moonHelpDialog) {
    moonHelpBtn.addEventListener('click', () => {
      if (typeof moonHelpDialog.showModal === 'function') moonHelpDialog.showModal();
      else moonHelpDialog.setAttribute('open', '');
    });
    moonHelpDialog.addEventListener('click', e => {
      const r = moonHelpDialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) moonHelpDialog.close();
    });
  }

  window.addEventListener('resize', () => {
    if (state.view === 'sky') drawSkyChart(state.lat, state.lon, skyWhen());
    else drawTrajectory(state.lat, state.lon, state.date);
  });
  render();
}
document.addEventListener('DOMContentLoaded', init);
