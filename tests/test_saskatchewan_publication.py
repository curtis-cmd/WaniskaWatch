import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/canada-mining'))
from saskatchewan_publication import publishable_holder, permitted_record

class SaskatchewanPublication(unittest.TestCase):
    def test_exact_reviewed_names_and_interests(self):
        for value in ['Cameco Corporation: 100.000%', '  CAMECO   CORPORATION  ', 'CAMECO CORPORATION: 50%; ISOENERGY LTD.: 50.000%']:
            self.assertEqual(publishable_holder(value), value)
    def test_unknown_or_mixed_are_withheld_in_full(self):
        for value in [None, '', 'Example Ltd.', 'Example Person: 100%', 'CAMECO CORPORATION: 50%; Example Person: 50%', 'CAMECO CORPORATION; ', 'CAMECO CORPORATION: invalid', '1234']:
            self.assertIsNone(publishable_holder(value))
    def test_scope_is_source_specific(self):
        self.assertTrue(permitted_record('saskatchewan', 'Crown mineral disposition'))
        self.assertFalse(permitted_record('saskatchewan', 'Mine location'))
        self.assertTrue(permitted_record('yukon', 'Mine location'))
