import './style.css';
import './experience.css';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { AmbientLight, DirectionalLight, LightingEffect, type PickingInfo } from '@deck.gl/core';
import { ColumnLayer, PathLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';

import { addSpotlight, applyMapTheme, buildBasemap, type Theme } from './basemap';
import { DataFilterExtension, PathStyleExtension } from '@deck.gl/extensions';
import { timeMode, changeBetween, freshObservation, traceNetwork, ribbonHeight, zoomHeightFactor, readingById, hasWaterMeasurement } from './experience';
import { WallGradientExtension } from './wall-gradient';
import { TripsLayer } from '@deck.gl/geo-layers';
import { buildFlowPaths, distanceToSea, type FlowPath } from './flow';
import { assessNearby, type Nearby } from './nearby';
import {
  gibs,
  loadDischarge,
  loadRadar,
  loadRain,
  loadRivers,
  loadWaterLevels,
  refreshDischarge,
  type Discharge,
  type RadarFrame,
  type RainStation,
  type Reach,
  type WaterStation,
} from './data';
import { DANGER_AT, HIGH_AT, LEVELS, buildFeatures, gaugeMeans, levelOf, rampColor, ratiosAt, setLevelTheme, type RGBA, type RiverFeature } from './rivers';
import { RAIN, areaCard, nearCard, pick, rainCard, rainClass, rgb, riverCard, setRainTheme, stationCard, stationLevel } from './cards';
import { Timeline, type Series } from './timeline';
import { applyStatic, browserLang, lang, longDate, rememberLang, savedLang, setCurrentLang, shortDate, t, type Lang } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => matchMedia('(max-width: 860px)').matches;
let keyboardInput = false;

// ---------------------------------------------------------------- theme
// Default follows the user's clock (06:00–18:00 light); a tap on the sun/moon button overrides
// and is remembered. index.html sets data-theme before first paint so nothing flashes.

const THEME_KEY = 'waterways.theme';
const clockTheme = (): Theme => {
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? 'light' : 'dark';
};
const savedTheme = (): Theme | null => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
};
setCurrentLang(savedLang() ?? ((document.documentElement.lang as Lang) || browserLang()));
applyStatic();

let theme: Theme = (document.documentElement.dataset.theme as Theme) || savedTheme() || clockTheme();
setLevelTheme(theme);
setRainTheme(theme);

// ---------------------------------------------------------------- views

type View = { center: [number, number]; zoom: number; pitch: number; bearing: number };
const VIEWS: Record<string, View> = {
  thailand: { center: [100.9, 14.4], zoom: 6.05, pitch: 58, bearing: -14 },
  north: { center: [99.8, 17.9], zoom: 7.0, pitch: 56, bearing: -10 },
  isan: { center: [103.4, 15.6], zoom: 6.9, pitch: 55, bearing: -24 },
  central: { center: [100.3, 14.7], zoom: 7.3, pitch: 58, bearing: -22 },
  bangkok: { center: [100.52, 13.7], zoom: 9.3, pitch: 58, bearing: -18 },
  south: { center: [99.9, 8.4], zoom: 6.9, pitch: 52, bearing: -8 },
};
const view = (k: string): View => ({ ...VIEWS[k], zoom: VIEWS[k].zoom - (isSmall() ? 0.95 : 0) });

// ---------------------------------------------------------------- map

const map = new maplibregl.Map({
  container: 'map',
  style: buildBasemap(theme),
  ...view('thailand'),
  // Intro starts flat and far out, then tilts in while the walls rise.
  ...(reduceMotion ? {} : { pitch: 0, bearing: 0, zoom: view('thailand').zoom - 0.8 }),
  maxPitch: 78,
  minZoom: 3.5,
  maxZoom: 16.5,
  attributionControl: false,
});
map.touchZoomRotate.enableRotation();
// Frame the map around the UI, not behind it: the camera centre sits in the open area between
// the place panel (left), the timeline (bottom) and the header — so "centre on Thailand" means
// centred where you can actually see it.
const uiPadding = () =>
  isSmall()
    ? { top: 150, bottom: 230, left: 0, right: 0 }
    : { top: 70, bottom: 200, left: Math.min(380, innerWidth * 0.28), right: 40 };
map.setPadding(uiPadding());
addEventListener('resize', () => map.setPadding(uiPadding()));
if (import.meta.env.DEV) Object.assign(window, { __map: map });
const overlayRef = () => overlay;
if (import.meta.env.DEV) setTimeout(() => Object.assign(window, { __overlay: overlayRef() }));

const lighting = new LightingEffect({
  ambient: new AmbientLight({ color: [255, 255, 255], intensity: 0.9 }),
  key: new DirectionalLight({ color: [210, 235, 255], intensity: 1.35, direction: [-3, -6, -4] }),
  rim: new DirectionalLight({ color: [255, 214, 170], intensity: 0.35, direction: [4, 3, -2] }),
});
const overlay = new MapboxOverlay({ interleaved: true, effects: [lighting], layers: [] });
map.addControl(overlay);

// Night: additive blending, so overlapping glow lines brighten like light on water.
// Day: plain alpha blending — additive light on a pale ground just washes out to white.
const GLOW_ADD = {
  depthWriteEnabled: false,
  blend: true,
  blendColorSrcFactor: 'src-alpha',
  blendColorDstFactor: 'one',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
} as const;
const GLOW_NORMAL = { depthWriteEnabled: false } as const;
const glow = () => (theme === 'dark' ? GLOW_ADD : GLOW_NORMAL);
const accent = (): RGBA => (theme === 'dark' ? [255, 255, 255, 255] : [20, 26, 32, 255]);

// ---------------------------------------------------------------- state

type LayerKey = 'rivers' | 'stations' | 'rain' | 'flood';
const TOGGLES: { key: LayerKey; color: string; live?: boolean }[] = [
  { key: 'rivers', color: 'var(--normal)' },
  { key: 'stations', color: 'var(--high)', live: true },
  { key: 'rain', color: 'var(--rain)' },
  { key: 'flood', color: 'var(--danger)' },
];

const state = {
  t: 0,
  today: 0,
  playing: false,
  speed: 14, // days per second
  exaggeration: 1,
  grow: reduceMotion ? 1 : 0, // intro: walls rise from the ground
  on: { rivers: true, stations: true, rain: false, flood: false } as Record<LayerKey, boolean>,
  imerg: false,
  radarFrame: 0,
  cinema: false,
  flat: false,
};

let reaches: Reach[] = [];
let discharge: Discharge;
let features: RiverFeature[] = [];
let ridges: RiverFeature[] = [];
let means: number[] = [];
let ratios: Float32Array = new Float32Array();
let overview: Series = { kind: 'overview', high: [], danger: [] };
let chartRiver: RiverFeature | null = null;
const basinNames = new Map<number, [string, string]>();
let stations: WaterStation[] = [];
let rain: RainStation[] = [];
let rainShown: RainStation[] = [];
let rainPonding: RainStation[] = [];
let overflowing: WaterStation[] = [];
let radar: RadarFrame[] = [];
let timeline: Timeline;
let userMoved = false;
let historyMonths = 6;
let liveStamp = '';
let growing = false;
let observationsFailed = false;
let activeArea: {kind: 'province'; name: string} | {kind: 'near'; point: [number, number]} | null = null;
let compareDate: string | null = null;
let mapReadyFlag = false; // nothing 3D draws until the basemap has painted

type Selection =
  | { kind: 'river'; f: RiverFeature }
  | { kind: 'station'; s: WaterStation }
  | { kind: 'rain'; r: RainStation }
  | { kind: 'area' }
  | null;
let selected: Selection = null;
let selectedSystem: RiverFeature[] = [];
let network = { upstream: [] as number[], downstream: [] as number[] };
let selectedIds = new Set<number>();
let marker: { pos: [number, number]; me?: boolean } | null = null;

// ---------------------------------------------------------------- timeline series

// Kilometres of Thai river at "high" and "danger" each day — the country's flood story at a glance.
function computeOverview(): Series {
  const n = discharge.time.length;
  const high = new Array<number>(n).fill(0);
  const danger = new Array<number>(n).fill(0);
  const thai = features.filter((f) => f.reach.th);
  const g = discharge.gauges;
  for (let t = 0; t < n; t++) {
    for (const f of thai) {
      const r = (g[f.gauge].series[t] as number) / means[f.gauge];
      if (r >= DANGER_AT) danger[t] += f.reach.len;
      else if (r >= HIGH_AT) high[t] += f.reach.len;
    }
  }
  return { kind: 'overview', high, danger };
}

