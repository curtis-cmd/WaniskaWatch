"""Prove a retained boundary-outage snapshot is the unchanged passing release."""
import hashlib
import json
from pathlib import Path


def fingerprints(root: Path, key: str) -> dict[str, str]:
    public = root / "public" / "data"
    paths = list(public.glob(f"{key}-*.json"))
    paths += list((public / f"{key}-claims").glob("**/*.json"))
    return {str(path.relative_to(public)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(paths)}


def capture(root: Path) -> None:
    audit = json.loads((root / "public/data/data-audit.json").read_text())
    snapshots = {}
    for entry in audit["liveJurisdictions"]:
        if entry.get("published") and entry.get("status") == "passed":
            snapshots[entry["key"]] = {"audit": entry, "files": fingerprints(root, entry["key"])}
    target = root / "data/refresh-baseline.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(snapshots))


def verify_retained(root: Path, key: str, generated_at: str) -> dict:
    baseline = json.loads((root / "data/refresh-baseline.json").read_text()).get(key)
    if not baseline or baseline["audit"].get("status") != "passed":
        raise ValueError("retained snapshot has no passing pre-refresh audit")
    if baseline["audit"].get("generatedAt") != generated_at:
        raise ValueError("retained snapshot verification date changed")
    if not baseline["files"] or baseline["files"] != fingerprints(root, key):
        raise ValueError("retained snapshot files changed or are missing")
    return baseline["audit"]


if __name__ == "__main__":
    capture(Path(__file__).resolve().parents[2])
    print("Captured passing public snapshot fingerprints before refresh.")
