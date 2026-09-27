// Extract the mainland Southeast Asia river network from HydroRIVERS v1.0 (Asia)
// and write a compact JSON consumed by the app.
//
// Source: Lehner & Grill (2013), HydroSHEDS — https://www.hydrosheds.org/products/hydrorivers
// Input:  .cache/HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as.{shp,dbf}
// Output: public/data/rivers.json

import * as shapefile from 'shapefile';
import simplify from '@turf/simplify';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = '.cache/HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as';
const BBOX = [92.0, 5.0, 110.0, 24.5]; // lon/lat — Irrawaddy to the Red River, Malay peninsula to Yunnan border
const MIN_DISCHARGE = 12; // m³/s long-term mean; keeps the visible skeleton, drops creeks

// Thailand outline (Natural Earth 1:50m) — used to tag reaches and to spotlight the country.
const NE = '.cache/ne_50m_admin_0_countries.geojson';
if (!existsSync(NE)) {
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
  writeFileSync(NE, Buffer.from(await (await fetch(url)).arrayBuffer()));
}
const thailand = JSON.parse(readFileSync(NE, 'utf8')).features.find((f) => f.properties.ADM0_A3 === 'THA').geometry;
const rings = thailand.type === 'Polygon' ? [thailand.coordinates] : thailand.coordinates; // [polygon][ring][pt]
function inThailand([x, y]) {
  let inside = false;
  for (const poly of rings) {
    const ring = poly[0];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// Distance (degrees, roughly) from a point to Thailand's border — catches border rivers such as
// the Mekong, whose centreline wanders a few hundred metres either side of the line.
const borderSegs = rings.flatMap((poly) => poly[0].slice(1).map((p, i) => [poly[0][i], p]));
function nearBorder([x, y], tol) {
  for (const [[x1, y1], [x2, y2]] of borderSegs) {
    if (Math.max(x1, x2) < x - tol || Math.min(x1, x2) > x + tol || Math.max(y1, y2) < y - tol || Math.min(y1, y2) > y + tol) continue;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)) < tol) return true;
  }
  return false;
}
const isThaiReach = (pts) => pts.some(inThailand) || nearBorder(pts[Math.floor(pts.length / 2)], 0.03);

const inBox = ([x, y]) => x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3];
const round = (v) => Math.round(v * 1e4) / 1e4;

const source = await shapefile.open(`${SRC}.shp`, `${SRC}.dbf`);
const reaches = [];
let seen = 0;
for (;;) {
  const { done, value } = await source.read();
  if (done) break;
  seen++;
  const p = value.properties;
  if (p.DIS_AV_CMS < MIN_DISCHARGE) continue;
  const coords = value.geometry.coordinates;
  if (!inBox(coords[0]) && !inBox(coords[coords.length - 1])) continue;

  const simple = simplify(value, { tolerance: 0.004, highQuality: false }).geometry.coordinates;
  reaches.push({
    id: p.HYRIV_ID,
    down: p.NEXT_DOWN,
    main: p.MAIN_RIV,
    q: Math.round(p.DIS_AV_CMS * 10) / 10,
    ord: p.ORD_FLOW,
    up: Math.round(p.UPLAND_SKM),
    len: Math.round(p.LENGTH_KM * 10) / 10,
    c: simple.map(([x, y]) => [round(x), round(y)]),
    th: isThaiReach(simple) ? 1 : 0,
  });
}

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/rivers.json', JSON.stringify({ bbox: BBOX, reaches }));
writeFileSync(
  'public/data/thailand.json',
  JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: rings.map((p) => p.map((r) => r.map(([x, y]) => [round(x), round(y)]))) } }),
);
console.log(`scanned ${seen} reaches, kept ${reaches.length}`);