function riverSeries(f: RiverFeature): Series {
  const s = discharge.gauges[f.gauge].series as number[];
  const m = means[f.gauge];
  return { kind: 'river', values: s.map((v) => (f.reach.q * v) / m), highAt: f.reach.q * HIGH_AT, dangerAt: f.reach.q * DANGER_AT };
}

function basinLabel(f: RiverFeature) {
  const n = basinNames.get(f.reach.main);
  return n ? t('river.basin', { name: pick(n[0], n[1]) }) : t('river.local');
}

function showChartFor(f: RiverFeature | null) {
  chartRiver = f;
  timeline.setSeries(f ? riverSeries(f) : overview);
  $('track-back').hidden = !f;
  updateTrackHead();
  updateComparison();
}

function updateTrackHead() {
  const i = dayIndex();
  if (chartRiver) {
    const s = riverSeries(chartRiver) as Extract<Series, { kind: 'river' }>;
    $('track-title').textContent = t('chart.river', { name: basinLabel(chartRiver) });
    $('track-value').textContent = t('chart.river.value', { q: Math.round(s.values[i]).toLocaleString('en-US') });
  } else if (overview.kind === 'overview' && overview.high.length) {
    $('track-title').textContent = t('chart.overview');
    $('track-value').innerHTML = t('chart.overview.value', {
      d: Math.round(overview.danger[i]).toLocaleString('en-US'),
      h: Math.round(overview.high[i]).toLocaleString('en-US'),
    });
  }
}

const isLive = () => timeMode(state.t, state.today) === 'latest';
const isForecast = () => timeMode(state.t, state.today) === 'forecast';
const dayIndex = () => Math.max(0, Math.min(discharge.time.length - 1, Math.round(state.t)));

// ---------------------------------------------------------------- basin names
// HydroRIVERS has no names; tag each river system by where it reaches the sea.

const MOUTHS: [string, string, number, number][] = [
  ['แม่น้ำโขง', 'Mekong River', 106.5, 9.8],
  ['แม่น้ำเจ้าพระยา', 'Chao Phraya River', 100.58, 13.55],
  ['แม่น้ำท่าจีน', 'Tha Chin River', 100.27, 13.5],
  ['แม่น้ำแม่กลอง', 'Mae Klong River', 100.0, 13.36],
  ['แม่น้ำบางปะกง', 'Bang Pakong River', 100.95, 13.45],
  ['แม่น้ำสาละวิน', 'Salween River', 97.6, 16.5],
  ['แม่น้ำอิรวดี', 'Irrawaddy River', 95.2, 15.9],
  ['แม่น้ำสะโตง', 'Sittaung River', 97.0, 17.3],
  ['แม่น้ำแดง', 'Red River', 106.6, 20.2],
  ['แม่น้ำตาปี', 'Tapi River', 99.3, 9.15],
  ['แม่น้ำปัตตานี', 'Pattani River', 101.28, 6.9],
  ['แม่น้ำโก-ลก', 'Kolok River', 102.1, 6.25],
  ['แม่น้ำจันทบุรี', 'Chanthaburi River', 102.05, 12.5],
  ['แม่น้ำเพชรบุรี', 'Phetchaburi River', 100.07, 13.2],
  ['แม่น้ำมา', 'Ma River', 105.9, 19.8],
];

function nameBasins() {
  const byId = new Map(reaches.map((r) => [r.id, r]));
  const outlets = new Map<number, Reach>();
  for (const r of reaches) if (!outlets.has(r.main) && byId.has(r.main)) outlets.set(r.main, byId.get(r.main)!);
  for (const [nameTh, nameEn, x, y] of MOUTHS) {
    let best: Reach | null = null;
    for (const o of outlets.values()) {
      const e = o.c[o.c.length - 1];
      const dkm = Math.hypot((e[0] - x) * 108, (e[1] - y) * 110.6);
      if (dkm < 70 && (!best || o.up > best.up)) best = o;
    }
    if (best && !basinNames.has(best.main)) basinNames.set(best.main, [nameTh, nameEn]);
  }
}

// ---------------------------------------------------------------- deck layers

const stationColor = (s: WaterStation): RGBA => levelOf(stationLevel(s)).c;
const rainColor = (mm: number): RGBA => rainClass(mm)?.c ?? [96, 96, 170, 200];
const flowAt = (f: RiverFeature) => f.reach.q * ratios[f.gauge];
const wallHeight = (q: number) => ribbonHeight(q) * state.exaggeration * zoomHeightFactor(map.getZoom());
// Intro: walls rise as a wave from the headwaters down to the sea, the way the water travels.
let sourceFrac = new Float32Array(); // per reach: 1 at the farthest headwater, 0 at the river mouth
const riseOf = (i: number) => (state.grow >= 1 ? 1 : easeOut(Math.min(1, Math.max(0, state.grow * 1.9 - (1 - sourceFrac[i]) * 0.9))));
const featureHeight = (f: RiverFeature) =>
  wallHeight(flowAt(f)) * riseOf(f.index) * (f.reach.th || selectedIds.has(f.reach.id) ? 1 : .15);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const lighten = (c: RGBA, k: number, a: number): RGBA => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k, a];

// Focus: rivers in Thailand carry full colour; neighbours fade toward the ground colour so the
// eye lands on the Thai story first while the wider basin stays readable as context.
const GROUND: Record<Theme, [number, number, number]> = { dark: [18, 25, 32], light: [236, 235, 230] };
function riverColor(f: RiverFeature, alpha = 255): RGBA {
  const c = rampColor(ratios[f.gauge], alpha);
  if (selectedIds.size && !selectedIds.has(f.reach.id)) return [c[0], c[1], c[2], Math.round(alpha * .14)];
  if (f.reach.th || selectedIds.has(f.reach.id)) return c;
  const g = GROUND[theme];
  const k = 0.85;
  return [c[0] + (g[0] - c[0]) * k, c[1] + (g[1] - c[1]) * k, c[2] + (g[2] - c[2]) * k, Math.round(alpha * .3)];
}

// Progressive disclosure: small streams appear as you zoom in (GPU filter, no data rebuild).
// Thai reaches count 4× so the home network stays full while neighbours thin out.
const minFlowForZoom = (z: number) => (z < 5.6 ? 120 : z < 6.4 ? 60 : z < 7.4 ? 30 : 0);
const filterWeight = (f: RiverFeature) => f.reach.q * (f.reach.th ? 4 : 1);
const riverFilter = new DataFilterExtension({ filterSize: 1 });
const WALL_FADE: Record<Theme, WallGradientExtension> = {
  dark: new WallGradientExtension({ fadeTo: 0.64, lift: 0.04 }),
  light: new WallGradientExtension({ fadeTo: 0.75, lift: 0 }),
};
// DataFilterExtension props aren't in the base layer types; spread them in.
const filterProps = (minFlow: number, soft: boolean, wall = false): any => ({
  extensions: wall ? [riverFilter, WALL_FADE[theme]] : [riverFilter],
  getFilterValue: (f: RiverFeature) => selectedIds.has(f.reach.id) ? 1e6 : filterWeight(f),
  filterRange: [minFlow, 1e7],
  ...(soft ? { filterSoftRange: [minFlow * 1.8, 1e7] } : {}),
});
// Gauges and rain: at country scale show only what needs attention; everything once zoomed in.
const DETAIL_ZOOM = 7;
let detailed = false;
let stationsShown: WaterStation[] = [];
function applyDetail() {
  detailed = map.getZoom() >= DETAIL_ZOOM;
  stationsShown = stations.filter(s => freshObservation(s.time) && hasWaterMeasurement(s) && (detailed || s.level >= 4));
  rainShown = rain.filter((x) => freshObservation(x.time) && x.mm24 >= (detailed ? 5 : 90));
}
map.on('zoom', () => {
  if (map.getZoom() >= DETAIL_ZOOM !== detailed) applyDetail();
  render();
});

// ---------------------------------------------------------------- flowing light
// Pulses ride the wall crests from source to sea once the walls have risen. Crest positions are
// rebuilt only when the day (or anything that changes wall height) changes.
let flowPaths: FlowPath[] = [];
let flowLoop = 1;
type FlowDatum = { path: [number, number, number][]; ts: number[]; color: RGBA; width: number };
let flowData: FlowDatum[] = [];
let flowKey = '';
const FLOW_FRONTS = 5;
const FLOW_SECONDS = 7; // one sweep from the farthest headwater to the sea

