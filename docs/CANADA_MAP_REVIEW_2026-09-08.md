# Canada map redesign and data review — September 8, 2026

## Release status

The redesigned national map is in the local preview. Public deployment has not been requested/approved for this revision. No production dataset, database or scheduled GitHub workflow was replaced by this review.

The national overview still describes the **published August 31 snapshots**, not today's government counts. Its 878,490 grouped claims are a navigation index across 12 represented jurisdictions, not complete national coverage or exact claim boundaries. Prince Edward Island remains explicitly unconfirmed.

## Interface changes

- Simplified vector geography from Statistics Canada's 2021 cartographic provincial/territorial boundaries. Source retrieved September 8; generalization is documented in `public/data/canada-provinces.json`.
- A persistent province/territory chooser, selected-area highlighting, and a prominent link to detailed records.
- Built-in zoom buttons and slider, Canada reset, browser full screen when supported, and presentation mode.
- Resizing preserves the user's zoom instead of repeatedly resetting to Canada.
- Direct province links remain available without an interactive map. Loading/failure states and coverage limitations are explicit.
- Both national and provincial pages warn when their displayed snapshot is more than seven days old.

## Verification completed in isolated staging

Fresh government mining downloads were normalized and audited without replacing published files:

| Jurisdiction | Published-current candidate records | Claims within those records | Holder-review flags | Mining source date |
| --- | ---: | ---: | ---: | --- |
| Ontario | 404,855 | 400,175 | 4,032 | September 8, 2026 |
| Saskatchewan | 7,500 | 7,463 | 37 | September 8, 2026 |
| British Columbia | 39,684 | 38,215 | 0 | September 8, 2026 |
| Quebec | 219,796 | 219,291 | 0 | September 8, 2026 |

All four jurisdiction audits passed: raw-page/manifest counts, normalized record counts, public identifiers, inactive-status and applicable expiry checks, holder classifications and totals, overview counts, and snapshot freshness. A passing pipeline audit is **not** individual confirmation against every registry entry and does not independently establish real-world mining activity.

Staged files and individual audit reports are retained in the ignored local directory `work/data-review-2026-09-08/`. This directory is not a deployable release: its other eight jurisdictions and aggregate audit/catalogue were copied from the previous release. Assemble and re-audit a complete release before promoting it.

The four refreshes reused the previously downloaded August 9 territorial-context files. Their original dates are preserved in the manifests, normalized source tables, public territory metadata and staged availability messages. Mining refresh dates must not be used as new verification dates for those boundaries.

## Remaining data issues

The check-only audit of the existing published snapshot failed its freshness gate: all 12 datasets were approximately 194–195 hours old. Four bundled B.C. records and one bundled Quebec record were beyond their listed expiry dates; the newly built candidates passed those expiry checks. The local Alberta raw evidence also lacks pages for the 33-record metallic/industrial permits layer, so that local lineage cannot be treated as freshly verified.

The other eight jurisdictions still require successful refreshes: Manitoba, Alberta, New Brunswick, Newfoundland and Labrador, Northwest Territories, Nova Scotia, Nunavut and Yukon. Do not label the entire database current today based on the four passing candidates. Preserve genuine source outages and unresolved holder-review flags.

## Refresh-resilience changes prepared

- Validate each jurisdiction before the final combined publication audit. Failed candidates are isolated rather than silently published.
- Capture the prior passing release's file hashes. Boundary-outage retention is accepted only if the full jurisdiction snapshot and verification date are unchanged.
- A restored boundary-outage snapshot no longer requires a nonexistent fresh raw manifest.
- Keep mining and cached-boundary verification dates separate.
- Preserve per-jurisdiction audit reports and source manifests as workflow artifacts.
- Keep the existing broad-outage safeguard: automatic publication stops if more than three jurisdictions would disappear at once.

These protections are prepared in source but are not yet running in the GitHub production workflow. A real hosted workflow run is still required after release.

## Checks and release gates

Fifteen application/data-navigation tests and six refresh-resilience tests passed. The Sites production build passed. Lint has no errors in the modified application files; three existing logo image optimization warnings remain. Browser interaction/visual review and physical iPhone/Android testing have not been performed in this revision.

Before claiming a fully checked public release: complete the remaining source refreshes, assemble only passing candidates with transparent unavailable-source handling, regenerate the national overview, run the full audit and application checks, test province selection/zoom/full screen/return navigation in browsers, and obtain approval to publish the redesigned map.
