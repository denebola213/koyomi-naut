"use strict";
/* 天文計算 (低精度・表示用途)
 * 太陽: Meeus 低精度 / 月: Meeus 低精度 (誤差 ~0.3° 程度)
 * 出没・薄明: 指定日のローカル時刻を走査し符号反転を二分探索
 */
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const RAD = d => d * D2R;
const norm360 = d => ((d % 360) + 360) % 360;
const sinD = d => Math.sin(RAD(d)), cosD = d => Math.cos(RAD(d));

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/* ---------- 太陽 ---------- */
function sunEcliptic(date) {
  const d = julianDay(date) - 2451545.0;
  const g = norm360(357.529 + 0.98560028 * d);
  const q = norm360(280.459 + 0.98564736 * d);
  const L = q + 1.915 * sinD(g) + 0.020 * sinD(2 * g);
  const e = 23.439 - 0.00000036 * d;
  const RA = Math.atan2(cosD(e) * sinD(L), cosD(L)) * R2D;
  const Dec = Math.asin(sinD(e) * sinD(L)) * R2D;
  return { lon: norm360(L), ra: norm360(RA), dec: Dec, obliquity: e };
}

/* ---------- 月 (Meeus 低精度) ---------- */
function moonEcliptic(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.881234 * T;          // 月の黄経 (平均)
  const D = 297.8501921 + 445267.1114034 * T;          // 平均朔望角
  const M = 357.5291092 + 35999.0502909 * T;           // 太陽の平均近点角
  const Mp = 134.9633964 + 477198.8675055 * T;        // 月の平均近点角
  const F = 93.2720950 + 483202.0175233 * T;           // 月の緯度の引数

  let lon = Lp
    - 1.274 * sinD(Mp - 2 * D) + 0.658 * sinD(2 * D) - 0.186 * sinD(M)
    - 0.059 * sinD(2 * Mp - 2 * D) - 0.057 * sinD(Mp - 2 * D + M)
    + 0.053 * sinD(Mp + 2 * D) + 0.046 * sinD(2 * D - M)
    + 0.041 * sinD(Mp - M) - 0.035 * sinD(D) - 0.031 * sinD(Mp + M)
    - 0.015 * sinD(2 * F - 2 * D) + 0.011 * sinD(Mp - 4 * D);
  let lat = 5.128 * sinD(F) + 0.281 * sinD(Mp + F) + 0.278 * sinD(Mp - F)
    + 0.173 * sinD(2 * D - F) - 0.055 * sinD(Mp - 2 * D + F)
    - 0.046 * sinD(Mp - 2 * D - F) + 0.033 * sinD(F + 2 * D)
    - 0.017 * sinD(2 * Mp + F);
  // 距離 (km, 近似) と照度
  const dist = 385001 - 20905 * cosD(Mp) - 3699 * cosD(2 * D - Mp) - 2956 * cosD(2 * D);
  const sunLon = sunEcliptic(date).lon;
  const elong = Math.acos(Math.min(1, Math.max(-1,
    cosD(lat) * cosD(lon - sunLon)))) * R2D;
  const illum = (1 - Math.cos(RAD(elong))) / 2; // 0=新月 1=満月
  // RA/Dec へ
  const e = 23.439 - 0.00000036 * (julianDay(date) - 2451545.0);
  const x = cosD(lat) * cosD(lon), y = cosD(lat) * sinD(lon) * cosD(e) - sinD(lat) * sinD(e);
  const z = cosD(lat) * sinD(lon) * sinD(e) + sinD(lat) * cosD(e);
  const ra = Math.atan2(y, x) * R2D, dec = Math.asin(z) * R2D;
  return { lon: norm360(lon), lat, ra: norm360(ra), dec, dist, illum, elong };
}

/* ---------- 高度・方位 ---------- */
function altAz(ra, dec, date, lat, lon) {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T;
  gmst = norm360(gmst);
  const lst = norm360(gmst + lon);
  const H = norm360(ra - lst + 540) - 180; // 時角 (-180..180)
  const alt = Math.asin(sinD(dec) * sinD(lat) + cosD(dec) * cosD(lat) * cosD(H)) * R2D;
  let az = Math.atan2(sinD(H), cosD(H) * sinD(lat) - Math.tan(RAD(dec)) * cosD(lat)) * R2D;
  az = norm360(az + 180); // 北=0
  return { alt, az, hourAngle: H };
}
const sunAltAz = (date, lat, lon) => { const s = sunEcliptic(date); return altAz(s.ra, s.dec, date, lat, lon); };
const moonAltAz = (date, lat, lon) => { const m = moonEcliptic(date); return altAz(m.ra, m.dec, date, lat, lon); };

/* ---------- 出没・薄明 ---------- */
function findCrossings(lat, lon, dayStart, hours, body, threshold) {
  // dayStart から hours 時間を 5 分刻みで走査し threshold 交差を二分探索
  const altAt = t => (body === 'sun' ? sunAltAz(new Date(t), lat, lon) : moonAltAz(new Date(t), lat, lon)).alt;
  const step = 5 * 60000;
  const hits = [];
  const end = dayStart.getTime() + hours * 3600000;
  let pt = dayStart.getTime(), pa = altAt(pt) - threshold;
  for (let t = pt + step; t <= end; t += step) {
    const a = altAt(t) - threshold;
    if ((pa <= 0 && a > 0) || (pa >= 0 && a < 0)) {
      let lo = t - step, hi = t, alo = pa;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2, am = altAt(mid) - threshold;
        if ((alo <= 0 && am <= 0) || (alo >= 0 && am >= 0)) { lo = mid; alo = am; } else hi = mid;
      }
      const tc = (lo + hi) / 2;
      const rising = altAt(tc + 60000) > altAt(tc - 60000);
      hits.push({ time: new Date(tc), rising });
    }
    pt = t; pa = a;
  }
  return hits;
}

