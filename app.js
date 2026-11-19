"use strict";
/* Sky PWA step1: 場所・日付 → 緯度経度(DMS) / 出没・薄明 / 太陽・月軌道図 */

const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const state = { lat: 35.6812, lon: 139.7671, place: '東京都 千代田区（既定）', date: '', skyOffsetMin: 180, view: 'events', showPlanets: true, showConstellations: true, showStars: true, showEcliptic: true, showMilkyWay: true, showConstellationNames: false };
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
  try { localStorage.setItem('skypwa-v1', JSON.stringify({ lat: state.lat, lon: state.lon, place: state.place, date: state.date, skyOffsetMin: state.skyOffsetMin, view: state.view, showPlanets: state.showPlanets, showConstellations: state.showConstellations, showStars: state.showStars, showEcliptic: state.showEcliptic, showMilkyWay: state.showMilkyWay, showConstellationNames: state.showConstellationNames })); } catch (e) {}
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
      if (typeof s.showStars === 'boolean') state.showStars = s.showStars;
      else if (s.starDisplay === 'off') state.showStars = false; // 旧形式: 一等星セレクト（off=非表示、pos/name=表示）からの移行
      if (typeof s.showEcliptic === 'boolean') state.showEcliptic = s.showEcliptic;
      if (typeof s.showMilkyWay === 'boolean') state.showMilkyWay = s.showMilkyWay;
      if (typeof s.showConstellationNames === 'boolean') state.showConstellationNames = s.showConstellationNames;
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
/* 現在時刻をスライダーオフセット（5分刻み）に変換する。
 * 現在が指定日の範囲（指定日18時±18時間）外なら日付を今日に合わせる。 */
