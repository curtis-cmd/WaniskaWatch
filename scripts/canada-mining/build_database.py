#!/usr/bin/env python3
"""Build a normalized, treaty-indexed SQLite database for one province."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

from pyproj import Transformer  # type: ignore
from shapely import STRtree  # type: ignore
from shapely.geometry import shape  # type: ignore
from shapely.ops import transform, unary_union  # type: ignore
from shapely.validation import make_valid  # type: ignore

from config import PROVINCES, Layer

SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE data_sources (
  source_id INTEGER PRIMARY KEY,
  province TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  layer_slug TEXT,
  layer_id INTEGER,
  retrieved_at TEXT NOT NULL,
  source_filter TEXT,
  notes TEXT
);

CREATE TABLE territory_contexts (
  territory_id INTEGER PRIMARY KEY,
  province TEXT NOT NULL,
  territory_name TEXT NOT NULL,
  alternate_name TEXT,
  context_type TEXT NOT NULL DEFAULT 'historic_treaty',
  source_id INTEGER NOT NULL REFERENCES data_sources(source_id),
  area_hectares REAL,
  geometry_wkt_epsg3347 TEXT NOT NULL,
  UNIQUE(province, territory_name)
);

CREATE TABLE mining_records (
  record_id INTEGER PRIMARY KEY,
  province TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('claim', 'exploration', 'operation')),
  record_type TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES data_sources(source_id),
  source_object_id TEXT NOT NULL,
  external_id TEXT,
  name TEXT,
  status TEXT,
  commodity TEXT,
  holder_or_owner TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  reported_area_hectares REAL,
  location_description TEXT,
  source_record_url TEXT,
  geometry_type TEXT NOT NULL,
  centroid_x_epsg3347 REAL NOT NULL,
  centroid_y_epsg3347 REAL NOT NULL,
  centroid_longitude REAL NOT NULL,
  centroid_latitude REAL NOT NULL,
  geometry_wkt_epsg3347 TEXT NOT NULL,
  source_attributes_json TEXT NOT NULL,
  UNIQUE(source_id, source_object_id)
);

CREATE TABLE record_territory_intersections (
  record_id INTEGER NOT NULL REFERENCES mining_records(record_id) ON DELETE CASCADE,
  territory_id INTEGER NOT NULL REFERENCES territory_contexts(territory_id),
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  assignment_method TEXT NOT NULL,
  overlap_area_hectares REAL,
  overlap_percent REAL,
  PRIMARY KEY (record_id, territory_id)
);

CREATE TABLE recorded_entities (
  entity_id INTEGER PRIMARY KEY,
  recorded_name TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  classification_method TEXT NOT NULL
);

CREATE TABLE record_entity_relationships (
  record_id INTEGER NOT NULL REFERENCES mining_records(record_id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES recorded_entities(entity_id),
  relationship_type TEXT NOT NULL DEFAULT 'recorded_holder',
  ownership_percent REAL,
  source_evidence TEXT NOT NULL,
  PRIMARY KEY (record_id, entity_id)
);

CREATE INDEX records_province_category_idx ON mining_records(province, category);
CREATE INDEX records_external_id_idx ON mining_records(external_id);
CREATE INDEX records_holder_idx ON mining_records(holder_or_owner);
CREATE INDEX records_status_idx ON mining_records(status);
CREATE INDEX intersections_territory_idx ON record_territory_intersections(territory_id);

CREATE VIEW records_by_territory AS
SELECT
  r.province,
  t.territory_name,
  r.category,
  r.record_type,
  r.external_id,
  r.name,
  r.status,
  r.commodity,
  r.holder_or_owner,
  r.issue_date,
  r.expiry_date,
  r.reported_area_hectares,
  x.is_primary,
  x.assignment_method,
  x.overlap_area_hectares,
  x.overlap_percent,
  r.centroid_longitude,
  r.centroid_latitude
FROM record_territory_intersections x
JOIN mining_records r ON r.record_id = x.record_id
JOIN territory_contexts t ON t.territory_id = x.territory_id;

CREATE VIEW territory_summary AS
SELECT
  t.province,
  t.territory_name,
  SUM(CASE WHEN r.category = 'claim' AND x.is_primary = 1 THEN 1 ELSE 0 END) AS claims,
  SUM(CASE WHEN r.category = 'exploration' AND x.is_primary = 1 THEN 1 ELSE 0 END)
    AS exploration_records,
  SUM(CASE WHEN r.category = 'operation' AND x.is_primary = 1 THEN 1 ELSE 0 END)
    AS operation_records,
  ROUND(SUM(CASE WHEN r.category = 'claim'
    THEN COALESCE(x.overlap_area_hectares, 0) ELSE 0 END), 2) AS claim_overlap_hectares
FROM territory_contexts t
LEFT JOIN record_territory_intersections x ON x.territory_id = t.territory_id
LEFT JOIN mining_records r ON r.record_id = x.record_id
GROUP BY t.territory_id, t.province, t.territory_name;
"""

