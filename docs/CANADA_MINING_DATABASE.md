# Saskatchewan and Ontario mining databases

Waniskâ Watch now has reproducible, province-specific pipelines for verified public mining
records in Saskatchewan and Ontario. The source schemas remain separate; the normalized
SQLite schema provides a consistent research layer without concealing differences between
MARS, MLAS, provincial geological inventories, and assessment-file systems.

## Current public coverage as of July 31, 2026

| Province | Claims / dispositions | Exploration records | Operations / tenure | Total |
| --- | ---: | ---: | ---: | ---: |
| Saskatchewan | 7,460 | 0 | 37 | 7,497 |
| Ontario | 394,875 | 676 | 4,031 | 399,582 |

The public view excludes Saskatchewan's 14,903 assessment-file footprints because they document
historical work rather than current exploration. It also excludes 103 past-producing mine
locations. Those source records remain available in the reproducible research database.

Ontario exploration coverage includes the active early-exploration layer and one exploratory
licence of occupation. Ontario operations/tenure includes leases, mining licences of occupation,
and 44 Ontario Mineral Inventory records explicitly published with status `Producing Mine`.

## Official sources

Saskatchewan:

- Government of Saskatchewan MARS Mineral Dispositions:
  `https://gis.saskatchewan.ca/arcgis/rest/services/Economy/Mineral_Tenure_Crown_Dispositions/MapServer/0`
- Saskatchewan Mineral Assessment File Information:
  `https://gis.saskatchewan.ca/arcgis/rest/services/Economy/P_Mineral_Assessment_File_Information/MapServer`
- Saskatchewan Geological Survey Mine Locations:
  `https://gis.saskatchewan.ca/arcgis/rest/services/Economy/Mineral_Exploration/MapServer/1`
- Government of Saskatchewan First Nation Treaty Boundaries:
  `https://gis.saskatchewan.ca/arcgis/rest/services/AboriginalLands/MapServer/2`

Ontario:

- Government of Ontario Mining Lands Administration System (MLAS):
  `https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/MLAS/mlas_op/MapServer`
- Ontario Mineral Inventory:
  `https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/GeologyOntario/GeologyOntario_Map/MapServer/46`
- Crown-Indigenous Relations and Northern Affairs Canada Historic Treaties:
  `https://geo.sac-isc.gc.ca/geomatics/rest/services/Donnees_Ouvertes-Open_Data/Historic_Treaty_E/MapServer/0`

Both provinces use Statistics Canada's 2021 Census Cartographic Boundary File to clip the
historic-treaty geographic index:

`https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/0`

## Database outputs

Generated databases are intentionally ignored by Git because they are reproducible and large:

- `data/saskatchewan-mining/processed/saskatchewan_mining_by_territory.sqlite`
- `data/ontario-mining/processed/ontario_mining_by_territory.sqlite`

The schema includes:

- `data_sources` — source URL, layer, filter, province, and retrieval timestamp;
- `territory_contexts` — clipped government-published historic-treaty polygons;
- `mining_records` — normalized record fields, full EPSG:3347 geometry, centroid, and the
  complete source attribute object;
- `record_territory_intersections` — many-to-many spatial matches with primary match,
  method, overlap area, and overlap percentage;
- `recorded_entities` and `record_entity_relationships` — exact published holder/owner names,
  ownership percentages where supplied, and evidence;
- `records_by_territory` and `territory_summary` — research-ready views.

Names are classified as organizations only by a transparent name-pattern inference. All other
names remain `unclassified`; Waniskâ Watch does not infer that an unclassified name is a private
individual. No private personal contact details are added.

## Refresh

Install pinned spatial dependencies into a local vendor folder:

```bash
python3 -m pip install --target scripts/canada-mining/vendor \
  -r scripts/canada-mining/requirements.txt
```

Then refresh a province:

```bash
PYTHON_BIN=python3 bash scripts/canada-mining/refresh.sh saskatchewan
PYTHON_BIN=python3 bash scripts/canada-mining/refresh.sh ontario
```

To regenerate only the browser-safe files after both databases exist:

```bash
python3 scripts/canada-mining/build_public_dataset.py saskatchewan ontario
```

## Public delivery

Saskatchewan's 7,497 current records are bundled into a simplified map dataset. Historical
assessment files and past-producing mines are retained in the research database but are not
presented as current activity.

Ontario's 394,875 Active or Hold claim polygons remain in the verified database but are not sent to every
visitor on initial page load. The public map requests the official MLAS claim layer only for the
current viewport at zoom level 9 or closer, restricted to Active or Hold status and capped at
2,000 features per view. The interface asks
the user to zoom further when a view exceeds that limit. This preserves specific claim locations
without turning the landing page into a 200+ MB download.

## Territorial-context limitation

Historic treaty polygons are geographic indexes only. They are not legal surveys and do not
determine rights, title, traditional territory, Métis or Inuit geography, consultation duties,
accommodation, or consent. Records without a polygon match remain explicitly unassigned.
Nation-verified and Nation-authorized information should take priority where it can be published
under appropriate governance.
