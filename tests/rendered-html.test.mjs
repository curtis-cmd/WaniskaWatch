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
  assert.match(html, /<title>Waniskâ Watch — Treaty Territory Mining Intelligence<\/title>/i);
  assert.match(html, /waniska-watch-logo\.png/i);
  assert.match(html, /waniska-services-logo\.png/i);
  assert.match(html, /A PRODUCT OF/i);
  assert.match(html, /https:\/\/waniskaservices\.ca\//i);
  assert.match(html, /See the mining activity happening in your treaty territory\./i);
  assert.match(html, /MINERAL RECORD TYPES/i);
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
  assert.match(portal, /A PRODUCT OF/);
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
});