function refreshFlowData() {
  const key = `${Math.round(state.t)}|${state.exaggeration}|${zoomHeightFactor(map.getZoom())}|${theme}|${selectedIds.size ? [...selectedIds][0] : 0}`;
  if (key === flowKey) return;
  flowKey = key;
  const r = ratiosAt(discharge, means, Math.round(state.t));
  flowData = flowPaths.map((p) => {
    const ratio = r[p.gauge];
    const q = p.reach.q * ratio;
    const h = wallHeight(q) + 60;
    const base = rampColor(ratio);
    const dim = selectedIds.size > 0 && !selectedIds.has(p.reach.id);
    const color: RGBA =
      theme === 'dark'
        ? lighten(base, 0.55, dim ? 40 : 255)
        : [base[0] * 0.8, base[1] * 0.8, base[2] * 0.8, dim ? 50 : 255];
    return { path: p.reach.c.map(([x, y]) => [x, y, h] as [number, number, number]), ts: p.ts, color, width: 1.4 + Math.log10(Math.max(q, 1)) * 0.9 };
  });
}

function flowLayers(now: number) {
  if (reduceMotion || state.grow < 1 || !flowPaths.length) return [];
  refreshFlowData();
  const clock = ((now / 1000) * flowLoop) / FLOW_SECONDS;
  const trail = flowLoop * 0.08;
  return Array.from(
    { length: FLOW_FRONTS },
    (_, k) =>
      new TripsLayer<FlowDatum>({
        id: `flow-${k}`,
        data: flowData,
        getPath: (d) => d.path,
        getTimestamps: (d) => d.ts,
        getColor: (d) => d.color,
        getWidth: (d) => d.width,
        widthUnits: 'pixels',
        widthMinPixels: 1.4,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
        trailLength: trail,
        currentTime: (clock + (k * flowLoop) / FLOW_FRONTS) % (flowLoop + trail),
        parameters: glow(),
        updateTriggers: { getPath: flowKey, getColor: flowKey, getWidth: flowKey },
      }),
  );
}

let lastRiverKey = '';
let riverLayers: any[] = [];

let lastMinFlow = -1;
function buildRiverLayers() {
  const key = `${state.t.toFixed(2)}|${state.exaggeration}|${zoomHeightFactor(map.getZoom())}|${state.grow.toFixed(3)}|${theme}|${selected?.kind === 'river' ? selected.f.reach.id : 0}|${isForecast()}`;
  const minFlow = minFlowForZoom(map.getZoom());
  if (key === lastRiverKey && minFlow === lastMinFlow) return riverLayers;
  lastMinFlow = minFlow;
  lastRiverKey = key;
  ratios = ratiosAt(discharge, means, state.t);
  riverLayers = [
    new PathLayer<RiverFeature>({
      id: 'river-glow',
      data: features,
      getPath: (f) => f.reach.c,
      getWidth: (f) => 1 + Math.log10(Math.max(flowAt(f), 1)) * 1.1,
      widthUnits: 'pixels',
      widthMinPixels: 0.8,
      getColor: (f) => riverColor(f, f.reach.th ? (theme === 'dark' ? 150 : 200) : theme === 'dark' ? 50 : 110),
      capRounded: true,
      jointRounded: true,
      parameters: glow(),
      ...filterProps(minFlow, true),
      updateTriggers: { getWidth: key, getColor: key },
    }),
    new SolidPolygonLayer<RiverFeature>({
      id: 'river-walls',
      data: features,
      getPolygon: (f) => f.wall,
      extruded: true,
      getElevation: featureHeight,
      getFillColor: (f) => riverColor(f, isForecast() ? 125 : 185),
      // Unlit: per-segment lighting stripes along curves. Depth comes from the vertical gradient
      // (solid at the river, fading to the crest) and the bright crest line instead.
      material: false,
      // Translucent walls would show both faces and stripe; draw only the side facing the camera.
      parameters: { cullMode: 'back' },
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      ...filterProps(minFlow, false, true),
      updateTriggers: { getElevation: key, getFillColor: key },
    }),
    // Luminous ridge along the top of the larger walls — reads like light on a water surface.
    new PathLayer<RiverFeature>({
      id: 'river-ridge',
      data: selectedSystem.length ? selectedSystem : ridges,
      getPath: (f) => {
        const h = featureHeight(f) + 30;
        return f.reach.c.map(([x, y]) => [x, y, h] as [number, number, number]);
      },
      getWidth: 1.5,
      ...({ extensions: [new PathStyleExtension({ dash: true })], getDashArray: isForecast() ? [3, 3] : [0, 0], dashJustified: true } as any),
      widthUnits: 'pixels',
      getColor: (f) => (theme === 'dark' ? lighten(riverColor(f), 0.35, f.reach.th ? 170 : 30) : lighten(riverColor(f), 0.45, f.reach.th ? 230 : 90)),
      parameters: glow(),
      ...filterProps(minFlow, false),
      extensions: [riverFilter, new PathStyleExtension({ dash: true })],
      updateTriggers: { getPath: key, getColor: key, getDashArray: key },
    }),
  ];
  return riverLayers;
}

function render() {
  if (!discharge || !mapReadyFlag) return;
  const live = isLive();
  const now = performance.now();
  const pulse = .45; // Stable rings identify attention points without constant flashing.
  const layers: any[] = [];

  if (state.on.rivers) layers.push(...buildRiverLayers(), ...flowLayers(now));

  if (selectedSystem.length && state.on.rivers) {
    const up = new Set(network.upstream);
    const palette = theme === 'dark' ? { up: [116,214,209,230], down: [181,197,255,230] } : { up: [8,119,111,255], down: [81,92,195,255] };
    layers.push(new PathLayer<RiverFeature>({
      id: 'selected-system', data: selectedSystem,
      getPath: f => f.reach.c.map(([x,y]) => [x,y,featureHeight(f)+50]),
      getWidth: 3, widthUnits: 'pixels', pickable: true,
      getColor: f => (up.has(f.reach.id) ? palette.up : palette.down) as RGBA,
      ...({ extensions: [new PathStyleExtension({ dash: true })], getDashArray: (f: RiverFeature) => up.has(f.reach.id) ? [0,0] : [4,2], dashJustified: true } as any),
      parameters: glow(), updateTriggers: {getPath: state.t, getColor: [theme, selected?.kind === 'river' && selected.f.reach.id], getDashArray: selected?.kind === 'river' && selected.f.reach.id},
    }));
  }

  if (state.on.rain && live && rain.length) {
    layers.push(
      new ColumnLayer<RainStation>({
        id: 'rain-columns',
        data: rainShown,
        getPosition: (r) => [r.lon, r.lat],
        getElevation: (r) => Math.min(4000, r.mm24 * 22) * state.exaggeration * easeOut(state.grow),
        getFillColor: (r) => rainColor(r.mm24),
        radius: 700,
        diskResolution: 8,
        extruded: true,
        material: { ambient: 0.75, diffuse: 0.4 },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 110],
        updateTriggers: { getElevation: [state.exaggeration, state.grow], getFillColor: theme },
      }),
      new ScatterplotLayer<RainStation>({
        id: 'rain-ponding',
        data: rainPonding,
        getPosition: (r) => [r.lon, r.lat],
        getRadius: 8,
        radiusUnits: 'pixels',
        stroked: true,
        filled: false,
        getLineColor: [...RAIN[2].c.slice(0, 3), Math.round(230 * (1 - pulse))] as RGBA,
        lineWidthMinPixels: 1.6,
        updateTriggers: { getRadius: pulse, getLineColor: pulse },
      }),
    );
  }

  if (state.on.stations && live && stations.length) {
    layers.push(
      new ScatterplotLayer<WaterStation>({
        id: 'stations', data: stationsShown, getPosition: s => [s.lon, s.lat],
        getRadius: s => s.level >= 5 ? 5.5 : s.level === 4 ? 4.5 : 3.5,
        radiusUnits: 'pixels', stroked: true, filled: true,
        getFillColor: stationColor, getLineColor: accent(), lineWidthMinPixels: 1.3,
        pickable: true, autoHighlight: true, updateTriggers: {getFillColor: theme, getLineColor: theme},
      }),
      new ScatterplotLayer<WaterStation>({
        id: 'stations-overflow',
        data: overflowing,
        getPosition: (s) => [s.lon, s.lat],
        // A soft glow under overflowing gauges: dense clusters merge into a haze instead of rings.
        getRadius: 11,
        radiusUnits: 'pixels',
        stroked: false,
        filled: true,
        getFillColor: [...levelOf('danger').c.slice(0, 3), theme === 'dark' ? 46 : 60] as RGBA,
        parameters: glow(),
        updateTriggers: { getRadius: pulse, getLineColor: pulse },
      }),
    );
  }

  // Near me: 1, 3 and 5 km rings so distances in the list have a picture.
  if (activeArea?.kind === 'near') {
    const c = accent();
    layers.push(
      new ScatterplotLayer<{ r: number }>({
        id: 'near-rings',
        data: [{ r: 1000 }, { r: 3000 }, { r: NEAR_KM * 1000 }],
        getPosition: () => (activeArea as { point: [number, number] }).point,
        getRadius: (d) => d.r,
        radiusUnits: 'meters',
        stroked: true,
        filled: false,
        getLineColor: (d) => [c[0], c[1], c[2], d.r === NEAR_KM * 1000 ? 150 : 70],
        lineWidthMinPixels: 1.2,
        updateTriggers: { getPosition: activeArea.point.join(), getLineColor: theme },
      }),
    );
    if (highlightPoint) {
      layers.push(
        new ScatterplotLayer({
          id: 'near-highlight',
          data: [highlightPoint],
          getPosition: (d: [number, number]) => d,
          getRadius: 14,
          radiusUnits: 'pixels',
          stroked: true,
          filled: false,
          getLineColor: [c[0], c[1], c[2], 230],
          lineWidthMinPixels: 2,
        }),
      );
    }
  } else highlightPoint = null;

  if (marker) {
    const p = reduceMotion ? .5 : (now / 2400) % 1;
    layers.push(
      new ScatterplotLayer({
        id: 'marker',
        data: [marker],
        getPosition: (m: any) => m.pos,
        getRadius: marker.me ? 6 : 9,
        radiusUnits: 'pixels',
        filled: !!marker.me,
        stroked: true,
        getFillColor: accent(),
        getLineColor: accent(),
        lineWidthMinPixels: 2.5,
      }),
      new ScatterplotLayer({
        id: 'marker-pulse',
        data: [marker],
        getPosition: (m: any) => m.pos,
        getRadius: 10 + p * 26,
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: [...accent().slice(0, 3), Math.round(200 * (1 - p))] as RGBA,
        lineWidthMinPixels: 2,
        updateTriggers: { getRadius: p, getLineColor: p },
      }),
    );
  }

  overlay.setProps({ layers, onHover, onClick });
}

