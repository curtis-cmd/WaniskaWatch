#!/usr/bin/env python3
"""Remove an unavailable jurisdiction from public delivery while retaining its status."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jurisdiction")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    public_root = root / "public" / "data"
    removed: list[str] = []

    for path in public_root.glob(f"{args.jurisdiction}-*.json"):
        path.unlink()
        removed.append(str(path.relative_to(root)))

    claim_tiles = public_root / f"{args.jurisdiction}-claims"
    if claim_tiles.exists():
        shutil.rmtree(claim_tiles)
        removed.append(str(claim_tiles.relative_to(root)))

    catalogue_path = public_root / "province-coverage.json"
    if catalogue_path.exists():
        catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
        catalogue["provinces"] = [
            item for item in catalogue.get("provinces", [])
            if item.get("key") != args.jurisdiction
        ]
        catalogue_path.write_text(
            json.dumps(catalogue, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(f"Unpublished {args.jurisdiction}: {', '.join(removed) or 'no public files present'}")


if __name__ == "__main__":
    main()
