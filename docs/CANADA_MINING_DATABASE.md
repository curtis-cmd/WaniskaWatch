# Canada mining databases

Waniskâ Watch maintains reproducible, jurisdiction-specific pipelines for current public mining
records. Each source schema remains traceable; a normalized SQLite schema provides a consistent
research layer without implying that different registries publish equivalent fields.

## Live coverage

As of August 5, 2026, verified pipelines are live for:

- Manitoba;
- Saskatchewan;
- Alberta;
- Ontario;
- New Brunswick;
- Nova Scotia;
- Newfoundland and Labrador;
- Yukon; and
- Nunavut;
- British Columbia;
- Northwest Territories; and
- Quebec.

| Jurisdiction | Current records | Delivery |
| --- | ---: | --- |
| Manitoba | 10,112 | Bundled |
| British Columbia | 38,891 | Claims by viewport; leases/licences bundled |
| Alberta | 90 | Bundled |
| New Brunswick | 1,412 | Bundled |
| Nova Scotia | 2,073 | Bundled |
| Newfoundland and Labrador | 4,482 | Bundled |
| Yukon | 201,033 | Claims by viewport; leases bundled |
| Nunavut | 5,022 | Claims by viewport; leases/licences bundled |
| Northwest Territories | 1,955 | Bundled |
| Quebec | 221,348 | Claims in local static map tiles; leases/concessions bundled |
| Saskatchewan | 7,470 | Bundled |
| Ontario | 395,244 | Claims by viewport; other records bundled |
| **Total** | **889,132** | |

The generated `public/data/data-audit.json` is the authoritative count and freshness register.
It reconciles each public dataset to canonical raw download pages and records the retrieval time,
current-only count, bundled map-feature count, holder coverage and any validation issue.

## What “current” means

The public view excludes records clearly published as abandoned, canceled/cancelled, closed,
converted, expired, forfeited, refused, rejected, remediated, surrendered, terminated or
withdrawn or merely pending. Historical assessment-file footprints are not presented as current exploration.
Mine inventories are included only when the source explicitly identifies an operating or
producing mine. Active, reinstated, suspended or otherwise unexpired administrative tenures remain
visible where the source treats them as legally current. The BC, Quebec and NWT pipelines also
apply strict published-expiry checks before public release.

Raw source downloads and normalized research databases remain reproducible, while the browser
datasets are current-only. This separation makes it possible to audit a government source without
showing historic records as present-day activity.

## Official sources

| Jurisdiction | Primary current mining source | Treaty/agreement context |
| --- | --- | --- |
| Manitoba | Government of Manitoba iMaQs | Manitoba Land Initiative treaty boundaries |
| Saskatchewan | Saskatchewan MARS and Geological Survey | Saskatchewan First Nation Treaty Boundaries |
| Alberta | Alberta Energy and Minerals agreement overview | CIRNAC/ISC Historic Treaties |
| Ontario | Ontario MLAS and Ontario Mineral Inventory | CIRNAC/ISC Historic Treaties |
| New Brunswick | GeoNB Mineral Claims | CIRNAC/ISC Historic Treaties |
| Nova Scotia | NovaROC exploration licences and mineral leases | CIRNAC/ISC Historic Treaties |
| Newfoundland and Labrador | Mineral Lands Map Staked Claims | CIRNAC/ISC Modern Treaties |
| Yukon | GeoYukon placer/quartz claims and leases | Government of Yukon Treaties and Agreements |
| Nunavut | CIRNAC mineral claims, mining leases and coal exploration licences | CIRNAC/ISC Modern Treaties |
| British Columbia | Mineral Titles Online / DataBC tenure spatial view | CIRNAC/ISC Historic Treaties |
| Northwest Territories | GNWT Mineral Tenure Web Map active layers | CIRNAC/ISC Modern Treaties |
| Quebec | GESTIM weekly active-title shapefile | CIRNAC/ISC Historic Treaties |

Statistics Canada’s 2021 cartographic boundaries clip national treaty/agreement data to each
selected province or territory.

## Database outputs

Generated databases are ignored by Git because they are reproducible and large:

`data/<jurisdiction>-mining/processed/<jurisdiction>_mining_by_territory.sqlite`

The normalized schema includes:

- `data_sources` — source URL, layer, filter, jurisdiction and retrieval timestamp;
- `territory_contexts` — clipped government-published treaty/agreement polygons and context type;
- `mining_records` — source fields, full EPSG:3347 geometry, centroid and source attributes;
- `record_territory_intersections` — many-to-many spatial matches, primary match and overlap;
- `recorded_entities` and `record_entity_relationships` — published holder names and evidence;
- `records_by_territory` and `territory_summary` — research-ready views.

Names are classified as organizations only by a transparent name-pattern inference. Other names
remain `unclassified`; Waniskâ Watch does not infer that an unclassified name is a private
individual. Private personal contact details are not added.

## Refresh and audit

Install the pinned spatial dependencies, refresh one configured jurisdiction, then audit all
published outputs:

```bash
python3 -m pip install --target scripts/canada-mining/vendor \
  -r scripts/canada-mining/requirements.txt
PYTHON_BIN=python3 bash scripts/canada-mining/refresh.sh yukon
python3 scripts/canada-mining/audit_public_datasets.py
```

To regenerate the browser-safe files after databases exist:

```bash
python3 scripts/canada-mining/build_public_dataset.py \
  alberta new-brunswick nova-scotia newfoundland-and-labrador \
  yukon nunavut british-columbia northwest-territories quebec \
  saskatchewan ontario
```

Ontario, Yukon, Nunavut and British Columbia claim polygons are delivered from official services
by map viewport rather than bundled into the landing page. Quebec's weekly GESTIM shapefile is
normalized into one-degree static map tiles. Users must zoom to a local view; responses are capped
and the interface asks users to zoom further when more records intersect the view than can be
safely displayed at once.

## Remaining jurisdictions

- **Prince Edward Island:** no current public mineral-title polygon registry has been identified;
  a zero count will not be represented as verified without provincial confirmation.

## Territorial-context limitation

Published treaty and agreement polygons are geographic indexes only. They are not legal surveys
and do not determine rights, title, traditional territory, Métis or Inuit geography, consultation
duties, accommodation or consent. Records without a polygon match remain explicitly unassigned.
Nation-verified and Nation-authorized information should take priority where it can be published
under appropriate governance.
