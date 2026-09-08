import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/canada-mining"))
from refresh_baseline import capture, verify_retained


class RetainedSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.public = self.root / "public/data"
        self.public.mkdir(parents=True)
        self.date = "2026-08-31T18:00:00+00:00"
        self.dataset = {"metadata": {"province": "Alberta", "generatedAt": self.date, "currentOnly": True, "featureCount": 1, "databaseRecordCount": 1, "recordedHolderRecordCount": 1, "holderReviewRequiredCount": 0}, "features": [{"id": "test", "properties": {"status": "Active", "holder": "Example", "holderAvailability": "published"}}]}
        self.write("alberta-mining.json", self.dataset)
        self.write("alberta-territories.json", {"type": "FeatureCollection", "features": []})
        self.audit = {"liveJurisdictions": [{"key": "alberta", "published": True, "status": "passed", "generatedAt": self.date, "normalizedRecordCount": 1}]}
        self.write("data-audit.json", self.audit)
        self.write("jurisdiction-status.json", {"jurisdictions": {"alberta": {"state": "verified", "boundaryState": "source-unavailable", "lastVerified": self.date}}})
        capture(self.root)

    def write(self, filename, value):
        (self.public / filename).write_text(json.dumps(value))

    def test_unchanged_retained_snapshot_passes_without_new_raw_manifest(self):
        self.assertEqual(verify_retained(self.root, "alberta", self.date)["generatedAt"], self.date)
        before = (self.public / "data-audit.json").read_bytes()
        result = self.audit_command()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.public / "data-audit.json").read_bytes(), before)
        self.assertEqual(json.loads((self.public / "alberta-mining.json").read_text())["metadata"]["generatedAt"], self.date)

    def audit_command(self):
        return subprocess.run([sys.executable, str(ROOT / "scripts/canada-mining/audit_public_datasets.py"), "--root", str(self.root), "--jurisdiction", "alberta", "--check-only"], text=True, capture_output=True)

    def test_changed_record_cannot_use_retained_verification(self):
        self.dataset["features"][0]["properties"]["holder"] = "Changed"
        self.write("alberta-mining.json", self.dataset)
        with self.assertRaises(ValueError): verify_retained(self.root, "alberta", self.date)
        self.assertNotEqual(self.audit_command().returncode, 0)

    def test_missing_boundary_file_fails_retention(self):
        (self.public / "alberta-territories.json").unlink()
        with self.assertRaises(ValueError): verify_retained(self.root, "alberta", self.date)

    def test_new_date_is_not_allowed_on_retained_snapshot(self):
        with self.assertRaises(ValueError): verify_retained(self.root, "alberta", "2026-09-08T18:00:00+00:00")

    def test_fresh_claim_requires_fresh_lineage(self):
        self.write("jurisdiction-status.json", {"jurisdictions": {"alberta": {"state": "verified", "boundaryState": "verified"}}})
        self.assertNotEqual(self.audit_command().returncode, 0)

    def test_cached_boundaries_keep_their_own_verification_date(self):
        raw = self.root / "data/alberta-mining/raw"
        raw.mkdir(parents=True)
        (raw / "download_manifest.json").write_text(json.dumps({"retrieved_at": "2026-09-08T18:00:00+00:00", "boundary_mode": "previously-verified-cache", "territory_boundary": {"retrieved_at": self.date}}))
        result = subprocess.run([sys.executable, str(ROOT / "scripts/canada-mining/update_jurisdiction_status.py"), "alberta", "verified", "--root", str(self.root)], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        status = json.loads((self.public / "jurisdiction-status.json").read_text())["jurisdictions"]["alberta"]
        self.assertEqual(status["boundaryState"], "previously-verified")
        self.assertEqual(status["boundaryVerifiedAt"], self.date)
        self.assertIn("boundaries were not re-verified", status["message"])


if __name__ == "__main__": unittest.main()
