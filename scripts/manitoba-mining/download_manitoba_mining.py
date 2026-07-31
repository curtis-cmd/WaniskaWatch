#!/usr/bin/env python3
"""Download authoritative Manitoba mining layers and treaty boundaries."""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://rdmaps.gov.mb.ca/arcgis/rest/services/iMaQs/imaqsMining/MapServer"
TREATY_URL = "https://mli.gov.mb.ca/adminbnd/shp_zip_files/treaty_boundary_shp.zip"
LAYERS = {
    3: "mining_claims",
    5: "mineral_exploration_licences",
    6: "mineral_leases",
    17: "assessment_reports",
    19: "mine_sites",
}


def fetch(url: str, *, attempts: int = 4) -> bytes:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Waniska-Manitoba-Mining-Database/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read()
        except Exception as error:  # network failures are retried, then surfaced
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise RuntimeError(f"Could not download {url}") from last_error


def download_layer(layer_id: int, output: Path, page_size: int = 1000) -> dict:
    features: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "26914",
            "orderByFields": "OBJECTID",
            "resultOffset": str(offset),
            "resultRecordCount": str(page_size),
            "f": "geojson",
        }
        url = f"{BASE_URL}/{layer_id}/query?{urllib.parse.urlencode(params)}"
        page = json.loads(fetch(url))
        if "error" in page:
            raise RuntimeError(f"ArcGIS layer {layer_id} returned: {page['error']}")
        page_features = page.get("features", [])
        features.extend(page_features)
        if len(page_features) < page_size:
            break
        offset += len(page_features)

    collection = {
        "type": "FeatureCollection",
        "name": LAYERS[layer_id],
        "crs": {"type": "name", "properties": {"name": "EPSG:26914"}},
        "features": features,
    }
    output.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")
    return {"layer_id": layer_id, "name": LAYERS[layer_id], "records": len(features), "file": str(output)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("data/manitoba-mining/raw"))
    args = parser.parse_args()
    args.raw_dir.mkdir(parents=True, exist_ok=True)

    treaty_path = args.raw_dir / "treaty_boundary_shp.zip"
    treaty_path.write_bytes(fetch(TREATY_URL))

    manifest = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "coordinate_reference_system": "EPSG:26914 (NAD83 / UTM zone 14N)",
        "treaty_source": TREATY_URL,
        "mining_source": BASE_URL,
        "layers": [],
    }
    for layer_id, name in LAYERS.items():
        result = download_layer(layer_id, args.raw_dir / f"{name}.geojson")
        manifest["layers"].append(result)
        print(f"{name}: {result['records']:,} records")

    (args.raw_dir / "download_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
