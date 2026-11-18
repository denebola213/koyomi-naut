"use strict";
/* Sky PWA step1: 場所・日付 → 緯度経度(DMS) / 出没・薄明 / 太陽・月軌道図 */

const $ = id => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const state = { lat: 35.6812, lon: 139.7671, place: '東京都 千代田区（既定）', date: '' };

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
  try { localStorage.setItem('skypwa-v1', JSON.stringify({ lat: state.lat, lon: state.lon, place: state.place, date: state.date })); } catch (e) {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('skypwa-v1') || 'null');
    if (s && typeof s.lat === 'number') { state.lat = s.lat; state.lon = s.lon; state.place = s.place || ''; state.date = s.date || ''; }
  } catch (e) {}
}

/* 市町村検索 (前方一致 + 部分一致、漢字/かな) */
function searchMunicipalities(q) {
  q = q.trim();
  if (!q) return [];
  const starts = [], contains = [];
  for (const [pref, city, kana, lat, lon] of MUNICIPALITIES) {
    const full = pref + ' ' + city, fullK = pref + ' ' + kana;
    if (full.startsWith(q) || fullK.startsWith(q)) starts.push({ pref, city, kana, lat, lon });
    else if (full.includes(q) || fullK.includes(q)) contains.push({ pref, city, kana, lat, lon });
    if (starts.length + contains.length >= 30) break;
  }
  return starts.concat(contains).slice(0, 30);
}

/* ---------- 描画 ---------- */
function render() {
  const { lat, lon, date } = state;
  $('dmsLat').textContent = toDMS(lat, 'N', 'S');
  $('dmsLon').textContent = toDMS(lon, 'E', 'W');
  $('decLat').textContent = `(${lat.toFixed(4)}°)`;
  $('decLon').textContent = `(${lon.toFixed(4)}°)`;

  const ev = dayEvents(lat, lon, date);
  const fmtDur = min => min == null ? '—' : `${Math.floor(min / 60)}時間${Math.round(min % 60)}分`;
  const fmtAstro = t => {
    if (!t) return '—';
    const suffix = t.getDate() !== Number(date.split('-')[2]) ? ' 翌' : '';
    return fmtTime(t) + suffix;
  };
  setText('evSunrise', fmtTime(ev.sunrise));
  setText('evSunset', fmtTime(ev.sunset));
  setText('evDayLength', fmtDur(ev.dayLengthMin));
  setText('evSunMax', ev.sunMaxAlt.toFixed(1) + '°');
  setText('evMoonrise', fmtAstro(ev.moonrise));
  setText('evMoonset', fmtAstro(ev.moonset));
  setText('evAstroStart', fmtAstro(ev.astroStart));
  setText('evAstroEnd', fmtAstro(ev.astroEnd));

  const now = new Date(date + 'T12:00:00');
  const m = moonEcliptic(now);
  if (typeof moonAge === 'function') {
    const age = moonAge(now);
    setText('moonAge', age.toFixed(1));
    setText('moonWax', age < SYNODIC / 2 ? '（満ちる）' : '（欠ける）');
    drawMoonPhase(age);
  }
  setText('moonInfo', `${moonPhaseName(m.illum)}・照度 ${(m.illum * 100).toFixed(0)}%・距離 ${(m.dist / 1000).toFixed(0)}千km`);

  drawTrajectory(lat, lon, date);
}

/* 月相イメージ図（北半球: 満ちる=右側が照る） */
function drawMoonPhase(age) {
  const cv = $('moonCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = 120, cx = S / 2, cy = S / 2, r = 52;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.clearRect(0, 0, S, S);
  // 暗部
  ctx.fillStyle = dark ? '#3a3f4a' : '#c9ccd4';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // 照部: 行ごとに終端楕円の内側を塗る
  const k = Math.cos(2 * Math.PI * age / SYNODIC);
  const waxing = age < SYNODIC / 2;
  ctx.fillStyle = dark ? '#f2ead0' : '#e8d98a';
  for (let y = -r; y <= r; y++) {
    const hw = Math.sqrt(Math.max(0, r * r - y * y));
    let x0, x1;
    if (waxing) { x0 = cx + k * hw; x1 = cx + hw; }
    else { x0 = cx - hw; x1 = cx - k * hw; }
    if (x1 > x0) ctx.fillRect(x0, cy + y, x1 - x0, 1);
  }
  ctx.strokeStyle = dark ? '#8a8f9a' : '#9a9da6';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

/* 軌道図: 横=方位(北0→東→南→西→北), 縦=高度(-20〜90) */
function drawTrajectory(lat, lon, date) {
  const cv = $('traj'), ctx = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 720, H = cv.clientHeight || 360;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const ink = dark ? '#d8d8d8' : '#222', dim = dark ? '#666' : '#999', grid = dark ? '#333' : '#ddd';
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
  path(sun, dark ? '#ffd54d' : '#c49000', 2);
  path(moon, dark ? '#b8c7e0' : '#4a6fa5', 1.6, [5, 3]);
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

/* ---------- イベント ---------- */
function init() {
  load();
  state.date = state.date || todayStr();
  $('dateInput').value = state.date;
  $('latInput').value = state.lat.toFixed(4);
  $('lonInput').value = state.lon.toFixed(4);
  $('placeLabel').textContent = state.place;

  const box = $('muniSearch'), list = $('muniResults');
  box.addEventListener('input', () => {
    const res = searchMunicipalities(box.value);
    list.innerHTML = '';
    for (const r of res) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'result';
      b.textContent = `${r.pref} ${r.city}（${r.kana}）`;
      b.addEventListener('click', () => { setPlace(r.lat, r.lon, `${r.pref} ${r.city}`); box.value = ''; list.innerHTML = ''; });
      list.appendChild(b);
    }
  });

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
  window.addEventListener('resize', () => drawTrajectory(state.lat, state.lon, state.date));
  render();
}
document.addEventListener('DOMContentLoaded', init);
