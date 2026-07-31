import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders Waniskâ Watch with the supplied branding", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Waniskâ Watch — Territory Watch<\/title>/i);
  assert.match(html, /waniska-watch-logo\.png/i);
  assert.match(html, /waniska-services-logo\.png/i);
  assert.match(html, /A free community resource from/i);
  assert.match(html, /https:\/\/waniskaservices\.ca\//i);
  assert.match(html, /Start with a place/i);
  assert.match(html, /TERRITORY WATCH/i);
  assert.match(html, /Mining activity/i);
  assert.match(html, /A claim is not consent/i);
  assert.doesNotMatch(html, /SECTOR LENSES/i);
  assert.doesNotMatch(html, /Export visible records/i);
  assert.doesNotMatch(html, /Minerals Watch/i);
});

test("keeps the Watch and Services branding wired to local assets", async () => {
  const [portal, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/MiningPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(portal, /\/waniska-watch-logo\.png/);
  assert.match(portal, /\/waniska-services-logo\.png/);
  assert.match(portal, /A free community resource from/);
  assert.match(layout, /Waniskâ Watch/);
  assert.match(packageJson, /"name": "waniska-watch"/);
});

test("wires official treaty and public-contact data into the mining portal", async () => {
  const portal = await readFile(new URL("../app/MiningPortal.tsx", import.meta.url), "utf8");

  assert.match(portal, /\/data\/manitoba-treaties\.json/);
  assert.match(portal, /\/data\/proponent-contacts\.json/);
  assert.doesNotMatch(portal, /\/data\/manitoba-sectors\.json/);
  assert.doesNotMatch(portal, /createObjectURL|Export visible records|\\.csv/i);
  assert.match(portal, /does not publish private personal contact information/i);
  assert.match(portal, /Claims and licences are not evidence of consultation or consent/i);
  assert.match(portal, /OCAP®/i);
  assert.match(portal, /Nation-verified information will take priority/i);
  assert.match(portal, /No published treaty match/i);
  assert.match(portal, /Recorded holder or company/i);
  assert.match(portal, /Published status/i);
  assert.match(portal, /Issue year from/i);
  assert.match(portal, /\/data\/saskatchewan-mining\.json/);
  assert.match(portal, /\/data\/saskatchewan-territories\.json/);
  assert.match(portal, /\/data\/ontario-mining\.json/);
  assert.match(portal, /\/data\/ontario-territories\.json/);
  assert.match(portal, /\/api\/claims\/ontario/);
  assert.match(portal, /Zoom in to level 9/i);
});

test("publishes verified Saskatchewan and Ontario coverage metadata", async () => {
  const [saskatchewan, ontario, catalogue] = await Promise.all([
    readFile(new URL("../public/data/saskatchewan-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/ontario-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/province-coverage.json", import.meta.url), "utf8"),
  ]);

  const sk = JSON.parse(saskatchewan);
  const on = JSON.parse(ontario);
  const coverage = JSON.parse(catalogue);

  assert.equal(sk.metadata.databaseRecordCount, 22_503);
  assert.equal(sk.metadata.featureCount, 22_503);
  assert.equal(on.metadata.databaseRecordCount, 399_585);
  assert.equal(on.metadata.claimDelivery, "viewport-live");
  assert.equal(coverage.provinces.length, 2);
});
