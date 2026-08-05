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
  assert.match(html, /waniska-watch-header\.png/i);
  assert.match(html, /waniska-watch-icon\.png/i);
  assert.match(html, /waniska-watch-footer\.png/i);
  assert.match(html, /waniska-services-logo\.png/i);
  assert.match(html, /A free community resource from/i);
  assert.match(html, /https:\/\/waniskaservices\.ca\//i);
  assert.match(html, /Know what’s happening/i);
  assert.match(html, /Explore the map/i);
  assert.match(html, /TERRITORY WATCH/i);
  assert.match(html, /Mining activity/i);
  assert.match(html, /A claim is not consent/i);
  assert.match(html, /Information only—do not rely on this map/i);
  assert.match(html, /compiles and continually updates its database using publicly available government records and other third-party sources/i);
  assert.match(html, /Company and individual names are reproduced as recorded in cited public sources/i);
  assert.match(html, /does not imply affiliation, endorsement, wrongdoing, consultation, consent or operational activity/i);
  assert.match(html, /Report an error or request a correction/i);
  assert.match(html, /must be independently verified and must not be relied upon/i);
  assert.match(html, /INFORMATION NOTICE/i);
  assert.match(html, /Public and third-party information/i);
  assert.doesNotMatch(html, /Limitation of liability/i);
  assert.doesNotMatch(html, /No warranties/i);
  assert.match(html, /href="#legal-notice"/i);
  assert.doesNotMatch(html, /SECTOR LENSES/i);
  assert.doesNotMatch(html, /Export visible records/i);
  assert.doesNotMatch(html, /Minerals Watch/i);
});

