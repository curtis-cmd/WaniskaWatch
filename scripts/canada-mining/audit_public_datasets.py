#!/usr/bin/env python3
"""Audit published mining datasets against their downloaded government manifests."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import PROVINCES

INACTIVE = re.compile(
    r"abandoned|canceled|cancelled|closed|converted to lease|expired|forfeited|"
    r"non operational|orphaned|past producing|pending|application|refused|rejected|remediated|surrendered|terminated|withdrawn",
    re.IGNORECASE,
)

PENDING_SOURCES = [
    {
        "jurisdiction": "Prince Edward Island",
        "status": "coverage-confirmation-required",
        "sourceUrl": "https://www.princeedwardisland.ca/en/topic/natural-resources",
        "note": "No current public mineral-title polygon registry was identified; Waniskâ Watch will not represent a zero count as verified until confirmed with the province.",
    },
]


def canonical_raw_count(raw_dir: Path, layer: dict[str, Any]) -> int:
    slug = layer["slug"]
    pages = [
        page for page in (raw_dir / slug).glob("page-*.geojson")
        if re.fullmatch(r"page-\d{5}\.geojson", page.name)
    ]
    return sum(
        len(json.loads(page.read_text(encoding="utf-8")).get("features") or [])
        for page in pages
    )


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    public_root = root / "public" / "data"
    audited_at = datetime.now(timezone.utc)
    audits: list[dict[str, Any]] = []
    status_path = public_root / "jurisdiction-status.json"
    source_statuses = (
        json.loads(status_path.read_text(encoding="utf-8")).get("jurisdictions", {})
        if status_path.exists()
        else {}
    )

    dataset_keys = ["manitoba", *PROVINCES.keys()]
    for key in dataset_keys:
        dataset_path = public_root / f"{key}-mining.json"
        if not dataset_path.exists():
            continue
        payload = json.loads(dataset_path.read_text(encoding="utf-8"))
        metadata = payload.get("metadata") or {}
        features = payload.get("features") or []
        issues: list[str] = []
        if metadata.get("currentOnly") is not True:
            issues.append("dataset is not marked currentOnly")
        if metadata.get("featureCount") != len(features):
            issues.append("metadata featureCount does not match bundled features")
        feature_ids = [str(feature.get("id")) for feature in features]
        if len(feature_ids) != len(set(feature_ids)):
            issues.append("duplicate public feature identifiers")
        inactive_count = sum(
            1 for feature in features
            if INACTIVE.search(str((feature.get("properties") or {}).get("status") or ""))
        )
        if inactive_count:
            issues.append(f"{inactive_count} clearly inactive bundled records")
        expired_count = sum(
            1 for feature in features
            if key in {"british-columbia", "quebec", "northwest-territories"}
            and str((feature.get("properties") or {}).get("expiryDate") or "")[:10]
            and str((feature.get("properties") or {}).get("expiryDate"))[:10] < audited_at.date().isoformat()
        )
        if expired_count:
            issues.append(f"{expired_count} bundled records are past their published expiry date")
        overview_cell_count = None
        claim_overview = metadata.get("claimOverview")
        if claim_overview:
            overview_path = root / "public" / str(claim_overview).lstrip("/")
            if not overview_path.exists():
                issues.append("claim overview file is missing")
            else:
                overview = json.loads(overview_path.read_text(encoding="utf-8"))
                overview_features = overview.get("features") or []
                overview_metadata = overview.get("metadata") or {}
                overview_cell_count = len(overview_features)
                if overview_metadata.get("currentOnly") is not True:
                    issues.append("claim overview is not marked currentOnly")
                if overview_metadata.get("cellCount") != overview_cell_count:
                    issues.append("claim overview cell count does not match its features")
                if overview_metadata.get("claimCount") != (metadata.get("counts") or {}).get("claim"):
                    issues.append("claim overview total does not match current public claim count")
                if overview_cell_count > 1_000:
                    issues.append("claim overview exceeds the lightweight map budget")
        generated_at = datetime.fromisoformat(str(metadata["generatedAt"]).replace("Z", "+00:00"))
        age_hours = (audited_at - generated_at).total_seconds() / 3600
        source_status = source_statuses.get(key) or {}
        source_unavailable = source_status.get("state") == "source-unavailable"
        if age_hours > 48 and not source_unavailable:
            issues.append(f"snapshot is {age_hours:.1f} hours old")

        lineage: list[dict[str, Any]] = []
        if key in PROVINCES and not source_unavailable:
            raw_dir = root / "data" / f"{key}-mining" / "raw"
            manifest = json.loads((raw_dir / "download_manifest.json").read_text(encoding="utf-8"))
            for layer in manifest["layers"]:
                found = canonical_raw_count(raw_dir, layer)
                expected = int(layer["records"])
                lineage.append({"layer": layer["slug"], "manifest": expected, "canonicalRaw": found})
                if found != expected:
                    issues.append(
                        f"{layer['slug']} manifest/raw mismatch: {expected} expected, {found} found"
                    )
            db_path = (
                root / "data" / f"{key}-mining" / "processed"
                / f"{key}_mining_by_territory.sqlite"
            )
            with sqlite3.connect(db_path) as db:
                normalized_count = int(db.execute("SELECT COUNT(*) FROM mining_records").fetchone()[0])
            if normalized_count != sum(item["canonicalRaw"] for item in lineage):
                issues.append("normalized record count does not match canonical raw features")
        elif key in PROVINCES:
            # A source outage deliberately retains the last published snapshot.
            # Fresh raw files are not available and must not be invented or
            # treated as newly verified lineage.
            normalized_count = int(metadata.get("databaseRecordCount", metadata.get("featureCount")) or 0)
        else:
            normalized_count = int(metadata.get("featureCount") or 0)

        audit_status = (
            "review-required" if issues
            else "source-unavailable" if source_unavailable
            else "passed"
        )
        audits.append(
            {
                "key": key,
                "jurisdiction": metadata.get("province") or key.replace("-", " ").title(),
                "status": audit_status,
                "sourceAvailability": source_status.get("state", "verified"),
                "sourceCheckedAt": source_status.get("checkedAt"),
                "lastVerified": source_status.get("lastVerified") or metadata.get("generatedAt"),
                "availabilityMessage": source_status.get("message"),
                "generatedAt": metadata.get("generatedAt"),
                "ageHours": round(age_hours, 2),
                "currentRecordCount": metadata.get("databaseRecordCount", metadata.get("featureCount")),
                "bundledFeatureCount": len(features),
                "claimDelivery": metadata.get("claimDelivery", "included"),
                "claimOverviewCellCount": overview_cell_count,
                "recordedHolderCount": metadata.get("recordedHolderCount"),
                "normalizedRecordCount": normalized_count,
                "lineage": lineage,
                "issues": issues,
            }
        )

    has_blocking_issues = any(item["status"] == "review-required" for item in audits)
    has_source_outages = any(item["status"] == "source-unavailable" for item in audits)
    audit_result = (
        "review-required" if has_blocking_issues
        else "passed-with-source-outages" if has_source_outages
        else "passed"
    )
    report = {
        "metadata": {
            "auditedAt": audited_at.isoformat(),
            "result": audit_result,
            "liveJurisdictionCount": len(audits),
            "totalCurrentRecordCount": sum(int(item["currentRecordCount"] or 0) for item in audits),
            "scope": "Current public mining records, canonical raw-page lineage, identifiers, statuses, freshness, and public feature counts.",
        },
        "liveJurisdictions": audits,
        "pendingJurisdictions": PENDING_SOURCES,
    }
    destination = public_root / "data-audit.json"
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {destination}")
    for item in audits:
        print(f"{item['jurisdiction']}: {item['status']} — {item['currentRecordCount']:,} current records")
    if has_blocking_issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