CORPORATE_PATTERN = re.compile(
    r"\b(?:INC(?:ORPORATED)?|CORP(?:ORATION)?|LTD|LIMITED|LLC|LP|PLC|"
    r"COMPANY|CO|MINES?|MINING|MINERALS?|RESOURCES?|EXPLORATION|ENERGY)\b",
    re.IGNORECASE,
)
PERCENT_PATTERN = re.compile(r":?\s*(\d+(?:\.\d+)?)%\s*$")


def scalar(props: dict[str, Any], key: str | None) -> Any:
    return props.get(key) if key else None


def clean_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def iso_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date().isoformat()
        except (ValueError, OSError):
            return str(value)
    text = clean_text(value)
    if not text:
        return None
    for pattern in (r"^\d{4}-\d{2}-\d{2}", r"^\d{4}$"):
        match = re.match(pattern, text)
        if match:
            return match.group(0)
    return text


def numeric(value: Any, divisor: float = 1.0) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value) / divisor
    except (TypeError, ValueError):
        return None


def feature_pages(raw_dir: Path, slug: str) -> Iterator[dict[str, Any]]:
    # Only consume canonical downloader pages. Synced filesystems can preserve
    # a collision as e.g. ``page-00001 2.geojson``; those are not authoritative
    # manifest pages and previously inflated Ontario counts.
    pages = [
        page for page in (raw_dir / slug).glob("page-*.geojson")
        if re.fullmatch(r"page-\d{5}\.geojson", page.name)
    ]
    for page in sorted(pages):
        payload = json.loads(page.read_text(encoding="utf-8"))
        yield from payload.get("features") or []


