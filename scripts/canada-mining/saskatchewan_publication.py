"""Fail-closed publication of reviewed corporate identities, not inferred entities."""
import json
import re
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[2] / "config/saskatchewan-holder-publication.json").read_text())
def normalized(value):
    return " ".join(value.upper().split())

COMPANIES = {normalized(row["name"]) for row in POLICY["companies"] if row["evidenceUrl"].startswith("https://")}

def publishable_holder(value):
    if not value:
        return None
    # Preserve the entire original value and interests only when EVERY party is reviewed.
    parties = str(value).split(";")
    for party in parties:
        match = re.fullmatch(r"\s*(.+?)\s*:\s*(\d+(?:\.\d+)?)%\s*", party)
        name = match.group(1) if match else party
        if normalized(name) not in COMPANIES:
            return None
    return value

def permitted_record(key, record_type):
    # Separate mine-location/assessment feeds have not been cleared by this source review.
    return key != "saskatchewan" or record_type == "Crown mineral disposition"
