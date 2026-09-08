#!/usr/bin/env python3
"""Record jurisdiction source availability without replacing verified data."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jurisdiction")
    parser.add_argument(
        "state",
        choices=["verified", "source-unavailable", "boundary-source-unavailable", "audit-failed"],
    )
    parser.add_argument("--source-url")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()

    root = args.root.resolve()
    public_root = root / "public" / "data"
    status_path = public_root / "jurisdiction-status.json"
    dataset_path = public_root / f"{args.jurisdiction}-mining.json"
    now = datetime.now(timezone.utc).isoformat()

    payload = (
        json.loads(status_path.read_text(encoding="utf-8"))
        if status_path.exists()
        else {"metadata": {}, "jurisdictions": {}}
    )
    dataset = (
        json.loads(dataset_path.read_text(encoding="utf-8"))
        if dataset_path.exists()
        else {}
    )
    metadata = dataset.get("metadata") or {}
    previous = payload.setdefault("jurisdictions", {}).get(args.jurisdiction) or {}
    last_verified = metadata.get("generatedAt") or previous.get("lastVerified")
    last_verified_record_count = (
        metadata.get("databaseRecordCount", metadata.get("featureCount"))
        if metadata
        else previous.get("lastVerifiedRecordCount")
    )
    jurisdiction_name = metadata.get("province") or args.jurisdiction.replace("-", " ").title()

    if args.state in {"verified", "boundary-source-unavailable"} and not metadata:
        raise SystemExit(f"Verified dataset is missing for {args.jurisdiction}")
    if not last_verified:
        raise SystemExit(f"No last-verified date is available for {args.jurisdiction}")

    payload["metadata"] = {
        "updatedAt": now,
        "note": "Only jurisdictions verified during the latest successful refresh are published. An unavailable source remains documented but its records are temporarily unpublished.",
    }
    jurisdictions = payload.setdefault("jurisdictions", {})
    if args.state == "verified":
        manifest_path = root / "data" / f"{args.jurisdiction}-mining" / "raw" / "download_manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        cached_boundaries = manifest.get("boundary_mode") == "previously-verified-cache"
        boundary_date = (manifest.get("territory_boundary") or {}).get("retrieved_at") or manifest.get("retrieved_at")
        jurisdictions[args.jurisdiction] = {
            "state": "verified",
            "checkedAt": now,
            "lastVerified": last_verified,
            "lastVerifiedRecordCount": last_verified_record_count,
            "message": (
                f"{jurisdiction_name} mining-source refresh verified. Territorial context uses previously verified boundary data, dated {str(boundary_date)[:10]}; boundaries were not re-verified in this refresh."
                if cached_boundaries else f"{jurisdiction_name} source refresh verified."
            ),
            "sourceUrl": args.source_url or metadata.get("sourceUrl"),
            "boundaryState": "previously-verified" if cached_boundaries else "verified",
            "boundaryVerifiedAt": boundary_date,
        }
    elif args.state == "boundary-source-unavailable":
        verified_date = previous.get("lastVerified") or last_verified
        jurisdictions[args.jurisdiction] = {
            "state": "verified",
            "checkedAt": now,
            "lastVerified": verified_date,
            "lastVerifiedRecordCount": (
                previous.get("lastVerifiedRecordCount") or last_verified_record_count
            ),
            "message": (
                "Mining records remain at the last verified snapshot because the "
                "territory-boundary source is temporarily unavailable—last verified "
                f"{datetime.fromisoformat(str(verified_date).replace('Z', '+00:00')).strftime('%B %-d, %Y')}."
            ),
            "sourceUrl": args.source_url or previous.get("sourceUrl") or metadata.get("sourceUrl"),
            "boundaryState": "source-unavailable",
            "boundaryCheckedAt": now,
        }
    else:
        jurisdictions[args.jurisdiction] = {
            "state": "source-unavailable",
            "checkedAt": now,
            "lastVerified": previous.get("lastVerified") or last_verified,
            "lastVerifiedRecordCount": previous.get("lastVerifiedRecordCount") or last_verified_record_count,
            "message": ("Verification checks did not pass; records temporarily unpublished" if args.state == "audit-failed" else "Source temporarily unavailable") + f"—last verified {datetime.fromisoformat(str(previous.get('lastVerified') or last_verified).replace('Z', '+00:00')).strftime('%B %-d, %Y')}.",
            "failureReason": "audit-failed" if args.state == "audit-failed" else "source-unavailable",
            "sourceUrl": args.source_url or previous.get("sourceUrl") or metadata.get("sourceUrl"),
        }

    status_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Recorded {args.jurisdiction}: {args.state}")


if __name__ == "__main__":
    main()
