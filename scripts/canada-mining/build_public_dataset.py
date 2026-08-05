#!/usr/bin/env python3
"""Create browser-safe province datasets and a national coverage catalogue."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import math
import shutil
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

INACTIVE_STATUS_MARKERS = (
    "abandoned", "canceled", "cancelled", "closed", "conv lease", "converted to lease",
    "expired", "forfeited", "non operational", "orphaned", "past producing",
    "past-producing", "refused", "rejected", "remediated", "surrendered", "terminated",
    "withdrawn", "pending", "application",
)
CURRENT_STATUS_MARKERS = (
    "active", "appl exemp", "appl exten", "appl lease", "appl rff",
    "good stand", "hold", "operational", "producer", "producing mine",
    "reactivat", "reinstat",
)


def normalized_status(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def is_current_record(row: sqlite3.Row, as_of_date: str, strict_expiry: bool = False) -> bool:
    status = normalized_status(row["status"])
    record_type = str(row["record_type"] or "").lower()
    if "assessment file" in record_type:
        return False
    if any(marker in status for marker in INACTIVE_STATUS_MARKERS):
        return False
    if row["category"] == "claim" and status in {"converted", "leased", "refused", "withdrawn"}:
        return False
    if record_type in {"mine location", "producing mine"}:
        return any(marker in status for marker in CURRENT_STATUS_MARKERS) and "pending" not in status
    explicitly_current = any(marker in status for marker in CURRENT_STATUS_MARKERS)
    expiry_date = str(row["expiry_date"] or "")[:10]
    if expiry_date and expiry_date < as_of_date and (strict_expiry or not explicitly_current):
        return False
    return True


def rounded(value: Any, digits: int = 5):
    if isinstance(value, dict):
        return {key: rounded(item, digits) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float)):
            return [round(number, digits) for number in value]
        return [rounded(item, digits) for item in value]
    return value


def compact_geometry(geom, transformer, tolerance: float):
    if tolerance and geom.geom_type not in {"Point", "MultiPoint"}:
        geom = geom.simplify(tolerance, preserve_topology=True)
    wgs = transform(transformer.transform, geom)
    return rounded(mapping(wgs))


class QuebecClaimTiles:
    """Write compact current-claim tiles without retaining Quebec in memory."""

    def __init__(self, data_root: Path, public_root: Path):
        self.output_dir = public_root / "quebec-claims"
        if self.output_dir.exists():
            shutil.rmtree(self.output_dir)
        self.output_dir.mkdir(parents=True)
        self.staging_dir = data_root / "quebec-mining" / "processed" / "claim-tiles"
        if self.staging_dir.exists():
            shutil.rmtree(self.staging_dir)
        self.staging_dir.mkdir(parents=True)
        self.handles: dict[str, Any] = {}
        self.counts: Counter[str] = Counter()
        self.record_count = 0

    @staticmethod
    def keys_for_bounds(bounds: tuple[float, float, float, float]):
        west, south, east, north = bounds
        for longitude in range(math.floor(west), math.floor(east) + 1):
            for latitude in range(math.floor(south), math.floor(north) + 1):
                yield f"{longitude}_{latitude}", longitude, latitude

    def add(self, feature: dict[str, Any], bounds: tuple[float, float, float, float]) -> None:
        serialized = json.dumps(feature, separators=(",", ":"), ensure_ascii=False)
        for key, _longitude, _latitude in self.keys_for_bounds(bounds):
            handle = self.handles.get(key)
            if handle is None:
                handle = (self.staging_dir / f"{key}.ndjson").open("w", encoding="utf-8")
                self.handles[key] = handle
            handle.write(serialized + "\n")
            self.counts[key] += 1
        self.record_count += 1

    def finish(self, generated_at: str, source_url: str) -> None:
        for handle in self.handles.values():
            handle.close()
        tiles = []
        for key in sorted(self.counts):
            longitude, latitude = (int(value) for value in key.split("_"))
            filename = f"{key}.json"
            source_path = self.staging_dir / f"{key}.ndjson"
            with (self.output_dir / filename).open("w", encoding="utf-8") as output:
                output.write('{"type":"FeatureCollection","features":[')
                first = True
                with source_path.open(encoding="utf-8") as source:
                    for line in source:
                        if not first:
                            output.write(",")
                        output.write(line.rstrip("\n"))
                        first = False
                output.write("]}")
            tiles.append(
                {
                    "key": key,
                    "file": f"/data/quebec-claims/{filename}",
                    "bounds": [longitude, latitude, longitude + 1, latitude + 1],
                    "featureCount": self.counts[key],
                }
            )
        (self.output_dir / "index.json").write_text(
            json.dumps(
                {
                    "metadata": {
                        "generatedAt": generated_at,
                        "recordCount": self.record_count,
                        "source": "Gouvernement du Québec GESTIM — Active Titles",
                        "sourceUrl": source_url,
                    },
                    "tiles": tiles,
                },
                separators=(",", ":"),
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )


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
                    "description": row["alternate_name"] or "Published treaty or agreement geography",
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
                "Government-published treaty or agreement polygons are shown only as a geographic "
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

    claim_delivery = config.get(
        "claim_delivery",
        "viewport-live" if province_key in {"ontario", "yukon", "nunavut"} else "included",
    )
    omitted_claim_polygons = claim_delivery != "included"
    quebec_tiles = QuebecClaimTiles(data_root, public_root) if province_key == "quebec" else None
    rows = db.execute(
        """SELECT r.*, s.source_name, s.source_url,
                  COALESCE(t.territory_name, 'Unassigned') territory_name
           FROM mining_records r
           JOIN data_sources s ON s.source_id=r.source_id
           LEFT JOIN record_territory_intersections x
             ON x.record_id=r.record_id AND x.is_primary=1
           LEFT JOIN territory_contexts t ON t.territory_id=x.territory_id
           ORDER BY r.record_id""",
    )
    features = []
    counts: Counter[str] = Counter()
    treaty_counts: Counter[str] = Counter()
    holders: set[str] = set()
    as_of_date = generated_at[:10]
    kind_lookup = {"claim": "claim", "exploration": "exploration", "operation": "lease"}
    tolerances = {"claim": 75, "exploration": 200, "operation": 75}
    for row in rows:
        if not is_current_record(row, as_of_date, bool(config.get("strict_expiry"))):
            continue
        counts[row["category"]] += 1
        treaty_counts[row["territory_name"]] += 1
        if row["holder_or_owner"]:
            holders.add(row["holder_or_owner"])
        if omitted_claim_polygons and row["category"] == "claim":
            if quebec_tiles:
                geom = wkt.loads(row["geometry_wkt_epsg3347"])
                wgs_geometry = compact_geometry(geom, to_wgs84, 20)
                wgs_shape = transform(to_wgs84.transform, geom)
                quebec_tiles.add(
                    {
                        "type": "Feature",
                        "id": f"quebec:claim:{row['source_object_id']}",
                        "geometry": wgs_geometry,
                        "properties": {
                            "OBJECTID": row["source_object_id"],
                            "TIT_NO": row["external_id"],
                            "STATUS": row["status"],
                            "OWNERS": row["holder_or_owner"],
                            "ISSUE_DATE": row["issue_date"],
                            "EXPIRY_DATE": row["expiry_date"],
                            "AREA_HA": row["reported_area_hectares"],
                            "LOCATION": row["location_description"],
                            "TITLE_TYPE": row["record_type"],
                        },
                    },
                    wgs_shape.bounds,
                )
            continue
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
    total_records = sum(counts.values())
    holder_count = len(holders)
    dataset_payload = {
        "metadata": {
            "generatedAt": generated_at,
            "asOfDate": as_of_date,
            "currentOnly": True,
            "province": province_name,
            "source": f"{province_name} public mining data catalogue",
            "sourceUrl": config["catalogue_url"],
            "featureCount": len(features),
            "databaseRecordCount": total_records,
            "counts": counts,
            "recordedHolderCount": holder_count,
            "treatyCounts": dict(treaty_counts),
            "claimDelivery": claim_delivery,
            "locationNote": (
                f"Current {province_name} claim polygons are loaded from the government source "
                "by map viewport; inactive and historical records are excluded from the public view."
                if omitted_claim_polygons
                else "Only current government-status records are included; historical assessment "
                "files and clearly inactive records are excluded."
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
    if quebec_tiles:
        quebec_tiles.finish(generated_at, config["catalogue_url"])
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

    catalogue_path = args.public_root / "province-coverage.json"
    catalogue_by_key: dict[str, dict[str, Any]] = {}
    if catalogue_path.exists():
        existing = json.loads(catalogue_path.read_text(encoding="utf-8"))
        catalogue_by_key = {
            entry["key"]: entry for entry in existing.get("provinces", [])
        }
    for province in args.provinces:
        entry = build_province(province, args.data_root, args.public_root)
        catalogue_by_key[province] = entry
        print(
            f"{entry['name']}: {entry['recordCount']:,} database records; "
            f"{entry['mapFeatureCount']:,} bundled map features"
        )
    catalogue = [
        catalogue_by_key[key] for key in PROVINCES if key in catalogue_by_key
    ]
    catalogue_path.write_text(
        json.dumps(
            {
                "metadata": {
                    "generatedAt": datetime.now(timezone.utc).isoformat(),
                    "note": "Current verified provincial mining coverage available in Waniskâ Watch; inactive and historical records are excluded.",
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
