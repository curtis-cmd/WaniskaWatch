import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { aggregateClaims } from "../scripts/build-national-overview.mjs";
import { extent } from '../scripts/build-national-detail.mjs';
import { isCurrentActivity } from '../app/current-record.mjs';
import ts from 'typescript';

const data = JSON.parse(await readFile(new URL("../public/data/canada-claims-overview.json", import.meta.url), "utf8"));

test("national counts reconcile with every included jurisdiction and map group", () => {
  assert.equal(data.features.reduce((s, f) => s + f.properties.count, 0), data.metadata.claimCount);
  assert.equal(data.jurisdictions.reduce((s, j) => s + j.count, 0), data.metadata.claimCount);
  assert.equal(new Set(data.jurisdictions.map(j => j.key)).size, data.jurisdictions.length);
  for (const j of data.jurisdictions) {
    assert.equal(data.features.filter(f => f.properties.province === j.key).reduce((s, f) => s + f.properties.count, 0), j.count);
    assert.ok(Date.parse(j.verifiedAt));
    assert.match(j.sourceUrl, /^https:\/\//);
  }
  assert.ok(data.unavailable.some(j => j.name === "Prince Edward Island"));
  assert.ok(data.features.length < 5000, "National view must stay lightweight");
});

test("national grouping preserves totals and rejects invalid points", () => {
  const points = [
    { geometry: { coordinates: [-100.8, 55.1] }, properties: { count: 2 } },
    { geometry: { coordinates: [-100.2, 55.8] }, properties: { count: 8 } },
  ];
  const result = aggregateClaims("example", "Example", points);
  assert.equal(result.length, 1);
  assert.equal(result[0].properties.count, 10);
  assert.deepEqual(result[0].geometry.coordinates, [-100.32, 55.66]);
  assert.throws(() => aggregateClaims("bad", "Bad", [{ geometry: { coordinates: [0, 0] }, properties: { count: 2 } }]));
  assert.throws(() => aggregateClaims("bad", "Bad", [{ geometry: { coordinates: [-100, 55] }, properties: { count: -1 } }]));
});

test("national navigation uses official outlines and never resets zoom on resize", async () => {
  const boundaries = JSON.parse(await readFile(new URL("../public/data/canada-provinces.json", import.meta.url), "utf8"));
  const component = await readFile(new URL("../app/canada/NationalOverview.tsx", import.meta.url), "utf8");
  assert.equal(boundaries.features.length, 13);
  assert.equal(new Set(boundaries.features.map(f => f.properties.key)).size, 13);
  assert.match(boundaries.metadata.sourceUrl, /^https:\/\/geo\.statcan\.gc\.ca\//);
  assert.match(component, /ResizeObserver\(\(\) => instance\.invalidateSize\(\{pan: false\}\)\)/);
  assert.match(component, /requestFullscreen/);
  assert.match(component, /focusProvince/);
  assert.match(component, /national-open-records/);
  assert.match(component, /minZoom: 0\.5,/);
  assert.match(component, /type="range" min="0\.5"/);
  assert.match(component, /paddingBottomRight: \[82, 104\]/);
});

test("Canada page renders useful content, dates and limitations without JavaScript", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/canada", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const content of ["Explore the land. Start here.", "claims in published snapshots", "Presentation view", "Verified as of", "Not complete national coverage", "Prince Edward Island", "Not real-time", "waniska-watch-header.png", "Zoom in", "Zoom out", "Map zoom level", "Full screen map", "Canada · All available claims"]) {
    assert.ok(html.includes(content), content);
  }
  assert.ok(html.includes(data.metadata.claimCount.toLocaleString("en-CA")));
  for (const j of data.jurisdictions) assert.ok(html.includes(`province=${j.key}`));
  for (const label of ['Map layers', 'Operating mines', 'Treaties &amp; agreements', 'Loaded records']) assert.ok(html.includes(label), label);
});

test('display tiles preserve published geometry, identifiers, dates and eligible category counts', async () => {
  const index = JSON.parse(await readFile(new URL('../public/data/canada-detail-index.json', import.meta.url), 'utf8'));
  for (const jurisdiction of data.jurisdictions) {
    const source = JSON.parse(await readFile(new URL(`../public/data/${jurisdiction.key}-mining.json`, import.meta.url), 'utf8'));
    const expected = source.features.filter(f => isCurrentActivity(f.properties));
    const actual = [];
    for (const tile of index.tiles.filter(t => t.province === jurisdiction.key)) {
      assert.match(tile.file, /^\/data\/canada-detail\/[a-z0-9-]+\.json$/);
      const payload = JSON.parse(await readFile(new URL(`../public${tile.file}`, import.meta.url), 'utf8'));
      assert.equal(payload.metadata.generatedAt, source.metadata.generatedAt);
      assert.equal(payload.features.length, tile.count);
      assert.ok(tile.count <= 250);
      for (const feature of payload.features) {
        const b = extent(feature.geometry);
        assert.ok(b[0] >= tile.bounds[0] && b[1] >= tile.bounds[1] && b[2] <= tile.bounds[2] && b[3] <= tile.bounds[3]);
        actual.push(JSON.stringify(feature));
      }
    }
    assert.deepEqual(actual.sort(), expected.map(JSON.stringify).sort(), jurisdiction.name);
    for (const kind of ['lease', 'exploration', 'mine']) assert.equal(
      index.groups.filter(g => g.properties.province === jurisdiction.key && g.properties.kind === kind).reduce((s,g) => s + g.properties.count, 0),
      expected.filter(f => f.properties.kind === kind).length,
    );
  }
});

