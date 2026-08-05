# Waniskâ Watch

A Waniskâ Services product for community-first mining intelligence by treaty
territory.

The platform maps current public mining claims, exploration licences, mineral
leases and mine sites across nine Canadian jurisdictions. Province- and
territory-specific pipelines preserve government-source evidence, map records
against the appropriate published treaty or agreement context, and retain
published holder names. Private personal contact information is not published.

The product is intentionally separate from Waniskâ Payroll. It has its own:

- application and source repository
- production deployment and access policy
- D1 database binding and schema
- data-refresh pipeline
- brand identity and metadata

The public map loads:

- `public/data/*-mining.json` — current-only jurisdiction datasets and map features
- `public/data/*-territories.json` — published treaty/agreement geographic indexes
- `public/data/province-coverage.json` — live jurisdiction coverage catalogue
- `public/data/data-audit.json` — latest automated freshness and lineage audit
- `public/data/proponent-contacts.json` — verified public corporate contacts

See `docs/MANITOBA_MINING_DATABASE.md` and `docs/CANADA_MINING_DATABASE.md` for
source methodology, refresh instructions and treaty-boundary cautions.
