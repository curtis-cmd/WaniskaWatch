#!/usr/bin/env python3
"""Download paged, authoritative mining and boundary records."""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import PROVINCES, STATCAN_PROVINCES, Layer

OUT_SR = "3347"
PAGE_SIZE = 1000
WORKERS = 4


def fetch_json(url: str, attempts: int = 5) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "Waniska-Watch-Public-Records/1.0"},
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.load(response)
            if payload.get("error"):
                raise RuntimeError(str(payload["error"]))
            return payload
        except Exception as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(2**attempt, 16))
    raise RuntimeError(f"Could not download {url}") from last_error


def post_json(url: str, params: dict[str, str], attempts: int = 5) -> dict[str, Any]:
    last_error: Exception | None = None
    encoded = urllib.parse.urlencode(params).encode("utf-8")
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(
                url,
                data=encoded,
                headers={
                    "User-Agent": "Waniska-Watch-Public-Records/1.0",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.load(response)
            if payload.get("error"):
                raise RuntimeError(str(payload["error"]))
            return payload
        except Exception as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(2**attempt, 16))
    raise RuntimeError(f"Could not download {url} using an ArcGIS POST query") from last_error


def query_url(endpoint: str, params: dict[str, str]) -> str:
    return f"{endpoint}/query?{urllib.parse.urlencode(params)}"


def layer_ids(layer: Layer) -> list[int]:
    payload = fetch_json(
        query_url(
            layer.endpoint,
            {
                "where": layer.where,
                "returnIdsOnly": "true",
                "f": "json",
            },
        )
    )
    return sorted(payload.get("objectIds") or [])


def download_page(layer: Layer, object_ids: list[int], destination: Path) -> dict[str, Any]:
    payload = post_json(
        f"{layer.endpoint}/query",
        {
            "objectIds": ",".join(map(str, object_ids)),
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": OUT_SR,
            "f": "geojson",
        },
    )
    destination.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    return {"file": destination.name, "records": len(payload.get("features") or [])}


def download_layer(layer: Layer, raw_dir: Path) -> dict[str, Any]:
    output_dir = raw_dir / layer.slug
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("page-*.geojson"):
        stale.unlink()

    ids = layer_ids(layer)
    pages = [ids[index : index + PAGE_SIZE] for index in range(0, len(ids), PAGE_SIZE)]
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(
                download_page,
                layer,
                page,
                output_dir / f"page-{index:05d}.geojson",
            ): index
            for index, page in enumerate(pages)
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
    results.sort(key=lambda item: item["file"])
    found = sum(item["records"] for item in results)
    if found != len(ids):
        raise RuntimeError(f"{layer.slug}: expected {len(ids):,} records, downloaded {found:,}")
    return {
        "slug": layer.slug,
        "source_name": layer.source_name,
        "source_url": layer.endpoint,
        "where": layer.where,
        "records": found,
        "pages": results,
    }


def download_single_layer(
    source_url: str,
    layer_id: int,
    destination: Path,
    *,
    where: str,
    max_allowable_offset: str | None = None,
) -> int:
    endpoint = f"{source_url}/{layer_id}"
    params = {
        "where": where,
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": OUT_SR,
        "geometryPrecision": "1",
        "f": "geojson",
    }
    if max_allowable_offset:
        params["maxAllowableOffset"] = max_allowable_offset
    payload = fetch_json(query_url(endpoint, params))
    destination.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    return len(payload.get("features") or [])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("province", choices=sorted(PROVINCES))
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument(
        "--boundaries-only",
        action="store_true",
        help="Keep previously downloaded mining pages and refresh only province/treaty boundaries.",
    )
    args = parser.parse_args()
    config = PROVINCES[args.province]
    raw_dir = args.data_root / f"{args.province}-mining" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    retrieved_at = datetime.now(timezone.utc).isoformat()
    manifest: dict[str, Any] = {
        "province": config["name"],
        "province_key": args.province,
        "retrieved_at": retrieved_at,
        "coordinate_reference_system": "EPSG:3347 (NAD83 / Statistics Canada Lambert)",
        "layers": [],
    }
    if not args.boundaries_only:
        for layer in config["layers"]:
            result = download_layer(layer, raw_dir)
            manifest["layers"].append(result)
            print(f"{result['slug']}: {result['records']:,} records")

    province_name, province_url, province_layer = STATCAN_PROVINCES
    province_records = download_single_layer(
        province_url,
        province_layer,
        raw_dir / "province_boundary.geojson",
        where=f"PRUID='{config['pruid']}'",
        max_allowable_offset="500",
    )
    manifest["province_boundary"] = {
        "source_name": province_name,
        "source_url": f"{province_url}/{province_layer}",
        "records": province_records,
    }

    territory_name, territory_url, territory_layer = config["territory_source"]
    territory_records = download_single_layer(
        territory_url,
        territory_layer,
        raw_dir / "territory_boundaries.geojson",
        where="1=1",
        max_allowable_offset="100",
    )
    manifest["territory_boundary"] = {
        "source_name": territory_name,
        "source_url": f"{territory_url}/{territory_layer}",
        "records": territory_records,
    }
    (raw_dir / "download_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote manifest to {raw_dir / 'download_manifest.json'}")


if __name__ == "__main__":
    main()
