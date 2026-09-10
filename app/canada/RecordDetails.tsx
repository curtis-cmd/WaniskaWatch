import {geometryBounds, type RecordFeature} from './map-data';

export function provincialRecordLink(record: RecordFeature) {
  const p = record.properties;
  const bounds = geometryBounds(record.geometry);
  const query = new URLSearchParams({province: p.province, record: String(p.id),
    lat: String(p.latitude ?? (bounds[1] + bounds[3]) / 2),
    lng: String(p.longitude ?? (bounds[0] + bounds[2]) / 2)});
  return `/?${query}#territory-watch`;
}

export default function RecordDetails({record, provinceName, path, onClose}: {
  record: RecordFeature; provinceName: string; path: (value:string) => string; onClose: () => void;
}) {
  const p = record.properties;
  const partyLabel = p.kind === 'lease' ? 'Recorded lease holder' : p.kind === 'exploration' ? 'Recorded licence holder or applicant' : p.kind === 'mine' ? 'Recorded operator or proponent' : 'Recorded holder';
  const verified = p.lastUpdated && Number.isFinite(Date.parse(p.lastUpdated))
    ? new Date(p.lastUpdated).toLocaleDateString('en-CA', {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}) : 'Not available';
  return <aside className="national-record-detail" aria-label="Selected mining record">
    <button type="button" onClick={onClose} aria-label="Close record details">×</button>
    <h3>{p.name || p.id}</h3><p>{p.kindLabel || p.kind} · {provinceName}</p>
    <dl><dt>Record ID</dt><dd>{p.id}</dd><dt>{partyLabel}</dt><dd>{p.holder || 'Holder source review required'}</dd>
      <dt>Published status</dt><dd>{p.status || 'Not supplied in this source field'}</dd>
      {p.holderSourceIdentifier && <><dt>Source holder identifier—not a verified name</dt><dd>{p.holderSourceIdentifier}</dd></>}
      {p.rightsClassification && <><dt>Rights classification</dt><dd>{p.rightsClassification}</dd></>}
      <dt>Verified as of</dt><dd>{verified}</dd><dt>Source</dt><dd>{p.sourceName || 'See official source register'}</dd>
    </dl>
    <p>Public-source information, not real-time or individually confirmed against every registry entry. It may be incomplete or inaccurate and must not be relied upon. Independently verify before acting.</p>
    {/^https:\/\//i.test(p.sourceUrl || '') && <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">Official source ↗</a>}
    <a href={path(provincialRecordLink(record))}>Open provincial record →</a>
    <a href={`mailto:info@waniskaservices.ca?subject=${encodeURIComponent(`Waniskâ Watch correction: ${p.province} ${p.id}`)}`}>Report an error</a>
  </aside>;
}
