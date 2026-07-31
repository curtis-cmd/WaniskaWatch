#!/usr/bin/env python3
"""Build a treaty-organized SQLite database from Manitoba government GIS layers."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import shapefile  # type: ignore
from pyproj import Transformer  # type: ignore
from shapely.geometry import Point, mapping, shape  # type: ignore
from shapely.ops import transform  # type: ignore
from shapely.validation import make_valid  # type: ignore

LAYERS = {
    "mining_claims": {
        "category": "claim",
        "record_type": "Mining claim",
        "id": "TENURE_NUMBER_ID",
        "name": "CLAIM_NAME",
        "status": "MINERAL_TENURE_STATUS_CODE",
        "area": "AREA_IN_HECTARES",
    },
    "mineral_exploration_licences": {
        "category": "exploration",
        "record_type": "Mineral exploration licence",
        "id": "TENURE_NUMBER_ID",
        "name": "CLAIM_NAME",
        "status": "MINERAL_TENURE_STATUS_CODE",
        "area": "AREA_IN_HECTARES",
    },
    "assessment_reports": {
        "category": "exploration",
        "record_type": "Assessment report",
        "id": "REPORT_NUMBER",
        "name": "REPORT_NUMBER",
        "status": None,
        "area": None,
    },
    "mineral_leases": {
        "category": "operation",
        "record_type": "Mineral lease",
        "id": "TENURE_NUMBER_ID",
        "name": "CLAIM_NAME",
        "status": "MINERAL_TENURE_STATUS_CODE",
        "area": "AREA_IN_HECTARES",
    },
    "mine_sites": {
        "category": "operation",
        "record_type": "Mine site",
        "id": "ABANDONED_MINE_SITE_PY_ID",
        "name": "MINE_NAME",
        "status": "MINE_STATUS",
        "area": None,
    },
}

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE data_sources (
  source_id INTEGER PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  layer_id INTEGER,
  retrieved_at TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE treaty_territories (
  treaty_id INTEGER PRIMARY KEY,
  treaty_name TEXT NOT NULL UNIQUE,
  treaty_year TEXT,
  description TEXT,
  source_id INTEGER NOT NULL REFERENCES data_sources(source_id),
  area_hectares REAL,
  geometry_wkt_utm14 TEXT NOT NULL
);

CREATE TABLE mining_records (
  record_id INTEGER PRIMARY KEY,
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
  good_to_date TEXT,
  expiry_date TEXT,
  termination_date TEXT,
  reported_area_hectares REAL,
  geometry_type TEXT NOT NULL,
  centroid_easting REAL,
  centroid_northing REAL,
  centroid_longitude REAL,
  centroid_latitude REAL,
  geometry_wkt_utm14 TEXT NOT NULL,
  source_attributes_json TEXT NOT NULL,
  UNIQUE(source_id, source_object_id)
);

CREATE TABLE record_treaty_intersections (
  record_id INTEGER NOT NULL REFERENCES mining_records(record_id) ON DELETE CASCADE,
  treaty_id INTEGER NOT NULL REFERENCES treaty_territories(treaty_id),
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  assignment_method TEXT NOT NULL,
  overlap_area_hectares REAL,
  overlap_percent REAL,
  PRIMARY KEY (record_id, treaty_id)
);

CREATE INDEX mining_records_category_idx ON mining_records(category);
CREATE INDEX mining_records_type_idx ON mining_records(record_type);
CREATE INDEX mining_records_status_idx ON mining_records(status);
CREATE INDEX treaty_intersections_treaty_idx ON record_treaty_intersections(treaty_id);

CREATE VIEW records_by_treaty AS
SELECT
  t.treaty_name,
  t.treaty_year,
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
FROM record_treaty_intersections x
JOIN mining_records r ON r.record_id = x.record_id
JOIN treaty_territories t ON t.treaty_id = x.treaty_id;

CREATE VIEW treaty_summary AS
SELECT
  t.treaty_name,
  t.treaty_year,
  SUM(CASE WHEN r.category = 'claim' AND x.is_primary = 1 THEN 1 ELSE 0 END) AS claims,
  SUM(CASE WHEN r.category = 'exploration' AND x.is_primary = 1 THEN 1 ELSE 0 END) AS exploration_records,
  SUM(CASE WHEN r.category = 'operation' AND x.is_primary = 1 THEN 1 ELSE 0 END) AS operation_records,
  ROUND(SUM(CASE WHEN r.category = 'claim' THEN COALESCE(x.overlap_area_hectares, 0) ELSE 0 END), 2)
    AS claim_overlap_hectares
FROM treaty_territories t
LEFT JOIN record_treaty_intersections x ON x.treaty_id = t.treaty_id
LEFT JOIN mining_records r ON r.record_id = x.record_id
GROUP BY t.treaty_id, t.treaty_name, t.treaty_year;
"""


