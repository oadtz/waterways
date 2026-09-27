// "Is there water around me?" — gathers every signal within a few kilometres of a point and ranks
// it. Satellite flood and radar tiles are read pixel by pixel at the user's location, so the answer
// is about *this* neighbourhood, not the province.

import type { RainStation, WaterStation } from './data';

export type Signal =
  | { kind: 'flood'; km: number; pixels: number; date: string }
  | { kind: 'radar'; km: number; intensity: 'light' | 'moderate' | 'heavy' }
  | { kind: 'gauge'; km: number; station: WaterStation }
  | { kind: 'rain'; km: number; rain: RainStation };

export type Nearby = { verdict: 'danger' | 'watch' | 'clear'; signals: Signal[]; radiusKm: number; checkedFlood: boolean; checkedRadar: boolean };

export const km = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)), (b[1] - a[1]) * 110.57);

// ---------------------------------------------------------------- tile sampling

const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z * 256;
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * 256;
};

type Hit = { km: number; rgba: [number, number, number, number] };

/** Read every pixel within `radiusKm` of a point from an XYZ raster template ({z}/{x}/{y}). */
async function samplePixels(template: string, [lon, lat]: [number, number], z: number, radiusKm: number, signal?: AbortSignal): Promise<Hit[] | null> {
  const px = lon2x(lon, z);
  const py = lat2y(lat, z);
  const mPerPx = (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  const r = (radiusKm * 1000) / mPerPx;
  const tx0 = Math.floor((px - r) / 256);
  const tx1 = Math.floor((px + r) / 256);
  const ty0 = Math.floor((py - r) / 256);
  const ty1 = Math.floor((py + r) / 256);
  const hits: Hit[] = [];
  let anyTile = false;
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const url = template.replace('{z}', String(z)).replace('{x}', String(tx)).replace('{y}', String(ty));
      let bmp: ImageBitmap;
      try {
        const res = await fetch(url, { signal, cache: 'force-cache' });
        if (!res.ok) continue;
        bmp = await createImageBitmap(await res.blob());
      } catch {
        continue;
      }
      anyTile = true;
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      } catch {
        continue;
      }
      const scale = bmp.width / 256;
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const d = Math.hypot(tx * 256 + x - px, ty * 256 + y - py);
          if (d > r) continue;
          const i = (Math.floor(y * scale) * bmp.width + Math.floor(x * scale)) * 4;
          if (!data[i + 3]) continue;
          hits.push({ km: (d * mPerPx) / 1000, rgba: [data[i], data[i + 1], data[i + 2], data[i + 3]] });
        }
      }
    }
  }
  return anyTile ? hits : null;
}

// MODIS combined flood palette: flood = red (250,30,36). Permanent water and cloud are ignored.
async function floodNear(template: string, me: [number, number], radiusKm: number, date: string, signal?: AbortSignal) {
  const hits = await samplePixels(template, me, 9, radiusKm, signal);
  if (!hits) return null;
  const flood = hits.filter((h) => h.rgba[0] > 230 && h.rgba[1] < 80 && h.rgba[2] < 80);
  if (!flood.length) return [] as Signal[];
  const nearest = Math.min(...flood.map((h) => h.km));
  return [{ kind: 'flood', km: nearest, pixels: flood.length, date } as Signal];
}

// RainViewer "universal blue": blues are light–moderate, yellow heavy, red/magenta intense.
async function radarNear(template: string, me: [number, number], radiusKm: number, signal?: AbortSignal) {
  const hits = await samplePixels(template, me, 7, radiusKm, signal);
  if (!hits) return null;
  const graded = hits
    .map((h) => {
      const [r, g, b] = h.rgba;
      const intensity = r > 200 && g < 150 ? 'heavy' : r > 200 && g >= 150 && b < 110 ? 'moderate' : b > r + 30 ? 'light' : null;
      return intensity ? { km: h.km, intensity } : null;
    })
    .filter(Boolean) as { km: number; intensity: 'light' | 'moderate' | 'heavy' }[];
  if (!graded.length) return [] as Signal[];
  const rank = { heavy: 3, moderate: 2, light: 1 } as const;
  const strongest = graded.reduce((a, b) => (rank[b.intensity] > rank[a.intensity] || (b.intensity === a.intensity && b.km < a.km) ? b : a));
  return [{ kind: 'radar', km: strongest.km, intensity: strongest.intensity } as Signal];
}

// ---------------------------------------------------------------- assessment

export async function assessNearby(opts: {
  me: [number, number];
  stations: WaterStation[];
  rain: RainStation[];
  floodTemplate?: string;
  floodDate?: string;
  radarTemplate?: string;
  radiusKm?: number;
  signal?: AbortSignal;
}): Promise<Nearby> {
  const radiusKm = opts.radiusKm ?? 5;
  const { me } = opts;
  const signals: Signal[] = [];

  for (const s of opts.stations) {
    const d = km(me, [s.lon, s.lat]);
    if (d <= radiusKm * 2) signals.push({ kind: 'gauge', km: d, station: s });
  }
  for (const r of opts.rain) {
    const d = km(me, [r.lon, r.lat]);
    if (d <= radiusKm && (r.mm24 >= 10 || (r.mm1 ?? 0) >= 5)) signals.push({ kind: 'rain', km: d, rain: r });
  }
  const [flood, radar] = await Promise.all([
    opts.floodTemplate ? floodNear(opts.floodTemplate, me, radiusKm, opts.floodDate ?? '', opts.signal).catch(() => null) : null,
    opts.radarTemplate ? radarNear(opts.radarTemplate, me, Math.min(radiusKm, 3), opts.signal).catch(() => null) : null,
  ]);
  if (flood) signals.push(...flood);
  if (radar) signals.push(...radar);

  const danger = signals.some(
    (s) =>
      (s.kind === 'flood' && s.km <= 3) ||
      (s.kind === 'gauge' && s.station.level >= 5 && s.km <= radiusKm) ||
      (s.kind === 'rain' && (s.rain.mm24 >= 90 || (s.rain.mm1 ?? 0) >= 30)),
  );
  const watch = signals.some(
    (s) =>
      s.kind === 'flood' ||
      (s.kind === 'radar' && s.intensity !== 'light') ||
      (s.kind === 'gauge' && s.station.level >= 4 && s.km <= radiusKm * 2) ||
      (s.kind === 'rain' && s.rain.mm24 >= 35),
  );
  // Rank: most urgent first, then nearest.
  const urgency = (s: Signal) =>
    s.kind === 'flood' ? 5 : s.kind === 'gauge' ? s.station.level : s.kind === 'radar' ? (s.intensity === 'heavy' ? 4 : 2) : s.rain.mm24 >= 90 ? 5 : s.rain.mm24 >= 35 ? 4 : 2;
  signals.sort((a, b) => urgency(b) - urgency(a) || a.km - b.km);
  return { verdict: danger ? 'danger' : watch ? 'watch' : 'clear', signals, radiusKm, checkedFlood: flood != null, checkedRadar: radar != null };
}
