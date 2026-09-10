import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/canada-mining'))
from publication_policy import eligible, holder_fields

class PublicationPolicyTests(unittest.TestCase):
    def test_past_dates_are_not_overridden_by_active_or_renewal_labels(self):
        for status in ('Active', 'GOOD_STAND', 'Reinstated', 'Renewed', 'ON_HOLD'):
            self.assertFalse(eligible('claim', status, '2026-09-08', '2026-09-09'))
    def test_future_renewal_date_is_eligible(self):
        self.assertTrue(eligible('claim', 'Renewed', '2027-09-09', '2026-09-09'))
    def test_missing_evidence_and_inactive_status_are_withheld(self):
        for status in (None, 'Mining Rights only', 'Suspended', 'APPL_EXTEN', 'Inactive'):
            self.assertFalse(eligible('claim', status, None, '2026-09-09'))
    def test_current_source_status_without_expiry(self):
        self.assertTrue(eligible('claim', 'GOOD_STAND', None, '2026-09-09'))
        self.assertFalse(eligible('mine', None, '2027-09-09', '2026-09-09'))
    def test_bad_dates_fail_closed(self):
        for date in ('unknown', '2026-02-30'):
            self.assertFalse(eligible('claim', 'Active', date, '2026-09-09'))
    def test_identifiers_are_not_names(self):
        self.assertEqual(holder_fields('413102'), (None, '413102'))
        self.assertEqual(holder_fields('200691,408908'), (None, '200691,408908'))
        self.assertEqual(holder_fields('123 Canada Ltd.'), ('123 Canada Ltd.', None))
