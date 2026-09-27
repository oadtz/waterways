// Flowing light: pulses that travel downstream along Thai rivers, source to sea.
//
// Every reach gets timestamps measured as "kilometres since the farthest headwater": the
// distance from the reach to the sea, flipped. A TripsLayer lights the stretch whose timestamps
// fall just behind its currentTime, so a front sweeps down the whole network coherently.
// Several layers with staggered clocks give a steady rhythm of pulses.

import type { Reach } from './data';

export type FlowPath = { reach: Reach; gauge: number; ts: number[] };

const segKm = ([x1, y1]: [number, number], [x2, y2]: [number, number]) =>
  Math.hypot((x2 - x1) * 111.32 * Math.cos(((y1 + y2) / 2) * (Math.PI / 180)), (y2 - y1) * 110.57);

// Distance (km) from each reach's upstream end to the sea, following NEXT_DOWN. Iterative and
// cycle-safe; rivers leaving the dataset count their known length only.
export function distanceToSea(reaches: Reach[]): Float64Array {
  const byId = new Map(reaches.map((r, i) => [r.id, i]));
  const toSea = new Float64Array(reaches.length).fill(-1);
  for (let i = 0; i < reaches.length; i++) {
    if (toSea[i] >= 0) continue;
    const chain: number[] = [];
    const seen = new Set<number>();
    let j: number | undefined = i;
    while (j !== undefined && toSea[j] < 0 && !seen.has(j)) {
      seen.add(j);
      chain.push(j);
      j = byId.get(reaches[j].down);
    }
    let acc = j !== undefined && toSea[j] >= 0 ? toSea[j] : 0;
    for (let k = chain.length - 1; k >= 0; k--) {
      acc += reaches[chain[k]].len;
      toSea[chain[k]] = acc;
    }
  }

  return toSea;
}

export function buildFlowPaths(reaches: Reach[], gaugeOf: (i: number) => number, include: (r: Reach) => boolean) {
  const toSea = distanceToSea(reaches);
  const paths: FlowPath[] = [];
  let longest = 0;
  reaches.forEach((r, i) => {
    if (include(r)) longest = Math.max(longest, toSea[i]);
  });
  reaches.forEach((r, i) => {
    if (!include(r) || r.c.length < 2) return;
    // Scale measured vertex spacing to the reach's official length so reaches join seamlessly.
    const cum = [0];
    for (let k = 1; k < r.c.length; k++) cum.push(cum[k - 1] + segKm(r.c[k - 1], r.c[k]));
    const scale = cum.at(-1)! > 0 ? r.len / cum.at(-1)! : 0;
    const start = longest - toSea[i];
    paths.push({ reach: r, gauge: gaugeOf(i), ts: cum.map((d) => start + d * scale) });
  });
  return { paths, loop: longest };
}
