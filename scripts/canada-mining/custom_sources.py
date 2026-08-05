"""Normalize authoritative non-ArcGIS mining sources into canonical GeoJSON pages."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable

VENDOR = Path(__file__).with_name("vendor")
if VENDOR.exists():
    sys.path.insert(0, str(VENDOR))

import shapefile  # type: ignore
from pyproj import Transformer  # type: ignore
from shapely.geometry import mapping, shape  # type: ignore
from shapely.ops import transform, unary_union  # type: ignore
from shapely.validation import make_valid  # type: ignore

from config import Layer

BC_WFS = "https://openmaps.gov.bc.ca/geo/pub/WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW/ows"
BC_TYPE_NAME = "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"
QUEBEC_ACTIVE_TITLES = (
    "https://diffusion.mern.gouv.qc.ca/Public/GESTIM/telechargements/"
    "Province_shape/TITRES_ACTIFS_ACTIVE_TITLES.zip"
)
QUEBEC_SHAPEFILE = "TITRES_ACTIFS_ACTIVE_TITLES"
PAGE_SIZE = 1000


def _request_bytes(url: str, timeout: int = 300) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Waniska-Watch-Public-Records/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except Exception:
        completed = subprocess.run(
            ["curl", "--fail", "--silent", "--show-error", "--max-time", str(timeout), url],
            check=True,
            capture_output=True,
        )
        return completed.stdout


def _download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Waniska-Watch-Public-Records/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=600) as response, destination.open("wb") as output:
            shutil.copyfileobj(response, output)
    except Exception:
        subprocess.run(
            [
                "curl", "--fail", "--silent", "--show-error", "--max-time", "600",
                "--output", str(destination), url,
            ],
            check=True,
        )


def _iso(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, (date, datetime)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    return str(value)[:10]


def _write_pages(raw_dir: Path, slug: str, features: Iterable[dict[str, Any]]) -> dict[str, Any]:
    output_dir = raw_dir / slug
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("page-*.geojson"):
        stale.unlink()
    pages: list[dict[str, Any]] = []
    page: list[dict[str, Any]] = []
    total = 0

    def flush() -> None:
        nonlocal page
        if not page:
            return
        filename = f"page-{len(pages):05d}.geojson"
        (output_dir / filename).write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": page},
                separators=(",", ":"),
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        pages.append({"file": filename, "records": len(page)})
        page = []

    for feature in features:
        page.append(feature)
        total += 1
        if len(page) >= PAGE_SIZE:
            flush()
    flush()
    return {"records": total, "pages": pages}


class _PageWriter:
    def __init__(self, raw_dir: Path, slug: str):
        self.output_dir = raw_dir / slug
        self.output_dir.mkdir(parents=True, exist_ok=True)
        for stale in self.output_dir.glob("page-*.geojson"):
            stale.unlink()
        self.buffer: list[dict[str, Any]] = []
        self.pages: list[dict[str, Any]] = []
        self.total = 0

    def add(self, feature: dict[str, Any]) -> None:
        self.buffer.append(feature)
        self.total += 1
        if len(self.buffer) >= PAGE_SIZE:
            self.flush()

    def flush(self) -> None:
        if not self.buffer:
            return
        filename = f"page-{len(self.pages):05d}.geojson"
        (self.output_dir / filename).write_text(
            json.dumps(
                {"type": "FeatureCollection", "features": self.buffer},
                separators=(",", ":"),
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        self.pages.append({"file": filename, "records": len(self.buffer)})
        self.buffer = []

    def finish(self) -> dict[str, Any]:
        self.flush()
        return {"records": self.total, "pages": self.pages}


def download_bc(config: dict[str, Any], raw_dir: Path, as_of_date: str) -> list[dict[str, Any]]:
    writers = {layer.slug: _PageWriter(raw_dir, layer.slug) for layer in config["layers"]}
    slug_by_subtype = {
        "C": "mineral_placer_coal_claims",
        "L": "mineral_placer_coal_leases",
        "S": "coal_licences",
    }
    to_3347 = Transformer.from_crs("EPSG:4326", "EPSG:3347", always_xy=True)
    current_key: tuple[str, str] | None = None
    current_group: dict[str, Any] | None = None

    def emit() -> None:
        nonlocal current_group
        if not current_group or not current_group["geometries"]:
            current_group = None
            return
        subtype, tenure = current_group["key"]
        geometries = [make_valid(shape(item)) for item in current_group["geometries"].values()]
        geometry = make_valid(transform(to_3347.transform, make_valid(unary_union(geometries))))
        props = current_group["props"]
        owner_parts = [
            f"{name}: {float(percent):g}%" if percent is not None else name
            for name, percent in sorted(current_group["owners"].values())
        ]
        normalized = {
            "OBJECTID": tenure,
            "TENURE_NUMBER_ID": tenure,
            "CLAIM_NAME": props.get("CLAIM_NAME") or tenure,
            "STATUS": "Active",
            "OWNERS": "; ".join(owner_parts) or None,
            "TENURE_TYPE_DESCRIPTION": props.get("TENURE_TYPE_DESCRIPTION"),
            "TENURE_SUB_TYPE_DESCRIPTION": props.get("TENURE_SUB_TYPE_DESCRIPTION"),
            "ISSUE_DATE": _iso(props.get("ISSUE_DATE")),
            "GOOD_TO_DATE": _iso(props.get("GOOD_TO_DATE")),
            "AREA_IN_HECTARES": props.get("AREA_IN_HECTARES"),
            "NUMBER_OF_OWNERS": len(owner_parts),
        }
        writers[slug_by_subtype[subtype]].add(
            {"type": "Feature", "geometry": mapping(geometry), "properties": normalized}
        )
        current_group = None

    start = 0
    page_size = 1000
    while True:
        query = urllib.parse.urlencode(
            {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": BC_TYPE_NAME,
                "startIndex": str(start),
                "count": str(page_size),
                "sortBy": "TENURE_NUMBER_ID,CLIENT_NUMBER_ID",
                "outputFormat": "application/json",
                "srsName": "EPSG:4326",
            }
        )
        payload = json.loads(_request_bytes(f"{BC_WFS}?{query}"))
        features = payload.get("features") or []
        if not features:
            break
        for feature in features:
            props = feature.get("properties") or {}
            subtype = str(props.get("TENURE_SUB_TYPE_CODE") or "").upper()
            tenure = str(props.get("TENURE_NUMBER_ID") or "").strip()
            expiry = _iso(props.get("GOOD_TO_DATE"))
            if subtype not in slug_by_subtype or not tenure:
                continue
            if props.get("TERMINATION_DATE") or (expiry and expiry < as_of_date):
                continue
            key = subtype, tenure
            if current_key is not None and key != current_key:
                emit()
            if current_group is None:
                current_group = {"key": key, "props": props, "geometries": {}, "owners": {}}
            current_key = key
            geometry = feature.get("geometry")
            if geometry:
                fingerprint = json.dumps(geometry, sort_keys=True, separators=(",", ":"))
                current_group["geometries"][fingerprint] = geometry
            owner_name = str(props.get("OWNER_NAME") or "").strip()
            if owner_name:
                owner_key = str(props.get("CLIENT_NUMBER_ID") or owner_name)
                current_group["owners"][owner_key] = (owner_name, props.get("PERCENT_OWNERSHIP"))
        start += len(features)
        matched = int(payload.get("numberMatched") or payload.get("totalFeatures") or start)
        if start >= matched:
            break
    emit()

    results = []
    for layer in config["layers"]:
        assert isinstance(layer, Layer)
        results.append(
            {
                "slug": layer.slug,
                "source_name": layer.source_name,
                "source_url": layer.endpoint,
                "where": "Current MTO title; applications and titles past GOOD_TO_DATE excluded",
                **writers[layer.slug].finish(),
            }
        )
    return results


QC_CLAIM_CODES = {"CDC", "CL", "CLD"}
QC_LEASE_CODES = {"BEX", "BM", "CM"}


def _qc_eligible(record: dict[str, Any], as_of_date: str) -> bool:
    code = str(record.get("TER_CODE") or "").upper()
    status = str(record.get("STI_DES_AN") or "").strip().lower()
    expiry = _iso(record.get("TIT_DAT_EX"))
    return (
        code in QC_CLAIM_CODES | QC_LEASE_CODES
        and status == "active"
        and not (expiry and expiry < as_of_date)
    )


def _qc_group_feature(rows: list[tuple[dict[str, Any], Any]], to_3347: Transformer) -> tuple[str, dict[str, Any]] | None:
    if not rows:
        return None
    first = rows[0][0]
    title = str(first.get("TIT_NO") or "").strip()
    code = str(first.get("TER_CODE") or "").upper()
    if not title:
        return None
    geometries = []
    fingerprints: set[str] = set()
    owners: dict[str, tuple[str, Any]] = {}
    for record, raw_shape in rows:
        geometry_mapping = raw_shape.__geo_interface__
        fingerprint = json.dumps(geometry_mapping, sort_keys=True, separators=(",", ":"))
        if fingerprint not in fingerprints:
            fingerprints.add(fingerprint)
            geometries.append(make_valid(shape(geometry_mapping)))
        owner_name = str(record.get("DET_NOM") or "").strip()
        if owner_name:
            owners[str(record.get("DET_NO") or owner_name)] = (owner_name, record.get("DET_POURC"))
    if not geometries:
        return None
    geometry = make_valid(transform(to_3347.transform, make_valid(unary_union(geometries))))
    owner_parts = [
        f"{name}: {float(percent):g}%" if percent is not None else name
        for name, percent in sorted(owners.values())
    ]
    location = " — ".join(
        value for value in (
            str(first.get("MUN_TIT") or "").strip(),
            str(first.get("MRC_TIT") or "").strip(),
            str(first.get("RAD_TIT") or "").strip(),
        ) if value
    )
    props = {
        "OBJECTID": title,
        "TIT_NO": title,
        "STATUS": "Active",
        "OWNERS": "; ".join(owner_parts) or None,
        "ISSUE_DATE": _iso(first.get("TIT_DAT_EM")),
        "EXPIRY_DATE": _iso(first.get("TIT_DAT_EX")),
        "AREA_HA": first.get("TIT_SUPRF"),
        "LOCATION": location or None,
        "TITLE_CODE": code,
        "TITLE_TYPE": {
            "CDC": "Map-designated claim",
            "CL": "Staked claim",
            "CLD": "Converted claim",
            "BEX": "Exclusive surface mineral lease",
            "BM": "Mining lease",
            "CM": "Mining concession",
        }.get(code, code),
    }
    slug = "active_mining_claims" if code in QC_CLAIM_CODES else "active_mining_leases"
    return slug, {"type": "Feature", "geometry": mapping(geometry), "properties": props}


def _write_quebec_features(
    shapefile_path: Path,
    as_of_date: str,
    writers: dict[str, _PageWriter],
) -> None:
    reader = shapefile.Reader(str(shapefile_path), encoding="cp1252")
    closed: set[str] = set()
    late_titles: set[str] = set()
    previous: str | None = None
    for record in reader.iterRecords():
        values = record.as_dict()
        if not _qc_eligible(values, as_of_date):
            continue
        title = str(values.get("TIT_NO") or "")
        if title != previous:
            if title in closed:
                late_titles.add(title)
            if previous is not None:
                closed.add(previous)
            previous = title
    reader.close()

    reader = shapefile.Reader(str(shapefile_path), encoding="cp1252")
    late_rows: dict[str, list[tuple[dict[str, Any], Any]]] = defaultdict(list)
    current_title: str | None = None
    current_rows: list[tuple[dict[str, Any], Any]] = []
    to_3347 = Transformer.from_crs("EPSG:4326", "EPSG:3347", always_xy=True)

    def emit(rows: list[tuple[dict[str, Any], Any]]) -> None:
        result = _qc_group_feature(rows, to_3347)
        if result:
            slug, feature = result
            writers[slug].add(feature)

    for item in reader.iterShapeRecords():
        values = item.record.as_dict()
        if not _qc_eligible(values, as_of_date):
            continue
        title = str(values.get("TIT_NO") or "")
        if title in late_titles:
            late_rows[title].append((values, item.shape))
            continue
        if current_title is not None and title != current_title:
            emit(current_rows)
            current_rows = []
        current_title = title
        current_rows.append((values, item.shape))
    emit(current_rows)
    for title in sorted(late_rows, key=lambda value: int(value)):
        emit(late_rows[title])
    reader.close()


def download_quebec(config: dict[str, Any], raw_dir: Path, as_of_date: str) -> list[dict[str, Any]]:
    archive = raw_dir / "source" / "TITRES_ACTIFS_ACTIVE_TITLES.zip"
    _download(QUEBEC_ACTIVE_TITLES, archive)
    extracted = raw_dir / "source" / QUEBEC_SHAPEFILE
    extracted.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for suffix in ("dbf", "prj", "shp", "shx"):
            member = f"{QUEBEC_SHAPEFILE}.{suffix}"
            with bundle.open(member) as source, (extracted / member).open("wb") as output:
                shutil.copyfileobj(source, output)
    writers = {layer.slug: _PageWriter(raw_dir, layer.slug) for layer in config["layers"]}
    _write_quebec_features(
        extracted / f"{QUEBEC_SHAPEFILE}.shp",
        as_of_date,
        writers,
    )
    results = []
    for layer in config["layers"]:
        assert isinstance(layer, Layer)
        page_data = writers[layer.slug].finish()
        results.append(
            {
                "slug": layer.slug,
                "source_name": layer.source_name,
                "source_url": layer.endpoint,
                "where": "GESTIM status Active and EXPIRY_DATE not before retrieval date",
                **page_data,
            }
        )
    return results


def download_custom(config: dict[str, Any], raw_dir: Path, as_of_date: str) -> list[dict[str, Any]]:
    kind = config.get("custom_download")
    if kind == "bc-wfs":
        return download_bc(config, raw_dir, as_of_date)
    if kind == "quebec-shapefile":
        return download_quebec(config, raw_dir, as_of_date)
    raise ValueError(f"Unsupported custom source: {kind}")