def load_boundary(path: Path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    geometries = [make_valid(shape(feature["geometry"])) for feature in payload.get("features") or []]
    if not geometries:
        raise RuntimeError(f"No geometry in {path}")
    return make_valid(unary_union(geometries))


def load_territories(raw_dir: Path, config: dict[str, Any], province_geometry) -> list[dict[str, Any]]:
    payload = json.loads((raw_dir / "territory_boundaries.geojson").read_text(encoding="utf-8"))
    grouped: dict[str, list[Any]] = defaultdict(list)
    alternate: dict[str, str | None] = {}
    for feature in payload.get("features") or []:
        props = feature.get("properties") or {}
        name = clean_text(props.get(config["territory_name_field"]))
        if not name:
            continue
        geom = make_valid(shape(feature["geometry"]))
        clipped = make_valid(geom.intersection(province_geometry))
        if clipped.is_empty:
            continue
        grouped[name].append(clipped)
        alternate[name] = clean_text(props.get(config["territory_alt_field"]))
    return [
        {
            "name": name,
            "alternate": alternate.get(name),
            "geometry": make_valid(unary_union(geometries)),
        }
        for name, geometries in sorted(grouped.items())
    ]


def classify_entity(name: str) -> tuple[str, str]:
    if CORPORATE_PATTERN.search(name):
        return "organization", "name-pattern inference; verify with a corporate registry"
    return "unclassified", "not classified from the government mining record"


def entity_parts(holder: str | None) -> list[tuple[str, float | None]]:
    if not holder:
        return []
    parts = []
    for raw in re.split(r";|\n", holder):
        item = clean_text(raw)
        if not item:
            continue
        match = PERCENT_PATTERN.search(item)
        percent = float(match.group(1)) if match else None
        if match:
            item = clean_text(item[: match.start()].rstrip(":")) or item
        item = re.sub(r"\s+\((?:self|on behalf of)\)\s*$", "", item, flags=re.IGNORECASE)
        parts.append((item, percent))
    return parts


def assignment_matches(geom, territories: list[dict[str, Any]], tree: STRtree) -> list[dict[str, Any]]:
    matches = []
    if geom.is_empty:
        return matches
    candidates = tree.query(geom)
    total_area = geom.area
    for index in candidates:
        territory = territories[int(index)]
        territory_geom = territory["geometry"]
        if geom.geom_type in {"Point", "MultiPoint"}:
            point = geom if geom.geom_type == "Point" else geom.centroid
            if territory_geom.covers(point):
                matches.append(
                    {
                        "territory": territory,
                        "method": "point-in-published-polygon",
                        "overlap_ha": None,
                        "overlap_pct": None,
                    }
                )
        else:
            overlap = geom.intersection(territory_geom).area
            if overlap > 0:
                matches.append(
                    {
                        "territory": territory,
                        "method": "polygon-area-intersection",
                        "overlap_ha": overlap / 10_000,
                        "overlap_pct": overlap / total_area * 100 if total_area else None,
                    }
                )
    matches.sort(key=lambda item: item["overlap_ha"] or 0, reverse=True)
    return matches


def create_source(
    db: sqlite3.Connection,
    *,
    province: str,
    name: str,
    url: str,
    retrieved_at: str,
    slug: str | None = None,
    layer_id: int | None = None,
    source_filter: str | None = None,
    notes: str | None = None,
) -> int:
    cursor = db.execute(
        """INSERT INTO data_sources
           (province, source_name, source_url, layer_slug, layer_id, retrieved_at,
            source_filter, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (province, name, url, slug, layer_id, retrieved_at, source_filter, notes),
    )
    return int(cursor.lastrowid)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("province", choices=sorted(PROVINCES))
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    args = parser.parse_args()
    config = PROVINCES[args.province]
    province_name = config["name"]
    raw_dir = args.data_root / f"{args.province}-mining" / "raw"
    output_dir = args.data_root / f"{args.province}-mining" / "processed"
    output_dir.mkdir(parents=True, exist_ok=True)
    database_path = output_dir / f"{args.province}_mining_by_territory.sqlite"
    database_path.unlink(missing_ok=True)

    manifest = json.loads((raw_dir / "download_manifest.json").read_text(encoding="utf-8"))
    retrieved_at = manifest["retrieved_at"]
    province_geometry = load_boundary(raw_dir / "province_boundary.geojson")
    territories = load_territories(raw_dir, config, province_geometry)
    tree = STRtree([item["geometry"] for item in territories])
    to_wgs84 = Transformer.from_crs("EPSG:3347", "EPSG:4326", always_xy=True)

    db = sqlite3.connect(database_path)
    db.executescript(SCHEMA)
    province_source = manifest["province_boundary"]
    create_source(
        db,
        province=province_name,
        name=province_source["source_name"],
        url=province_source["source_url"],
        retrieved_at=retrieved_at,
        notes="Used to clip published treaty polygons to the selected province.",
    )
    territory_source = manifest["territory_boundary"]
    territory_source_id = create_source(
        db,
        province=province_name,
        name=territory_source["source_name"],
        url=territory_source["source_url"],
        retrieved_at=retrieved_at,
        notes=(
            "Government-published treaty or agreement geography used as a contextual index only; "
            "not a rights, title, traditional-territory, consultation, or consent determination."
        ),
    )
    territory_ids: dict[str, int] = {}
    for territory in territories:
        geom = territory["geometry"]
        cursor = db.execute(
            """INSERT INTO territory_contexts
               (province, territory_name, alternate_name, context_type, source_id, area_hectares,
                geometry_wkt_epsg3347)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                province_name,
                territory["name"],
                territory["alternate"],
                config.get("territory_context_type", "historic_treaty"),
                territory_source_id,
                geom.area / 10_000,
                geom.wkt,
            ),
        )
        territory_ids[territory["name"]] = int(cursor.lastrowid)

    entity_cache: dict[str, int] = {}
    record_count = 0
    assigned_count = 0
    for layer in config["layers"]:
        assert isinstance(layer, Layer)
        source_id = create_source(
            db,
            province=province_name,
            name=layer.source_name,
            url=layer.endpoint,
            retrieved_at=retrieved_at,
            slug=layer.slug,
            layer_id=layer.layer_id,
            source_filter=layer.where,
        )
        layer_count = 0
        duplicate_count = 0
        seen_source_records: dict[str, str] = {}
        for feature in feature_pages(raw_dir, layer.slug):
            props = feature.get("properties") or {}
            if not feature.get("geometry"):
                continue
            geom = make_valid(shape(feature["geometry"]))
            if geom.is_empty:
                continue
            centroid = geom.centroid
            longitude, latitude = to_wgs84.transform(centroid.x, centroid.y)
            source_object_id = clean_text(props.get("OBJECTID")) or clean_text(
                scalar(props, layer.external_id)
            )
            if not source_object_id:
                continue
            feature_fingerprint = json.dumps(
                {"geometry": feature.get("geometry"), "properties": props},
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            )
            if source_object_id in seen_source_records:
                if seen_source_records[source_object_id] != feature_fingerprint:
                    raise RuntimeError(
                        f"{layer.slug}: source object {source_object_id} was published more "
                        "than once with conflicting content"
                    )
                duplicate_count += 1
                continue
            seen_source_records[source_object_id] = feature_fingerprint
            external_id = clean_text(scalar(props, layer.external_id))
            holder = clean_text(scalar(props, layer.holder))
            source_record_url = clean_text(scalar(props, layer.source_link))
            cursor = db.execute(
                """INSERT INTO mining_records
                   (province, category, record_type, source_id, source_object_id, external_id,
                    name, status, commodity, holder_or_owner, issue_date, expiry_date,
                    reported_area_hectares, location_description, source_record_url,
                    geometry_type, centroid_x_epsg3347, centroid_y_epsg3347,
                    centroid_longitude, centroid_latitude, geometry_wkt_epsg3347,
                    source_attributes_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    province_name,
                    layer.category,
                    layer.record_type,
                    source_id,
                    source_object_id,
                    external_id,
                    clean_text(scalar(props, layer.name)) or external_id,
                    clean_text(scalar(props, layer.status)),
                    clean_text(scalar(props, layer.commodity)),
                    holder,
                    iso_date(scalar(props, layer.issue_date)),
                    iso_date(scalar(props, layer.expiry_date)),
                    numeric(scalar(props, layer.area), layer.area_divisor),
                    clean_text(scalar(props, layer.location)),
                    source_record_url,
                    geom.geom_type,
                    centroid.x,
                    centroid.y,
                    longitude,
                    latitude,
                    geom.wkt,
                    json.dumps(props, separators=(",", ":"), ensure_ascii=False),
                ),
            )
            record_id = int(cursor.lastrowid)
            record_count += 1
            layer_count += 1

            matches = assignment_matches(geom, territories, tree)
            for index, match in enumerate(matches):
                db.execute(
                    """INSERT INTO record_territory_intersections
                       (record_id, territory_id, is_primary, assignment_method,
                        overlap_area_hectares, overlap_percent)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        record_id,
                        territory_ids[match["territory"]["name"]],
                        1 if index == 0 else 0,
                        match["method"],
                        match["overlap_ha"],
                        match["overlap_pct"],
                    ),
                )
            if matches:
                assigned_count += 1

            for entity_name, percent in entity_parts(holder):
                entity_id = entity_cache.get(entity_name)
                if entity_id is None:
                    entity_type, method = classify_entity(entity_name)
                    entity_cursor = db.execute(
                        """INSERT OR IGNORE INTO recorded_entities
                           (recorded_name, entity_type, classification_method)
                           VALUES (?, ?, ?)""",
                        (entity_name, entity_type, method),
                    )
                    if entity_cursor.lastrowid:
                        entity_id = int(entity_cursor.lastrowid)
                    else:
                        entity_id = int(
                            db.execute(
                                "SELECT entity_id FROM recorded_entities WHERE recorded_name = ?",
                                (entity_name,),
                            ).fetchone()[0]
                        )
                    entity_cache[entity_name] = entity_id
                db.execute(
                    """INSERT OR IGNORE INTO record_entity_relationships
                       (record_id, entity_id, ownership_percent, source_evidence)
                       VALUES (?, ?, ?, ?)""",
                    (
                        record_id,
                        entity_id,
                        percent,
                        f"{layer.source_name} public field {layer.holder}",
                    ),
                )
        duplicate_note = f"; ignored {duplicate_count:,} exact source duplicates" if duplicate_count else ""
        print(f"{layer.slug}: inserted {layer_count:,} records{duplicate_note}")
        db.commit()

    db.execute("PRAGMA optimize")
    db.commit()
    db.close()
    print(
        f"Wrote {record_count:,} records to {database_path}; "
        f"{assigned_count:,} received at least one published treaty-polygon match."
    )


if __name__ == "__main__":
    main()
