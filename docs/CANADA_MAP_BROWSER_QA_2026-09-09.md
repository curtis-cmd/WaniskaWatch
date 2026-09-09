# Canada overview browser QA — September 9, 2026

## Result

The redesigned interface passed the local browser checks below after two corrections. No production deployment was made. This is functional QA of the exercised paths, not a penetration test, a physical-device certification, or individual verification of every registry entry.

## Corrections tested

- Canada was clipped on narrow screens because the minimum zoom and fixed bounds prevented fitting the entire country beside the controls. Reduced the minimum zoom to 0.5, reserved space for controls/legend and removed the conflicting pan bounds. Group marker radii now scale down at national phone zooms while retaining relative count sizes.
- Ontario licences of occupation could display a rights classification as their status. Normalization now separates the known Ontario rights classifications for those records as well as leases. Genuine statuses and source verification dates remain unchanged. Added an executable regression test.

## Browser checks passed

- All 12 province/territory selections produce the corresponding detailed-record link.
- Zoom in/out, keyboard-operated zoom slider, reset to Canada and selected-region zoom work.
- Resizing the viewport preserves a selected-region zoom; 320, 390 and 768 pixel widths had no horizontal document overflow. The complete national outline was visually checked at 320 and 390 pixels.
- A Manitoba group opens a count/location popup with a route to Manitoba records; closing it works.
- Ontario navigation opens its provincial workspace and a selected lease's details, provenance, date-specific verification notice and correction link.
- Searching Ontario and switching to British Columbia clears the search and restores matching BC records.
- Presentation mode hides the chooser and restores it on exit. Copy-link reports success. Full-screen entry and exit work at the normal desktop viewport.
- Ontario status options are Active and Producing Mine; Mining and Surface Rights, Mining Rights only and Surface Rights only appear separately under rights classifications.
- No browser error/warning entries were reported in the final observed local flows.

## Automated checks

- Sites/Vinext production build: passed.
- Next.js/Vercel production build and TypeScript: passed.
- National overview and rendered HTML regression suites: 16 tests passed.
- Refresh resilience suite: 6 tests passed.

## Deployment gates still open

The preview still uses published August 31 snapshots. September 8 staged refreshes for Ontario, Saskatchewan, British Columbia and Quebec passed their jurisdiction audits but have not been promoted. Eight other jurisdictions still require refresh/review. See CANADA_MAP_REVIEW_2026-09-08.md for the prior data audit findings, including expired bundled entries and source-evidence gaps. No verification dates were advanced by these UI changes.

Before a combined public release, assemble passing refreshes, apply the approved unavailable-source policy, run the complete audit and regenerate/reconcile the national aggregate. Keep failed or unverified data out of the promoted dataset. Browser counts passing reconciliation does not establish current government status.

Physical iPhone and Android testing over cellular data remains outstanding; responsive browser emulation is not a substitute. The branded production route and its path-prefixed links must also be smoke-tested after an authorized deployment.
