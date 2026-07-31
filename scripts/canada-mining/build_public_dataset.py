#!/usr/bin/env python3
"""Create browser-safe province datasets and a national coverage catalogue."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

from pyproj import Transformer  # type: ignore
from shapely import wkt  # type: ignore
from shapely.geometry import mapping  # type: ignore
from shapely.ops import transform  # type: ignore

from config import PROVINCES

COLORS = [
    "#C5723C",
    "#2E7D75",
    "#76537D",
    "#B89A45",
    "#3E6B8F",
    "#9A544E",
    "#607D3B",
    "#8B6F47",
    "#486A62",
]


def rounded(value: Any, digits: int = 5):
    if isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float)):
            return [round(number, digits) for number in value]
        return [rounded(item, digits) for item in value]
    return value


def compact_geometry(geom, transformer, tolerance: float):
    if tolerance and geom.geom_type not in {"Point", "MultiPoint"}:
        geom = geom.simplify(tolerance, preserve_topology=True)
    wgs = transform(transformer.transform, geom)
    result = mapping(wgs)
    result["coordinates"] = rounded(result["coordinates"])
    return result


def build_province(province_key: str, data_root: Path, public_root: Path) -> dict[str, Any]:
    config = PROVINCES[province_key]
    province_name = config["name"]
    database = (
        data_root
        / f"{province_key}-mining"
        / "processed"
        / f"{province_key}_mining_by_territory.sqlite"
    )
    raw_manifest = json.loads(
        (data_root / f"{province_key}-mining" / "raw" / "download_manifest.json").read_text()
    )
    generated_at = raw_manifest["retrieved_at"]
    db = sqlite3.connect(database)
    db.row_factory = sqlite3.Row
    to_wgs84 = Transformer.from_crs("EPSG:3347", "EPSG:4326", always_xy=True)

    territory_features = []
    for index, row in enumerate(
        db.execute(
            """SELECT t.*, s.source_name, s.source_url
               FROM territory_contexts t JOIN data_sources s ON s.source_id=t.source_id
               ORDER BY t.territory_name"""
        )
    ):
        geom = wkt.loads(row["geometry_wkt_epsg3347"])
        territory_features.append(
            {
                "type": "Feature",
                "id": row["territory_id"],
                "geometry": compact_geometry(geom, to_wgs84, 1000),
                "properties": {
                    "name": row["territory_name"],
                    "year": "",
                    "description": row["alternate_name"] or "Published historic treaty geography",
                    "color": COLORS[index % len(COLORS)],
                    "sourceUrl": row["source_url"],
                },
            }
        )
    territory_source = raw_manifest["territory_boundary"]
    treaty_payload = {
        "metadata": {
            "generatedAt": generated_at,
            "source": territory_source["source_name"],
            "sourceUrl": territory_source["source_url"],
            "boundaryNote": (
                "Government-published historic treaty polygons are shown only as a geographic "
                "index. They do not determine rights, title, traditional territory, consultation "
                "obligations, or consent. Polygons are clipped to the province using Statistics "
                "Canada's 2021 cartographic boundary."
            ),
        },
        "type": "FeatureCollection",
        "features": territory_features,
    }
    treaty_path = public_root / f"{province_key}-territories.json"
    treaty_path.write_text(
        json.dumps(treaty_payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )

    counts = Counter(
        {row["category"]: row["records"] for row in db.execute(
            "SELECT category, COUNT(*) records FROM mining_records GROUP BY category"
        )}
    )
    total_records = sum(counts.values())
    holder_count = db.execute(
        "SELECT COUNT(DISTINCT holder_or_owner) FROM mining_records "
        "WHERE holder_or_owner IS NOT NULL AND holder_or_owner <> ''"
    ).fetchone()[0]
    treaty_counts = {
        row["territory_name"]: row["records"]
        for row in db.execute(
            """SELECT t.territory_name, COUNT(*) records
               FROM record_territory_intersections x
               JOIN territory_contexts t ON t.territory_id=x.territory_id
               WHERE x.is_primary=1
               GROUP BY t.territory_id, t.territory_name"""
        )
    }
    omitted_claim_polygons = province_key == "ontario"
    rows = db.execute(
        """SELECT r.*, s.source_name, s.source_url,
                  COALESCE(t.territory_name, 'Unassigned') territory_name
           FROM mining_records r
           JOIN data_sources s ON s.source_id=r.source_id
           LEFT JOIN record_territory_intersections x
             ON x.record_id=r.record_id AND x.is_primary=1
           LEFT JOIN territory_contexts t ON t.territory_id=x.territory_id
           WHERE (? = 0 OR r.category <> 'claim')
           ORDER BY r.record_id""",
        (1 if omitted_claim_polygons else 0,),
    )
    features = []
    kind_lookup = {"claim": "claim", "exploration": "exploration", "operation": "lease"}
    tolerances = {"claim": 75, "exploration": 200, "operation": 75}
    for row in rows:
        geom = wkt.loads(row["geometry_wkt_epsg3347"])
        kind = "mine" if row["record_type"] in {"Mine location", "Producing mine"} else kind_lookup[
            row["category"]
        ]
        features.append(
            {
                "type": "Feature",
                "id": f"{province_key}:{row['record_type']}:{row['source_object_id']}",
                "geometry": compact_geometry(geom, to_wgs84, tolerances[row["category"]]),
                "properties": {
                    "id": row["external_id"] or row["source_object_id"],
                    "name": row["name"] or row["external_id"] or row["source_object_id"],
                    "kind": kind,
                    "kindLabel": row["record_type"],
                    "status": row["status"],
                    "treaty": row["territory_name"],
                    "areaHa": row["reported_area_hectares"],
                    "commodity": row["commodity"],
                    "holder": row["holder_or_owner"],
                    "holderEvidence": (
                        f"Published field in {row['source_name']}" if row["holder_or_owner"] else None
                    ),
                    "issueDate": row["issue_date"],
                    "expiryDate": row["expiry_date"],
                    "longitude": round(row["centroid_longitude"], 5),
                    "latitude": round(row["centroid_latitude"], 5),
                    "location": row["location_description"],
                    "sourceUrl": row["source_record_url"] or row["source_url"],
                    "sourceName": row["source_name"],
                    "lastUpdated": generated_at,
                    "locationAccuracy": "Government-published feature geometry",
                },
            }
        )
    dataset_payload = {
        "metadata": {
            "generatedAt": generated_at,
            "province": province_name,
            "source": f"{province_name} government mining data catalogue",
            "sourceUrl": (
                "https://gis.saskatchewan.ca/arcgis/rest/services/Economy"
                if province_key == "saskatchewan"
                else "https://ws.lioservices.lrc.gov.on.ca/arcgis1071a/rest/services/MLAS"
            ),
            "featureCount": len(features),
            "databaseRecordCount": total_records,
            "counts": counts,
            "recordedHolderCount": holder_count,
            "treatyCounts": treaty_counts,
            "claimDelivery": (
                "viewport-live"
                if omitted_claim_polygons
                else "included"
            ),
            "locationNote": (
                "Ontario claim polygons are retained in the verified database and are loaded "
                "by map viewport rather than bundled into this page dataset."
                if omitted_claim_polygons
                else "All configured provincial records are included in this public map file."
            ),
        },
        "type": "FeatureCollection",
        "features": features,
    }
    dataset_path = public_root / f"{province_key}-mining.json"
    dataset_path.write_text(
        json.dumps(dataset_payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    db.close()
    return {
        "key": province_key,
        "name": province_name,
        "abbreviation": config["abbreviation"],
        "generatedAt": generated_at,
        "recordCount": total_records,
        "mapFeatureCount": len(features),
        "counts": counts,
        "recordedHolderCount": holder_count,
        "territoryCount": len(territory_features),
        "miningDataset": f"/data/{province_key}-mining.json",
        "territoryDataset": f"/data/{province_key}-territories.json",
        "claimDelivery": dataset_payload["metadata"]["claimDelivery"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("provinces", nargs="+", choices=sorted(PROVINCES))
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--public-root", type=Path, default=Path("public/data"))
    args = parser.parse_args()
    args.public_root.mkdir(parents=True, exist_ok=True)

    catalogue = []
    for province in args.provinces:
        entry = build_province(province, args.data_root, args.public_root)
        catalogue.append(entry)
        print(
            f"{entry['name']}: {entry['recordCount']:,} database records; "
            f"{entry['mapFeatureCount']:,} bundled map features"
        )
    catalogue_path = args.public_root / "province-coverage.json"
    catalogue_path.write_text(
        json.dumps(
            {
                "metadata": {
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "note": "Verified provincial mining coverage available in Waniskâ Watch.",
                },
                "provinces": catalogue,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {catalogue_path}")


if __name__ == "__main__":
    main()
