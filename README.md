# Waniskâ Watch

A Waniskâ Services product for community-first environmental and industrial
intelligence by treaty territory.

The platform maps Manitoba mining claims alongside public water, forestry,
energy, pollution, infrastructure and land-use projects. It uses Manitoba's
official historic-treaty boundary dataset as a geographic index, preserves
source evidence, and connects records to verified public business contacts
where available. Private personal contact information is not published.

The product is intentionally separate from Waniskâ Payroll. It has its own:

- application and source repository
- production deployment and access policy
- D1 database binding and schema
- data-refresh pipeline
- brand identity and metadata

The public map loads:

- `public/data/manitoba-mining.json` — Manitoba iMaQs mining records
- `public/data/manitoba-treaties.json` — official Manitoba historic-treaty polygons
- `public/data/manitoba-sectors.json` — public federal assessment inventory and
  representative provincial forestry records
- `public/data/proponent-contacts.json` — verified public corporate contacts

See `docs/MANITOBA_MINING_DATABASE.md` for mining-source methodology, refresh
instructions and treaty-boundary cautions.