def iso_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return str(value)


def load_treaties(raw_dir: Path) -> list[dict]:
    extract_dir = raw_dir / "treaty_boundary"
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(raw_dir / "treaty_boundary_shp.zip") as archive:
        archive.extractall(extract_dir)

    reader = shapefile.Reader(str(extract_dir / "treaty.shp"))
    treaties = []
    for item in reader.iterShapeRecords():
        attrs = item.record.as_dict()
        geom = make_valid(shape(item.shape.__geo_interface__))
        treaties.append(
            {
                "name": attrs["TREATY_NAM"].strip(),
                "year": attrs["TREATY_YEA"].strip(),
                "description": attrs["DESCRIPTIO"].strip(),
                "geometry": geom,
            }
        )
    return treaties


def scalar(props: dict, key: str | None) -> Any:
    return props.get(key) if key else None


def assign_treaties(geom, treaties: list[dict]) -> list[dict]:
    matches = []
    if geom.geom_type in ("Point", "MultiPoint"):
        point = geom if geom.geom_type == "Point" else geom.centroid
        for treaty in treaties:
            if treaty["geometry"].covers(point):
                matches.append(
                    {
                        "treaty": treaty,
                        "method": "point-in-polygon",
                        "overlap_ha": None,
                        "overlap_pct": None,
                    }
                )
    else:
        total_area = geom.area
        for treaty in treaties:
            overlap_area = geom.intersection(treaty["geometry"]).area
            if overlap_area > 0:
                matches.append(
                    {
                        "treaty": treaty,
                        "method": "polygon-area-intersection",
                        "overlap_ha": overlap_area / 10_000,
                        "overlap_pct": overlap_area / total_area * 100 if total_area else None,
                    }
                )
        matches.sort(key=lambda item: item["overlap_ha"] or 0, reverse=True)
    for index, match in enumerate(matches):
        match["is_primary"] = index == 0
    return matches


