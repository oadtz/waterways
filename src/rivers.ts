import type { Discharge, Reach } from './data';
import { t } from './i18n';

export type RGBA = [number, number, number, number];

// One four-step scale for everything on the map, so a child or a grandparent learns it once:
// grey = less than usual, blue = normal, yellow = a lot, red = dangerous / over the bank.
export type LevelKey = 'low' | 'normal' | 'high' | 'danger';
// Labels resolve through i18n at read time, so a language switch needs no rebuild.
const level = (key: LevelKey, c: RGBA) => ({
  key,
  c,
  get label() {
    return t(`level.${key}`);
  },
  get desc() {
    return t(`level.${key}.desc`);
  },
});
export const LEVELS: { key: LevelKey; label: string; desc: string; c: RGBA }[] = [
  level('low', [139, 154, 171, 255]),
  level('normal', [79, 179, 234, 255]),
  level('high', [247, 201, 72, 255]),
  level('danger', [255, 77, 61, 255]),
];

// On a light ground the same hues need more weight to hold their contrast.
const LEVEL_COLORS: Record<'dark' | 'light', Record<LevelKey, RGBA>> = {
  dark: { low: [139, 154, 171, 255], normal: [103, 201, 219, 255], high: [237, 186, 98, 255], danger: [255, 130, 118, 255] },
  light: { low: [128, 140, 154, 255], normal: [8, 123, 145, 255], high: [147, 97, 0, 255], danger: [185, 47, 37, 255] },
};
export function setLevelTheme(theme: 'dark' | 'light') {
  for (const l of LEVELS) l.c = LEVEL_COLORS[theme][l.key];
}
export const levelOf = (k: LevelKey) => LEVELS.find((l) => l.key === k)!;

// River flow relative to its annual mean → level. "Normal" is deliberately wide: rivers in the
// monsoon routinely run at twice their yearly average.
const CUTS = [0.5, 2, 3.5];
export const HIGH_AT = CUTS[1];
export const DANGER_AT = CUTS[2];
export const riverLevel = (ratio: number): LevelKey =>
  ratio < CUTS[0] ? 'low' : ratio < CUTS[1] ? 'normal' : ratio < CUTS[2] ? 'high' : 'danger';

// Colour with a short blend across each boundary, so walls change smoothly while animating
// but still land squarely on one of the four legend colours.
export function rampColor(ratio: number, alpha = 255): RGBA {
  const x = Math.log(Math.max(ratio, 1e-3));
  const cuts = CUTS.map(Math.log);
  const band = 0.12;
  let i = 0;
  while (i < cuts.length && x > cuts[i] + band) i++;
  const base = LEVELS[i].c;
  let r = base[0];
  let g = base[1];
  let b = base[2];
  if (i < cuts.length && x > cuts[i] - band) {
    const t = (x - (cuts[i] - band)) / (2 * band);
    const n = LEVELS[i + 1].c;
    r += (n[0] - r) * t;
    g += (n[1] - g) * t;
    b += (n[2] - b) * t;
  }
  // Within "normal", brighten gently with flow so the monsoon still visibly swells.
  if (i === 1) {
    const k = Math.max(0, Math.min(1, (x - cuts[0]) / (cuts[1] - cuts[0])));
    const f = 0.72 + 0.28 * k;
    r *= f;
    g *= f;
    b *= f;
  }
  return [r, g, b, alpha];
}

export const RAMP = LEVELS; // legacy name

export type RiverFeature = {
  index: number; // position in the reaches array
  reach: Reach;
  gauge: number;
  wall: [number, number][]; // thin polygon around the centreline, extruded into a wall
};

// Build a thin ribbon polygon around the reach centreline (mitred offsets).
function ribbon(line: [number, number][], halfWidthM: number): [number, number][] {
  // Two-point reaches get a midpoint so a tapered ribbon still has width in the middle.
  const c: [number, number][] =
    line.length === 2 ? [line[0], [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2], line[1]] : line;
  const n = c.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const k = Math.cos((c[0][1] * Math.PI) / 180);
  const toM = (p: [number, number]) => [p[0] * 111320 * k, p[1] * 110574];
  for (let i = 0; i < n; i++) {
    const a = toM(c[Math.max(0, i - 1)]);
    const b = toM(c[Math.min(n - 1, i + 1)]);
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Pinch both ends to (almost) nothing: adjacent reaches then meet without square end caps,
    // which would otherwise stand side-on to the camera as a row of stripes.
    const w = i === 0 || i === n - 1 ? halfWidthM * 0.02 : halfWidthM;
    const ox = (-dy * w) / (111320 * k);
    const oy = (dx * w) / 110574;
    left.push([c[i][0] + ox, c[i][1] + oy]);
    right.push([c[i][0] - ox, c[i][1] - oy]);
  }
  return [...left, ...right.reverse()];
}

// Chaikin corner-cutting: turns the simplified zigzag lines into soft curves so walls read as
// smooth ribbons instead of a picket fence. Endpoints are kept so neighbouring reaches still join.
function chaikin(c: [number, number][], iterations: number): [number, number][] {
  let pts = c;
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      if (i > 0) out.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25]);
      if (i < pts.length - 2) out.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export function buildFeatures(reaches: Reach[], d: Discharge): RiverFeature[] {
  for (const r of reaches) r.c = chaikin(r.c, r.th ? 2 : 1);
  return reaches.map((reach, i) => ({
    index: i,
    reach,
    gauge: d.assign[i],
    wall: ribbon(reach.c, 120 + 8 * Math.sqrt(reach.q)),
  }));
}

// Per-gauge "normal" flow. The baked record may cover only part of a year (six months by
// default, weighted toward the dry season), so blend its mean with HydroRIVERS' long-term annual
// mean for the same reach (geometric mean). Keeps small coastal rivers from reading as floods.
export function gaugeMeans(d: Discharge): number[] {
  const end = Math.max(1, d.time.indexOf(d.forecastFrom));
  return d.gauges.map((g) => {
    let s = 0;
    for (let i = 0; i < end; i++) s += g.series[i] as number;
    const windowMean = Math.max(s / end, 0.01);
    return Math.sqrt(windowMean * Math.max(g.q, 0.01));
  });
}

// Ratio of each gauge's flow to its mean at a fractional day index (linear between days).
export function ratiosAt(d: Discharge, means: number[], t: number): Float32Array {
  const i0 = Math.max(0, Math.min(d.time.length - 1, Math.floor(t)));
  const i1 = Math.min(d.time.length - 1, i0 + 1);
  const f = t - i0;
  const out = new Float32Array(d.gauges.length);
  d.gauges.forEach((g, k) => {
    const a = g.series[i0] as number;
    const b = g.series[i1] as number;
    out[k] = (a + (b - a) * f) / means[k];
  });
  return out;
}
