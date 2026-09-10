// Withhold unresolved status/expiry conflicts; this is not a legal title ruling.
export function isCurrentActivity(properties, asOfDate = new Date().toISOString().slice(0, 10)) {
  const status = String(properties.status || '').trim().toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ');
  if (String(properties.kindLabel || '').toLowerCase().includes('assessment file')) return false;
  if (/inactive|abandon|cancel|closed|conv lease|converted|expired|forfeit|non operational|orphan|past.produc|refus|reject|remediat|surrender|terminat|withdraw|pending|application/.test(status)) return false;
  const expiry = String(properties.expiryDate || '').slice(0, 10);
  if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry)) || new Date(expiry).toISOString().slice(0, 10) !== expiry || expiry < asOfDate)) return false;
  const current = /^(active(?:\b.*)?|good stand|on hold|hold|operational|producer|producing mine|reactivated|reinstated|renewed)$/.test(status);
  return properties.kind === 'mine' ? current : Boolean(expiry) || current;
}

export function normalizeHolder(properties) {
  const holder = String(properties.holder || '').trim();
  if (!/^\d+(?:\s*[,;|]\s*\d+)*$/.test(holder)) return properties;
  return {...properties, holder: null, holderSourceIdentifier: holder,
    holderAvailability: 'identifier-only', holderReviewRequired: true};
}