// ---------------------------------------------------------------- raster overlays (MapLibre)

const FLOOD = 'MODIS_Combined_Flood_2-Day';
const IMERG = 'IMERG_Precipitation_Rate';
let rasterDate = '';

async function recolorTile(url: string, signal: AbortSignal, paint: (px: Uint8ClampedArray, i: number) => void) {
  const res = await fetch(url, { signal, cache: 'force-cache' });
  if (!res.ok) throw new Error(`tile ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) paint(img.data, i);
  ctx.putImageData(img, 0, 0);
  return { data: await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer() };
}
const set = (px: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number) => {
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
};

// MODIS paints clouds grey and every permanent water body cyan. Keep only new flooding, in red.
maplibregl.addProtocol('flood', (params, abort) =>
  recolorTile(params.url.replace('flood://', 'https://'), abort.signal, (px, i) => {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (r > 230 && g < 80 && b < 80) set(px, i, 255, 77, 61, 235);
    else px[i + 3] = 0;
  }),
);

// RainViewer's free tiles only come in a loud blue/yellow/red scheme; fold them into violet
// so radar reads as weather, consistent with the rain gauges.
maplibregl.addProtocol('radar', (params, abort) =>
  recolorTile(params.url.replace('radar://', 'https://'), abort.signal, (px, i) => {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (r > 200 && g < 120) set(px, i, 244, 206, 255, 235);
    else if (r > 200 && g >= 120 && b < 110) set(px, i, 196, 160, 255, 205);
    else if (b > r + 30) set(px, i, 128, 112, 240, Math.min(150, 25 + (255 - (r + g + b) / 3) * 0.75));
    else px[i + 3] = 0;
  }),
);
const floodTiles = (date: string) => gibs(FLOOD, date, 'GoogleMapsCompatible_Level9').replace('https://', 'flood://');

function addRasters() {
  map.addSource('imerg', { type: 'raster', tiles: [gibs(IMERG, '2026-01-01', 'GoogleMapsCompatible_Level6')], tileSize: 256, maxzoom: 6 });
  map.addLayer(
    { id: 'imerg', type: 'raster', source: 'imerg', paint: { 'raster-opacity': 0.5, 'raster-fade-duration': 0 }, layout: { visibility: 'none' } },
    'coast',
  );
  map.addSource('flood', { type: 'raster', tiles: [floodTiles('2026-01-01')], tileSize: 256, maxzoom: 9 });
  map.addLayer(
    { id: 'flood', type: 'raster', source: 'flood', paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 }, layout: { visibility: 'none' } },
    'coast',
  );
}

function removeRadar() {
  for (let i = 0; map.getLayer(`radar-${i}`); i++) {
    map.removeLayer(`radar-${i}`);
    map.removeSource(`radar-${i}`);
  }
}

function addRadar() {
  removeRadar();
  radar.forEach((f, i) => {
    map.addSource(`radar-${i}`, { type: 'raster', tiles: [f.url.replace('https://', 'radar://')], tileSize: 256, maxzoom: 6 });
    map.addLayer(
      {
        id: `radar-${i}`,
        type: 'raster',
        source: `radar-${i}`,
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 0 } },
        layout: { visibility: 'none' },
      },
      'coast',
    );
  });
}

let rasterTimer = 0;
function syncRasters() {
  if (!discharge || !map.style || !map.getLayer('flood')) return;
  const live = isLive();
  const fc = isForecast();

  // Satellite products lag ~1 day; for "today" show yesterday's composite.
  const idx = dayIndex() - (live ? 1 : 0);
  const date = discharge.time[Math.max(0, idx)];
  map.setLayoutProperty('flood', 'visibility', state.on.flood && !fc ? 'visible' : 'none');
  map.setLayoutProperty('imerg', 'visibility', state.on.rain && state.imerg && !live && !fc ? 'visible' : 'none');
  if (date !== rasterDate && !fc) {
    clearTimeout(rasterTimer);
    rasterTimer = window.setTimeout(
      () => {
        rasterDate = date;
        (map.getSource('flood') as any).setTiles([floodTiles(date)]);
        (map.getSource('imerg') as any).setTiles([gibs(IMERG, date, 'GoogleMapsCompatible_Level6')]);
      },
      state.playing ? 350 : 60,
    );
  }

  // Radar tiles are only requested while visible (RainViewer rate-limits hard).
  const radarOn = state.on.rain && live;
  radar.forEach((_, i) => {
    map.setLayoutProperty(`radar-${i}`, 'visibility', radarOn ? 'visible' : 'none');
    map.setPaintProperty(`radar-${i}`, 'raster-opacity', radarOn && i === state.radarFrame ? (detailed ? 0.8 : 0.5) : 0);
  });
}

// ---------------------------------------------------------------- interaction: hover + tap

function onHover(info: PickingInfo) {
  document.body.toggleAttribute('data-pointer', !!info.object);
}

const card = $('card');
// Cards are kept as render functions so they can redraw in the new colours on a theme switch.
let cardRender: (() => string) | null = null;
function openCard(html: string | (() => string)) {
  cardRender = typeof html === 'string' ? () => html : html;
  $('card-body').innerHTML = cardRender();
  card.hidden = false;
  document.body.setAttribute('data-card', '');
  setSheetExpanded(!isSmall());
}
function closeCard() {
  card.hidden = true;
  document.body.removeAttribute('data-card');
  cardRender = null;
  if (chartRiver) showChartFor(null);
  selected = null;
  selectedSystem = [];
  selectedIds.clear();
  network = {upstream: [], downstream: []};
  marker = null;
  lastRiverKey = '';
  render();
}
$('card-close').addEventListener('click', closeCard);
$('track-back').addEventListener('click', closeCard);
addEventListener('keydown', (e) => e.key === 'Escape' && closeCard());

function riverCardHtml(f: RiverFeature) {
  const n = basinNames.get(f.reach.main);
  return riverCard({
    basin: n && pick(n[0], n[1]),
    upland: f.reach.up,
    q: flowAt(f),
    ratio: ratios[f.gauge],
    date: discharge.time[dayIndex()],
    forecast: isForecast(),
    values: (riverSeries(f) as Extract<Series, {kind:'river'}>).values,
    current: dayIndex(), forecastAt: state.today,
    upstream: network.upstream.length, downstream: network.downstream.length,
  });
}

// River cards follow the timeline: re-render while the selected river's card is open.
function refreshCard() {
  if (selected?.kind !== 'river' || card.hidden) return;
  $('card-body').innerHTML = riverCardHtml(selected.f);
}

function onClick(info: PickingInfo) {
  if (pickingLocation) return; // the map click handler places the near-me point
  const o = info.object as any;
  const id = info.layer?.id;
  if (!o) {
    closeCard();
    return;
  }
  if (id === 'river-walls' || id === 'selected-system' || id === 'river-glow') {
    selected = { kind: 'river', f: o };
    network = traceNetwork(reaches, o.reach.id);
    selectedIds = new Set([o.reach.id, ...network.upstream, ...network.downstream]);
    selectedSystem = features.filter(f => selectedIds.has(f.reach.id));
    lastRiverKey = '';
    marker = null;
    const f = o as RiverFeature;
    openCard(() => riverCardHtml(f));
    showChartFor(f);
  } else if (id === 'stations') {
    if (chartRiver) showChartFor(null);
    selectedIds.clear();
    selected = { kind: 'station', s: o };
    selectedSystem = [];
    marker = { pos: [o.lon, o.lat] };
    openCard(() => stationCard(o));
  } else if (id === 'rain-columns') {
    if (chartRiver) showChartFor(null);
    selectedIds.clear();
    selected = { kind: 'rain', r: o };
    selectedSystem = [];
    marker = { pos: [o.lon, o.lat] };
    openCard(() => rainCard(o));
  }
  render();
}

// ---------------------------------------------------------------- find a place

const km = (a: [number, number], b: [number, number]) =>
  Math.hypot((b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)), (b[1] - a[1]) * 110.57);

function fillProvinces() {
  const names = [...new Set([...stations.map((s) => s.province), ...rain.map((r) => r.province)].filter(n => n && !n.includes('เมียนมา') && !n.includes('Myanmar')))].sort((a, b) =>
    a.localeCompare(b, 'th'),
  );
  const sel = $<HTMLSelectElement>('province');
  const current = sel.value;
  // Value stays the Thai name (the key in ThaiWater data); the label follows the language.
  const en = new Map<string, string>();
  for (const p of [...stations, ...rain]) if (p.province && !en.has(p.province)) en.set(p.province, p.provinceEn);
  const label = (n: string) => pick(n, en.get(n) ?? n);
  names.sort((a, b) => label(a).localeCompare(label(b), lang));
  const regions = Object.keys(VIEWS).map((k) => `<option value="view:${k}">${t(`view.${k}`)}</option>`).join('');
  sel.innerHTML =
    `<option value="">${t('province.placeholder')}</option>` +
    `<optgroup label="${t('group.regions')}">${regions}</optgroup>` +
    `<optgroup label="${t('group.provinces')}">${names.map((n) => `<option value="${n}">${label(n)}</option>`).join('')}</optgroup>`;
  sel.value = current;
}

function showProvince(name: string) {
  closeCard();
  activeArea = {kind: 'province', name};
  const st = stations.filter((s) => s.province === name);
  const rn = rain.filter((r) => r.province === name);
  const pts = [...st, ...rn].map((p) => [p.lon, p.lat] as [number, number]);
  if (!pts.length) return;
  const b = pts.reduce(
    (acc, [x, y]) => [Math.min(acc[0], x), Math.min(acc[1], y), Math.max(acc[2], x), Math.max(acc[3], y)],
    [180, 90, -180, -90],
  );
  userMoved = true;
  map.fitBounds(
    [
      [b[0] - 0.15, b[1] - 0.15],
      [b[2] + 0.15, b[3] + 0.15],
    ],
    { padding: isSmall() ? { top: Math.min(220, innerHeight * .22), bottom: Math.min(280, innerHeight * .36), left: 25, right: 55 } : { top: 100, bottom: 260, left: 380, right: 90 }, pitch: 55, bearing: -14, maxZoom: 9.5, duration: reduceMotion || keyboardInput ? 0 : 900 },
  );
  selected = { kind: 'area' };
  selectedSystem = [];
  marker = null;
  goLive();
  const nameEn = st[0]?.provinceEn ?? rn[0]?.provinceEn ?? name;
  openCard(() => areaCard(t('province.title', { name: pick(name, nameEn) }), t('province.kicker'), stations.filter(s => s.province === name), rain.filter(r => r.province === name)));
  updateLiveStats();
}

// ---------------------------------------------------------------- near me
// Street-level answer to "is there water around me?": zoom to the neighbourhood, draw 1/3/5 km
// rings, and combine nearby gauges, rain, radar and satellite flood pixels into one ranked list.

const NEAR_KM = 5;
let nearResult: Nearby | null = null;
let nearAbort: AbortController | null = null;
let pickingLocation = false;

async function nearAt(me: [number, number], fly = true) {
  closeCard();
  userMoved = true;
  activeArea = { kind: 'near', point: me };
  marker = { pos: me, me: true };
  selected = { kind: 'area' };
  goLive();
  if (fly) map.flyTo({ center: me, zoom: 13.2, pitch: 45, bearing: -14, padding: uiPadding(), duration: reduceMotion || keyboardInput ? 0 : 1600 });
  nearResult = null;
  openCard(() => nearCard(nearResult, liveStamp));
  updateLiveStats();
  nearAbort?.abort();
  const abort = (nearAbort = new AbortController());
  const floodDate = discharge.time[Math.max(0, state.today - 1)];
  const result = await assessNearby({
    me,
    radiusKm: NEAR_KM,
    stations: stations.filter((s) => freshObservation(s.time) && hasWaterMeasurement(s)),
    rain: rain.filter((r) => freshObservation(r.time)),
    floodTemplate: gibs(FLOOD, floodDate, 'GoogleMapsCompatible_Level9'),
    floodDate,
    radarTemplate: radar.at(-1)?.url,
    signal: abort.signal,
  });
  if (abort.signal.aborted || activeArea?.kind !== 'near') return;
  nearResult = result;
  openCard(() => nearCard(nearResult, liveStamp));
  render();
}

// Tapping a row in the near-me list shows that item on the map without losing the list.
document.getElementById('card-body')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sig');
  if (!btn || !nearResult || activeArea?.kind !== 'near') return;
  const sig = nearResult.signals[Number(btn.dataset.sig)];
  const at: [number, number] =
    sig.kind === 'gauge' ? [sig.station.lon, sig.station.lat] : sig.kind === 'rain' ? [sig.rain.lon, sig.rain.lat] : activeArea.point;
  map.flyTo({ center: at, zoom: Math.max(map.getZoom(), 14), padding: uiPadding(), duration: reduceMotion ? 0 : 900 });
  highlightPoint = at;
  render();
});
let highlightPoint: [number, number] | null = null;
if (import.meta.env.DEV) Object.assign(window, { __nearAt: nearAt });

function nearMe() {
  const btn = $<HTMLButtonElement>('near');
  const fail = () =>
    openCard(
      () => `<p class="kicker">${t('near')}</p><h3>${t('near.errorTitle')}</h3><p>${t('near.errorBody')}</p>
        <button class="btn primary pick-location" id="pick-location">${t('near.pick')}</button>`,
    );
  if (!navigator.geolocation) return fail();
  btn.disabled = true;
  $('near-label').textContent = t('near.finding');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      $('near-label').textContent = t('near');
      nearAt([pos.coords.longitude, pos.coords.latitude]);
    },
    () => {
      btn.disabled = false;
      $('near-label').textContent = t('near');
      fail();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
  );
}
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('#pick-location')) return;
  pickingLocation = true;
  closeCard();
  document.body.toggleAttribute('data-picking', true);
  $('pick-hint').hidden = false;
});
map.on('click', (e) => {
  if (!pickingLocation) return;
  pickingLocation = false;
  document.body.toggleAttribute('data-picking', false);
  $('pick-hint').hidden = true;
  nearAt([e.lngLat.lng, e.lngLat.lat]);
});

// ---------------------------------------------------------------- HUD


function updateHud() {
  const i = dayIndex();
  $('date').textContent = longDate(discharge.time[i]);
  const mode = $('mode');
  const live = isLive();
  mode.dataset.state = live ? 'live' : isForecast() ? 'forecast' : 'past';
  mode.textContent = t(live ? 'mode.now' : isForecast() ? 'mode.forecast' : 'mode.past');
  $('updated').textContent = live && liveStamp ? t('updated', { hm: liveStamp.slice(11, 16) }) : '';
  // The gauge counts are "right now" numbers — fade them while looking at another day.
  document.querySelector('.status')!.toggleAttribute('data-stale', !live);
  document.body.dataset.time = timeMode(state.t, state.today);
  $('time-context').textContent = t(isForecast() ? 'time.forecast' : live ? 'time.latest' : 'time.past');
  const modelStale = discharge.time[state.today] < new Date().toISOString().slice(0,10);
  document.body.toggleAttribute('data-model-stale', modelStale);
  if (live && modelStale) $('time-context').textContent = t('time.old');
  $('timeline-source').textContent = t(isForecast() ? 'source.forecast' : 'source.model');
  const date = discharge.time[i];
  for (const id of ['date-picker', 'compare-b']) ($<HTMLInputElement>(id)).value = date;
  const slider = $<HTMLInputElement>('day-slider');
  slider.max = String(discharge.time.length - 1);
  slider.value = String(i);
  slider.setAttribute('aria-valuetext', `${longDate(date)} · ${t(isForecast() ? 'source.forecast' : 'source.model')}`);
  updateComparison();
  timeline.setCursor(state.t);
  updateTrackHead();

  document.querySelectorAll<HTMLButtonElement>('#layers button').forEach((btn) => {
    const l = TOGGLES.find((x) => x.key === btn.dataset.key)!;
    btn.toggleAttribute('data-off', (!!l.live && !live) || (isForecast() && l.key === 'flood'));
  });
  if (selected?.kind === 'river') refreshCard();
}

function refreshObservationCard() {
  if (!selected || selected.kind === 'river' || card.hidden) return;
  if (selected.kind === 'station') {
    const item = readingById(stations, selected.s.id);
    if (item) { selected = {kind:'station', s:item}; cardRender = () => stationCard(item); }
    else cardRender = () => `<p class="source-badge">${t('source.observed')}</p><h3>${t('station.unavailable')}</h3>`;
  } else if (selected.kind === 'rain') {
    const item = readingById(rain, selected.r.id);
    if (item) { selected = {kind:'rain', r:item}; cardRender = () => rainCard(item); }
    else cardRender = () => `<p class="source-badge">${t('source.observed')}</p><h3>${t('area.noRain')}</h3>`;
  }
  if (cardRender) $('card-body').innerHTML = cardRender();
}

function areaObservations() {
  const area = activeArea;
  const inArea = (p: WaterStation | RainStation) => !area || (area.kind === 'province' ? p.province === area.name : km(area.point, [p.lon,p.lat]) <= NEAR_KM);
  return { st: stations.filter(s => inArea(s) && freshObservation(s.time) && hasWaterMeasurement(s)), rn: rain.filter(r => inArea(r) && freshObservation(r.time)) };
}
function updateLiveStats() {
  const {st, rn} = areaObservations();
  $('stat-overflow').textContent = st.length ? String(st.filter(s => s.level >= 5).length) : '—';
  $('stat-high').textContent = st.length ? String(st.filter(s => s.level === 4).length) : '—';
  $('stat-rain').textContent = rn.length ? String(rn.filter(r => r.mm24 >= 90).length) : '—';
  const area = activeArea;
  const item = area?.kind === 'province' ? [...stations, ...rain].find(s => s.province === area.name) : null;
  $('scope').textContent = area?.kind === 'province' ? pick(area.name, item?.provinceEn ?? area.name) : t(area ? 'near.title' : 'scope.national');
  $('coverage').textContent = t(observationsFailed ? 'source.unavailable' : 'source.coverage');
}

function buildLegend() {
  // Collapsed key: the four colours in one row, always visible.
  $('keyrow').innerHTML = [...LEVELS]
    .reverse()
    .map((l) => `<li><i style="--c:${rgb(l.c)}"></i>${t(`model.${l.key}`)}</li>`)
    .join('');
  $('legend').innerHTML = [...LEVELS]
    .reverse()
    .map((l) => `<li><i style="--c:${rgb(l.c)}"></i><span><b>${t(`model.${l.key}`)}</b><small>${t(`model.${l.key}.desc`)}</small></span></li>`)
    .join('');
  $('rainkey').innerHTML =
    RAIN.map((r) => `<li><i style="--c:${rgb(r.c)}"></i>${r.label}</li>`).join('') +
    `<li><i class="ring" style="--c:${rgb(RAIN[2].c)}"></i>${t('rain.ring')}</li>`;
}

function setTheme(next: Theme, remember: boolean) {
  if (remember) {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }
  const btn = $('theme');
  const label = t(next === 'dark' ? 'theme.toLight' : 'theme.toDark');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  if (next === theme) return;
  theme = next;
  document.documentElement.dataset.theme = next;
  setLevelTheme(next);
  setRainTheme(next);
  // isStyleLoaded() stays false while tiles stream in; the layers exist as soon as the style parses.
  if (map.getLayer('bg')) applyMapTheme(map, next);
  else map.once('style.load', () => applyMapTheme(map, theme));
  lastRiverKey = '';
  buildLegend();
  timeline?.draw();
  updateExperienceLabels();
  if (selected?.kind === 'river') refreshCard();
  else if (cardRender && !card.hidden) $('card-body').innerHTML = cardRender();
  render();
}

// ---------------------------------------------------------------- language
// Default follows the browser (any Thai language → Thai); the button overrides and is remembered.

function setGuideText() {
  const span = historyMonths >= 11 ? t('span.year') : t('span.months', { n: historyMonths });
  $('guide-3').innerHTML = t('guide.3', { span });
}

function setLang(next: Lang, remember: boolean) {
  if (remember) rememberLang(next);
  setCurrentLang(next);
  applyStatic();
  setGuideText();
  buildLegend();
  document.querySelectorAll<HTMLButtonElement>('#layers button').forEach((b) => (b.textContent = t(`layer.${b.dataset.key}`)));
  fillProvinces();
  updateLiveStats();
  updateExperienceLabels();
  setTheme(theme, false); // refresh the theme button's label
  $('play-label').textContent = t(state.playing ? 'pause' : 'play');
  if (discharge) {
    updateHud();
    timeline.draw();
  }
  if (selected?.kind === 'river') refreshCard();
  else if (cardRender && !card.hidden) $('card-body').innerHTML = cardRender();
}

function buildPanel() {
  buildLegend();
  fillProvinces();
  $('lang').addEventListener('click', () => setLang(lang === 'th' ? 'en' : 'th', true));
  // Phones tuck language and theme into the panel; these proxy the header buttons.
  document.querySelectorAll<HTMLButtonElement>('[data-proxy]').forEach((b) =>
    b.addEventListener('click', () => $(b.dataset.proxy!).click()),
  );
  setTheme(theme, false);
  $('theme').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark', true));
  // No saved choice: keep following the clock (e.g. switch to dark at 18:00 while open).
  setInterval(() => {
    if (!savedTheme()) setTheme(clockTheme(), false);
  }, 5 * 60e3);

  const box = $('layers');
  box.innerHTML = TOGGLES.map(
    (l) => `<button data-key="${l.key}" aria-pressed="${state.on[l.key]}" style="--c:${l.color}">${t(`layer.${l.key}`)}</button>`,
  ).join('');
  box.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const k = btn.dataset.key as LayerKey;
    state.on[k] = !state.on[k];
    btn.setAttribute('aria-pressed', String(state.on[k]));
    render();
    syncRasters();
  });

  const ex = $<HTMLInputElement>('exaggeration');
  ex.addEventListener('input', () => {
    state.exaggeration = Number(ex.value);
    $('exaggeration-out').textContent = `${state.exaggeration.toFixed(1)}×`;
    render();
  });
  $<HTMLInputElement>('imerg').addEventListener('change', (e) => {
    state.imerg = (e.target as HTMLInputElement).checked;
    syncRasters();
  });

  const panel = $('panel');
  $('panel-toggle').addEventListener('click', () => {
    const open = !panel.hasAttribute('data-open');
    panel.toggleAttribute('data-open', open);
    $('panel-toggle').setAttribute('aria-expanded', String(open));
  });

  // One place-finder: regions (camera presets) and provinces (camera + summary card).
  $<HTMLSelectElement>('province').addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (v.startsWith('view:')) {
      userMoved = true;
      closeCard();
      activeArea = null;
      updateLiveStats();
      map.flyTo({ ...view(v.slice(5)), padding: uiPadding(), duration: reduceMotion || keyboardInput ? 0 : 900, essential: true });
    } else if (v) showProvince(v);
  });
  $('near').addEventListener('click', nearMe);
}

// ---------------------------------------------------------------- guide

const GUIDE_KEY = 'waterways.guide.v1';
function setupGuide() {
  const guide = $('guide');
  const close = () => {
    guide.hidden = true;
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      /* ignore */
    }
  };
  $('guide-ok').addEventListener('click', close);
  guide.addEventListener('click', (e) => e.target === guide && close());
  let previousFocus: HTMLElement | null = null;
  $('help').addEventListener('click', () => { previousFocus = document.activeElement as HTMLElement; guide.hidden = false; $('guide-ok').focus(); });
  guide.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); previousFocus?.focus(); }
    if (e.key === 'Tab') { e.preventDefault(); $('guide-ok').focus(); }
  });
  $('guide-ok').addEventListener('click', () => previousFocus?.focus());
  let seen = false;
  try {
    seen = !!localStorage.getItem(GUIDE_KEY);
  } catch {
    /* ignore */
  }
  // Let the walls rise first, then explain them.
  // The place-first interface provides inline guidance; help opens only on request.
  void seen;
}

// ---------------------------------------------------------------- playback

function seek(t: number) {
  state.t = Math.max(0, Math.min(discharge.time.length - 1, t));
  ratios = ratiosAt(discharge, means, state.t);
  if (!isLive() && selected && selected.kind !== 'river') closeCard();
  updateHud();
  render();
  syncRasters();
}

function goLive() {
  setPlaying(false);
  seek(state.today);
}

function setPlaying(p: boolean) {
  state.playing = p;
  const btn = $('play');
  btn.toggleAttribute('data-playing', p);
  $('play-label').textContent = t(p ? 'pause' : 'play');
  // Starting from today (or the end) replays the whole record from the beginning.
  if (p && (state.t >= discharge.time.length - 1.01 || isLive())) state.t = 0;
  if (p && selected?.kind !== 'river') closeCard();
  if (!p) syncRasters();
}

function wirePlayback() {
  $('play').addEventListener('click', () => setPlaying(!state.playing));
  $('now').addEventListener('click', goLive);
  document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) =>
    b.addEventListener('click', () => {
      state.speed = Number(b.dataset.speed);
      document.querySelectorAll('.speed button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    }),
  );
  addEventListener('keydown', (e) => {
    if (!$('guide').hidden || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      setPlaying(!state.playing);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      setPlaying(false);
      seek(Math.round(state.t) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 7 : 1));
    } else if (e.key === 'Home') seek(0);
    else if (e.key === 'End') goLive();
  });

  let dragging = false;
  map.on('mousedown', () => { dragging = true; state.cinema = false; updateExperienceLabels(); });
  map.on('touchstart', () => { dragging = true; state.cinema = false; updateExperienceLabels(); });
  map.on('mouseup', () => (dragging = false));
  map.on('touchend', () => (dragging = false));

  let last = performance.now();
  let lastRadar = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (growing && state.grow < 1) state.grow = Math.min(1, state.grow + dt / 2.6);
    if (state.playing) {
      state.t += dt * state.speed;
      if (state.t >= discharge.time.length - 1) {
        state.t = discharge.time.length - 1;
        setPlaying(false);
      }
      // A slow orbit while the story plays — the landscape turns as the seasons change.
      ratios = ratiosAt(discharge, means, state.t);
      updateHud();
      syncRasters();
    }
    if (radar.length && isLive() && now - lastRadar > (state.radarFrame === radar.length - 1 ? 1600 : 450)) {
      lastRadar = now;
      state.radarFrame = (state.radarFrame + 1) % radar.length;
      syncRasters();
    }
    if (state.cinema && !reduceMotion && !dragging && !map.isMoving()) map.setBearing(map.getBearing() + dt * 1.5);
    // Flowing light needs every frame; everything else renders on demand.
    const flowing = state.on.rivers && !reduceMotion && flowPaths.length > 0 && state.grow >= 1;
    if (!document.hidden && (flowing || state.playing || growing && state.grow < 1 || marker && !reduceMotion)) render();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- exploration controls
function setSheetExpanded(expanded: boolean) {
  card.toggleAttribute('data-expanded', expanded);
  $('sheet-toggle').setAttribute('aria-expanded', String(expanded));
  $('sheet-toggle').textContent = t(expanded ? 'sheet.collapse' : 'sheet.expand');
}
function updateExperienceLabels() {
  $('cinema').textContent = t(state.cinema ? 'map.cinema.stop' : 'map.cinema');
  $('cinema').setAttribute('aria-pressed', String(state.cinema));
  document.querySelectorAll<HTMLElement>('[data-proxy=cinema]').forEach(b => { b.textContent = t(state.cinema ? 'map.cinema.stop' : 'map.cinema'); b.hidden = reduceMotion; });
  $('map-flat').setAttribute('aria-pressed', String(state.flat));
  $('compare-toggle').textContent = t(compareDate ? 'compare.close' : 'compare.open');
  $('chart-toggle').textContent = t($('timeline').hasAttribute('data-expanded') ? 'chart.close' : 'chart.open');
  $('sheet-toggle').textContent = t(card.hasAttribute('data-expanded') ? 'sheet.collapse' : 'sheet.expand');
}
function comparisonValue(index: number) {
  if (chartRiver) return (riverSeries(chartRiver) as Extract<Series, {kind:'river'}>).values[index];
  return overview.kind === 'overview' ? overview.high[index] + overview.danger[index] : null;
}
function updateComparison() {
  if (!discharge || !timeline) return;
  const start = discharge.time[0], end = discharge.time.at(-1)!;
  for (const id of ['date-picker', 'compare-a', 'compare-b']) {
    const input = $<HTMLInputElement>(id);
    input.min = start; input.max = end;
  }
  if (!compareDate) { timeline.setComparison(null); return; }
  let a = discharge.time.indexOf(compareDate);
  if (a < 0) { a = Math.max(0, dayIndex() - 7); compareDate = discharge.time[a]; }
  $<HTMLInputElement>('compare-a').value = compareDate;
  const b = dayIndex();
  $('compare-metric').textContent = chartRiver ? t('chart.river', { name: basinLabel(chartRiver) }) : t('compare.overview');
  timeline.setComparison(a);
  for (const [id, i] of [['compare-a-source', a], ['compare-b-source', b]] as const) {
    $(id).textContent = t(i > state.today ? 'source.forecast' : 'source.model');
  }
  const change = changeBetween(comparisonValue(a), comparisonValue(b));
  const result = $('compare-result');
  if (a === b) { result.textContent = t('compare.same'); return; }
  if (!change) { result.textContent = t('compare.unavailable'); return; }
  const unit = t(chartRiver ? 'unit.flow' : 'unit.length');
  const signed = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n).toLocaleString('en-US')}`;
  const percent = change.percent == null ? t('compare.noBase') : `${signed(change.percent)}%`;
  const displayedA = Math.round(comparisonValue(a)!);
  const displayedB = Math.round(comparisonValue(b)!);
  result.innerHTML = `<strong>${t('compare.delta', {delta: signed(displayedB - displayedA), unit, percent})}</strong><span>${t('compare.value', {a: displayedA.toLocaleString('en-US'), b: displayedB.toLocaleString('en-US'), unit})}</span>`;
}
function wireExperience() {
  addEventListener('keydown', () => { keyboardInput = true; document.body.setAttribute('data-keyboard', ''); });
  addEventListener('pointerdown', () => { keyboardInput = false; document.body.removeAttribute('data-keyboard'); });
  $('sheet-toggle').addEventListener('click', () => setSheetExpanded(!card.hasAttribute('data-expanded')));
  // Swipe is optional; the same sheet can always be operated with its labelled button.
  let sheetStart: {y:number; time:number; id:number} | null = null;
  const handle = document.querySelector<HTMLElement>('.sheet-controls')!;
  handle.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; sheetStart = {y:e.clientY,time:performance.now(),id:e.pointerId}; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointerup', e => {
    if (!sheetStart || sheetStart.id !== e.pointerId) return;
    const delta = e.clientY-sheetStart.y;
    if (Math.abs(delta) > 35) setSheetExpanded(delta < 0);
    sheetStart = null;
  });
  handle.addEventListener('pointercancel', () => { sheetStart = null; });
  $('card-body').addEventListener('click', e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-station-id]');
    if (!button) return;
    const s = stations.find(s => s.id === Number(button.dataset.stationId));
    if (!s) return;
    selected = {kind:'station', s}; selectedSystem = []; selectedIds.clear(); marker = {pos:[s.lon,s.lat]};
    openCard(() => stationCard(s));
    map.flyTo({center:[s.lon,s.lat], zoom:9.5, padding: uiPadding(), duration:reduceMotion || keyboardInput ? 0 : 800});
    render();
  });
  $('chart-toggle').addEventListener('click', () => {
    const open = !$('timeline').hasAttribute('data-expanded');
    if (open && isSmall() && compareDate) { compareDate = null; $('comparison').hidden = true; $('compare-toggle').setAttribute('aria-expanded','false'); updateComparison(); }
    $('timeline').toggleAttribute('data-expanded', open);
    $('chart-toggle').setAttribute('aria-expanded', String(open));
    updateExperienceLabels();
  });
  $('compare-toggle').addEventListener('click', () => {
    setPlaying(false);
    compareDate = compareDate ? null : discharge.time[Math.max(0, dayIndex()-7)];
    $('comparison').hidden = !compareDate;
    if (isSmall() && compareDate) { $('timeline').removeAttribute('data-expanded'); $('chart-toggle').setAttribute('aria-expanded','false'); setSheetExpanded(false); }
    $('compare-toggle').setAttribute('aria-expanded', String(!!compareDate));
    updateExperienceLabels(); updateComparison();
  });
  for (const id of ['date-picker', 'compare-b']) {
    $<HTMLInputElement>(id).addEventListener('change', e => {
      const date = (e.target as HTMLInputElement).value;
      const index = discharge.time.indexOf(date);
      if (index >= 0) { setPlaying(false); seek(index); }
      else updateHud();
    });
  }
  $<HTMLInputElement>('compare-a').addEventListener('change', e => {
    const value = (e.target as HTMLInputElement).value;
    if (discharge.time.includes(value)) compareDate = value;
    updateComparison();
  });
  $('day-slider').addEventListener('input', e => { setPlaying(false); seek(Number((e.target as HTMLInputElement).value)); });
  $('event-week').addEventListener('click', () => { setPlaying(false); seek(state.today-7); });
  $('event-next').addEventListener('click', () => { setPlaying(false); seek(state.today+7); });
  $('event-peak').addEventListener('click', () => {
    let peak = 0;
    for (let i=1; i<=state.today; i++) if ((comparisonValue(i) ?? 0) > (comparisonValue(peak) ?? 0)) peak = i;
    setPlaying(false); seek(peak);
  });
  const cameraDuration = () => reduceMotion || keyboardInput ? 0 : 600;
  $('zoom-in').addEventListener('click', () => map.zoomIn({duration:cameraDuration()}));
  $('zoom-out').addEventListener('click', () => map.zoomOut({duration:cameraDuration()}));
  $('map-flat').addEventListener('click', () => { state.flat = !state.flat; state.cinema = false; map.easeTo({pitch:state.flat ? 0 : 56, bearing:state.flat ? 0 : -14,duration:cameraDuration()}); updateExperienceLabels(); });
  $('map-home').addEventListener('click', () => {
    closeCard(); activeArea = null; state.cinema = false; state.flat = false;
    $<HTMLSelectElement>('province').value = 'view:thailand';
    map.flyTo({...view('thailand'), padding:uiPadding(),duration:cameraDuration()});
    updateLiveStats(); updateExperienceLabels();
  });
  $('cinema').addEventListener('click', () => { state.cinema = !state.cinema; updateExperienceLabels(); });
  $('cinema').hidden = reduceMotion;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--dock-height', `${Math.round($('timeline').getBoundingClientRect().height)}px`);
  }).observe($('timeline'));
  setInterval(() => { applyDetail(); updateLiveStats(); refreshObservationCard(); render(); }, 60_000);
  updateExperienceLabels();
}

