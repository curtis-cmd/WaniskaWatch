import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async name => JSON.parse(await readFile(resolve(root, "public/data", name), "utf8"));

// Each jurisdiction contributes either its complete claim overview or its
// bundled claims, never both. This is a navigation index, not claim geometry.
export function aggregateClaims(key, name, features) {
  const cells = new Map();
  for (const feature of features) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const count = feature.properties.count;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -142 || longitude > -50 || latitude < 40 || latitude > 85
      || !Number.isSafeInteger(count) || count < 1) throw new Error(`Invalid national overview input: ${key}`);
    const cellKey = `${Math.floor(longitude)}:${Math.floor(latitude)}`;
    const cell = cells.get(cellKey) ?? { count: 0, longitude: 0, latitude: 0 };
    cell.count += count;
    cell.longitude += longitude * count;
    cell.latitude += latitude * count;
    cells.set(cellKey, cell);
  }
  return [...cells.values()].map(cell => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [+(cell.longitude / cell.count).toFixed(5), +(cell.latitude / cell.count).toFixed(5)] },
    properties: { province: key, name, count: cell.count },
  }));
}

export async function buildNationalOverview() {
  const [audit, statuses] = await Promise.all([read("data-audit.json"), read("jurisdiction-status.json")]);
  const features = [], jurisdictions = [], unavailable = [];
  for (const [key, status] of Object.entries(statuses.jurisdictions)) {
    if (status.state !== "verified" && !audit.liveJurisdictions.some(j => j.key === key)) {
      unavailable.push({ name: key.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase()), reason: "No passing published snapshot available" });
    }
  }
  for (const jurisdiction of audit.liveJurisdictions) {
    const key = jurisdiction.key;
    if (!jurisdiction.published || jurisdiction.status !== "passed" || statuses.jurisdictions[key]?.state !== "verified") {
      unavailable.push({ name: jurisdiction.jurisdiction, reason: "No passing published snapshot available" });
      continue;
    }
    const dataset = await read(`${key}-mining.json`);
    if (dataset.metadata.currentOnly !== true) throw new Error(`Non-current dataset: ${key}`);
    if (dataset.metadata.featureCount !== dataset.features.length
      || (dataset.metadata.databaseRecordCount ?? dataset.features.length) !== jurisdiction.currentRecordCount
      || dataset.metadata.generatedAt !== jurisdiction.generatedAt) throw new Error(`Published audit mismatch: ${key}`);
    const expected = dataset.metadata.counts.claim ?? 0;
    let points;
    if (dataset.metadata.claimOverview) {
      const overview = await read(dataset.metadata.claimOverview.split("/").pop());
      if (overview.metadata.claimCount !== expected || overview.metadata.currentOnly !== true
        || overview.metadata.generatedAt !== dataset.metadata.generatedAt) throw new Error(`Claim overview mismatch: ${key}`);
      points = overview.features;
    } else {
      points = dataset.features.filter(f => f.properties.kind === "claim").map(f => ({
        geometry: { coordinates: [f.properties.longitude, f.properties.latitude] }, properties: { count: 1 },
      }));
    }
    const cells = aggregateClaims(key, jurisdiction.jurisdiction, points);
    const count = cells.reduce((sum, f) => sum + f.properties.count, 0);
    if (count !== expected) throw new Error(`National claim count does not reconcile: ${key}: ${count} != ${expected}`);
    features.push(...cells);
    jurisdictions.push({ key, name: jurisdiction.jurisdiction, count, verifiedAt: jurisdiction.lastVerified, sourceUrl: dataset.metadata.sourceUrl });
  }
  unavailable.push({ name: "Prince Edward Island", reason: "Coverage not confirmed; not a verified zero" });
  const dates = jurisdictions.map(j => j.verifiedAt).sort();
  const result = {
    type: "FeatureCollection",
    metadata: {
      claimCount: jurisdictions.reduce((sum, j) => sum + j.count, 0),
      oldestVerified: dates[0] ?? null, newestVerified: dates.at(-1) ?? null,
      auditedAt: audit.metadata.auditedAt,
      note: "Published claim snapshots grouped into approximate one-degree cells. Markers are not claim boundaries or land-area measurements. Not guaranteed real-time or complete national coverage.",
    },
    jurisdictions: jurisdictions.sort((a, b) => a.name.localeCompare(b.name)),
    unavailable,
    features,
  };
  await writeFile(resolve(root, "public/data/canada-claims-overview.json"), JSON.stringify(result));
  console.log(`Canada overview: ${result.metadata.claimCount.toLocaleString("en-CA")} published claims in ${features.length} groups across ${jurisdictions.length} jurisdictions.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildNationalOverview();
