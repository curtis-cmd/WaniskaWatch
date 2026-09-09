import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateClaims } from './build-national-overview.mjs';
import { isCurrentActivity } from '../app/current-record.mjs';

const root = fileURLToPath(new URL('../public/data/', import.meta.url));
export function extent(geometry) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = value => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number') {
      box[0] = Math.min(box[0], value[0]); box[1] = Math.min(box[1], value[1]);
      box[2] = Math.max(box[2], value[0]); box[3] = Math.max(box[3], value[1]);
    } else value.forEach(visit);
  };
  if (geometry?.type === 'GeometryCollection') geometry.geometries.forEach(g => visitGeometry(g));
  else visit(geometry?.coordinates);
  function visitGeometry(g) { const b = extent(g); visit([b[0], b[1]]); visit([b[2], b[3]]); }
  return box;
}

export async function buildNationalDetail() {
  const overview = JSON.parse(await readFile(resolve(root, 'canada-claims-overview.json'), 'utf8'));
  const previous = await readFile(resolve(root, 'canada-detail-index.json'), 'utf8').then(JSON.parse).catch(() => ({tiles: []}));
  const index = { metadata: { note: 'Derived display tiles from published snapshots; dates are unchanged.' }, tiles: [], groups: [] };
  await mkdir(resolve(root, 'canada-detail'), { recursive: true });
  for (const jurisdiction of overview.jurisdictions) {
    const dataset = JSON.parse(await readFile(resolve(root, `${jurisdiction.key}-mining.json`), 'utf8'));
    dataset.features = dataset.features.filter(f => isCurrentActivity(f.properties));
    const buckets = new Map();
    for (const feature of dataset.features) {
      const p = feature.properties;
      if (!['claim', 'lease', 'exploration', 'mine'].includes(p.kind)) throw Error('Unexpected mining category');
      const key = `${p.kind}-${Math.floor(p.longitude)}-${Math.floor(p.latitude)}`;
      const items = buckets.get(key) || []; items.push(feature); buckets.set(key, items);
    }
    for (const kind of ['lease', 'exploration', 'mine']) {
      const points = dataset.features.filter(f => f.properties.kind === kind).map(f => ({geometry: {coordinates: [f.properties.longitude, f.properties.latitude]}, properties: {count: 1}}));
      index.groups.push(...aggregateClaims(jurisdiction.key, jurisdiction.name, points).map(f => ({...f, properties: {...f.properties, kind}})));
    }
    for (const [key, features] of buckets) {
      for (let start = 0; start < features.length; start += 250) {
        const batch = features.slice(start, start + 250);
        const boxes = batch.map(f => extent(f.geometry));
        if (boxes.some(b => !b.every(Number.isFinite))) throw Error('Invalid detail geometry');
        const bounds = [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
        const file = `/data/canada-detail/${jurisdiction.key}-${key}-${start}.json`;
        await writeFile(resolve(root, file.replace('/data/', '')), JSON.stringify({type: 'FeatureCollection', metadata: dataset.metadata, features: batch}));
        index.tiles.push({province: jurisdiction.key, kind: batch[0].properties.kind, bounds, file, count: batch.length});
      }
    }
  }
  await writeFile(resolve(root, 'canada-detail-index.json'), JSON.stringify(index));
  const files = new Set(index.tiles.map(t => t.file));
  for (const tile of previous.tiles) {
    if (!files.has(tile.file) && /^\/data\/canada-detail\/[a-z0-9-]+\.json$/.test(tile.file)) {
      await unlink(resolve(root, tile.file.replace('/data/', ''))).catch(error => {if (error.code !== 'ENOENT') throw error;});
    }
  }
  console.log(`National detail: ${index.tiles.length} display tiles, ${index.groups.length} non-claim groups. Verification dates preserved.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildNationalDetail();