test('national and provincial maps share active-record and renewal rules', () => {
  for (const status of ['Expired', 'Cancelled', 'Non operational', 'Past-producing', 'Pending']) assert.equal(isCurrentActivity({kind:'mine',status}), false);
  assert.equal(isCurrentActivity({kind:'mine',status:'Operational'}), true);
  assert.equal(isCurrentActivity({kind:'mine',status:null}), false);
  assert.equal(isCurrentActivity({kind:'claim',status:null,expiryDate:'2020-01-01'}), false);
  assert.equal(isCurrentActivity({kind:'claim',status:'Reinstated',expiryDate:'2020-01-01'}), false);
});

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function mapDataModule() {
  const source = await readFile(new URL('../app/canada/map-data.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
    .replaceAll('../current-record.mjs', new URL('../app/current-record.mjs', import.meta.url).href);
  const url = moduleUrl(javascript);
  return {url, module: await import(url)};
}

test('viewport geometry and Ontario field normalization retain provenance', async () => {
  const {module: m} = await mapDataModule();
  assert.equal(m.intersects([-107,50,-105,52], [-106,51,-104,53]), true);
  assert.equal(m.intersects([-107,50,-105,52], [-80,50,-78,52]), false);
  const geometry = {type:'Polygon',coordinates:[[[-106,50],[-105,50],[-105,51],[-106,50]]]};
  assert.deepEqual(m.geometryBounds(geometry), [-106,50,-105,51]);
  const result = m.normalizeRecord({type:'Feature',geometry,properties:{kind:'exploration',id:'LIC-1',status:'Surface Rights Only',holder:'Recorded company'}}, 'ontario', {source:'Ontario',sourceUrl:'https://example.gov/registry',generatedAt:'2026-08-31'}, '2026-08-31');
  assert.equal(result.properties.status, null);
  assert.equal(result.properties.rightsClassification, 'Surface Rights Only');
  assert.equal(result.properties.lastUpdated, '2026-08-31');
  assert.equal(result.properties.holder, 'Recorded company');
  assert.deepEqual(result.geometry, geometry);
});

test('a failing display tile does not suppress passing neighbouring records', {timeout: 10000}, async t => {
  const {url} = await mapDataModule();
  const source = await readFile(new URL('../app/canada/activity-map.ts', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll('./map-data', url);
  const {mountActivityLayers} = await import(moduleUrl(javascript));
  const feature = {type:'Feature',geometry:{type:'Point',coordinates:[-106,51]},properties:{kind:'lease',id:'1',status:'Active'}};
  const fixtures = {
    '/data/canada-detail-index.json': {groups:[],tiles:[{province:'saskatchewan',kind:'lease',bounds:[-107,50,-105,52],file:'/good'},{province:'saskatchewan',kind:'claim',bounds:[-107,50,-105,52],file:'/bad'}]},
    '/data/canada-provinces.json':{features:[{...feature,properties:{key:'saskatchewan'}}]},
    '/good':{type:'FeatureCollection',features:[feature],metadata:{generatedAt:'2026-08-31'}},
  };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(JSON.stringify(fixtures[url] || {}), {status:fixtures[url] ? 200 : 503});
  t.after(() => {globalThis.fetch = oldFetch;});
  const group = () => ({addTo(){return this;},clearLayers(){},remove(){},eachLayer(){}});
  const L = {layerGroup:group,geoJSON:group};
  const map = {createPane(){},getPane(){return {style:{}};},getZoom(){return 6;},getBounds(){return {getWest:()=>-107,getEast:()=>-105,getSouth:()=>50,getNorth:()=>52};},on(){},off(){}};
  let records, keys;
  let finish;
  const completed = new Promise(resolve => {finish = resolve;});
  const controller = mountActivityLayers(L,map,{jurisdictions:[{key:'saskatchewan',name:'Saskatchewan',verifiedAt:'2026-08-31'}],path:x=>x,settings:()=>({kinds:new Set(['lease','claim']),territories:false}),onGroups(){},onSelect(){},onRecords:r=>{records=r;},onDetailKeys:k=>{keys=k;},onNote:n=>{if(n.includes('individual records loaded')) finish(n);}});
  t.after(()=>controller.destroy());
  const note = await completed;
  assert.equal(records.length,1);
  assert.match(note,/could not load/);
  assert.equal(keys.has('saskatchewan:lease'),true);
  assert.equal(keys.has('saskatchewan:claim'),false);
});
