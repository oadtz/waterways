// Plain-language detail cards. Every card answers, in order: what is this, is it OK,
// and one comparison a child could picture. Copy rules: short sentences, whole words
// (มิลลิเมตร, not มม.), numbers with their unit, no model jargon outside the fine print.

import type { RainStation, WaterStation } from './data';
import type { Nearby, Signal } from './nearby';
import { escapeHtml, freshObservation, hasWaterMeasurement } from './experience';
import { LEVELS, levelOf, riverLevel, type LevelKey, type RGBA } from './rivers';
import { lang, shortDate, t } from './i18n';

const OLYMPIC_POOL_M3 = 2500;

export const rgb = (c: RGBA) => `rgb(${c[0]},${c[1]},${c[2]})`;
export const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const fmt1 = (v: number) => (v >= 10 ? fmt(v) : v.toFixed(1).replace(/\.0$/, ''));

// ThaiWater timestamps look like "2026-09-27 06:50".
const when = (stamp: string) => {
  if (!stamp || !/^\d{4}-\d{2}-\d{2}/.test(stamp)) return t('source.noTime');
  const [d, hm] = stamp.replace('T', ' ').split(' ');
  return t('when', { date: shortDate(d, false), hm: hm ?? '' });
};
// ThaiWater gives Thai and English names; pick by language.
// Some ThaiWater English names arrive in capitals ("NAKORNNAYOK"); tame those to Title Case.
const tidy = (en: string) =>
  en && en === en.toUpperCase() && /[A-Z]/.test(en) ? en.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : en;
export const pick = (th: string, en: string) => escapeHtml(lang === 'en' ? tidy(en) || th : th);
const sentence = (html: string) => html.replace(/^[a-z]/, (c) => c.toUpperCase());

export function stationLevel(s: WaterStation): LevelKey {
  return s.level >= 5 ? 'danger' : s.level === 4 ? 'high' : s.level === 3 ? 'normal' : 'low';
}

export type RainClass = { key: 'moderate' | 'heavy' | 'very'; label: string; c: RGBA; min: number };
const rainKind = (key: RainClass['key'], c: RGBA, min: number): RainClass => ({
  key,
  c,
  min,
  get label() {
    return t(`rain.${key}`);
  },
});
export const RAIN: RainClass[] = [
  rainKind('moderate', [124, 118, 214, 255], 10),
  rainKind('heavy', [170, 140, 255, 255], 35),
  rainKind('very', [226, 170, 255, 255], 90),
];
const RAIN_COLORS: Record<'dark' | 'light', Record<RainClass['key'], RGBA>> = {
  dark: { moderate: [124, 118, 214, 255], heavy: [170, 140, 255, 255], very: [226, 170, 255, 255] },
  light: { moderate: [150, 140, 230, 255], heavy: [118, 86, 224, 255], very: [150, 40, 200, 255] },
};
export function setRainTheme(theme: 'dark' | 'light') {
  for (const r of RAIN) r.c = RAIN_COLORS[theme][r.key];
}
export const rainClass = (mm: number) => [...RAIN].reverse().find((r) => mm >= r.min) ?? null;

