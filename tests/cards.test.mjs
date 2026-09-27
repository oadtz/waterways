import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
globalThis.document = { documentElement: {lang:'en'} };
const server = await createServer({server:{middlewareMode:true, hmr:false, ws:false}, appType:'custom'});
after(() => server.close());
const {stationCard, riverCard, areaCard, rainCard} = await server.ssrLoadModule('/src/cards.ts');
const station = {id:1,name:'Gauge',nameEn:'Gauge',province:'Place',provinceEn:'Place',basin:'River',basinEn:'River',lon:100,lat:14,msl:null,prev:null,bankPct:null,bankDiff:null,overBank:false,level:3,time:''};
test('station without bank measurement never depicts an empty river', () => {
  const html = stationCard(station);
  assert.ok(!html.includes('Water is at 0%'));
  assert.match(html, /unavailable/i);
});
test('model high flow does not claim confirmed danger or bank overflow', () => {
  const html = riverCard({q:1000,ratio:4,upland:100,date:'2026-09-27',forecast:false});
  assert.ok(!html.includes('>Danger<'));
  assert.match(html, /model/i);
  assert.match(html, /not.*flood/i);
});
test('area with only low readings does not claim mostly normal', () => {
  const html = areaCard('Place','Latest',[{...station,level:1,msl:1,time:new Date().toISOString()}],[]);
  assert.ok(!html.includes('mostly normal'));
  assert.match(html, /Most gauges report low water/);
});
test('empty station data is explicitly unavailable, not a normal status', () => {
  const html = areaCard('Place','Latest',[],[]);
  assert.match(html,/No water-level gauges|No recent/i);
  assert.ok(!html.includes('mostly normal'));
});
test('missing all water measurements cannot display a reassuring normal verdict', () => {
  const html = stationCard({...station,time:new Date().toISOString()});
  assert.ok(!html.includes('>Normal</span>'));
  assert.match(html,/unavailable/i);
});
test('missing hourly rainfall remains unavailable beside a valid daily total', () => {
  const html = rainCard({...station,mm24:12,mm1:null,time:new Date().toISOString()});
  assert.match(html, /—/);
  assert.ok(!html.includes('Last hour: 0'));
});