function nowSkyOffsetMin(dateStr) {
  const base = new Date(`${dateStr}T18:00:00`);
  return Math.round((new Date() - base) / 60000 / 5) * 5;
}
function resetSkyToNow(forceToday) {
  const today = todayStr();
  if (forceToday) state.date = today;
  let off = nowSkyOffsetMin(state.date || today);
  if (off < -1080 || off > 1080) {
    state.date = today;
    off = nowSkyOffsetMin(today);
  }
  state.skyOffsetMin = Math.max(-1080, Math.min(1080, off));
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
  renderMoonCalendar();
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

/* 月相イメージ図（北半球: 満ちる=右側が照る）。結果ゾーンの大図と月齢カレンダーの小図で共通 */
function drawMoonPhaseInto(cv, age, S) {
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, r = S * 52 / 120;
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
function drawMoonPhase(age) {
  drawMoonPhaseInto($('moonCanvas'), age, 120);
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

/* 空のようす: 極射円盤。中心=天頂、外周=地平線。北を上・東を左。
 * 画面を上に向けて空と重ねたとき、東西が地図（上から見た図）と左右逆になるため
 * 東を左・西を右に置く（方位090°=東は左、270°=西は右）。
 * 太陽・月は astro.js、惑星は planets.js、星座の結びは constellations.js（線のみ）、
 * 一等星は bright-stars.js（等級1.5以下22星）、黄道は黄道緯度0°の円（ラベルなし）、
 * 天の川は milky-way.js（外側輪郭で塗る）。 */
/* 星座名の位置: 結びの点の球面平均（単位ベクトル平均）で中心を求める */
let _constLabelCache = null;
function constellationLabelPos(c) {
  if (!_constLabelCache) _constLabelCache = new WeakMap();
  let v = _constLabelCache.get(c);
  if (v) return v;
  let x = 0, y = 0, z = 0;
  for (const line of c.lines) for (const [ra, dec] of line) {
    const r = ra * Math.PI / 180, d = dec * Math.PI / 180;
    x += Math.cos(d) * Math.cos(r); y += Math.cos(d) * Math.sin(r); z += Math.sin(d);
  }
  const ra = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  const dec = Math.asin(z / Math.hypot(x, y, z)) * 180 / Math.PI;
  v = [ra, dec];
  _constLabelCache.set(c, v);
  return v;
}
/* 天の川の帯判定: 外側輪郭2本を銀河座標 (l, b) に変換し、l ごとの南・北境界 b(l) を作る。
 * 帯は銀河面に沿う帯なので、各 l で b は単調な区間になる（北銀極付近を除く）。 */
function unitVec(raDeg, decDeg) {
  const r = raDeg * Math.PI / 180, d = decDeg * Math.PI / 180;
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
}
let _galBasis = null;
function galBasis() {
  if (_galBasis) return _galBasis;
  const zg = unitVec(192.859508, 27.128336); // 北銀極 (J2000)
  const xg = unitVec(266.405, -29.008);     // 銀河中心方向 (l=0, b=0)
  const ygRaw = [zg[1] * xg[2] - zg[2] * xg[1], zg[2] * xg[0] - zg[0] * xg[2], zg[0] * xg[1] - zg[1] * xg[0]];
  const yn = Math.hypot(ygRaw[0], ygRaw[1], ygRaw[2]);
  _galBasis = { zg, xg, yg: [ygRaw[0] / yn, ygRaw[1] / yn, ygRaw[2] / yn] };
  return _galBasis;
}
function galOf(v) {
  const { zg, xg, yg } = galBasis();
  return [
    Math.atan2(v[0] * yg[0] + v[1] * yg[1] + v[2] * yg[2], v[0] * xg[0] + v[1] * xg[1] + v[2] * xg[2]) * 180 / Math.PI,
    Math.asin(Math.max(-1, Math.min(1, v[0] * zg[0] + v[1] * zg[1] + v[2] * zg[2]))) * 180 / Math.PI,
  ];
}
let _milkyBandCache = null;
function milkyBand() {
  if (_milkyBandCache) return _milkyBandCache;
  const loops = MILKY_WAY.map(ring => {
    const pts = ring.map(([ra, dec]) => galOf(unitVec(ra, dec)));
    const u = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      let [l, b] = pts[i];
      while (l - u[u.length - 1][0] > 180) l -= 360;
      while (l - u[u.length - 1][0] < -180) l += 360;
      u.push([l, b]);
    }
    if (u[u.length - 1][0] < u[0][0]) u.reverse(); // l 増加順に
    return u;
  });
  loops.sort((a, b) => (a.reduce((s, p) => s + p[1], 0) / a.length) - (b.reduce((s, p) => s + p[1], 0) / b.length));
  const bAt = (u, lq) => {
    let l = lq;
    while (l < u[0][0]) l += 360;
    while (l > u[0][0] + 360) l -= 360;
    for (let i = 0; i < u.length - 1; i++) {
      if (l >= u[i][0] && l <= u[i + 1][0]) {
        const t = u[i + 1][0] === u[i][0] ? 0 : (l - u[i][0]) / (u[i + 1][0] - u[i][0]);
        return u[i][1] + t * (u[i + 1][1] - u[i][1]);
      }
    }
    return u[u.length - 1][1];
  };
  const N = 720, south = new Float64Array(N), north = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    const l = k * 0.5;
    south[k] = bAt(loops[0], l);
    north[k] = bAt(loops[loops.length - 1], l);
  }
  _milkyBandCache = { south, north, n: N };
  return _milkyBandCache;
}
function inMilkyBand(band, l, b) {
  const k = Math.floor((((l % 360) + 360) % 360) / 360 * band.n) % band.n;
  return b > band.south[k] && b < band.north[k];
}
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
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 24;
  const xy = (az, alt) => {
    const r = R * (90 - alt) / 90, a = az * Math.PI / 180;
    return [cx - r * Math.sin(a), cy - r * Math.cos(a)];
  };
  const xyR = (az, r) => {
    const a = az * Math.PI / 180;
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
    const [x, y] = xyR(az, R - 14); // 方位ラベルは円盤の内側に置く（外側だと全幅化で欠ける）
    ctx.textAlign = 'center'; ctx.fillText(lab, x, y + 4); ctx.textAlign = 'left';
    const [hx, hy] = xy(az, 0);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke();
  }
  const body = (name, p, color) => {
    if (!p || p.alt < 0) return;
    const [x, y] = xy(p.az, p.alt);
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(name, x + 8, y + 4);
  };
  // 天の川（外側輪郭2本で塗る・輪郭線はなし。MILKY_WAY は scripts/build-milkyway.py で算出）
  // 投影面でポリゴンを fill すると地平線下の経路や天頂付近の自己交差で崩れるため、
  // 円盤内の格子点を銀河座標に変換し、帯の内側（南・北の外周の間）かを判定して塗る。
  if (state.showMilkyWay && typeof MILKY_WAY !== 'undefined') {
    const band = milkyBand();
    const jd = julianDay(when), T = (jd - 2451545.0) / 36525;
    let gmst = (280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T) % 360;
    if (gmst < 0) gmst += 360;
    const lst = (gmst + lon) * Math.PI / 180, latr = lat * Math.PI / 180;
    const up = [Math.cos(latr) * Math.cos(lst), Math.cos(latr) * Math.sin(lst), Math.sin(latr)];
    const north = [-Math.sin(latr) * Math.cos(lst), -Math.sin(latr) * Math.sin(lst), Math.cos(latr)];
    // 東方向は赤経増加と逆向き（地平座標の東 = 赤道座標では [sin LST, -cos LST, 0]）。逆にすると東西反転する
    const east = [Math.sin(lst), -Math.cos(lst), 0];
    ctx.fillStyle = red ? 'rgba(255,150,150,0.16)' : (isDarkPair() ? 'rgba(200,205,220,0.22)' : 'rgba(150,155,170,0.30)');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const step = 2;
    for (let gy = cy - R; gy <= cy + R; gy += step) {
      for (let gx = cx - R; gx <= cx + R; gx += step) {
        const dx = gx - cx, dy = gy - cy, r = Math.hypot(dx, dy);
        if (r > R) continue;
        const alt = (90 - r / R * 90) * Math.PI / 180;
        const az = Math.atan2(-dx, -dy);
        const ca = Math.cos(alt);
        const v = [
          east[0] * ca * Math.sin(az) + north[0] * ca * Math.cos(az) + up[0] * Math.sin(alt),
          east[1] * ca * Math.sin(az) + north[1] * ca * Math.cos(az) + up[1] * Math.sin(alt),
          east[2] * ca * Math.sin(az) + north[2] * ca * Math.cos(az) + up[2] * Math.sin(alt),
        ];
        const [l, b] = galOf(v);
        if (inMilkyBand(band, l, b)) ctx.fillRect(gx - step / 2, gy - step / 2, step, step);
      }
    }
    ctx.restore();
  }
  // 黄道（ラベルなし）: 黄道緯度0°の円を2°刻みでサンプルし、地平線下で途切る
  if (state.showEcliptic) {
    const e = 23.439 - 0.00000036 * (julianDay(when) - 2451545.0);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = red ? '#a04a4a' : (isDarkPair() ? '#8a7aa8' : '#9a8ab8');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let eclLon = 0; eclLon <= 360; eclLon += 2) {
      const L = eclLon * Math.PI / 180;
      const x = Math.cos(L), y = Math.sin(L) * Math.cos(e * Math.PI / 180), z = Math.sin(L) * Math.sin(e * Math.PI / 180);
      const ra = ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
      const dec = Math.asin(z) * 180 / Math.PI;
      const p = altAz(ra, dec, when, lat, lon);
      if (p.alt < 0) { started = false; continue; }
      const [px, py] = xy(p.az, p.alt);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 星座の結び（線のみ）: 地平線円でクリップし、はみ出しを切る
  if (state.showConstellations && typeof CONSTELLATIONS !== 'undefined') {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = red ? '#7a2b2b' : (isDarkPair() ? '#555c6e' : '#b8bcc4');
    ctx.lineWidth = 1;
    for (const c of CONSTELLATIONS) {
      for (const line of c.lines) {
        ctx.beginPath();
        let started = false;
        for (const [ra, dec] of line) {
          const p = altAz(ra, dec, when, lat, lon);
          if (p.alt < 0) { started = false; continue; } // 地平線下で線を途切る
          const [x, y] = xy(p.az, p.alt);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // 星座名: 中心付近に表示。へび座（頭・尾で2件）は重複を避け1回だけ（結びの表示とは独立）
  if (state.showConstellationNames && typeof CONSTELLATIONS !== 'undefined') {
    ctx.fillStyle = red ? '#b05a5a' : (isDarkPair() ? '#8a8f9e' : '#7a7f8c');
    ctx.font = '10px system-ui, sans-serif';
    const seen = new Set();
    for (const c of CONSTELLATIONS) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const [ra, dec] = constellationLabelPos(c);
      const p = altAz(ra, dec, when, lat, lon);
      if (p.alt < 0) continue;
      const [x, y] = xy(p.az, p.alt);
      ctx.textAlign = 'center'; ctx.fillText(c.name, x, y); ctx.textAlign = 'left';
    }
    ctx.font = '11px system-ui, sans-serif';
  }
  // 一等星: 惑星より小さい点（半径2.2）。表示時は名前も一緒に出す
  if (state.showStars && typeof BRIGHT_STARS !== 'undefined') {
    ctx.fillStyle = red ? '#ffd7d7' : (isDarkPair() ? '#e8e8ea' : '#1c1c1e');
    ctx.font = '10px system-ui, sans-serif';
    for (const s of BRIGHT_STARS) {
      const p = altAz(s.ra, s.dec, when, lat, lon);
      if (p.alt < 0) continue;
      const [x, y] = xy(p.az, p.alt);
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(s.name, x + 5, y + 3);
    }
    ctx.font = '11px system-ui, sans-serif';
  }
  const below = [];
  const drawBody = (name, p, color) => {
    if (!p) return;
    if (p.alt < 0) { below.push(name); return; }
    body(name, p, color);
  };
  drawBody('太陽', sunAltAz(when, lat, lon), red ? '#ff8a66' : (isDarkPair() ? '#ffd54d' : '#c49000'));
  drawBody('月', moonAltAz(when, lat, lon), red ? '#ffb3b3' : (isDarkPair() ? '#b8c7e0' : '#4a6fa5'));
  if (state.showPlanets && typeof planetsAltAz === 'function') {
    const planetColor = red ? '#ff9a9a' : (isDarkPair() ? '#e6c87a' : '#8a6d1a');
    for (const p of planetsAltAz(when, lat, lon)) drawBody(p.name, p, planetColor);
  }
  ctx.fillStyle = dim;
  const belowTxt = below.length ? `${below.join('・')}は地平線下` : '太陽・月・惑星はすべて地平線上';
  ctx.fillText(belowTxt, 10, H - 10);
}

/* ---------- 月齢カレンダー（日付入力の補助・折りたたみ） ---------- */
/* 表示月は state.date と独立に保持し、前月/翌月ボタンでだけ移動する。
 * 各日セルは正午の moonAge()（結果ゾーンの月齢表示と同じ基準）。 */
let moonCalY = null, moonCalM = null; // m: 0-11
function syncMoonCalMonth() {
  const d = new Date(`${state.date}T12:00:00`);
  if (!isNaN(d)) { moonCalY = d.getFullYear(); moonCalM = d.getMonth(); }
}
function renderMoonCalendar() {
  const grid = $('moonCalGrid'); if (!grid) return;
  if (moonCalY == null || moonCalM == null) syncMoonCalMonth();
  if (moonCalY == null) return;
  const p2 = n => String(n).padStart(2, '0');
  setText('moonCalTitle', `${moonCalY}年${moonCalM + 1}月`);
  grid.innerHTML = '';
  const firstDow = new Date(moonCalY, moonCalM, 1).getDay(); // 0=日曜
  const daysInMonth = new Date(moonCalY, moonCalM + 1, 0).getDate();
  for (let i = 0; i < firstDow; i++) {
    const s = document.createElement('span'); grid.appendChild(s);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${moonCalY}-${p2(moonCalM + 1)}-${p2(d)}`;
    const noon = new Date(moonCalY, moonCalM, d, 12, 0, 0);
    const age = moonAge(noon);
    const quarter = moonPhaseName(noon);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'moon-cal-day' + (quarter ? ' is-quarter' : '') + (ds === state.date ? ' is-selected' : '');
    b.dataset.date = ds;
    b.setAttribute('aria-label', `${moonCalY}年${moonCalM + 1}月${d}日、月齢 ${age.toFixed(1)} 日${quarter ? '、' + quarter : ''}`);
    if (ds === state.date) b.setAttribute('aria-current', 'date');
    const num = document.createElement('span'); num.className = 'moon-cal-num'; num.textContent = d;
    const img = document.createElement('canvas');
    img.className = 'moon-cal-img'; img.width = 24; img.height = 24;
    img.setAttribute('aria-hidden', 'true');
    drawMoonPhaseInto(img, age, 24);
    const ag = document.createElement('span'); ag.className = 'moon-cal-age'; ag.textContent = age.toFixed(1);
    b.append(num, img, ag);
    if (quarter) {
      const q = document.createElement('span'); q.className = 'moon-cal-quarter'; q.textContent = quarter;
      b.appendChild(q);
    }
    b.addEventListener('click', () => {
      state.date = ds; $('dateInput').value = ds; save(); render();
    });
    grid.appendChild(b);
  }
}
function shiftMoonCalMonth(delta) {
  if (moonCalY == null) syncMoonCalMonth();
  const d = new Date(moonCalY, moonCalM + delta, 1);
  moonCalY = d.getFullYear(); moonCalM = d.getMonth();
  renderMoonCalendar();
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
  syncMoonCalMonth();
  // 空のようすの初期値は現在時刻（保存値より優先）。範囲外の日付は今日に合わせる
  resetSkyToNow();
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
  $('dateInput').addEventListener('change', e => { state.date = e.target.value || todayStr(); syncMoonCalMonth(); save(); render(); });
  $('todayBtn').addEventListener('click', () => { state.date = todayStr(); $('dateInput').value = state.date; syncMoonCalMonth(); save(); render(); });
  $('moonCalPrev').addEventListener('click', () => shiftMoonCalMonth(-1));
  $('moonCalNext').addEventListener('click', () => shiftMoonCalMonth(1));
  $('planetToggle').checked = state.showPlanets;
  $('constellationToggle').checked = state.showConstellations;
  $('starToggle').checked = state.showStars;
  $('eclipticToggle').checked = state.showEcliptic;
  $('milkyWayToggle').checked = state.showMilkyWay;
  $('constellationNameToggle').checked = state.showConstellationNames;
  // 空のようすの時刻スライダー: 指定日18時±18時間（-1080〜+1080分、5分刻み）。ドラッグ中も即時再描画
  $('timeSlider').value = state.skyOffsetMin;
  $('timeSlider').addEventListener('input', e => {
    state.skyOffsetMin = Number(e.target.value) || 0;
    save();
    updateTimeLabels();
    if (state.view === 'sky') drawSkyChart(state.lat, state.lon, skyWhen());
  });
  // 「現在」ボタン: 日付を今日・時刻を現在時刻に戻す
  $('nowBtn').addEventListener('click', () => {
    resetSkyToNow(true);
    $('dateInput').value = state.date;
    syncMoonCalMonth();
    $('timeSlider').value = state.skyOffsetMin;
    save();
    render();
  });
  $('planetToggle').addEventListener('change', e => { state.showPlanets = e.target.checked; save(); render(); });
  $('constellationToggle').addEventListener('change', e => { state.showConstellations = e.target.checked; save(); render(); });
  $('starToggle').addEventListener('change', e => { state.showStars = e.target.checked; save(); render(); });
  $('eclipticToggle').addEventListener('change', e => { state.showEcliptic = e.target.checked; save(); render(); });
  $('milkyWayToggle').addEventListener('change', e => { state.showMilkyWay = e.target.checked; save(); render(); });
  $('constellationNameToggle').addEventListener('change', e => { state.showConstellationNames = e.target.checked; save(); render(); });

  /* 「地名検索」説明ポップアップ */
  const placeHelpBtn = $('placeHelpBtn');
  const placeHelpDialog = $('placeHelpDialog');
  if (placeHelpBtn && placeHelpDialog) {
    placeHelpBtn.addEventListener('click', () => {
      if (typeof placeHelpDialog.showModal === 'function') placeHelpDialog.showModal();
      else placeHelpDialog.setAttribute('open', '');
    });
    placeHelpDialog.addEventListener('click', e => {
      const r = placeHelpDialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) placeHelpDialog.close();
    });
  }

  /* 「天文薄明」説明ポップアップ */
  const twilightHelpBtn = $('twilightHelpBtn');
  const twilightHelpDialog = $('twilightHelpDialog');
  if (twilightHelpBtn && twilightHelpDialog) {
    twilightHelpBtn.addEventListener('click', () => {
      if (typeof twilightHelpDialog.showModal === 'function') twilightHelpDialog.showModal();
      else twilightHelpDialog.setAttribute('open', '');
    });
    twilightHelpDialog.addEventListener('click', e => {
      const r = twilightHelpDialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) twilightHelpDialog.close();
    });
  }

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

  /* 「空のようす」説明ポップアップ */
  const skyHelpBtn = $('skyHelpBtn');
  const skyHelpDialog = $('skyHelpDialog');
  if (skyHelpBtn && skyHelpDialog) {
    skyHelpBtn.addEventListener('click', () => {
      if (typeof skyHelpDialog.showModal === 'function') skyHelpDialog.showModal();
      else skyHelpDialog.setAttribute('open', '');
    });
    skyHelpDialog.addEventListener('click', e => {
      const r = skyHelpDialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) skyHelpDialog.close();
    });
  }

  window.addEventListener('resize', () => {
    if (state.view === 'sky') drawSkyChart(state.lat, state.lon, skyWhen());
    else drawTrajectory(state.lat, state.lon, state.date);
  });
  render();
}
document.addEventListener('DOMContentLoaded', init);
