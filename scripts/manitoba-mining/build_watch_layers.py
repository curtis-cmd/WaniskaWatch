#!/usr/bin/env python3
"""Build the official Manitoba treaty-boundary layer for Waniskâ Watch."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import shapefile  # type: ignore
from pyproj import Transformer  # type: ignore
from shapely.geometry import mapping, shape  # type: ignore
from shapely.ops import transform  # type: ignore
from shapely.validation import make_valid  # type: ignore

TREATY_SOURCE = "https://mli.gov.mb.ca/adminbnd/meta_files/treaty_boundary_metadata.htm"
TREATY_COLORS = {
    "Treaty 1": "#cc6b4a",
    "Treaty 2": "#d49a3a",
    "Treaty 3": "#6f8f4e",
    "Treaty 4": "#7a63a8",
    "Treaty 5": "#2f7f85",
    "Treaty 6": "#4779a6",
    "Treaty 10": "#a15d7d",
}


def round_coordinates(value, digits=5):
    if isinstance(value, (list, tuple)):
        if value and isinstance(value[0], (int, float)):
            return [round(number, digits) for number in value]
        return [round_coordinates(item, digits) for item in value]
    return value


def load_treaties(raw_dir: Path):
    reader = shapefile.Reader(str(raw_dir / "treaty_boundary" / "treaty.shp"))
    to_wgs84 = Transformer.from_crs("EPSG:26914", "EPSG:4326", always_xy=True)
    treaties = []
    for item in reader.iterShapeRecords():
        attrs = item.record.as_dict()
        utm_geometry = make_valid(shape(item.shape.__geo_interface__))
        wgs_geometry = transform(to_wgs84.transform, utm_geometry)
        treaties.append(
            {
                "name": attrs["TREATY_NAM"].strip(),
                "year": attrs["TREATY_YEA"].strip(),
                "description": attrs["DESCRIPTIO"].strip(),
                "geometry": wgs_geometry,
            }
        )
    return treaties


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw"))
    parser.add_argument("--treaty-output", type=Path, default=Path("public/data/manitoba-treaties.json"))
    args = parser.parse_args()

    treaties = load_treaties(args.raw_dir)
    treaty_features = []
    for treaty in treaties:
        geometry = treaty["geometry"].simplify(0.004, preserve_topology=True)
        mapped = mapping(geometry)
        mapped["coordinates"] = round_coordinates(mapped["coordinates"])
        treaty_features.append(
            {
                "type": "Feature",
                "id": treaty["name"],
                "geometry": mapped,
                "properties": {
                    "name": treaty["name"],
                    "year": treaty["year"],
                    "description": treaty["description"],
                    "color": TREATY_COLORS.get(treaty["name"], "#657b76"),
                    "sourceUrl": TREATY_SOURCE,
                },
            }
        )

    treaty_payload = {
        "type": "FeatureCollection",
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": "Manitoba Land Initiative — Treaty Boundary",
            "sourceUrl": TREATY_SOURCE,
            "boundaryNote": (
                "Official provincial historic-treaty boundary dataset used as a geographic index. "
                "It is not a determination of traditional territory, rights, or consultation obligations."
            ),
        },
        "features": treaty_features,
    }
    args.treaty_output.parent.mkdir(parents=True, exist_ok=True)
    args.treaty_output.write_text(
        json.dumps(treaty_payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Wrote {len(treaty_features)} treaty boundaries")


if __name__ == "__main__":
    main()