test("keeps the Watch and Services branding wired to local assets", async () => {
  const [portal, layout, packageJson, socialCard, headerLogo, footerLogo] = await Promise.all([
    readFile(new URL("../app/MiningPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/og-territory-watch-v2.png", import.meta.url)),
    readFile(new URL("../public/waniska-watch-header.png", import.meta.url)),
    readFile(new URL("../public/waniska-watch-footer.png", import.meta.url)),
  ]);

  assert.match(portal, /\/waniska-watch-header\.png/);
  assert.match(portal, /\/waniska-watch-footer\.png/);
  assert.match(portal, /\/waniska-services-logo\.png/);
  assert.match(portal, /A free community resource from/);
  assert.match(portal, /See the activity\. Know the territory\./);
  assert.match(portal, /mailto:info@waniskaservices\.ca/);
  assert.doesNotMatch(portal, /306-203-6830|tel:\+13062036830/);
  assert.match(layout, /Waniskâ Watch/);
  assert.match(layout, /https:\/\/app\.waniskaservices\.ca\/watch\/og-territory-watch-v2\.png/);
  assert.match(layout, /summary_large_image/);
  assert.match(layout, /Know what’s happening on the land\./);
  assert.match(packageJson, /"name": "waniska-watch"/);
  assert.equal(socialCard.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(socialCard.readUInt32BE(16), 1200);
  assert.equal(socialCard.readUInt32BE(20), 630);
  for (const logo of [headerLogo, footerLogo]) {
    assert.equal(logo.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(logo.readUInt32BE(16), 1733);
    assert.equal(logo.readUInt32BE(20), 813);
  }
});

test("wires official treaty and public-contact data into the mining portal", async () => {
  const [portal, ontarioClaimsRoute, yukonClaimsRoute, nunavutClaimsRoute, bcClaimsRoute] = await Promise.all([
    readFile(new URL("../app/MiningPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/claims/ontario/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/claims/yukon/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/claims/nunavut/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/claims/british-columbia/route.ts", import.meta.url), "utf8"),
  ]);

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
  assert.match(portal, /Recorded lease holder/i);
  assert.match(portal, /Recorded operator or proponent/i);
  assert.match(portal, /Official source/i);
  assert.match(portal, /Last verified/i);
  assert.match(portal, /Waniskâ Watch correction request/i);
  assert.match(portal, /Published status/i);
  assert.match(portal, /Rights classification/i);
  assert.match(portal, /setQuery\(""\)/i);
  assert.match(portal, /setRightsFilter\(""\)/i);
  assert.match(portal, /Issue year from/i);
  assert.match(portal, /\/data\/saskatchewan-mining\.json/);
  assert.match(portal, /\/data\/saskatchewan-territories\.json/);
  assert.match(portal, /\/data\/ontario-mining\.json/);
  assert.match(portal, /\/data\/ontario-territories\.json/);
  for (const jurisdiction of [
    "alberta", "new-brunswick", "nova-scotia", "newfoundland-and-labrador",
    "yukon", "nunavut", "saskatchewan", "ontario", "british-columbia",
    "northwest-territories", "quebec",
  ]) {
    assert.match(portal, new RegExp(`/data/${jurisdiction}-mining\\.json`));
  }
  assert.match(portal, /`\/api\/claims\/\$\{province\}/);
  assert.match(portal, /minimumZoom/);
  assert.match(portal, /watch-claim-tooltip/);
  assert.match(portal, /mouseover/);
  assert.match(portal, /mouseout/);
  assert.match(portal, /applyActivityLayerState/);
  assert.match(portal, /fitBounds\(bounds\.pad\(0\.2\)/);
  assert.match(portal, /paddingBottomRight/);
  assert.match(portal, /Hover or tap a claim to identify it/i);
  assert.match(portal, /Gold circles summarize current/i);
  assert.match(portal, /Claim activity overview/i);
  assert.match(portal, /claim-overview\.json/i);
  assert.match(portal, /scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(portal, /isCurrentActivity/);
  assert.match(portal, /assessment file/);
  assert.match(portal, /Current activity only/i);
  assert.match(ontarioClaimsRoute, /TENURE_STATUS_DESC LIKE 'Active%' OR TENURE_STATUS_DESC LIKE 'Hold%'/);
  assert.match(yukonClaimsRoute, /TENURE_STATUS='Active'/);
  assert.match(nunavutClaimsRoute, /CLAIM_STAT IN \('ACTIVE','REINSTATED','SUSPENDED'\)/);
  assert.match(bcClaimsRoute, /TERMINATION_DATE/);
  assert.match(bcClaimsRoute, /GOOD_TO_DATE/);
  assert.match(portal, /\/data\/quebec-claims\/index\.json/);
});

test("publishes lightweight current-claim overviews for large jurisdictions", async () => {
  const expected = {
    "ontario": 390_543,
    "yukon": 198_861,
    "nunavut": 4_403,
    "british-columbia": 37_429,
    "quebec": 220_841,
  };
  for (const [jurisdiction, claimCount] of Object.entries(expected)) {
    const payload = JSON.parse(await readFile(
      new URL(`../public/data/${jurisdiction}-claim-overview.json`, import.meta.url),
      "utf8",
    ));
    assert.equal(payload.metadata.currentOnly, true);
    assert.equal(payload.metadata.claimCount, claimCount);
    assert.equal(payload.features.length, payload.metadata.cellCount);
    assert.ok(payload.features.length < 1_000);
    assert.equal(payload.features.every(feature => feature.geometry.type === "Point"), true);
  }
});

test("publishes audited current-only coverage for twelve Canadian jurisdictions", async () => {
  const [manitoba, saskatchewan, ontario, yukon, nunavut, bc, nwt, quebec, quebecIndex, catalogue, audit] = await Promise.all([
    readFile(new URL("../public/data/manitoba-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/saskatchewan-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/ontario-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/yukon-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/nunavut-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/british-columbia-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/northwest-territories-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/quebec-mining.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/quebec-claims/index.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/province-coverage.json", import.meta.url), "utf8"),
    readFile(new URL("../public/data/data-audit.json", import.meta.url), "utf8"),
  ]);

  const mb = JSON.parse(manitoba);
  const sk = JSON.parse(saskatchewan);
  const on = JSON.parse(ontario);
  const yt = JSON.parse(yukon);
  const nu = JSON.parse(nunavut);
  const britishColumbia = JSON.parse(bc);
  const northwestTerritories = JSON.parse(nwt);
  const qc = JSON.parse(quebec);
  const qcIndex = JSON.parse(quebecIndex);
  const coverage = JSON.parse(catalogue);
  const dataAudit = JSON.parse(audit);

  assert.equal(mb.metadata.featureCount, 10_112);
  assert.equal(mb.metadata.currentOnly, true);
  assert.equal(mb.features.filter(feature => feature.properties.kind === "mine").length, 11);
  assert.equal(mb.features.some(feature => /rejected|abandoned|remediated|non operational/i.test(feature.properties.status || "")), false);
  assert.equal(sk.metadata.databaseRecordCount, 7_470);
  assert.equal(sk.metadata.featureCount, 7_470);
  assert.equal(sk.metadata.currentOnly, true);
  assert.equal(on.metadata.currentOnly, true);
  assert.equal(sk.features.some(feature => /assessment file/i.test(feature.properties.kindLabel)), false);
  assert.equal(sk.features.some(feature => /past|abandoned|remediated|non operational/i.test(feature.properties.status || "")), false);
  assert.equal(on.metadata.databaseRecordCount, 395_244);
  assert.equal(on.metadata.claimDelivery, "viewport-live");
  assert.equal(yt.metadata.databaseRecordCount, 201_033);
  assert.equal(yt.metadata.claimDelivery, "viewport-live");
  assert.equal(nu.metadata.databaseRecordCount, 5_022);
  assert.equal(nu.metadata.claimDelivery, "viewport-live");
  assert.equal(britishColumbia.metadata.databaseRecordCount, 38_891);
  assert.equal(britishColumbia.metadata.claimDelivery, "viewport-live");
  assert.equal(northwestTerritories.metadata.databaseRecordCount, 1_955);
  assert.equal(qc.metadata.databaseRecordCount, 221_348);
  assert.equal(qc.metadata.claimDelivery, "viewport-static");
  assert.equal(qcIndex.metadata.recordCount, 220_841);
  assert.equal(coverage.provinces.length, 11);
  assert.equal(dataAudit.metadata.result, "passed");
  assert.equal(dataAudit.metadata.liveJurisdictionCount, 12);
  assert.equal(dataAudit.metadata.totalCurrentRecordCount, 889_132);
  assert.equal(dataAudit.liveJurisdictions.every(item => item.status === "passed"), true);
});