def export_view(connection: sqlite3.Connection, query: str, destination: Path) -> None:
    cursor = connection.execute(query)
    with destination.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([column[0] for column in cursor.description])
        writer.writerows(cursor)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw"))
    parser.add_argument("--output-dir", type=Path, default=Path("data/manitoba-mining/processed"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    database_path = args.output_dir / "manitoba_mining_by_treaty.sqlite"
    if database_path.exists():
        database_path.unlink()

    manifest_path = args.raw_dir / "download_manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    retrieved_at = manifest.get("retrieved_at", datetime.now(timezone.utc).isoformat())
    treaties = load_treaties(args.raw_dir)
    to_wgs84 = Transformer.from_crs("EPSG:26914", "EPSG:4326", always_xy=True)

    connection = sqlite3.connect(database_path)
    connection.executescript(SCHEMA)
    treaty_source = connection.execute(
        "INSERT INTO data_sources(source_name, source_url, retrieved_at, notes) VALUES (?, ?, ?, ?)",
        (
            "Manitoba Land Initiative — Treaty Boundaries",
            "https://mli.gov.mb.ca/adminbnd/shp_zip_files/treaty_boundary_shp.zip",
            retrieved_at,
            "Approximate boundaries; source metadata edition 2000.",
        ),
    ).lastrowid

    treaty_ids = {}
    for treaty in treaties:
        treaty_id = connection.execute(
            """INSERT INTO treaty_territories
               (treaty_name, treaty_year, description, source_id, area_hectares, geometry_wkt_utm14)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                treaty["name"],
                treaty["year"],
                treaty["description"],
                treaty_source,
                treaty["geometry"].area / 10_000,
                treaty["geometry"].wkt,
            ),
        ).lastrowid
        treaty_ids[treaty["name"]] = treaty_id

    for filename, config in LAYERS.items():
        path = args.raw_dir / f"{filename}.geojson"
        if not path.exists():
            raise FileNotFoundError(f"Missing {path}; run download_manitoba_mining.py first")
        layer_id = next(item["layer_id"] for item in manifest.get("layers", []) if item["name"] == filename)
        source_url = f"https://rdmaps.gov.mb.ca/arcgis/rest/services/iMaQs/imaqsMining/MapServer/{layer_id}"
        source_id = connection.execute(
            "INSERT INTO data_sources(source_name, source_url, layer_id, retrieved_at) VALUES (?, ?, ?, ?)",
            (f"Manitoba iMaQs — {config['record_type']}", source_url, layer_id, retrieved_at),
        ).lastrowid
        data = json.loads(path.read_text(encoding="utf-8"))
        for feature in data["features"]:
            props = feature.get("properties") or {}
            geom = make_valid(shape(feature["geometry"]))
            centroid = geom.centroid
            longitude, latitude = to_wgs84.transform(centroid.x, centroid.y)
            object_id = str(props.get("OBJECTID", scalar(props, config["id"])))
            holder = props.get("CLAIM_HOLDER") or props.get("CURRENT_OWNER")
            record_id = connection.execute(
                """INSERT INTO mining_records (
                     category, record_type, source_id, source_object_id, external_id, name, status,
                     commodity, holder_or_owner, issue_date, good_to_date, expiry_date, termination_date,
                     reported_area_hectares, geometry_type, centroid_easting, centroid_northing,
                     centroid_longitude, centroid_latitude, geometry_wkt_utm14, source_attributes_json
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    config["category"],
                    config["record_type"],
                    source_id,
                    object_id,
                    str(scalar(props, config["id"])) if scalar(props, config["id"]) is not None else None,
                    str(scalar(props, config["name"])) if scalar(props, config["name"]) is not None else None,
                    scalar(props, config["status"]),
                    props.get("COMMODITY"),
                    holder,
                    iso_date(props.get("ISSUE_DATE")),
                    iso_date(props.get("GOOD_TO_DATE")),
                    iso_date(props.get("EXPIRY_DATE")),
                    iso_date(props.get("TERMINATION_DATE")),
                    scalar(props, config["area"]),
                    geom.geom_type,
                    centroid.x,
                    centroid.y,
                    longitude,
                    latitude,
                    geom.wkt,
                    json.dumps(props, separators=(",", ":"), ensure_ascii=False),
                ),
            ).lastrowid
            for assignment in assign_treaties(geom, treaties):
                connection.execute(
                    """INSERT INTO record_treaty_intersections
                       (record_id, treaty_id, is_primary, assignment_method, overlap_area_hectares, overlap_percent)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        record_id,
                        treaty_ids[assignment["treaty"]["name"]],
                        int(assignment["is_primary"]),
                        assignment["method"],
                        assignment["overlap_ha"],
                        assignment["overlap_pct"],
                    ),
                )
        print(f"Loaded {len(data['features']):,} {config['record_type'].lower()} records")

    connection.commit()
    export_view(connection, "SELECT * FROM treaty_summary ORDER BY treaty_name", args.output_dir / "treaty_summary.csv")
    export_view(
        connection,
        "SELECT * FROM records_by_treaty ORDER BY treaty_name, category, record_type, name",
        args.output_dir / "records_by_treaty.csv",
    )
    export_view(
        connection,
        """SELECT r.* FROM mining_records r
           WHERE NOT EXISTS (SELECT 1 FROM record_treaty_intersections x WHERE x.record_id = r.record_id)
           ORDER BY r.category, r.record_type, r.name""",
        args.output_dir / "unassigned_records.csv",
    )
    connection.close()
    print(f"Created {database_path}")


if __name__ == "__main__":
    main()
