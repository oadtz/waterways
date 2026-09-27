// Timeline scrubber. Two stories:
//  - overview: kilometres of Thai river running high (yellow) or dangerous (red), stacked, per day
//  - river:    one river's daily flow, coloured by level, with the "high" and "danger" lines drawn
// The forecast window is hatched. Dragging or clicking moves the day cursor.

import { displayYear, monthShort, shortDate, t } from './i18n';

export const thaiDate = shortDate; // kept name: callers format dates through i18n now

export type Series =
  | { kind: 'overview'; high: number[]; danger: number[] }
  | { kind: 'river'; values: number[]; highAt: number; dangerAt: number };

// Canvas can't read CSS variables directly; resolve theme tokens at draw time.
function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888';
}
function alpha(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Timeline {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private hover = -1;
  private day = 0;
  private comparison: number | null = null;
  private readonly pad = { l: 4, r: 4, t: 10, b: 20 };

  constructor(
    private canvas: HTMLCanvasElement,
    private cursor: HTMLElement,
    private label: HTMLElement,
    private time: string[],
    private series: Series,
    private today: number,
    private onSeek: (t: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);

    const plot = canvas.parentElement!;
    const seek = (e: PointerEvent) => this.onSeek(this.xToT(e.clientX));
    plot.addEventListener('pointerdown', (e) => {
      plot.setPointerCapture(e.pointerId);
      seek(e);
      const move = (ev: PointerEvent) => seek(ev);
      const up = () => {
        plot.removeEventListener('pointermove', move);
        plot.removeEventListener('pointerup', up);
        plot.removeEventListener('pointercancel', up);
      };
      plot.addEventListener('pointermove', move);
      plot.addEventListener('pointerup', up);
      plot.addEventListener('pointercancel', up);
    });
    plot.addEventListener('pointermove', (e) => {
      this.hover = this.xToT(e.clientX);
      this.draw();
    });
    plot.addEventListener('pointerleave', () => {
      this.hover = -1;
      this.draw();
    });
  }

  setComparison(day: number | null) {
    if (this.comparison === day) return;
    this.comparison = day;
    this.draw();
  }

  setSeries(series: Series) {
    this.series = series;
    this.draw();
  }

  setData(time: string[], series: Series, today: number) {
    this.time = time;
    this.series = series;
    this.today = today;
    this.draw();
  }

  private xToT(clientX: number) {
    const r = this.canvas.getBoundingClientRect();
    const x = (clientX - r.left - this.pad.l) / (r.width - this.pad.l - this.pad.r);
    return Math.max(0, Math.min(this.time.length - 1, x * (this.time.length - 1)));
  }

  private tToX(t: number) {
    return this.pad.l + (t / (this.time.length - 1)) * (this.w - this.pad.l - this.pad.r);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
    this.setCursor(this.day); // reposition once the canvas has a real width
  }

  setCursor(day: number) {
    this.day = day;
    const x = this.tToX(day);
    this.cursor.style.transform = `translateX(${x}px)`;
    this.cursor.toggleAttribute('data-flip', x > this.w - 90);
    const i = Math.round(day);
    this.label.textContent = i === this.today ? t('mode.now') : shortDate(this.time[i], false);
  }

  draw() {
    const { ctx, w, h, pad, time, series } = this;
    if (!w || !time.length) return;
    ctx.clearRect(0, 0, w, h);
    const C = {
      text: token('--text'),
      text2: token('--text-2'),
      text3: token('--text-3'),
      normal: token('--normal'),
      low: token('--low'),
      high: token('--high'),
      danger: token('--danger'),
    };
    const n = time.length;
    const top = series.kind === 'overview' ? series.high.map((v, i) => v + series.danger[i]) : series.values;
    const max = Math.max(1, ...top, series.kind === 'river' ? series.dangerAt * 1.1 : 0) * 1.08;
    const y = (v: number) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
    const base = h - pad.b;
    const obsEnd = Math.min(this.today, n - 1);

    // Month grid + labels
    ctx.font = '12px "IBM Plex Sans Thai", sans-serif';
    ctx.textBaseline = 'alphabetic';
    let lastLabelEnd = -Infinity;
    time.forEach((d, i) => {
      if (!d.endsWith('-01')) return;
      const x = this.tToX(i);
      ctx.fillStyle = alpha(C.text3, 0.18);
      ctx.fillRect(Math.round(x), pad.t, 1, base - pad.t);
      const m = Number(d.slice(5, 7));
      const text = m === 1 ? `${monthShort(1)} ${displayYear(Number(d.slice(0, 4)))}` : monthShort(m);
      if (x + 3 < lastLabelEnd + 6) return; // narrow screens: skip labels that would collide
      ctx.fillStyle = m === 1 ? C.text2 : C.text3;
      ctx.fillText(text, x + 3, h - 3);
      lastLabelEnd = x + 3 + ctx.measureText(text).width;
    });

    const area = (vals: (i: number) => number, floor: (i: number) => number, from: number, to: number) => {
      ctx.beginPath();
      ctx.moveTo(this.tToX(from), y(floor(from)));
      for (let i = from; i <= to; i++) ctx.lineTo(this.tToX(i), y(vals(i)));
      for (let i = to; i >= from; i--) ctx.lineTo(this.tToX(i), y(floor(i)));
      ctx.closePath();
    };

    if (series.kind === 'overview') {
      // Red at the bottom (the part that matters most), yellow stacked above it.
      const d = series.danger;
      const hi = series.high;
      for (const [from, to, fade] of [
        [0, obsEnd, 1],
        [obsEnd, n - 1, 0.45],
      ] as const) {
        if (to <= from) continue;
        area((i) => d[i] + hi[i], (i) => d[i], from, to);
        ctx.fillStyle = alpha(C.high, 0.75 * fade);
        ctx.fill();
        area((i) => d[i], () => 0, from, to);
        ctx.fillStyle = alpha(C.danger, 0.85 * fade);
        ctx.fill();
      }
    } else {
      // Each day's sliver takes the colour of that day's level.
      const v = series.values;
      const colorOf = (q: number) => (q >= series.dangerAt ? C.danger : q >= series.highAt ? C.high : q >= series.highAt / 4 ? C.normal : C.low);
      for (let i = 0; i < n - 1; i++) {
        const fade = i >= obsEnd ? 0.45 : 1;
        ctx.beginPath();
        ctx.moveTo(this.tToX(i), base);
        ctx.lineTo(this.tToX(i), y(v[i]));
        ctx.lineTo(this.tToX(i + 1), y(v[i + 1]));
        ctx.lineTo(this.tToX(i + 1), base);
        ctx.closePath();
        ctx.fillStyle = alpha(colorOf(v[i]), 0.8 * fade);
        ctx.fill();
      }
      // Threshold lines with plain labels
      for (const [q, col, key] of [
        [series.highAt, C.high, 'model.high'],
        [series.dangerAt, C.danger, 'model.danger'],
      ] as const) {
        if (q > max) continue;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = alpha(col, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.l, Math.round(y(q)) + 0.5);
        ctx.lineTo(w - pad.r, Math.round(y(q)) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.fillText(t(key), pad.l + 4, y(q) - 3);
      }
    }

    // Forecast hatch
    if (obsEnd < n - 1) {
      const x0 = this.tToX(obsEnd);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, w - x0, base);
      ctx.clip();
      ctx.strokeStyle = alpha(C.text3, 0.22);
      ctx.lineWidth = 1;
      for (let x = x0 - h; x < w; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.lineTo(x + h, base - h);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = C.text2;
      if (w - x0 > 60) ctx.fillText(t('forecast'), x0 + 5, base - 4);
    }

    // Peak marker (observed part only)
    let peak = 0;
    for (let i = 1; i <= obsEnd; i++) if (top[i] > top[peak]) peak = i;
    if (top[peak] > 0) {
      const px = this.tToX(peak);
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.arc(px, y(top[peak]), 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.text2;
      const peakLabel = t('highest');
      const tw = ctx.measureText(peakLabel).width;
      const lx = px > w * 0.6 ? px - tw - 6 : px + 6;
      if (Math.abs(lx + tw / 2 - this.tToX(this.today)) > tw / 2 + 60) ctx.fillText(peakLabel, lx, Math.max(y(top[peak]) - 4, 11));
    }

    // Faint marker for today, so it stays findable while scrubbing elsewhere
    const tx = Math.round(this.tToX(this.today));
    ctx.fillStyle = alpha(C.text, 0.4);
    for (let yy = pad.t; yy < base; yy += 4) ctx.fillRect(tx, yy, 1, 2);

    if (this.comparison != null) {
      const ax = this.tToX(this.comparison);
      ctx.save();
      ctx.strokeStyle = C.text;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(ax, pad.t); ctx.lineTo(ax, base); ctx.stroke();
      ctx.fillStyle = C.text; ctx.fillText('A', Math.min(w-12, ax+4), pad.t+10);
      ctx.restore();
    }
    if (this.hover >= 0) {
      const hx = this.tToX(Math.round(this.hover));
      ctx.fillStyle = alpha(C.text, 0.25);
      ctx.fillRect(Math.round(hx), pad.t, 1, base - pad.t);
    }
  }
}
