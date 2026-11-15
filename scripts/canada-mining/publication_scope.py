"""Shared publication allow-list, independent of successful source refreshes."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def enabled(key, root=ROOT):
    policy = json.loads((root/'config/publication-sources.json').read_text())
    row = policy['jurisdictions'].get(key, {})
    return row.get('enabled') is True and all(row.get(k) for k in ('licenceUrl','evidenceUrl','attribution'))

def withhold(key, root=ROOT):
    path = root/'public/data/jurisdiction-status.json'
    directory = json.loads(path.read_text())
    row = directory['jurisdictions'][key]
    row.update(state='publication-review', failureReason='publication-scope-review',
               message='Not currently republished by Waniskâ Watch. Consult the official registry. This is not a finding of no activity or invalid titles.')
    # Preserve lastVerified and checkedAt: a policy decision is not a source check.
    path.write_text(json.dumps(directory, ensure_ascii=False, indent=2)+'\n')

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('jurisdiction')
    p.add_argument('--withhold',action='store_true')
    a=p.parse_args()
    if a.withhold:
        if enabled(a.jurisdiction): raise SystemExit('Cannot policy-withhold an enabled jurisdiction')
        withhold(a.jurisdiction)
    else: raise SystemExit(0 if enabled(a.jurisdiction) else 1)
