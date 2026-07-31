# Manitoba Mining by Treaty Territory

This dataset is a reproducible SQLite database built from Government of Manitoba GIS data. It organizes mineral claims, exploration records, and mine/lease operations by the numbered treaty territory intersected by each record.

## Deliverables

- `data/manitoba-mining/processed/manitoba_mining_by_treaty.sqlite` — normalized SQLite database
- `data/manitoba-mining/processed/treaty_summary.csv` — counts and claim-overlap area by treaty
- `data/manitoba-mining/processed/records_by_treaty.csv` — analysis-ready flat export
- `data/manitoba-mining/processed/unassigned_records.csv` — records that could not be assigned
- `public/data/manitoba-mining.json` — browser-ready GeoJSON used by Waniskâ Watch
- `/mining` — treaty-filtered portal with mapped records and published holder evidence

## Included Government Layers

| Database category | Manitoba iMaQs layer |
|---|---|
| Claim | Mining Claim (layer 3) |
| Exploration | Mineral Exploration Licence (layer 5) |
| Exploration | Assessment Files (layer 17) |
| Operation | Mineral Lease (layer 6) |
| Operation | Mine Sites, including operational, non-operational, orphaned/abandoned and remediated sites (layer 19) |

The database records the retrieval timestamp and source URL in `data_sources`. Full source attributes are retained as JSON so no published fields are discarded.

## Treaty Assignment Method

All calculations use NAD83 / UTM zone 14N (`EPSG:26914`).

- Polygon records are linked to every treaty polygon they overlap.
- The treaty with the largest overlap is marked `is_primary = 1`.
- Overlap area and percentage are stored in `record_treaty_intersections`.
- Point mine sites use point-in-polygon assignment.
- A record that does not intersect a published treaty polygon is retained and exported to `unassigned_records.csv`.

The treaty polygons are approximate, illustrative boundaries. They do not establish rights, consultation obligations, traditional territory, or the treaty affiliation of a nearby First Nation. Some First Nations are signatories to a treaty different from the mapped treaty area in which their reserve is located. Use this database as a geographic index, not as legal or consultation advice.

## Database Structure

- `data_sources` — provenance and retrieval dates
- `treaty_territories` — five Manitoba treaty polygons and geometry
- `mining_records` — normalized claims, explorations, leases, and mine sites
- `record_treaty_intersections` — many-to-many geographic crosswalk
- `records_by_treaty` — convenient joined view
- `treaty_summary` — aggregate view

Example:

```sql
SELECT treaty_name, record_type, COUNT(*) AS records
FROM records_by_treaty
WHERE is_primary = 1
GROUP BY treaty_name, record_type
ORDER BY treaty_name, record_type;
```

## Refresh

From the project root:

```bash
PYTHON_BIN=python3 scripts/manitoba-mining/refresh.sh
```

The refresh script downloads the current Manitoba iMaQs layers and rebuilds the database and CSV exports. The source layer is a live administrative service, so counts and status fields may change.

## Holder and Owner Evidence

The GIS service does not publish claim-holder names. Current claim holders are
retrieved separately from the public iMaQs Mining Search bulk export, normalized,
and joined by disposition number. The portal only labels a holder as published
when that public evidence is available.

Refresh the good-standing mining-claim export:

```bash
python3 scripts/manitoba-mining/download_imaqs_ownership.py \
  --types MC4 \
  --status GOOD_STAND
```

The Manitoba export is an Excel file with an `.xls` extension. Convert it to
`.xlsx` with LibreOffice, then normalize it:

```bash
python3 scripts/manitoba-mining/normalize_ownership.py \
  path/to/mining_claim_holders_good_stand.xlsx
python3 scripts/manitoba-mining/build_portal_dataset.py
```

The ownership model keeps the recorded name, evidence URL, evidence date, and
confidence separate. Corporate-parent research can therefore be added later
without overwriting the government's recorded holder.
