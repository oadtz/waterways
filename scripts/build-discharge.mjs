// Build the daily river-discharge timelapse.
//
// 1. Pick ~150 "virtual gauges" along the larger rivers in rivers.json.
// 2. Snap each gauge to the GloFAS v4 grid cell (0.05°) that actually carries the river:
//    the nearest cell often belongs to a side stream, so we scan a 5×5 neighbourhood and keep
//    the cell whose flow best matches HydroRIVERS' long-term mean for that reach.
// 3. Fetch one year of daily discharge + 30 days of forecast for each snapped cell.
//
// Source: GloFAS v4 via Open-Meteo Flood API — https://open-meteo.com/en/docs/flood-api
// Output: public/data/discharge.json

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CACHE = '.cache/open-meteo';
mkdirSync(CACHE, { recursive: true });

const { reaches } = JSON.parse(readFileSync('public/data/rivers.json', 'utf8'));

const DAY = 86400e3;
const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const iso = (d) => d.toISOString().slice(0, 10);
// Open-Meteo's free tier weights long requests (≈1 call per 2 weeks of data per location) and
// caps at 10k calls/day, so the default window is six months. `DAYS=365 npm run data` for a year.
const DAYS = Number(process.env.DAYS ?? 183);
const START = iso(new Date(today - DAYS * DAY));
const END = iso(new Date(+today + 30 * DAY));

// ---------- gauge selection ----------
const MIN_Q = 150;
const km = ([x1, y1], [x2, y2]) => {
  const dx = (x2 - x1) * 111.32 * Math.cos(((y1 + y2) / 2) * (Math.PI / 180));
  const dy = (y2 - y1) * 110.57;
  return Math.hypot(dx, dy);
};
const mid = (c) => c[Math.floor(c.length / 2)];

const candidates = reaches.filter((r) => r.q >= MIN_Q).sort((a, b) => b.q - a.q);
const gauges = [];
for (const r of candidates) {
  const p = mid(r.c);
  // Big rivers get denser gauges; the spacing grows as flow shrinks.
  const spacing = r.q > 3000 ? 70 : r.q > 800 ? 60 : 55;
  if (gauges.some((g) => km(g.p, p) < spacing)) continue;
  gauges.push({ reach: r.id, main: r.main, q: r.q, p });
}
console.log(`gauges: ${gauges.length}`);

// ---------- open-meteo client ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function om(params, weight) {
  const url = `https://flood-api.open-meteo.com/v1/flood?${new URLSearchParams(params)}`;
  const file = `${CACHE}/${createHash('sha1').update(url).digest('hex')}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    } catch (err) {
      if (attempt > 6) throw err;
      console.warn(`  network: ${err.cause?.code ?? err.message} — retry in 10s`);
      await sleep(10_000);
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      await sleep(weight * 110); // stay well under 600 calls/min
      return json;
    }
    const body = await res.text();
    if (attempt > 20) throw new Error(`${res.status} ${body}`);
    const wait = res.status !== 429 ? 5_000 * (attempt + 1) : /hourly/i.test(body) ? 300_000 : /daily/i.test(body) ? 3_600_000 : 65_000;
    console.warn(`  ${res.status} ${body.slice(0, 120)} — retry in ${wait / 1000}s`);
    await sleep(wait);
  }
}
const asList = (j) => (Array.isArray(j) ? j : [j]);

// ---------- snapping ----------
const G = 0.05;
const cellCentre = (v) => Math.round((v - 0.025) / G) * G + 0.025;
const SNAP_FROM = '2024-09-20';
const SNAP_TO = '2024-10-10'; // late monsoon: most rivers run ~1.5–2.5× their annual mean
const SEASON = 1.9;

const snapped = [];
for (let i = 0; i < gauges.length; i += 4) {
  const batch = gauges.slice(i, i + 4);
  const cells = [];
  for (const g of batch) {
    const cx = cellCentre(g.p[0]);
    const cy = cellCentre(g.p[1]);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) cells.push({ g, x: +(cx + dx * G).toFixed(3), y: +(cy + dy * G).toFixed(3) });
  }
  const json = asList(
    await om(
      {
        latitude: cells.map((c) => c.y).join(','),
        longitude: cells.map((c) => c.x).join(','),
        daily: 'river_discharge',
        start_date: SNAP_FROM,
        end_date: SNAP_TO,
      },
      cells.length * 1.5,
    ),
  );
  json.forEach((loc, k) => {
    const v = loc.daily.river_discharge.filter((x) => x != null);
    cells[k].mean = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  });
  for (const g of batch) {
    const mine = cells.filter((c) => c.g === g && c.mean > 0);
    const target = Math.log(g.q * SEASON);
    let best = null;
    let bestScore = Infinity;
    for (const c of mine) {
      const score = Math.abs(Math.log(c.mean) - target) + km(g.p, [c.x, c.y]) / 40;
      if (score < bestScore) (bestScore = score), (best = c);
    }
    // Reject gauges where no cell is within ~×4 of the expected flow — GloFAS doesn't see that river.
    if (best && bestScore < Math.log(4)) snapped.push({ ...g, cell: [best.x, best.y], fit: +bestScore.toFixed(2) });
  }
  process.stdout.write(`\r  snapped ${snapped.length}/${Math.min(i + 4, gauges.length)}`);
}
console.log();

// ---------- series ----------
const series = [];
let time = null;
for (let i = 0; i < snapped.length; i += 5) {
  const batch = snapped.slice(i, i + 5);
  const json = asList(
    await om(
      {
        latitude: batch.map((g) => g.cell[1]).join(','),
        longitude: batch.map((g) => g.cell[0]).join(','),
        daily: 'river_discharge',
        start_date: START,
        end_date: END,
      },
      batch.length * 30,
    ),
  );
  json.forEach((loc) => {
    time ??= loc.daily.time;
    series.push(loc.daily.river_discharge.map((v) => (v == null ? null : Math.round(v * 10) / 10)));
  });
  process.stdout.write(`\r  series ${series.length}/${snapped.length}`);
}
console.log();

// ---------- reach → gauge assignment ----------
// Each reach borrows the relative anomaly (Q(t) / annual mean) of the closest gauge on the same
// river system, falling back to the closest gauge anywhere.
const byMain = new Map();
snapped.forEach((g, k) => {
  if (!byMain.has(g.main)) byMain.set(g.main, []);
  byMain.get(g.main).push(k);
});
const assign = reaches.map((r) => {
  const p = mid(r.c);
  const pool = byMain.get(r.main) ?? snapped.map((_, k) => k);
  let best = pool[0];
  let bestD = Infinity;
  for (const k of pool) {
    const d = km(snapped[k].p, p);
    if (d < bestD) (bestD = d), (best = k);
  }
  return best;
});

const out = {
  source: 'GloFAS v4 (Copernicus EMS) via Open-Meteo Flood API',
  generated: new Date().toISOString(),
  time,
  forecastFrom: iso(today),
  gauges: snapped.map((g, k) => ({ reach: g.reach, p: g.p, cell: g.cell, q: g.q, series: series[k] })),
  assign,
};
writeFileSync('public/data/discharge.json', JSON.stringify(out));
console.log(`wrote ${snapped.length} gauges × ${time.length} days`);
