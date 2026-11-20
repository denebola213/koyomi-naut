"use strict";
/* astro.js 単体テスト (Node標準 node:test / node:assert、依存ゼロ)
 * 前提: TZ=Asia/Tokyo で実行 (dayEvents 等はローカル時刻で走査するため)。
 *   npm test / node --test test/
 * 低精度 Meeus のため時刻は厳密一致ではなく許容誤差で判定する。
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  julianDay, sunEcliptic, moonEcliptic, sunAltAz, moonAltAz,
  dayEvents, trajectory, moonAge, SYNODIC, toDMS, fmtTime,
  moonPhaseName, quarterCrossing, phaseAngle, distanceRatioPct,
  PERIGEE_KM, APOGEE_KM,
} = require('../astro.js');

// 東京都千代田区 (app.js の既定地点)
const LAT = 35.6812, LON = 139.7671;

function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
function assertTimeNear(actual, hhmm, tolMin, label) {
  assert.ok(actual instanceof Date && !Number.isNaN(actual.getTime()), `${label} が時刻でない: ${actual}`);
  const want = hhmm[0] * 60 + hhmm[1];
  assert.ok(Math.abs(minutesOfDay(actual) - want) <= tolMin,
    `${label} が ${want}±${tolMin}分 の範囲外: ${minutesOfDay(actual).toFixed(1)}分 (${actual})`);
}

test('julianDay: Unix epoch は 2440587.5', () => {
  assert.equal(julianDay(new Date(0)), 2440587.5);
});

test('sunEcliptic: 黄経・赤経は 0..360、赤緯は -23.5..23.5', () => {
  const s = sunEcliptic(new Date(Date.UTC(2000, 0, 1, 12)));
  assert.ok(s.lon >= 0 && s.lon < 360);
  assert.ok(s.ra >= 0 && s.ra < 360);
  assert.ok(s.dec >= -23.5 && s.dec <= 23.5);
  // 2000-01-01 12:00 UTC = J2000付近。太陽黄経は約 280.4°
  assert.ok(Math.abs(s.lon - 280.4) < 0.5, `lon=${s.lon}`);
});

test('moonEcliptic: 距離は近点〜遠点の近傍、照度は 0..1', () => {
  const m = moonEcliptic(new Date(2026, 0, 1, 12, 0, 0));
  assert.ok(m.dist >= PERIGEE_KM - 45000 && m.dist <= APOGEE_KM + 5000, `dist=${m.dist}`);
  assert.ok(m.illum >= 0 && m.illum <= 1);
  assert.ok(m.lat >= -6 && m.lat <= 6);
});

test('moonEcliptic: 月黄経が外部暦 (DE440s) と ±0.1° で一致する (2026-11-20 12:00 JST)', () => {
  // #18: 楕円補正 6.289 sin M′ 等の欠落は最大 6.4° のずれを生む。絶対値を固定する。
  const lon = moonEcliptic(new Date(2026, 10, 20, 12, 0, 0)).lon;
  assert.ok(Math.abs(lon - 358.42) < 0.1, `lon=${lon}`);
});

test('moonPhaseName: 満月 2026-09-27 にラベルを返す (#18)', () => {
  assert.equal(moonPhaseName(new Date(2026, 8, 27, 12)), '満月');
});

test('sunAltAz/moonAltAz: 高度は -90..90、方位は 0..360', () => {
  const t = new Date(2026, 5, 21, 12, 0, 0);
  for (const p of [sunAltAz(t, LAT, LON), moonAltAz(t, LAT, LON)]) {
    assert.ok(p.alt >= -90 && p.alt <= 90, `alt=${p.alt}`);
    assert.ok(p.az >= 0 && p.az < 360, `az=${p.az}`);
    assert.ok(Number.isFinite(p.hourAngle));
  }
});

test('dayEvents: 東京の日の出・日の入り (春分の日 2026-03-20)', () => {
  const e = dayEvents(LAT, LON, '2026-03-20');
  assertTimeNear(e.sunrise, [5, 45], 4, '日の出');
  assertTimeNear(e.sunset, [17, 52], 4, '日の入り');
  assert.ok(e.sunrise < e.sunset);
  // 春分ごろなので昼は約12時間
  assert.ok(Math.abs(e.dayLengthMin - 727) < 10, `dayLengthMin=${e.dayLengthMin}`);
  // 日の長さが日の出→日の入りの差と一致する
  assert.ok(Math.abs((e.sunset - e.sunrise) / 60000 - e.dayLengthMin) < 0.2);
});

test('dayEvents: 夏至・冬至は昼の長さが最大・最小', () => {
  const summer = dayEvents(LAT, LON, '2026-06-21');
  const winter = dayEvents(LAT, LON, '2026-12-21');
  assertTimeNear(summer.sunrise, [4, 25], 4, '夏至日の出');
  assertTimeNear(summer.sunset, [18, 59], 4, '夏至日の入り');
  assertTimeNear(winter.sunrise, [6, 46], 4, '冬至日の出');
  assertTimeNear(winter.sunset, [16, 31], 4, '冬至日の入り');
  assert.ok(summer.dayLengthMin > winter.dayLengthMin);
  assert.ok(summer.sunMaxAlt > winter.sunMaxAlt);
  assert.ok(Math.abs(summer.dayLengthMin - 875) < 10);
  assert.ok(Math.abs(winter.dayLengthMin - 585) < 10);
});

test('dayEvents: 天文薄明は日の出・日の入りの外側にある', () => {
  const e = dayEvents(LAT, LON, '2026-06-21');
  assert.ok(e.astroStart && e.astroEnd, '薄明時刻が無い');
  assert.ok(e.astroStart > e.sunset);
  assert.ok(e.astroEnd < e.nextSunrise);
  assert.ok(Math.abs((e.astroEnd - e.astroStart) / 60000 - e.nightLengthMin) < 0.2);
});

test('dayEvents: windowEvents は時刻順で太陽の南中を含む', () => {
  const e = dayEvents(LAT, LON, '2026-03-20');
  assert.ok(e.windowEvents.length >= 8, `windowEvents=${e.windowEvents.length}`);
  for (let i = 1; i < e.windowEvents.length; i++) {
    assert.ok(e.windowEvents[i].time >= e.windowEvents[i - 1].time, '時刻順でない');
  }
  const labels = e.windowEvents.map(w => w.label);
  assert.ok(labels.includes('太陽の南中'));
  // 南中は日の出より後で日の入りより前
  const transit = e.windowEvents.find(w => w.label === '太陽の南中');
  assert.ok(transit.time > e.sunrise && transit.time < e.sunset);
  for (const w of e.windowEvents) {
    assert.ok(['sun', 'moon', 'astro'].includes(w.cls), `cls=${w.cls}`);
    assert.ok(typeof w.label === 'string' && w.label.length > 0);
  }
});

test('dayEvents: 極昼・極夜の緯度でも落ちない', () => {
  // 北極付近: 6月は太陽が沈まず日の出/日の入りが無くても例外にならないこと
  const e = dayEvents(78, 15, '2026-06-21');
  assert.equal(e.sunrise, null);
  assert.equal(e.sunset, null);
  assert.equal(e.dayLengthMin, null);
  assert.ok(Array.isArray(e.windowEvents));
});

test('trajectory: 0:00〜24:00 を10分刻みで返す', () => {
  const t = trajectory(LAT, LON, '2026-03-20');
  assert.equal(t.sun.length, 145);
  assert.equal(t.moon.length, 145);
  assert.equal(t.sun[0].time.getHours(), 0);
  assert.equal(t.sun[0].time.getMinutes(), 0);
  for (const p of [...t.sun, ...t.moon]) {
    assert.ok(Number.isFinite(p.alt) && Number.isFinite(p.az));
  }
});

test('moonAge: 0..SYNODIC の範囲、新月基準日はほぼ0', () => {
  const ref = moonAge(new Date(Date.UTC(2000, 0, 6, 18, 14))); // 基準の新月
  assert.ok(ref < 1, `ref=${ref}`);
  for (const d of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    const age = moonAge(new Date(`${d}T12:00:00`));
    assert.ok(age >= 0 && age < SYNODIC, `${d} age=${age}`);
  }
});

test('moonAge: 月齢カレンダー（正午・連続日）で1日ごとに約1増え SYNODIC で巻き戻る', () => {
  // 月齢カレンダーは各日正午の moonAge() を並べるだけ。月内連続日で
  // 前日からの差が +1（巻き戻り時は +1-SYNODIC）になることを確認する。
  let prev = null;
  for (let d = 1; d <= 31; d++) {
    const age = moonAge(new Date(2026, 0, d, 12));
    assert.ok(age >= 0 && age < SYNODIC, `d=${d} age=${age}`);
    if (prev != null) {
      const diff = ((age - prev) % SYNODIC + SYNODIC) % SYNODIC;
      assert.ok(Math.abs(diff - 1) < 0.01, `d=${d} diff=${diff}`);
    }
    prev = age;
  }
});

test('phaseAngle: 0..360 の範囲', () => {
  for (let m = 0; m < 12; m++) {
    const p = phaseAngle(new Date(2026, m, 15, 12));
    assert.ok(p >= 0 && p < 360, `${m}月 p=${p}`);
  }
});

test('moonPhaseName/quarterCrossing: 四大相の日はラベルが返り、交差時刻が位相角と一致する', () => {
  // 2026年1月の既知の四大相付近の日
  assert.equal(moonPhaseName(new Date(2026, 0, 3, 12)), '満月');
  assert.equal(moonPhaseName(new Date(2026, 0, 11, 12)), '下弦');
  assert.equal(moonPhaseName(new Date(2026, 0, 19, 12)), '新月');
  assert.equal(moonPhaseName(new Date(2026, 0, 26, 12)), '上弦');
  // 四大相から離れた日は空文字
  assert.equal(moonPhaseName(new Date(2026, 0, 8, 12)), '');

  const noon = new Date(2026, 0, 3, 12).getTime();
  const cross = quarterCrossing(noon, 180); // 満月
  assert.ok(cross instanceof Date);
  assert.ok(Math.abs(phaseAngle(cross) - 180) < 1, `phaseAngle=${phaseAngle(cross)}`);
  assert.ok(Math.abs(cross.getTime() - noon) <= 1.5 * 86400000);
});

test('distanceRatioPct: 近点0%・遠点100%・中点50%', () => {
  assert.equal(distanceRatioPct(PERIGEE_KM), 0);
  assert.equal(distanceRatioPct(APOGEE_KM), 100);
  assert.equal(distanceRatioPct((PERIGEE_KM + APOGEE_KM) / 2), 50);
  assert.equal(PERIGEE_KM, 356500);
  assert.equal(APOGEE_KM, 406700);
});

test('distanceRatioPct: 400日走査で 0..100 に収まる (#19)', () => {
  for (let i = 0; i < 400; i++) {
    const dist = moonEcliptic(new Date(2026, 0, 1 + i, 12)).dist;
    const pct = distanceRatioPct(dist);
    assert.ok(pct >= 0 && pct <= 100, `i=${i} dist=${dist} pct=${pct}`);
  }
  // clamp: 範囲外の距離でも 0..100 を外れない
  assert.equal(distanceRatioPct(PERIGEE_KM - 10000), 0);
  assert.equal(distanceRatioPct(APOGEE_KM + 10000), 100);
});

test('toDMS: 緯度・経度の表記と桁上がり', () => {
  assert.equal(toDMS(35.6812, 'N', 'S'), '35° 40′ 52″ N');
  assert.equal(toDMS(-33.8688, 'N', 'S'), '33° 52′ 08″ S');
  assert.equal(toDMS(139.7671, 'E', 'W'), '139° 46′ 02″ E');
  assert.equal(toDMS(-0.1, 'E', 'W'), '0° 06′ 00″ W');
});

test('fmtTime: null はダッシュ、時刻は HH:MM', () => {
  assert.equal(fmtTime(null), '—');
  assert.equal(fmtTime(new Date(2026, 0, 1, 5, 7)), '05:07');
  assert.equal(fmtTime(new Date(2026, 0, 1, 23, 59)), '23:59');
});