// Chip text flips between ink and white depending on how bright the chip colour is.
const onColor = (c: RGBA) => ((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6 ? '#0b0f14' : '#ffffff');
const verdict = (c: RGBA | string, text: string) =>
  typeof c === 'string'
    ? `<span class="verdict" style="--c:${c}">${text}</span>`
    : `<span class="verdict" style="--c:${rgb(c)};color:${onColor(c)}">${text}</span>`;

// "…equal to N Olympic swimming pools every second" — switches to per-minute for small streams.
function poolsSentence(q: number) {
  const perSecond = q / OLYMPIC_POOL_M3;
  if (perSecond >= 0.2) return t('pools.second', { n: fmt1(perSecond) });
  return t('pools.minute', { n: fmt1(perSecond * 60) });
}


// ---------------------------------------------------------------- river

const sourceBadge = (key: string) => `<p class="source-badge">${t(key)}</p>`;
const readingAge = (stamp: string) => freshObservation(stamp) ? '' : `<p class="data-warning">${t('source.stale')}</p>`;

function sparkline(values: number[], current: number, forecastAt: number) {
  if (values.length < 2) return '';
  const max = Math.max(...values.filter(Number.isFinite), 1);
  const x = (i: number) => 6 + i / (values.length - 1) * 288;
  const y = (v: number) => 63 - Math.max(0, v) / max * 53;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const index = Math.max(0, Math.min(values.length - 1, current));
  const start = Math.max(0, Math.min(values.length - 1, forecastAt));
  return `<svg class="flow-spark" viewBox="0 0 300 74" role="img" aria-label="${t('river.series')}">
    <path d="${path} L294,70 L6,70 Z" fill="var(--normal)" opacity=".1"/>
    <path d="${path}" fill="none" stroke="var(--normal)" stroke-width="2"/>
    <rect x="${x(start)}" y="0" width="${300-x(start)}" height="74" fill="var(--panel-solid)" opacity=".65"/>
    <path d="${values.slice(start).map((v,i)=>`${i?'L':'M'}${x(start+i)},${y(v)}`).join(' ')}" fill="none" stroke="var(--normal)" stroke-width="2" stroke-dasharray="3 4"/>
    <circle cx="${x(index)}" cy="${y(values[index])}" r="4" fill="var(--text)" stroke="var(--panel-solid)" stroke-width="2"/>
  </svg>`;
}

export function riverCard(opts: { basin?: string; upland: number; q: number; ratio: number; date: string; forecast: boolean; values?: number[]; current?: number; forecastAt?: number; upstream?: number; downstream?: number }) {
  const lvl = levelOf(riverLevel(opts.ratio));
  const compare = opts.ratio >= 1.15 ? t('river.more', { x: opts.ratio.toFixed(1) }) : opts.ratio <= .87 ? t('river.less', { pct: Math.round(opts.ratio * 100) }) : t('river.usual');
  return `${sourceBadge(opts.forecast ? 'source.forecast' : 'source.model')}
    <h3>${opts.basin ? t('river.basin', { name: opts.basin }) : t('river.local')}</h3>
    ${verdict(lvl.c, t(`model.${lvl.key}`))}
    <div class="card-details">
      <div class="flow-number"><b>${fmt(opts.q)}</b><span>${t('unit.flow')}</span></div>
      <p>${compare} · ${shortDate(opts.date)}</p>
      ${sparkline(opts.values ?? [], opts.current ?? 0, opts.forecastAt ?? 0)}
      <p class="fine">${t('model.reference')}</p>
      <div class="network-legend"><span class="network-up">↳ ${t('river.upstream')} <b>${opts.upstream ?? 0}</b></span><span class="network-down">↳ ${t('river.downstream')} <b>${opts.downstream ?? 0}</b></span></div>
      <p class="fine">${t('river.networkNote')}</p>
      <p>${sentence(poolsSentence(opts.q))}</p>
      <p class="data-warning">${t('model.disclaimer')}</p>
      <p class="fine">${t('river.fine', { area: fmt(opts.upland) })}</p>
    </div>`;
}

// ---------------------------------------------------------------- water-level station

// A river cross-section: banks, and water filled to the station's % of bank height.
function crossSection(pct: number, c: RGBA) {
  const W = 300;
  const H = 110;
  const bankY = 46;
  const bedY = 104;
  const p = Math.max(0, Math.min(pct, 150)) / 100;
  const waterY = bedY - (bedY - bankY) * p;
  const over = p > 1;
  const col = rgb(c);
  const inner = `M60 ${bankY} C 80 ${bankY} 90 ${bedY} 110 ${bedY} L190 ${bedY} C 210 ${bedY} 220 ${bankY} 240 ${bankY} Z`;
  const channel = `M0 ${bankY} L60 ${bankY} C 80 ${bankY} 90 ${bedY} 110 ${bedY} L190 ${bedY} C 210 ${bedY} 220 ${bankY} 240 ${bankY} L${W} ${bankY}`;
  // Water fills the channel up to the level; past 100% it spreads over both banks.
  const water =
    `<rect x="0" y="${Math.max(waterY, bankY)}" width="${W}" height="${bedY - Math.max(waterY, bankY) + 1}" fill="${col}" opacity="0.85" clip-path="url(#xs-channel)"/>` +
    (over ? `<rect x="0" y="${waterY}" width="${W}" height="${bankY - waterY}" fill="${col}" opacity="0.6"/>` : '');
  return `<svg class="section" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('xs.aria', { pct: Math.round(pct) })}">
    <defs><clipPath id="xs-channel"><path d="${inner}"/></clipPath></defs>
    ${water}
    <path d="${channel}" fill="none" class="xs-bank" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="0" x2="${W}" y1="${bankY}" y2="${bankY}" class="xs-line" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="4" y="${bankY - 6}" class="xs-label" font-size="12">${t('xs.bank')}</text>
    <text x="${W - 4}" y="${Math.min(waterY - 6, bedY - 6)}" fill="${col}" font-size="13" font-weight="600" text-anchor="end">${t('xs.water', { pct: Math.round(pct) })}</text>
  </svg>`;
}

export function stationCard(s: WaterStation, extra = '') {
  const lvl = levelOf(stationLevel(s));
  const pct = s.bankPct;
  const d = s.msl != null && s.prev != null ? s.msl - s.prev : null;
  const trend = d == null ? '' : d > 0.02 ? t('station.rising') : d < -0.02 ? t('station.falling') : t('station.steady');
  const m = s.bankDiff == null ? '' : Math.abs(s.bankDiff).toFixed(2);
  const bank = s.bankDiff == null ? '' : t(s.overBank ? 'station.overBy' : 'station.below', { m });
  return `
    ${sourceBadge('source.observed')}
    <p class="kicker">${t(s.canal ? 'canal.kicker' : 'station.kicker', { province: pick(s.province, s.provinceEn) })}</p>
    <h3>${pick(s.name, s.nameEn)}</h3>
    ${hasWaterMeasurement(s) ? verdict(lvl.c, lvl.key === 'danger' ? t('station.over') : lvl.key === 'high' ? t('station.nearly') : lvl.label) : `<p class="data-warning">${t('station.unavailable')}</p>`}
    ${readingAge(s.time)}<div class="card-details">
    ${pct == null || !Number.isFinite(pct) ? `<p class="empty-reading">${t('station.noLevel')}</p>` : crossSection(pct, lvl.c)}
    <p>${bank}${bank && trend ? '<br />' : ''}${trend}</p>
    ${extra}
    <p class="fine">${t('station.fine', { when: when(s.time), basin: pick(s.basin, s.basinEn) })}</p></div>`;
}

// ---------------------------------------------------------------- rain gauge

export function rainCard(r: RainStation, extra = '') {
  const cls = rainClass(r.mm24);
  const warn =
    r.mm24 >= 90 || (r.mm1 ?? 0) >= 30 ? `<p>${t('rainCard.warnVery')}</p>` : r.mm24 >= 35 ? `<p>${t('rainCard.warnHeavy')}</p>` : '';
  return `
    ${sourceBadge('source.observed')}
    <p class="kicker">${t('rainCard.kicker', { province: pick(r.province, r.provinceEn) })}</p>
    <h3>${pick(r.name, r.nameEn)}</h3>
    ${cls ? verdict(cls.c, cls.label) : verdict('#8795a0', t('rain.light'))}
    ${readingAge(r.time)}<div class="card-details">
    <div class="rain-measure"><div class="rain-vessel"><span style="height:${Math.min(100, r.mm24 / 150 * 100)}%"></span></div><div><b>${fmt1(r.mm24)}</b><span>${lang === 'th' ? 'มิลลิเมตร' : 'millimetres'}</span><small>${t('rain.scale')}</small></div></div>
    <p>${t('rainCard.amount', { mm: fmt1(r.mm24) })}<br />${t('rainCard.depth', { cm: fmt1(r.mm24 / 10) })}</p>
    ${warn}
    ${extra}
    <p class="fine">${t('rainCard.fine', { mm1: r.mm1 == null ? '—' : fmt1(r.mm1), when: when(r.time) })}</p></div>`;
}

// ---------------------------------------------------------------- province / near me

export function areaCard(title: string, kicker: string, stations: WaterStation[], rain: RainStation[], note = '') {
  const excluded = stations.filter((s) => (!freshObservation(s.time) || !hasWaterMeasurement(s))).length;
  stations = stations.filter((s) => freshObservation(s.time) && hasWaterMeasurement(s));
  rain = rain.filter((r) => freshObservation(r.time));
  const count: Record<LevelKey, number> = { low: 0, normal: 0, high: 0, danger: 0 };
  for (const s of stations) count[stationLevel(s)]++;
  const wettest = rain.reduce<RainStation | null>((a, b) => (!a || b.mm24 > a.mm24 ? b : a), null);
  const head = count.danger
    ? verdict(levelOf('danger').c, t('area.over', { n: count.danger }))
    : count.high
      ? verdict(levelOf('high').c, t('area.nearly', { n: count.high }))
      : stations.length
        ? verdict(levelOf(count.low > count.normal ? 'low' : 'normal').c, t(count.low > stations.length / 2 ? 'area.low' : count.normal > stations.length / 2 ? 'area.normal' : 'area.mixed'))
        : '';
  const tally = stations.length
    ? `<ul class="tally">${[...LEVELS]
        .reverse()
        .map((l) => `<li style="--c:${rgb(l.c)}"><b>${count[l.key]}</b>${t(`tally.${l.key}`)}</li>`)
        .join('')}</ul>`
    : `<p>${t('area.noGauges')}</p>`;
  const rainLine =
    wettest && wettest.mm24 > 0
      ? `<p>${t('area.wettest', { mm: fmt1(wettest.mm24), name: pick(wettest.name, wettest.nameEn) })}</p>`
      : rain.length
        ? `<p>${t('area.dry')}</p>`
        : `<p class="fine">${t('area.noRain')}</p>`;
  const watch = stations.filter(s => s.level >= 4).sort((a,b) => b.level-a.level).slice(0,3);
  return `
    ${sourceBadge('source.observed')}
    <p class="kicker">${kicker}</p>
    <h3>${title}</h3>
    ${head}
    <div class="card-details">
    ${tally}
    ${watch.length ? `<div class="watch-list"><h4>${t('area.attention')}</h4>${watch.map(s => `<button data-station-id="${s.id}"><span>${pick(s.name,s.nameEn)}</span><span>${s.level >= 5 ? t('station.over') : t('station.nearly')} ↗</span></button>`).join('')}</div>` : ''}
    ${rainLine}
    ${note}
    <p class="fine">${t('area.fine', { n: stations.length })}</p>
    ${excluded ? `<p class="fine">${t('area.outdated', { n: excluded })}</p>` : ''}</div>`;
}

// ---------------------------------------------------------------- near me


const distance = (km: number) => (km < 1 ? t('dist.m', { m: Math.max(50, Math.round(km * 20) * 50) }) : t('dist.km', { km: km.toFixed(1) }));

function signalRow(s: Signal, i: number) {
  let dot: RGBA | string;
  let title: string;
  let detail: string;
  if (s.kind === 'flood') {
    dot = levelOf('danger').c;
    title = t('near.sig.flood');
    detail = t('near.sig.flood.detail', { date: s.date ? shortDate(s.date, false) : '' });
  } else if (s.kind === 'radar') {
    dot = RAIN[s.intensity === 'heavy' ? 2 : s.intensity === 'moderate' ? 1 : 0].c;
    title = t(s.km < 0.6 ? 'near.sig.radarHere' : 'near.sig.radar');
    detail = t(`near.sig.radar.${s.intensity}`);
  } else if (s.kind === 'gauge') {
    const st = s.station;
    const lvl = levelOf(stationLevel(st));
    dot = lvl.c;
    title = pick(st.name, st.nameEn);
    detail = `${t(st.canal ? 'near.sig.canal' : 'near.sig.river')} · ${lvl.key === 'danger' ? t('station.over') : lvl.key === 'high' ? t('station.nearly') : lvl.label}`;
  } else {
    const r = s.rain;
    dot = rainClass(r.mm24)?.c ?? '#8795a0';
    title = pick(r.name, r.nameEn);
    detail = t('near.sig.rain', { mm: fmt1(r.mm24) });
  }
  const color = typeof dot === 'string' ? dot : rgb(dot);
  return `<li><button class="sig" data-sig="${i}"><i style="--c:${color}"></i><span><b>${title}</b><small>${detail}</small></span><em>${distance(s.km)}</em></button></li>`;
}

export function nearCard(n: Nearby | null, stamp: string) {
  if (!n) return `<p class="kicker">${t('near.kicker')}</p><h3>${t('near.checking')}</h3><div class="near-loading"></div>`;
  const tone = n.verdict === 'danger' ? levelOf('danger').c : n.verdict === 'watch' ? levelOf('high').c : levelOf('normal').c;
  const rows = n.signals.slice(0, 6).map(signalRow).join('');
  const missing = [!n.checkedFlood && t('near.missing.flood'), !n.checkedRadar && t('near.missing.radar')].filter(Boolean).join(' · ');
  return `
    <p class="kicker">${t('near.kicker')}${stamp ? ` · ${t('updated', { hm: stamp.slice(11, 16) }).replace(/^· /, '')}` : ''}</p>
    <h3>${t(`near.verdict.${n.verdict}`)}</h3>
    ${verdict(tone, t(`near.chip.${n.verdict}`, { km: n.radiusKm }))}
    ${rows ? `<ul class="signals">${rows}</ul>` : `<p>${t('near.none', { km: n.radiusKm })}</p>`}
    <p class="fine">${t('near.fine', { km: n.radiusKm })}${missing ? ` ${t('near.missing', { what: missing })}` : ''}</p>`;
}
