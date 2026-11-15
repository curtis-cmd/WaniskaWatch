import policy from '../config/publication-sources.json' with {type: 'json'};

export function publicationEnabled(key) {
  const source = policy.jurisdictions[key];
  return source?.enabled === true && /^https:\/\//.test(source.licenceUrl || '')
    && /^https:\/\//.test(source.evidenceUrl || '') && !!source.attribution;
}

export function publicationStatus(key, status) {
  if (publicationEnabled(key)) return status;
  return {...status, state:'publication-review', failureReason:'publication-scope-review',
    message:'Not currently republished by Waniskâ Watch. Consult the official registry. This is not a finding of no mining activity or invalid titles.'};
}

export {policy as publicationPolicy};
