"use strict";
/* 惑星の位置（水星〜土星・低精度表示用途）
 * JPL「Approximate Positions of the Planets」Table 1 のケプラー軌道要素
 * （1800 AD — 2050 AD 対象、J2000 平均黄道・春分点基準）で計算する。
 * 誤差の目安（同表）: 水星 15″ / 金星 20″ / 火星 40″ / 木星 400″ / 土星 600″（黄経）。
 * 計算は端末内で完結し、外部データの取得は行わない。
 * astro.js の julianDay / altAz / sunEcliptic を利用する（ブラウザでは同一グローバル、Node では require 側で束ねる）。
 */
const PLANETS = [
  //          a            e            I            L             long.peri.     long.node.   名称
  { name: '水星', a: 0.38709927, e: 0.20563593, I: 7.00497902,  L: 252.25032350, peri: 77.45779628,   node: 48.33076593,
    da: 0.00000037, de: 0.00001906, dI: -0.00594749, dL: 149472.67411175, dperi: 0.16047689,  dnode: -0.12534081 },
  { name: '金星', a: 0.72333566, e: 0.00677672, I: 3.39467605,  L: 181.97909950, peri: 131.60246718,  node: 76.67984255,
    da: 0.00000390, de: -0.00004107, dI: -0.00078890, dL: 58517.81538729,  dperi: 0.00268329,  dnode: -0.27769418 },
  { name: '火星', a: 1.52371034, e: 0.09339410, I: 1.84969142,  L: -4.55343205,  peri: -23.94362959,  node: 49.55953891,
    da: 0.00001847, de: 0.00007882, dI: -0.00813131, dL: 19140.30268499,  dperi: 0.44441088,  dnode: -0.29257343 },
  { name: '木星', a: 5.20288700, e: 0.04838624, I: 1.30439695,  L: 34.39644051,  peri: 14.72847983,   node: 100.47390909,
    da: -0.00011607, de: -0.00013253, dI: -0.00183714, dL: 3034.74612775,   dperi: 0.21252668,  dnode: 0.20469106 },
  { name: '土星', a: 9.53667594, e: 0.05386179, I: 2.48599187,  L: 49.95424423,  peri: 92.59887831,   node: 113.66242448,
    da: -0.00125060, de: -0.00050991, dI: 0.00193609,  dL: 1222.49362201,   dperi: -0.41897216, dnode: -0.28867794 },
];
// 地球-月バリセンタ（EM Bary）の軌道要素（衝突回避のため惑星から地球位置を求める）
const EARTH = { a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, peri: 102.93768193, node: 0.0,
  da: 0.00000562, de: -0.00004392, dI: -0.01294668, dL: 35999.37244981, dperi: 0.32327364, dnode: 0.0 };

function keplerEcliptic(el, T) {
  const a = el.a + el.da * T;
  const e = el.e + el.de * T;
  const I = el.I + el.dI * T;
  const L = el.L + el.dL * T;
  const peri = el.peri + el.dperi * T;
  const node = el.node + el.dnode * T;
  const omega = peri - node; // 近点引数
  let M = L - peri;          // 平均近点角
  // Kepler方程式 E - e sinE = M を Newton 法で解く
  let E = M + e * Math.sin(M * Math.PI / 180) * (1 + e * Math.cos(M * Math.PI / 180));
  for (let i = 0; i < 30; i++) {
    const Mr = M * Math.PI / 180, Er = E * Math.PI / 180;
    const f = E - e * (180 / Math.PI) * Math.sin(Er) - M;
    const fp = 1 - e * Math.cos(Er);
    const dE = -f / fp;
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  const cosE = Math.cos(E * Math.PI / 180), sinE = Math.sin(E * Math.PI / 180);
  const x0 = a * (cosE - e);
  const y0 = a * Math.sqrt(1 - e * e) * sinE;
  const cw = Math.cos(omega * Math.PI / 180), sw = Math.sin(omega * Math.PI / 180);
  const cO = Math.cos(node * Math.PI / 180), sO = Math.sin(node * Math.PI / 180);
  const cI = Math.cos(I * Math.PI / 180), sI = Math.sin(I * Math.PI / 180);
  return {
    x: (cw * cO - sw * sO * cI) * x0 + (-sw * cO - cw * sO * cI) * y0,
    y: (cw * sO + sw * cO * cI) * x0 + (-sw * sO + cw * cO * cI) * y0,
    z: (sw * sI) * x0 + (cw * sI) * y0,
  };
}

/* 地心黄道座標（lon/lat: 度、dist: AU）を返す */
function planetEcliptic(name, date) {
  const p = PLANETS.find(x => x.name === name);
  if (!p) return null;
  const T = (julianDay(date) - 2451545.0) / 36525;
  const hp = keplerEcliptic(p, T);
  const he = keplerEcliptic(EARTH, T);
  const x = hp.x - he.x, y = hp.y - he.y, z = hp.z - he.z;
  const dist = Math.hypot(x, y, z);
  return {
    lon: norm360(Math.atan2(y, x) * 180 / Math.PI),
    lat: Math.asin(z / dist) * 180 / Math.PI,
    dist,
  };
}

/* 黄道座標 → 赤道座標（平均黄道傾斜）→ 高度・方位 */
function planetAltAz(name, date, lat, lon) {
  const g = planetEcliptic(name, date);
  if (!g) return null;
  const e = 23.439 - 0.00000036 * (julianDay(date) - 2451545.0);
  const cl = Math.cos(g.lon * Math.PI / 180), sl = Math.sin(g.lon * Math.PI / 180);
  const cb = Math.cos(g.lat * Math.PI / 180), sb = Math.sin(g.lat * Math.PI / 180);
  const ce = Math.cos(e * Math.PI / 180), se = Math.sin(e * Math.PI / 180);
  const x = cb * cl, y = cb * sl * ce - sb * se, z = cb * sl * se + sb * ce;
  const ra = norm360(Math.atan2(y, x) * 180 / Math.PI);
  const dec = Math.asin(z) * 180 / Math.PI;
  return { ...altAz(ra, dec, date, lat, lon), ra, dec, dist: g.dist };
}

function planetsAltAz(date, lat, lon) {
  return PLANETS.map(p => ({ name: p.name, ...planetAltAz(p.name, date, lat, lon) }));
}

if (typeof module !== 'undefined') module.exports = { PLANETS, planetEcliptic, planetAltAz, planetsAltAz, keplerEcliptic };
