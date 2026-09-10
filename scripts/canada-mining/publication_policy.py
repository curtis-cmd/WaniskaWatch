"""Conservative publication eligibility; not a legal finding about a title."""
import re
from datetime import date

INACTIVE = re.compile(r"inactive|abandon|cancel|closed|conv lease|converted|expired|forfeit|non operational|orphan|past.produc|refus|reject|remediat|surrender|terminat|withdraw|pending|application", re.I)
CURRENT = re.compile(r"^(active(?:\b.*)?|good stand|on hold|hold|operational|producer|producing mine|reactivated|reinstated|renewed)$", re.I)

def eligible(kind, status, expiry, as_of):
    status = ' '.join(str(status or '').lower().replace('_', ' ').split())
    if INACTIVE.search(status):
        return False
    value = str(expiry or '')[:10]
    if value:
        try:
            expiry_date = date.fromisoformat(value)
        except ValueError:
            return False
        if expiry_date < date.fromisoformat(as_of):
            return False  # A conflicting current label is not evidence of renewal.
    current = bool(CURRENT.fullmatch(status))
    return current if kind == 'mine' else bool(value) or current

def holder_fields(value):
    """Retain numeric source identifiers without presenting them as names."""
    value = str(value or '').strip()
    if value and re.fullmatch(r'[0-9]+(?:\s*[,;|]\s*[0-9]+)*', value):
        return None, value
    return value or None, None
