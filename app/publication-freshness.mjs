export const VERIFICATION_WINDOW_MS = 48 * 3600000;
export function freshVerification(value, now = Date.now()) {
  const age = now - Date.parse(value || '');
  return Number.isFinite(age) && age >= 0 && age <= VERIFICATION_WINDOW_MS;
}
export function publicStatus(status, now = Date.now()) {
  if (status.state !== 'verified' || freshVerification(status.lastVerified, now)) return status;
  return {...status, state: 'source-unavailable', failureReason: 'verification-window-elapsed',
    message: 'Records temporarily withheld pending a fresh source check. This is not a finding that the titles are invalid.'};
}