// ---------------------------------------------------------------- boot

async function loadLive() {
  const [w, r] = await Promise.allSettled([loadWaterLevels(), loadRain()]);
  observationsFailed = w.status === 'rejected' || r.status === 'rejected';
  if (w.status === 'fulfilled') stations = w.value;
  if (r.status === 'fulfilled') rain = r.value;
  applyDetail();
  rainPonding = rain.filter((x) => freshObservation(x.time) && (x.mm24 >= 90 || (x.mm1 ?? 0) >= 30));
  overflowing = stations.filter((x) => freshObservation(x.time) && hasWaterMeasurement(x) && x.level >= 5);
  // Newest reading across all gauges, "YYYY-MM-DD HH:MM" sorts as text.
  liveStamp = [...stations.map((x) => x.time), ...rain.map((x) => x.time)].filter(Boolean).sort().at(-1) ?? '';
  updateLiveStats();
  if (discharge) updateHud();
  fillProvinces();
  refreshObservationCard();
  // Keep a near-me answer current without moving the camera.
  if (activeArea?.kind === 'near' && nearResult && !card.hidden) nearAt(activeArea.point, false);
  render();
}

// RainViewer publishes a new frame every 10 minutes; swap in the new set only when it changed.
function startRadar() {
  loadRadar()
    .then((frames) => {
      const next = frames.slice(-5);
      if (next.length && next.at(-1)!.time === radar.at(-1)?.time) return;
      radar = next;
      state.radarFrame = radar.length - 1;
      addRadar();
      syncRasters();
    })
    .catch(() => {});
}

