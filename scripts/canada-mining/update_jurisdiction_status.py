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
    dataset = json.loads(dataset_path.read_text(encoding="utf-8"))
    metadata = dataset.get("metadata") or {}
    last_verified = metadata.get("generatedAt")
    jurisdiction_name = metadata.get("province") or args.jurisdiction.replace("-", " ").title()

    payload["metadata"] = {
        "updatedAt": now,
        "note": "Source availability is tracked separately from record status. A source outage never replaces the last verified jurisdiction snapshot.",
    }
    jurisdictions = payload.setdefault("jurisdictions", {})
    if args.state == "verified":
        jurisdictions[args.jurisdiction] = {
            "state": "verified",
            "checkedAt": now,
            "lastVerified": last_verified,
            "message": f"{jurisdiction_name} source refresh verified.",
            "sourceUrl": args.source_url or metadata.get("sourceUrl"),
        }
    else:
        previous = jurisdictions.get(args.jurisdiction) or {}
        jurisdictions[args.jurisdiction] = {
            "state": "source-unavailable",
            "checkedAt": now,
            "lastVerified": previous.get("lastVerified") or last_verified,
            "message": f"Source temporarily unavailable—last verified {datetime.fromisoformat(str(previous.get('lastVerified') or last_verified).replace('Z', '+00:00')).strftime('%B %-d, %Y')}.",
            "sourceUrl": args.source_url or previous.get("sourceUrl") or metadata.get("sourceUrl"),
        }

    status_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Recorded {args.jurisdiction}: {args.state}")


if __name__ == "__main__":
    main()
