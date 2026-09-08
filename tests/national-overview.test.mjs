import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { aggregateClaims } from "../scripts/build-national-overview.mjs";

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
  assert.ok(html.includes("province=ontario"));
  assert.ok(html.includes("province=quebec"));
});
