import type { Feature, FeatureCollection, Geometry } from 'geojson';
export { isCurrentActivity as currentRecord } from '../current-record.mjs';
import { normalizeHolder } from '../current-record.mjs';

export type Kind = 'claim' | 'lease' | 'exploration' | 'mine';
export type RecordFeature = Feature<Geometry, Record<string, any>>;
export type Box = [number, number, number, number];
export const kinds: Record<Kind, {label: string; color: string; symbol: string}> = {
  claim: {label: 'Claims', color: '#b87925', symbol: '◆'},
  exploration: {label: 'Exploration', color: '#bc5236', symbol: '●'},
  lease: {label: 'Leases', color: '#725584', symbol: '■'},
  mine: {label: 'Operating mines', color: '#245f58', symbol: '▲'},
};
export const detailZoom: Record<string, number> = {ontario: 9, yukon: 8, nunavut: 7, 'british-columbia': 8, quebec: 8};
export const intersects = (a: number[], b: number[]) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
export function geometryBounds(geometry: Geometry): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value: any) => {
    if (typeof value?.[0] === 'number') {
      box[0] = Math.min(box[0], value[0]); box[1] = Math.min(box[1], value[1]);
      box[2] = Math.max(box[2], value[0]); box[3] = Math.max(box[3], value[1]);
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(g => {const b = geometryBounds(g); visit([b[0], b[1]]); visit([b[2], b[3]]);});
  else visit(geometry.coordinates);
  return box;
}
export function normalizeRecord(feature: RecordFeature, province: string, metadata: Record<string, any>, verifiedAt: string): RecordFeature {
  const p = feature.properties || {};
  const rawDate = (v: any) => typeof v === 'number' && Number.isFinite(v) ? new Date(v).toISOString().slice(0, 10) : v || null;
  const props: Record<string, any> = p.kind ? {...p} : {
    id: String(p.TENURE_NUMBER_ID || p.GRANT_NUMBER || p.CLAIM_NUM || p.TIT_NO || p.OBJECTID || feature.id),
    name: p.CLAIM_NAME, kind: 'claim', kindLabel: p._WANISKA_CLAIM_TYPE || p.TITLE_TYPE || 'Mining claim',
    holder: p.HOLDER || p.OWNER_NAME || p.OWNERS || null,
    status: p.TENURE_STATUS_DESC || p.TENURE_STATUS || p.CLAIM_STAT || p.STATUS || null,
    expiryDate: rawDate(p.CLAIM_DUE_DATE || p.EXPIRY_DATE || p.GOOD_TO_DATE || p.CANCEL_DT),
  };
  if (province === 'ontario' && /^(?:mining(?: and surface)?|surface) rights(?: only)?$/i.test(props.status || '')) {
    props.rightsClassification = props.status; props.status = null;
  }
  return {...feature, properties: {...normalizeHolder(props), province, sourceName: props.sourceName || metadata.source,
    sourceUrl: props.sourceUrl || metadata.sourceUrl, lastUpdated: props.lastUpdated || metadata.generatedAt || verifiedAt}};
}
export async function jsonData(url: string, signal: AbortSignal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw Error('Source unavailable');
  return response.json();
}
export type Collection = FeatureCollection<Geometry, Record<string, any>> & {metadata?: Record<string, any>};
