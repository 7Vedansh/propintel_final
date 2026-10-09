"""Group similar events across sources and decide corroboration status.

Single events come into this module after validation. We bucket them by
(eventType, direction, project|locality, ~30-day window), then assign one
of six corroborationStatus values + a corroborationWeight that the scorer
uses to dampen or boost the deterministic effect.

Trust ranges (per design):
  official_plus_media   → 1.10 (capped)
  official_only         → 1.00
  media_corroborated    → 0.72 (mid of 0.70–0.75)
  media_only            → 0.40 (mid of 0.35–0.45)
  local_media_only      → 0.25 (mid of 0.20–0.30)
  unconfirmed/rejected  → 0.00
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Dict, List, Tuple

DAYS_WINDOW = 30
CORROBORATION_WEIGHT = {
    "official_plus_media":   1.10,
    "official_only":         1.00,
    "media_corroborated":    0.72,
    "media_only":            0.40,
    "local_media_only":      0.25,
    "unconfirmed":           0.00,
    "rejected":              0.00,
}


def _norm_key_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def _bucket_window(days: Any) -> int:
    """Round publishedDaysAgo into 30-day buckets so events ~3 weeks apart
    can still corroborate each other."""
    try:
        d = int(days)
    except (TypeError, ValueError):
        d = 30
    return max(0, d) // DAYS_WINDOW


def _group_key(event: Dict[str, Any]) -> str:
    event_type = _norm_key_text(event.get("eventType"))
    direction = _norm_key_text(event.get("direction"))
    # Prefer project name; otherwise locality / microMarket.
    anchor = _norm_key_text(
        event.get("project") or event.get("microMarketId") or event.get("locality")
    )
    window = _bucket_window(event.get("publishedDaysAgo"))
    raw = f"{event_type}|{direction}|{anchor}|{window}"
    return "grp-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def _tier_count(events: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    official = sum(1 for e in events if (e.get("sourceTier") or "") == "official")
    reputed  = sum(1 for e in events if (e.get("sourceTier") or "") == "reputed_media")
    local    = sum(1 for e in events if (e.get("sourceTier") or "") == "local_media")
    return official, reputed, local


def _decide_status(events: List[Dict[str, Any]]) -> str:
    official, reputed, local = _tier_count(events)
    if official >= 1 and (reputed + local) >= 1:
        return "official_plus_media"
    if official >= 1:
        return "official_only"
    # Need at least 2 INDEPENDENT reputed sources for media_corroborated
    if reputed >= 2:
        # Check independence — distinct sourceName
        names = {e.get("sourceName") for e in events if (e.get("sourceTier") or "") == "reputed_media"}
        if len(names) >= 2:
            return "media_corroborated"
        return "media_only"
    if reputed == 1:
        return "media_only"
    if local >= 1:
        return "local_media_only"
    return "unconfirmed"


def annotate_corroboration(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group all accepted events, set corroborationStatus + corroborationWeight
    + matchedGroupId + groupedEventKey on each. Returns same list (mutated)."""
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for ev in events:
        if not ev.get("accepted"):
            continue
        key = _group_key(ev)
        ev["groupedEventKey"] = key
        groups.setdefault(key, []).append(ev)

    for key, members in groups.items():
        status = _decide_status(members)
        weight = CORROBORATION_WEIGHT.get(status, 0.0)
        for ev in members:
            ev["matchedGroupId"] = key
            ev["corroborationStatus"] = status
            ev["corroborationWeight"] = weight

    # Events that never made it into a group (rejected) still need defaults.
    for ev in events:
        if not ev.get("accepted"):
            ev.setdefault("corroborationStatus", "rejected")
            ev.setdefault("corroborationWeight", 0.0)
            ev.setdefault("matchedGroupId", None)
            ev.setdefault("groupedEventKey", None)

    return events


def corroboration_counts(events: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {
        "official_only": 0,
        "official_plus_media": 0,
        "media_corroborated": 0,
        "media_only": 0,
        "local_media_only": 0,
        "unconfirmed": 0,
    }
    seen_groups = set()
    for ev in events:
        if not ev.get("accepted"):
            continue
        gid = ev.get("matchedGroupId")
        if gid in seen_groups:
            continue
        seen_groups.add(gid)
        status = ev.get("corroborationStatus") or "unconfirmed"
        if status in counts:
            counts[status] += 1
    return counts


def source_tier_counts(events: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {"official": 0, "reputed_media": 0, "local_media": 0}
    for ev in events:
        if not ev.get("accepted"):
            continue
        tier = ev.get("sourceTier") or "official"
        if tier in counts:
            counts[tier] += 1
    return counts
