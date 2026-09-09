// Shared display rule. Explicit government current/renewal statuses take priority
// over older due dates; this is not a substitute for a successful source audit.
export function isCurrentActivity(properties, asOfDate = new Date().toISOString().slice(0, 10)) {
  const status = String(properties.status || '').trim().toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ');
  if (String(properties.kindLabel || '').toLowerCase().includes('assessment file')) return false;
  if (['abandoned', 'canceled', 'cancelled', 'closed', 'conv lease', 'converted to lease', 'expired', 'forfeited', 'non operational', 'orphaned', 'past producing', 'past-producing', 'refused', 'rejected', 'remediated', 'surrendered', 'terminated', 'withdrawn', 'pending', 'application'].some(marker => status.includes(marker))) return false;
  if (properties.kind === 'claim' && ['converted', 'leased', 'refused', 'withdrawn'].includes(status)) return false;
  const current = ['active', 'appl exemp', 'appl exten', 'appl lease', 'appl rff', 'good stand', 'hold', 'operational', 'producer', 'producing mine', 'reactivat', 'reinstat'].some(marker => status.includes(marker));
  if (properties.kind === 'mine') return current;
  if (properties.expiryDate && properties.expiryDate.slice(0, 10) < asOfDate && !current) return false;
  return true;
}