// GloFAS publishes once a day. When a new day's analysis is out, splice it in and move "today".
async function refreshRivers() {
  if (!discharge) return;
  const wasLive = isLive();
  const changed = await refreshDischarge(discharge).catch(() => false);
  if (!changed) return;
  means = gaugeMeans(discharge);
  state.today = Math.max(0, discharge.time.indexOf(discharge.forecastFrom));
  overview = computeOverview();
  timeline.setData(discharge.time, chartRiver ? riverSeries(chartRiver) : overview, state.today);
  lastRiverKey = '';
  if (wasLive) seek(state.today);
  else updateHud();
}

// Everything live, at once — used on a timer and whenever the tab comes back into view.
function refreshAll() {
  loadLive();
  startRadar();
  refreshRivers();
}
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (Date.now() - hiddenAt > 2 * 60e3) refreshAll();
});

async function boot() {
  const mapReady = new Promise<void>((res) => map.once('load', () => res()));
  map.once('dragstart', () => (userMoved = true));
  [reaches, discharge] = await Promise.all([loadRivers(), loadDischarge()]);
  await refreshDischarge(discharge).catch(() => false);

  features = buildFeatures(reaches, discharge);
  ridges = features.filter((f) => f.reach.q >= 120);
  {
    const d = distanceToSea(reaches);
    let max = 1;
    reaches.forEach((r, i) => r.th && (max = Math.max(max, d[i])));
    sourceFrac = Float32Array.from(d, (v) => Math.min(1, v / max));
  }
  ({ paths: flowPaths, loop: flowLoop } = buildFlowPaths(reaches, (i) => discharge.assign[i], (r) => r.th === 1 && r.q >= 10));
  means = gaugeMeans(discharge);
  nameBasins();
  state.today = Math.max(0, discharge.time.indexOf(discharge.forecastFrom));
  state.t = state.today;
  // How much history is baked in (6 months by default, a year with DAYS=365).
  const months = Math.round(state.today / 30.4);
  historyMonths = months;
  setGuideText();

  overview = computeOverview();
  timeline = new Timeline($('chart') as HTMLCanvasElement, $('cursor'), $('cursor-label'), discharge.time, overview, state.today, (t) => {
    setPlaying(false);
    seek(t);
  });
  buildPanel();
  wireExperience();
  setupGuide();
  wirePlayback();
  updateHud();
  loadLive();
  setInterval(loadLive, 5 * 60e3);
  setInterval(startRadar, 5 * 60e3);
  setInterval(refreshRivers, 60 * 60e3);

  await mapReady;
  // Wait for the first full paint of the basemap so the reveal is one clean moment.
  // …but never hold the cover longer than 2.5 s for slow tiles.
  await Promise.race([
    new Promise<void>((res) => (map.loaded() ? res() : map.once('idle', () => res()))),
    new Promise<void>((res) => setTimeout(res, 2500)),
  ]);
  mapReadyFlag = true;
  addSpotlight(map, theme, await (await fetch(`${import.meta.env.BASE_URL}data/thailand.json`)).json());
  addRasters();
  setTimeout(startRadar, reduceMotion ? 0 : 3400);
  render();
  syncRasters();
  $('loading').setAttribute('data-done', '');
  growing = true;
  $('loading').setAttribute('aria-hidden', 'true');
  if (!reduceMotion && !userMoved) map.easeTo({ ...view('thailand'), duration: 1300, easing: easeOut });
}

boot().catch((err) => {
  console.error(err);
  $('loading-text').textContent = t('loading.error');
});
