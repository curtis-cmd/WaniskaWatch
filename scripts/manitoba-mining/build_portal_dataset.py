#!/usr/bin/env python3
"""Build a compact, browser-ready mining map dataset."""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

from pyproj import Transformer  # type: ignore
from shapely.geometry import mapping, shape  # type: ignore
from shapely.ops import transform  # type: ignore

LAYERS = {
    "mining_claims": ("claim", 55),
    "mineral_exploration_licences": ("exploration", 120),
    "mineral_leases": ("lease", 35),
    "mine_sites": ("mine", 0),
}

INACTIVE_STATUS_MARKERS = (
    "abandoned", "cancelled", "closed", "conv lease", "converted to lease",
    "expired", "forfeited", "non operational", "orphaned", "past producing",
    "past-producing", "rejected", "remediated", "surrendered", "terminated",
)
CURRENT_STATUS_MARKERS = (
    "active", "appl exemp", "appl exten", "appl lease", "appl rff",
    "good stand", "hold", "operational", "pending", "producing mine",
    "reactivat", "renew",
)


def normalized_status(value):
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def is_current_record(kind, status, expiry_date, as_of_date):
    normalized = normalized_status(status)
    if any(marker in normalized for marker in INACTIVE_STATUS_MARKERS):
        return False
    if kind == "mine":
        return any(marker in normalized for marker in CURRENT_STATUS_MARKERS) and "pending" not in normalized
    explicitly_current = any(marker in normalized for marker in CURRENT_STATUS_MARKERS)
    return not (expiry_date and expiry_date < as_of_date and not explicitly_current)


def compact_date(value):
    if value in (None, ""):
        return None
    try:
        return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return str(value)


def round_coordinates(value, digits=5):
    if isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float)):
            return [round(number, digits) for number in value]
        return [round_coordinates(item, digits) for item in value]
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw"))
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("data/manitoba-mining/processed/manitoba_mining_by_treaty.sqlite"),
    )
    parser.add_argument("--output", type=Path, default=Path("public/data/manitoba-mining.json"))
    parser.add_argument(
        "--ownership",
        type=Path,
        default=Path("data/manitoba-mining/processed/claim_holders_good_stand.csv"),
    )
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    db = sqlite3.connect(args.database)
    db.row_factory = sqlite3.Row
    assignments = {
        (row["record_type"], row["external_id"]): row["treaty_name"]
        for row in db.execute(
            """SELECT r.record_type, r.external_id, t.treaty_name
               FROM mining_records r
               JOIN record_treaty_intersections x ON x.record_id = r.record_id AND x.is_primary = 1
               JOIN treaty_territories t ON t.treaty_id = x.treaty_id"""
        )
    }
    verified_holders = {
        # Verified in Manitoba's public iMaQs Mining Search on 2026-07-30.
        "W45426": "Vision Lithium Inc.",
    }
    if args.ownership.exists():
        with args.ownership.open(encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                verified_holders[row["disposition_number"]] = row["holder_names"] or row["holder_raw"]
    type_names = {
        "claim": "Mining claim",
        "exploration": "Mineral exploration licence",
        "lease": "Mineral lease",
        "mine": "Mine site",
    }
    record_type_lookup = {
        "claim": "Mining claim",
        "exploration": "Mineral exploration licence",
        "lease": "Mineral lease",
        "mine": "Mine site",
    }
    to_wgs84 = Transformer.from_crs("EPSG:26914", "EPSG:4326", always_xy=True)
    features = []
    generated_at = datetime.now(timezone.utc).isoformat()
    as_of_date = generated_at[:10]

    for filename, (kind, tolerance) in LAYERS.items():
        source = json.loads((args.raw_dir / f"{filename}.geojson").read_text(encoding="utf-8"))
        for feature in source["features"]:
            props = feature.get("properties") or {}
            status = props.get("MINERAL_TENURE_STATUS_CODE") or props.get("MINE_STATUS")
            expiry_date = compact_date(props.get("EXPIRY_DATE"))
            if not is_current_record(kind, status, expiry_date, as_of_date):
                continue
            geom = shape(feature["geometry"])
            if tolerance and geom.geom_type not in {"Point", "MultiPoint"}:
                geom = geom.simplify(tolerance, preserve_topology=True)
            wgs = transform(to_wgs84.transform, geom)
            external_id = str(
                props.get("TENURE_NUMBER_ID")
                or props.get("ABANDONED_MINE_SITE_PY_ID")
                or props.get("OBJECTID")
            )
            record_type = record_type_lookup[kind]
            holder = (
                verified_holders.get(external_id)
                or props.get("CLAIM_HOLDER")
                or props.get("CURRENT_OWNER")
            )
            name = props.get("CLAIM_NAME") or props.get("MINE_NAME") or external_id
            centroid = wgs.centroid
            geometry = mapping(wgs)
            geometry["coordinates"] = round_coordinates(geometry["coordinates"])
            features.append(
                {
                    "type": "Feature",
                    "id": f"{kind}:{external_id}",
                    "geometry": geometry,
                    "properties": {
                        "id": external_id,
                        "name": name,
                        "kind": kind,
                        "kindLabel": type_names[kind],
                        "status": status,
                        "treaty": assignments.get((record_type, external_id), "Unassigned"),
                        "areaHa": props.get("AREA_IN_HECTARES"),
                        "commodity": props.get("COMMODITY"),
                        "holder": holder,
                        "holderEvidence": "iMaQs public Mining Search" if external_id in verified_holders else None,
                        "issueDate": compact_date(props.get("ISSUE_DATE")),
                        "expiryDate": expiry_date,
                        "longitude": round(centroid.x, 5),
                        "latitude": round(centroid.y, 5),
                    },
                }
            )

    counts = Counter(feature["properties"]["kind"] for feature in features)
    treaty_counts = Counter(feature["properties"]["treaty"] for feature in features)
    payload = {
        "metadata": {
            "generatedAt": generated_at,
            "asOfDate": as_of_date,
            "currentOnly": True,
            "source": "Government of Manitoba iMaQs",
            "sourceUrl": "https://rdmaps.gov.mb.ca/arcgis/rest/services/iMaQs/imaqsMining/MapServer",
            "treatyBoundaryNote": "Approximate geographic index only; not a legal or consultation determination.",
            "featureCount": len(features),
            "locationNote": "Only current government-status records are included; clearly inactive and expired records are excluded.",
            "counts": counts,
            "treatyCounts": treaty_counts,
        },
        "type": "FeatureCollection",
        "features": features,
    }
    args.output.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(features):,} map features to {args.output}")


if __name__ == "__main__":
    main()
