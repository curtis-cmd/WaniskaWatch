import {readFileSync} from 'node:fs';
export const policy = JSON.parse(readFileSync(new URL('../config/saskatchewan-holder-publication.json',import.meta.url),'utf8'));
const normalize = value => value.toUpperCase().trim().replace(/\s+/g,' ');
const companies = new Set(policy.companies.filter(c=>c.evidenceUrl.startsWith('https://')).map(c=>normalize(c.name)));
export function publishableHolder(value) {
  if (typeof value !== 'string' || !value) return null;
  return value.split(';').every(party => {
    const match=party.match(/^\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)%\s*$/);
    return companies.has(normalize(match ? match[1] : party));
  }) ? value : null;
}
export function validateSaskatchewan(data) {
  if (data.metadata?.holderPublicationPolicy !== policy.version) throw new Error('Missing Saskatchewan holder publication policy');
  for (const feature of data.features) {
    const p=feature.properties;
    if (p.kindLabel !== 'Crown mineral disposition' || p.holderSourceIdentifier || (p.holder && publishableHolder(p.holder)!==p.holder)) throw new Error('Saskatchewan publication scope check failed');
    if (!p.holder && !['withheld-publication-review','published-field-empty'].includes(p.holderAvailability)) throw new Error('Saskatchewan missing-holder classification inconsistent');
    if (p.holderAvailability === 'withheld-publication-review' && (p.holder || p.holderEvidence || p.holderEvidenceUrl || p.holderVerifiedAt || !p.holderReviewRequired)) throw new Error('Saskatchewan withheld-holder classification inconsistent');
  }
}
