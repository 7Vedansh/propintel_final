"""Evidence validator — the 10 acceptance rules.

Every extracted event must pass all 10 before it earns any scoring impact.
Failing events are kept in the output (with accepted=false + rejectionReason)
for the audit trail, but contribute zero deltas.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional

from .llm_extractor import ALLOWED_DIRECTIONS, ALLOWED_EVENT_TYPES, ALLOWED_PROJECT_STATUS
from .source_registry import source_matches


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def _fuzzy_substring_match(needle: str, haystack: str, *, min_overlap: float = 0.7) -> bool:
    """Cheap fuzzy substring check used when an exact substring isn't present.

    Splits the needle into 4-char token windows and looks for at least
    `min_overlap` fraction of tokens present in haystack. Good enough to catch
    minor whitespace / casing differences without paying for difflib.
    """
    n = _normalize(needle)
    h = _normalize(haystack)
    if not n or not h:
        return False
    if n in h:
        return True
    if len(n) < 12:
        return False
    tokens = [n[i:i + 4] for i in range(0, max(1, len(n) - 4), 4)]
    if not tokens:
        return False
    hits = sum(1 for t in tokens if t in h)
    return (hits / len(tokens)) >= min_overlap


def validate_event(
    event: Dict[str, Any],
    *,
    document: Dict[str, Any],
    source_id: str,
    published_days_ago: Optional[int],
) -> Dict[str, Any]:
    """Return event dict with `accepted` + (if rejected) `rejectionReason` set.

    The 10 rules are applied in order. First failure short-circuits.
    """
    out = dict(event)
    out.setdefault("accepted", False)
    out["rejectionReason"] = None

    event_type = (out.get("eventType") or "").strip()
    direction = (out.get("direction") or "").strip().lower()
    project_status = (out.get("projectStatus") or "unknown").strip()
    confidence = float(out.get("confidence") or 0)
    locality_relevance = float(out.get("localityRelevance") or 0)
    source_url = document.get("url") or ""
    source_text = " ".join([document.get("title") or "", document.get("body") or ""])

    # 1. Source must be whitelisted (registry match)
    if not source_id or not source_matches(source_id, source_url):
        out["rejectionReason"] = "source_url_not_whitelisted"
        return out

    # 2. Source URL domain must match registry — covered by source_matches above.

    # 3. eventType must be in allowed enum
    if event_type not in ALLOWED_EVENT_TYPES:
        out["rejectionReason"] = f"event_type_not_allowed:{event_type or '<empty>'}"
        return out

    # 4. direction must be in allowed enum (or derivable from eventType)
    if direction not in ALLOWED_DIRECTIONS:
        out["rejectionReason"] = f"direction_not_allowed:{direction or '<empty>'}"
        return out

    # 5. evidence must exist and be found inside the original scraped text
    evidence = (out.get("evidence") or "").strip()
    if not evidence:
        out["rejectionReason"] = "missing_evidence"
        return out
    if not _fuzzy_substring_match(evidence, source_text):
        out["rejectionReason"] = "evidence_not_in_source_text"
        return out

    # 6. Event detection only needs a minimal geographic signal. Property-level
    # valuation impact is decided later by property_relevance.py.
    if locality_relevance < 0.03:
        out["rejectionReason"] = f"no_property_geography_signal:{locality_relevance:.2f}"
        return out

    # 7. confidence threshold
    if confidence < 0.60:
        out["rejectionReason"] = f"confidence_below_threshold:{confidence:.2f}"
        return out

    # 8. eventType not irrelevant
    if event_type == "irrelevant":
        out["rejectionReason"] = "event_type_irrelevant"
        return out

    # 9. sourceTrust exists
    if not isinstance(document.get("sourceTrust"), (int, float)):
        out["rejectionReason"] = "missing_source_trust"
        return out

    # 10. publishedDaysAgo available or estimated
    if published_days_ago is None or not isinstance(published_days_ago, (int, float)):
        out["rejectionReason"] = "missing_published_days_ago"
        return out

    # projectStatus must be in allowed enum (defensive — defaults to 'unknown')
    if project_status not in ALLOWED_PROJECT_STATUS:
        out["projectStatus"] = "unknown"

    out["accepted"] = True
    return out