/* 指定ローカル日 (dateStr 'YYYY-MM-DD') の各種時刻を返す
 * タイムライン対象: 指定日 00:00 から翌日の日の出まで (windowEvents)
 * 暗夜の長さ: 指定日夕方の天文薄明開始 → 翌朝の天文薄明終了
 */
function dayEvents(lat, lon, dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0);
  const nextDayStart = new Date(y, mo - 1, d + 1, 0, 0, 0);
  // 48時間走査して窓 (00:00〜翌日日の出) の全交差を集める
  const sHits = findCrossings(lat, lon, dayStart, 48, 'sun', -0.833);
  const astroHits = findCrossings(lat, lon, dayStart, 48, 'sun', -18);
  const moonHits = findCrossings(lat, lon, dayStart, 48, 'moon', 0.125);
  const nextSunriseHit = sHits.find(h => h.rising && h.time >= nextDayStart) || null;
  const windowEnd = nextSunriseHit ? nextSunriseHit.time : new Date(dayStart.getTime() + 24 * 3600000);
  const inWindow = t => t >= dayStart && t <= windowEnd;
  const windowEvents = [];
  const push = (hits, risingLabel, settingLabel, cls) => {
    for (const h of hits) if (inWindow(h.time)) windowEvents.push({ time: h.time, label: h.rising ? risingLabel : settingLabel, cls });
  };
  push(sHits, '日の出', '日の入り', 'sun');
  push(astroHits, '天文薄明終了', '天文薄明開始', 'astro');
  push(moonHits, '月の出', '月の入り', 'moon');
  windowEvents.sort((a, b) => a.time - b.time);

  const rise = sHits.find(h => h.rising && h.time < nextDayStart) || null;
  const set = sHits.find(h => !h.rising && h.time < nextDayStart) || null;
  const astroStart = astroHits.find(h => !h.rising && h.time >= dayStart && h.time < nextDayStart) || null;
  const astroEnd = astroStart ? (astroHits.find(h => h.rising && h.time > astroStart.time) || null) : null;
  const moonDay = moonHits.filter(h => h.time < nextDayStart);
  const moonrise = moonDay.find(h => h.rising) || null;
  const moonset = moonDay.find(h => !h.rising) || moonHits.find(h => !h.rising && h.time >= nextDayStart) || null;

  // 昼の長さ・太陽最大高度・暗夜の長さ
  let maxAlt = -90;
  for (let m = 0; m <= 24 * 60; m += 10) {
    const t = new Date(dayStart.getTime() + m * 60000);
    const a = sunAltAz(t, lat, lon).alt;
    if (a > maxAlt) maxAlt = a;
  }
  return {
    sunrise: rise ? rise.time : null, sunset: set ? set.time : null,
    astroStart: astroStart ? astroStart.time : null, astroEnd: astroEnd ? astroEnd.time : null,
    moonrise: moonrise ? moonrise.time : null, moonset: moonset ? moonset.time : null,
    sunMaxAlt: maxAlt, dayLengthMin: (rise && set) ? (set.time - rise.time) / 60000 : null,
    nightLengthMin: (astroStart && astroEnd) ? (astroEnd.time - astroStart.time) / 60000 : null,
    windowEvents, nextSunrise: nextSunriseHit ? nextSunriseHit.time : null,
  };
}

/* 軌道図用サンプル (指定日 0:00〜24:00, 10 分刻み) */
function trajectory(lat, lon, dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const start = new Date(y, mo - 1, d, 0, 0, 0).getTime();
  const sun = [], moon = [];
  for (let m = 0; m <= 24 * 60; m += 10) {
    const t = new Date(start + m * 60000);
    sun.push({ time: t, ...sunAltAz(t, lat, lon) });
    moon.push({ time: t, ...moonAltAz(t, lat, lon) });
  }
  return { sun, moon };
}

/* ---------- 月齢 ---------- */
const SYNODIC = 29.530588853;
const NEW_MOON_JD = 2451550.1; // 2000-01-06 18:14 UTC の新月（基準）
function moonAge(date) {
  const jd = julianDay(date);
  return ((jd - NEW_MOON_JD) % SYNODIC + SYNODIC) % SYNODIC;
}

/* ---------- 表示用 ---------- */
function toDMS(value, posLabel, negLabel) {
  const hemi = value >= 0 ? posLabel : negLabel;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round((((abs - deg) * 60) - min) * 60);
  if (sec === 60) { sec = 0; min++; }
  if (min === 60) { min = 0; deg++; }
  const p2 = n => String(n).padStart(2, '0');
  return `${deg}° ${p2(min)}′ ${p2(sec)}″ ${hemi}`;
}
function fmtTime(date) {
  if (!date) return '—';
  const p2 = n => String(n).padStart(2, '0');
  const next = date.getDate() !== new Date().getDate() && date.getHours() < 12 ? '' : '';
  return `${p2(date.getHours())}:${p2(date.getMinutes())}`;
}
function moonPhaseName(illum) {
  if (illum < 0.03) return '新月';
  if (illum > 0.97) return '満月';
  if (illum < 0.47) return '三日月〜半月';
  if (illum < 0.53) return '半月';
  return '半月〜満月';
}

if (typeof module !== 'undefined') module.exports = { julianDay, sunEcliptic, moonEcliptic, sunAltAz, moonAltAz, dayEvents, trajectory, moonAge, SYNODIC, toDMS, fmtTime, moonPhaseName };
