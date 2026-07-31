#!/usr/bin/env python3
"""Normalize public iMaQs holder exports for database and portal use."""

from __future__ import annotations

import argparse
import re
from datetime import date
from pathlib import Path

import pandas as pd

ORGANIZATION_TERMS = re.compile(
    r"\b(INC|INCORPORATED|LTD|LIMITED|CORP|CORPORATION|COMPANY|CO|MINES|MINING|"
    r"METALS|MINERALS|RESOURCES|EXPLORATION|ALLIANCE|PARTNERSHIP|LP|LLP|LLC|"
    r"NATION|GOVERNMENT|MUNICIPALITY|UNIVERSITY)\b",
    re.IGNORECASE,
)
CLIENT_ID = re.compile(r"(?<!\d)(?:\()?\d{3,}\)\s*")


def holder_names(raw: str) -> list[str]:
    matches = list(CLIENT_ID.finditer(raw))
    if not matches:
        return [raw.strip()] if raw.strip() else []
    names = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        name = raw[match.end():end].strip(" ,;")
        if name:
            names.append(name)
    return names


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/manitoba-mining/processed/claim_holders_good_stand.csv"),
    )
    args = parser.parse_args()
    data = pd.read_excel(args.input, dtype=str).fillna("")
    rows = []
    for _, row in data.iterrows():
        raw = str(row["Holder"]).strip()
        names = holder_names(raw)
        types = ["organization" if ORGANIZATION_TERMS.search(name) else "individual" for name in names]
        rows.append(
            {
                "disposition_number": str(row["Disposition Number"]).strip(),
                "holder_raw": raw,
                "holder_names": " | ".join(names),
                "holder_types": " | ".join(types),
                "status": str(row["Status"]).strip(),
                "evidence_url": "https://web33.gov.mb.ca/imaqs/page/viewer/mineralSearch/searchForm.jsf",
                "evidence_date": date.today().isoformat(),
                "confidence": "verified",
            }
        )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(args.output, index=False)
    print(f"Wrote {len(rows):,} ownership rows to {args.output}")


if __name__ == "__main__":
    main()
