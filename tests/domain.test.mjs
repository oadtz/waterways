import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
after(() => server.close());
const domain = await server.ssrLoadModule('/src/experience.ts');

test('calendar day, not fractional playback time, determines the displayed time mode', () => {
  assert.equal(domain.timeMode?.(9.7, 10), 'latest');
  assert.equal(domain.timeMode?.(9.2, 10), 'past');
  assert.equal(domain.timeMode?.(10.7, 10), 'forecast');
});
test('comparison reports meaningful change and does not divide by zero or invent missing values', () => {
  assert.deepEqual(domain.changeBetween?.(100, 150), { delta: 50, percent: 50 });
  assert.deepEqual(domain.changeBetween?.(0, 25), { delta: 25, percent: null });
  assert.equal(domain.changeBetween?.(null, 25), null);
  assert.equal(domain.changeBetween?.(10, NaN), null);
});
test('observation freshness interprets Thai timestamps and rejects old, missing and future readings', () => {
  const now = Date.parse('2026-09-27T10:00:00+07:00');
  assert.equal(domain.freshObservation?.('2026-09-27 09:40', now), true);
  assert.equal(domain.freshObservation?.('2026-09-26 09:40', now), false);
  assert.equal(domain.freshObservation?.('', now), false);
  assert.equal(domain.freshObservation?.('2026-09-28 09:40', now), false);
});
test('network focus follows directed connections and excludes unrelated tributaries downstream', () => {
  const reaches = [{id:1,down:3},{id:2,down:3},{id:3,down:4},{id:4,down:0},{id:5,down:4},{id:6,down:7},{id:7,down:6}];
  const result = domain.traceNetwork?.(reaches, 3);
  assert.deepEqual(result, { upstream: [1,2], downstream: [4] });
  assert.deepEqual(domain.traceNetwork?.(reaches, 6), { upstream: [7], downstream: [] });
});
test('display height stays bounded and monotonic across small streams and large rivers', () => {
  assert.equal(domain.ribbonHeight?.(0), 0);
  assert.ok(domain.ribbonHeight?.(100) < domain.ribbonHeight?.(1000));
  assert.ok(domain.ribbonHeight?.(10000000) <= domain.RIBBON_MAX);
  assert.equal(domain.ribbonHeight?.(NaN), 0);
});
test('latest selected reading resolves a refreshed value by ID and handles removal', () => {
  assert.deepEqual(domain.readingById?.([{id:1,value:9}],1), {id:1,value:9});
  assert.equal(domain.readingById?.([{id:2,value:9}],1), null);
});
test('water status needs at least one actual measurement', () => {
  assert.equal(domain.hasWaterMeasurement?.({msl:null,bankPct:null,bankDiff:null}), false);
  assert.equal(domain.hasWaterMeasurement?.({msl:0,bankPct:null,bankDiff:null}), true);
});
