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
    parser.add_argument("state", choices=["verified", "source-unavailable"])
    parser.add_argument("--source-url")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
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

    if args.state == "verified" and not metadata:
        raise SystemExit(f"Verified dataset is missing for {args.jurisdiction}")
    if not last_verified:
        raise SystemExit(f"No last-verified date is available for {args.jurisdiction}")

    payload["metadata"] = {
        "updatedAt": now,
        "note": "Only jurisdictions verified during the latest successful refresh are published. An unavailable source remains documented but its records are temporarily unpublished.",
    }
    jurisdictions = payload.setdefault("jurisdictions", {})
    if args.state == "verified":
        jurisdictions[args.jurisdiction] = {
            "state": "verified",
            "checkedAt": now,
            "lastVerified": last_verified,
            "lastVerifiedRecordCount": last_verified_record_count,
            "message": f"{jurisdiction_name} source refresh verified.",
            "sourceUrl": args.source_url or metadata.get("sourceUrl"),
        }
    else:
        jurisdictions[args.jurisdiction] = {
            "state": "source-unavailable",
            "checkedAt": now,
            "lastVerified": previous.get("lastVerified") or last_verified,
            "lastVerifiedRecordCount": previous.get("lastVerifiedRecordCount") or last_verified_record_count,
            "message": f"Source temporarily unavailable—last verified {datetime.fromisoformat(str(previous.get('lastVerified') or last_verified).replace('Z', '+00:00')).strftime('%B %-d, %Y')}.",
            "sourceUrl": args.source_url or previous.get("sourceUrl") or metadata.get("sourceUrl"),
        }

    status_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Recorded {args.jurisdiction}: {args.state}")


if __name__ == "__main__":
    main()
