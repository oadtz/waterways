/** Shared presentation rules. None of these infer local flood safety. */
export const timeMode = (day: number, latest: number): 'past' | 'latest' | 'forecast' =>
  Math.round(day) === latest ? 'latest' : Math.round(day) < latest ? 'past' : 'forecast';

export function changeBetween(a: number | null, b: number | null) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { delta: b - a, percent: a === 0 ? null : ((b - a) / Math.abs(a)) * 100 };
}

export function freshObservation(stamp: string, now = Date.now()) {
  if (!stamp) return false;
  const parsed = Date.parse(stamp.includes('T') ? stamp : `${stamp.replace(' ', 'T')}+07:00`);
  const age = now - parsed;
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= 6 * 60 * 60_000;
}

export function traceNetwork(reaches: { id: number; down: number }[], selected: number) {
  const byId = new Map(reaches.map((r) => [r.id, r]));
  const parents = new Map<number, number[]>();
  for (const r of reaches) parents.set(r.down, [...(parents.get(r.down) ?? []), r.id]);
  const visited = new Set([selected]);
  const upstream: number[] = [];
  const stack = [...(parents.get(selected) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    upstream.push(id);
    stack.push(...(parents.get(id) ?? []));
  }
  const downstream: number[] = [];
  let id = byId.get(selected)?.down;
  while (id && byId.has(id) && !visited.has(id)) {
    visited.add(id);
    downstream.push(id);
    id = byId.get(id)?.down;
  }
  return { upstream: upstream.sort((a, b) => a - b), downstream };
}

/** A bounded visual encoding, in map metres; never a physical water depth.
 *  Square-root scaling keeps big and small rivers distinguishable (Mekong ≈ 55 km, Chao Phraya
 *  ≈ 23 km, a 100 m³/s stream ≈ 4 km) at country scale; the map shrinks it as you zoom in. */
export const RIBBON_MAX = 60000;
export function ribbonHeight(q: number) {
  return Number.isFinite(q) && q > 0 ? Math.min(RIBBON_MAX, 420 * Math.sqrt(q)) : 0;
}

/** Walls tall enough to read at country scale would tower over a city; scale them with zoom. */
export function zoomHeightFactor(zoom: number) {
  const z = Math.round(zoom * 4) / 4; // quarter-zoom steps, so heights don't rebuild every frame
  return Math.min(1.3, Math.max(0.12, Math.pow(2, (6.1 - z) * 0.75)));
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const readingById = <T extends {id: number}>(readings: T[], id: number): T | null => readings.find(r => r.id === id) ?? null;
export const hasWaterMeasurement = (s: {msl: number | null; bankPct: number | null; bankDiff: number | null}) =>
  [s.msl, s.bankPct, s.bankDiff].some(v => v != null && Number.isFinite(v));
