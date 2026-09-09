# Continuous Canada mining map — local implementation

## Delivered

- Same OpenStreetMap geographic background as the provincial workspace; transparent provincial outlines preserve context.
- Canada remains one map when choosing jurisdictions, panning across borders, or zooming. A chosen province does not hide neighbouring activity.
- Claims, leases, exploration and operating-mine controls. Headline totals remain explicitly claim-only.
- Optional coloured published treaty/agreement polygons from zoom 4, with independent source-date and boundary-limit notices.
- Group summaries at national scale; small viewport display tiles from zoom 5. Ontario exact claims use the existing service at zoom 9; BC/Yukon/Quebec at 8; Nunavut at 7.
- Hover highlighting, persistent selection, record details, precise recorded-party labels, official source, verification date and correction link. Provincial record links carry coordinates so viewport-delivered claims can be located.
- Accessible loaded-record list, existing zoom slider, full-screen and presentation controls.

## Performance and failure behaviour

The generator produces bounded tiles (up to 250 records each), preserving original published geometry and provenance. At most 12 snapshot tiles load per view, three at a time. Quebec reads at most four matching existing claim tiles per view. Existing claim endpoints retain their limits. Rendering is capped at 6,000 detail records. A bounded 24-entry cache avoids retaining entire national geometry in memory.

Dense or truncated views say they are partial. Summary markers remain wherever detail is incomplete or unavailable; they are not additional records to add to the detail count. A failing tile does not remove successfully loaded neighbours. Requests abort on movement or layer changes; no stale selected record persists while a new view loads. Source requests time out after 25 seconds.

Generated display tiles are regenerated in both supported build scripts, including the refresh workflow's existing test/build step. Only previously generated, explicitly indexed obsolete tile paths are removed; original government datasets are not edited.

## Validation and release status

Both supported production builds and TypeScript passed. Twenty automated tests passed, including all-tile equality against eligible published source features, geometry bounds, dates, category/group reconciliation, shared active-record rules, Ontario rights normalization, and a simulated partial loading failure. Local `/canada` returned HTTP 200.

This iteration has not received a new interactive-browser or physical-device QA pass; the earlier browser report predates these changes. Browser testing of basemap delivery, cross-border panning, record selection, layers and mobile layout remains a release gate.

No remote push or public deployment was attempted. Earlier approval restrictions remain in place. These are display enhancements, not a fresh government audit. The underlying published snapshots remain August 31; the four September 8 staged refreshes and the outstanding jurisdictions have not been promoted. Complete refresh/audit and obtain publication approval before a combined release.
