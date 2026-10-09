"""Deterministic scoring engine for accepted locality events.

The LLM/extractor only produces structured event objects. THIS module decides
the numeric impact. Every effect is bounded; total per-call deltas are clamped
to global caps. Base market value is never directly altered.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .property_relevance import VALUATION_RELEVANCE_FLOOR, enrich_property_relevance

# Per-eventType base impact ceilings. The dynamic eventWeight scales each
# accepted event's effect within these ceilings.
BASE_IMPACTS: Dict[str, Dict[str, float]] = {
    # positive / growth
    "metro_connectivity":       {"liquidity": +0.06, "marketability": +0.05, "confidence": +0.02,  "ttl": -0.08},
    "airport_connectivity":     {"liquidity": +0.05, "marketability": +0.05, "confidence": +0.015, "ttl": -0.07},
    "road_infra":               {"liquidity": +0.04, "marketability": +0.035,"confidence": +0.015, "ttl": -0.05},
    "commercial_growth":        {"liquidity": +0.04, "marketability": +0.05, "confidence": +0.015, "ttl": -0.05},
    "business_district_growth": {"liquidity": +0.04, "marketability": +0.05, "confidence": +0.015, "ttl": -0.05},
    "rental_demand_growth":     {"liquidity": +0.04, "marketability": +0.05, "confidence": +0.015, "ttl": -0.05},
    "redevelopment_activity":   {"liquidity": +0.025,"marketability": +0.03, "confidence": +0.010, "ttl": -0.03},

    # negative / risk
    "infrastructure_delay":     {"liquidity": -0.04, "marketability": -0.03, "confidence": -0.015, "ttl": +0.06},
    "rera_project_risk":        {"liquidity": -0.03, "marketability": -0.03, "confidence": -0.020, "ttl": +0.05},
    "revoked_project":          {"liquidity": -0.04, "marketability": -0.04, "confidence": -0.025, "ttl": +0.06},
    "delayed_project":          {"liquidity": -0.03, "marketability": -0.03, "confidence": -0.020, "ttl": +0.05},
    "deregistered_project":     {"liquidity": -0.04, "marketability": -0.04, "confidence": -0.025, "ttl": +0.06},
    "litigation_redevelopment_risk": {"liquidity": -0.03, "marketability": -0.03, "confidence": -0.020, "ttl": +0.05},
    "environmental_restriction":{"liquidity": -0.03, "marketability": -0.02, "confidence": -0.015, "ttl": +0.04},
    "weather_water_risk":       {"liquidity": -0.02, "marketability": -0.02, "confidence": -0.010, "ttl": +0.03},
    "flood_warning":            {"liquidity": -0.03, "marketability": -0.03, "confidence": -0.015, "ttl": +0.04},
    "flood_risk":               {"liquidity": -0.03, "marketability": -0.03, "confidence": -0.015, "ttl": +0.04},
    "waterlogging_risk":        {"liquidity": -0.02, "marketability": -0.02, "confidence": -0.010, "ttl": +0.03},
    "disaster_alert":           {"liquidity": -0.025,"marketability": -0.025,"confidence": -0.015, "ttl": +0.04},
    "heavy_rain_alert":         {"liquidity": -0.015,"marketability": -0.015,"confidence": -0.010, "ttl": +0.03},
    "heavy_rain_warning":       {"liquidity": -0.015,"marketability": -0.015,"confidence": -0.010, "ttl": +0.03},
    "oversupply_signal":        {"liquidity": -0.04, "marketability": -0.04, "confidence": -0.010, "ttl": +0.06},

    # neutral
    "neutral_update":           {"liquidity": 0.0,   "marketability": 0.0,   "confidence": 0.0,    "ttl": 0.0},
    "irrelevant":               {"liquidity": 0.0,   "marketability": 0.0,   "confidence": 0.0,    "ttl": 0.0},
}

# Routes by event type — used when the event triggers manual review.
INSPECTION_ROUTE: Dict[str, str] = {
    "rera_project_risk":           "legal_review",
    "revoked_project":             "legal_review",
    "delayed_project":             "technical_valuer_inspection",
    "deregistered_project":        "legal_review",
    "litigation_redevelopment_risk": "legal_review",
    "environmental_restriction":   "legal_review",
    "infrastructure_delay":        "field_officer_review",
    "flood_warning":               "technical_valuer_inspection",
    "flood_risk":                  "technical_valuer_inspection",
    "weather_water_risk":          "technical_valuer_inspection",
    "waterlogging_risk":           "technical_valuer_inspection",
    "disaster_alert":              "field_officer_review",
    "heavy_rain_alert":            "field_officer_review",
    "heavy_rain_warning":          "field_officer_review",
    "oversupply_signal":           "senior_credit_review",
}

# ── Aggregate caps ────────────────────────────────────────────────────────
# Positive upside from locality intelligence is intentionally more
# conservative than downside risk. We only allow the wider positive ceilings
# when the current run has at least one LIVE official-tier event
# (official_only or official_plus_media). Cached-only runs use the tight set.
# Negative caps are unchanged.
GLOBAL_CAPS_TIGHT = {
    "liquidity":     (-0.08, +0.05),
    "marketability": (-0.08, +0.05),
    "confidence":    (-0.04, +0.04),
    "ttl":           (-0.07, +0.15),
}
GLOBAL_CAPS_RELAXED = {
    "liquidity":     (-0.08, +0.08),
    "marketability": (-0.08, +0.08),
    "confidence":    (-0.04, +0.04),
    "ttl":           (-0.10, +0.15),
}
# Backwards-compat alias — kept so older callers don't break.
GLOBAL_CAPS = GLOBAL_CAPS_RELAXED

# Single media-only or local-media-only POSITIVE events are mostly watchlist;
# halve their already-corroboration-dampened scaled deltas.
POSITIVE_WATCHLIST_SUPPRESSOR = 0.5

# Per-event multipliers applied when the pipeline is serving from cache.
# Live events use 1.00 (no dampener). Cached events are dampened by tier so the
# scoring layer can't go full strength when we're not actually live.
CACHE_DAMPENERS = {
    "official_plus_media": 0.75,
    "official_only":       0.75,
    "media_corroborated":  0.40,
    "media_only":          0.40,
    "local_media_only":    0.20,   # see SEVERE_RISK_TYPES_FOR_CACHE_DAMPENER
    "unconfirmed":         0.00,
    "rejected":            0.00,
}

# When cache-dampening, a local_media_only event has its scoring impact dropped
# to zero (watchlist-only) UNLESS the event type is in this severe-risk allow-list.
SEVERE_RISK_TYPES_FOR_CACHE_DAMPENER = {
    "revoked_project",
    "rera_project_risk",
    "litigation_redevelopment_risk",
    "environmental_restriction",
    "flood_warning",
    "infrastructure_delay",
}

RECENCY_BUCKETS: Tuple[Tuple[int, float], ...] = (
    (90,   1.00),
    (180,  0.80),
    (365,  0.60),
    (730,  0.35),
    (10**9, 0.15),
)


def _clamp(value: float, lo: float, hi: float) -> float:
    if value != value:  # NaN guard
        return 0.0
    return max(lo, min(hi, value))


def recency_weight(published_days_ago: Optional[int]) -> float:
    if published_days_ago is None:
        return 0.50
    try:
        d = int(published_days_ago)
    except Exception:
        return 0.50
    for threshold, weight in RECENCY_BUCKETS:
        if d <= threshold:
            return weight
    return 0.15


def project_maturity_weight(project_status: Optional[str], expected_completion_months: Optional[int]) -> float:
    status = (project_status or "unknown").lower()
    months = None
    try:
        if expected_completion_months is not None:
            months = int(expected_completion_months)
    except Exception:
        months = None

    if status in ("operational", "completed"):
        return 1.0
    if status == "under_construction":
        if months is not None and months <= 12:
            return 0.85
        if months is not None and months <= 36:
            return 0.60
        return 0.55
    if status == "approved":
        return 0.45
    if status in ("announced", "proposed"):
        return 0.20
    if status == "delayed":
        return -0.30
    if status == "stalled":
        return -0.50
    return 0.35  # unknown


def compute_event_weight(event: Dict[str, Any]) -> float:
    source_trust       = float(event.get("sourceTrust") or 0.5)
    property_relevance = float(event.get("valuationRelevanceScore") or 0.0)
    rw = recency_weight(event.get("publishedDaysAgo"))
    pmw = project_maturity_weight(event.get("projectStatus"), event.get("expectedCompletionMonths"))
    # Corroboration weight multiplies the formula (per brief). Falls back to
    # 1.0 (neutral) when corroboration hasn't run yet.
    cw = event.get("corroborationWeight")
    if cw is None:
        cw = 1.0
    try:
        cw = float(cw)
    except Exception:
        cw = 1.0
    return source_trust * property_relevance * rw * pmw * cw


def score_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Compute the bounded deterministic deltas for a single accepted event.

    Mutates and returns the event dict with: eventWeight, liquidityDelta,
    marketabilityDelta, confidenceDelta, timeToLiquidateDeltaPct, riskFlag,
    manualReviewRequired, inspectionRoute, audit.
    """
    out = dict(event)

    if not out.get("accepted"):
        out.update({
            "eventWeight": 0.0,
            "liquidityDelta": 0.0,
            "marketabilityDelta": 0.0,
            "confidenceDelta": 0.0,
            "timeToLiquidateDeltaPct": 0.0,
            "riskFlag": None,
            "manualReviewRequired": False,
            "inspectionRoute": "none",
            "audit": {
                "ruleId": "NEWS_REJECTED",
                "source": out.get("sourceName"),
                "input": f"reason={out.get('rejectionReason')}",
                "formula": "n/a",
                "effect": "all deltas = 0",
                "explanation": f"Event rejected: {out.get('rejectionReason') or 'unknown'}.",
            },
        })
        return out

    out = enrich_property_relevance(out)
    event_type = out.get("eventType") or "neutral_update"
    base = BASE_IMPACTS.get(event_type, BASE_IMPACTS["neutral_update"])
    direction = out.get("direction") or "neutral"
    impact_eligible = (
        bool(out.get("valuationImpactEligible"))
        and float(out.get("valuationRelevanceScore") or 0.0) >= VALUATION_RELEVANCE_FLOOR
    )

    weight = compute_event_weight(out)
    # Treat absolute magnitude of weight as the scaling factor; the SIGN
    # of the impact comes from base impacts (positive/negative eventType).
    scale = abs(weight)
    # However, a delayed/stalled positive project inverts: weight is negative.
    # In that case, flip the sign of positive-direction base impacts.
    if not impact_eligible:
        scaled = {k: 0.0 for k in base}
    elif direction == "positive" and weight < 0:
        scaled = {k: -v * scale for k, v in base.items()}
    else:
        scaled = {k: v * scale for k, v in base.items()}

    # ─── Positive-watchlist suppressor ─────────────────────────────────────
    # A single media-only or local-media-only POSITIVE event should mostly
    # be supporting intelligence, not a meaningful liquidity / marketability
    # mover. We halve its scaled deltas across every metric. Negative-
    # direction watchlist events keep their existing (already corroboration-
    # dampened) impact so legitimate risk signals still surface.
    corroboration_status_pre = (out.get("corroborationStatus") or "official_only")
    is_watchlist_pre = corroboration_status_pre in ("media_only", "local_media_only", "unconfirmed")
    positive_watchlist_suppressed = False
    if is_watchlist_pre and direction == "positive":
        scaled = {k: v * POSITIVE_WATCHLIST_SUPPRESSOR for k, v in scaled.items()}
        positive_watchlist_suppressed = True

    out["eventWeight"]              = round(weight, 4)
    out["liquidityDelta"]           = round(scaled.get("liquidity", 0.0), 4)
    out["marketabilityDelta"]       = round(scaled.get("marketability", 0.0), 4)
    out["confidenceDelta"]          = round(scaled.get("confidence", 0.0), 4)
    out["timeToLiquidateDeltaPct"]  = round(scaled.get("ttl", 0.0), 4)
    out["finalValuationAdjustment"] = {
        "liquidityDelta": out["liquidityDelta"],
        "marketabilityDelta": out["marketabilityDelta"],
        "confidenceDelta": out["confidenceDelta"],
        "timeToLiquidateDeltaPct": out["timeToLiquidateDeltaPct"],
    }

    is_negative = impact_eligible and (
        out["liquidityDelta"] < 0
        or out["confidenceDelta"] < 0
        or out["timeToLiquidateDeltaPct"] > 0
    )

    # Watchlist routing — media-only and local_media_only signals are tagged
    # as watchlist regardless of direction. They contribute their (already
    # corroboration-dampened) deltas but do NOT trigger manual review unless
    # the event is a severe risk type.
    corroboration_status = (out.get("corroborationStatus") or "official_only")
    is_watchlist = corroboration_status in ("media_only", "local_media_only", "unconfirmed")
    SEVERE_RISK_TYPES = {
        "revoked_project", "rera_project_risk", "litigation_redevelopment_risk",
        "environmental_restriction", "flood_warning", "infrastructure_delay",
    }
    severe_risk = event_type in SEVERE_RISK_TYPES

    out["isWatchlist"] = is_watchlist
    out["riskFlag"] = event_type if is_negative else None
    out["manualReviewRequired"] = (
        is_negative
        and INSPECTION_ROUTE.get(event_type) is not None
        and (not is_watchlist or severe_risk)
    )
    out["inspectionRoute"] = INSPECTION_ROUTE.get(event_type, "none") if out["manualReviewRequired"] else "none"

    # Audit ruleId encodes the corroboration/tier so the trail is self-describing.
    if not impact_eligible:
        rule_id = "NEWS_DETECTED_NO_PROPERTY_IMPACT_" + event_type.upper()
    elif is_watchlist:
        rule_id = "NEWS_MEDIA_WATCH_" + event_type.upper()
    elif corroboration_status == "media_corroborated":
        rule_id = "NEWS_CORR_MEDIA_" + event_type.upper()
    elif corroboration_status == "official_plus_media":
        rule_id = "NEWS_OFFICIAL_PLUS_MEDIA_" + event_type.upper()
    else:
        rule_id = "NEWS_OFFICIAL_" + event_type.upper()

    out["audit"] = {
        "ruleId": rule_id,
        "source": out.get("sourceName"),
        "sourceTier": out.get("sourceTier") or "official",
        "corroborationStatus": corroboration_status,
        "input": (
            f"{event_type}, severity={out.get('severity')}, confidence={out.get('confidence')}, "
            f"localityMatchScore={out.get('localityMatchScore')}, "
            f"valuationRelevanceScore={out.get('valuationRelevanceScore')}, "
            f"distanceToPropertyKm={out.get('distanceToPropertyKm')}, "
            f"projectStatus={out.get('projectStatus')}, "
            f"publishedDaysAgo={out.get('publishedDaysAgo')}, "
            f"corroborationWeight={out.get('corroborationWeight')}"
        ),
        "formula": (
            "valuationRelevance = eventSeverity x geographicOverlap x distanceDecay x persistence "
            "x assetRelevance x confidence; impact = baseImpact x sourceTrust x valuationRelevance "
            "x recencyWeight x projectMaturityWeight x corroborationWeight"
        ),
        "effect": (
            f"liquidity {out['liquidityDelta']:+.4f}, "
            f"marketability {out['marketabilityDelta']:+.4f}, "
            f"confidence {out['confidenceDelta']:+.4f}, "
            f"TTL {out['timeToLiquidateDeltaPct']*100:+.2f}%"
            + f" | valuation relevance {float(out.get('valuationRelevanceScore') or 0):.4f}"
            + (" | watchlist" if is_watchlist else "")
        ),
        "explanation": (
            f"{event_type.replace('_', ' ').title()} from {out.get('sourceName')} "
            f"({out.get('sourceTier') or 'official'}, {corroboration_status}). "
            + (
                f"Detected event only: {out.get('impactReason')}"
                if not impact_eligible
                else (
                    f"Applied bounded {'risk' if is_negative else 'growth'} impact. "
                    f"{out.get('impactReason')}"
                    f"{' Watchlist only, no manual review trigger.' if (is_watchlist and not severe_risk) else ''}"
                )
            )
        ),
    }
    return out


def apply_cache_dampener(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Multiply each accepted event's deltas by its tier-based cache dampener.

    Mutates events in place. Returns a list of per-event dampener records (for
    the NEWS_CACHE_DAMPENER_001 audit entry). Should be called exactly once,
    only when the pipeline is serving from cache.
    """
    log: List[Dict[str, Any]] = []
    for ev in events:
        if not ev.get("accepted"):
            continue
        status = ev.get("corroborationStatus") or "official_only"
        mult = CACHE_DAMPENERS.get(status, 0.0)
        event_type = ev.get("eventType") or ""
        if (
            status == "local_media_only"
            and event_type not in SEVERE_RISK_TYPES_FOR_CACHE_DAMPENER
        ):
            mult = 0.0  # watchlist-only; no scoring effect

        before = {
            "liquidityDelta": ev.get("liquidityDelta"),
            "marketabilityDelta": ev.get("marketabilityDelta"),
            "confidenceDelta": ev.get("confidenceDelta"),
            "timeToLiquidateDeltaPct": ev.get("timeToLiquidateDeltaPct"),
        }
        for key in ("liquidityDelta", "marketabilityDelta", "confidenceDelta", "timeToLiquidateDeltaPct"):
            try:
                ev[key] = round(float(ev.get(key) or 0) * mult, 4)
            except (TypeError, ValueError):
                ev[key] = 0.0
        ev["finalValuationAdjustment"] = {
            "liquidityDelta": ev.get("liquidityDelta"),
            "marketabilityDelta": ev.get("marketabilityDelta"),
            "confidenceDelta": ev.get("confidenceDelta"),
            "timeToLiquidateDeltaPct": ev.get("timeToLiquidateDeltaPct"),
        }
        ev["cacheDampener"] = mult

        # Annotate the event's own audit so the trail shows what was dampened
        if ev.get("audit"):
            ev["audit"]["cacheDampener"] = mult
            ev["audit"]["effect"] = f"{ev['audit'].get('effect','')} · cached dampener ×{mult:.2f}"

        log.append({
            "eventId": ev.get("eventId") or ev.get("groupedEventKey"),
            "corroborationStatus": status,
            "multiplier": mult,
            "before": before,
            "after": {
                "liquidityDelta": ev["liquidityDelta"],
                "marketabilityDelta": ev["marketabilityDelta"],
                "confidenceDelta": ev["confidenceDelta"],
                "timeToLiquidateDeltaPct": ev["timeToLiquidateDeltaPct"],
            },
        })
    return log


def aggregate(events: List[Dict[str, Any]], *, relax_positive_caps: bool = False) -> Dict[str, Any]:
    """Sum accepted events' deltas, apply global caps, build the summary block.

    Positive caps default to the *tight* set (max liquidity/marketability +0.05,
    TTL improvement -0.07). When relax_positive_caps=True (live run with at
    least one official-tier accepted event), the wider caps (+0.08 / -0.10)
    apply. Negative caps are constant either way.
    """
    caps = GLOBAL_CAPS_RELAXED if relax_positive_caps else GLOBAL_CAPS_TIGHT
    liquidity = 0.0
    marketability = 0.0
    confidence = 0.0
    ttl = 0.0
    risk_flags: List[str] = []
    review_required = False
    inspection_routes: List[str] = []
    growth = 0
    risk = 0
    neutral = 0
    watchlist_signals: List[Dict[str, Any]] = []
    property_impact_events = 0

    for ev in events:
        if not ev.get("accepted"):
            continue
        impact_eligible = bool(ev.get("valuationImpactEligible"))
        if impact_eligible:
            property_impact_events += 1
        liquidity     += float(ev.get("liquidityDelta") or 0)
        marketability += float(ev.get("marketabilityDelta") or 0)
        confidence    += float(ev.get("confidenceDelta") or 0)
        ttl           += float(ev.get("timeToLiquidateDeltaPct") or 0)
        if ev.get("riskFlag"):
            risk_flags.append(ev["riskFlag"])
            risk += 1
        elif impact_eligible and (ev.get("direction") or "neutral") == "positive":
            growth += 1
        else:
            neutral += 1
        if ev.get("manualReviewRequired"):
            review_required = True
        if ev.get("inspectionRoute") and ev["inspectionRoute"] != "none":
            inspection_routes.append(ev["inspectionRoute"])
        if ev.get("isWatchlist"):
            watchlist_signals.append({
                "eventType": ev.get("eventType"),
                "direction": ev.get("direction"),
                "sourceName": ev.get("sourceName"),
                "sourceTier": ev.get("sourceTier"),
                "corroborationStatus": ev.get("corroborationStatus"),
                "summary": (ev.get("summary") or ev.get("title") or "")[:200],
                "confidence": ev.get("confidence"),
                "localityRelevance": ev.get("localityRelevance"),
                "valuationRelevanceScore": ev.get("valuationRelevanceScore"),
                "impactReason": ev.get("impactReason"),
            })

    pre_caps = {
        "liquidity": liquidity,
        "marketability": marketability,
        "confidence": confidence,
        "ttl": ttl,
    }
    liquidity     = _clamp(liquidity,     *caps["liquidity"])
    marketability = _clamp(marketability, *caps["marketability"])
    confidence    = _clamp(confidence,    *caps["confidence"])
    ttl           = _clamp(ttl,           *caps["ttl"])

    # Pick the most severe inspection route as the headline
    severity_order = {
        "none": 0,
        "field_officer_review": 1,
        "technical_valuer_inspection": 2,
        "senior_credit_review": 3,
        "legal_review": 3,
        "structural_engineer_inspection": 4,
    }
    inspection_route = "none"
    for r in inspection_routes:
        if severity_order.get(r, 0) > severity_order.get(inspection_route, 0):
            inspection_route = r

    # Split positive vs negative cap audit so the trail tells you exactly
    # which direction was clamped (and why the positive ceiling was tight).
    cap_audits: List[Dict[str, Any]] = []
    positive_breached = (
        pre_caps["liquidity"]     > caps["liquidity"][1]     or
        pre_caps["marketability"] > caps["marketability"][1] or
        pre_caps["confidence"]    > caps["confidence"][1]    or
        pre_caps["ttl"]           < caps["ttl"][0]
    )
    negative_breached = (
        pre_caps["liquidity"]     < caps["liquidity"][0]     or
        pre_caps["marketability"] < caps["marketability"][0] or
        pre_caps["confidence"]    < caps["confidence"][0]    or
        pre_caps["ttl"]           > caps["ttl"][1]
    )
    cap_band_label = "relaxed (live official present)" if relax_positive_caps else "tight (cached or no live official)"
    if positive_breached:
        cap_audits.append({
            "ruleId": "NEWS_POSITIVE_CAP_001",
            "source": "scoring_engine",
            "input": f"pre={pre_caps}, caps={cap_band_label}",
            "effect": str({
                "liquidity": round(liquidity, 4),
                "marketability": round(marketability, 4),
                "confidence": round(confidence, 4),
                "ttl": round(ttl, 4),
            }),
            "explanation": (
                "Aggregate positive locality-news effects clamped to the "
                f"{cap_band_label} positive ceilings. "
                "Live official-confirmed events would relax these caps."
            ),
        })
    if negative_breached:
        cap_audits.append({
            "ruleId": "NEWS_NEGATIVE_CAP_001",
            "source": "scoring_engine",
            "input": f"pre={pre_caps}",
            "effect": str({
                "liquidity": round(liquidity, 4),
                "marketability": round(marketability, 4),
                "confidence": round(confidence, 4),
                "ttl": round(ttl, 4),
            }),
            "explanation": "Aggregate negative locality-news effects clamped to the negative-risk floor.",
        })
    cap_audit = cap_audits[0] if cap_audits else None  # back-compat

    return {
        "liquidityDelta":           round(liquidity, 4),
        "marketabilityDelta":       round(marketability, 4),
        "confidenceDelta":          round(confidence, 4),
        "timeToLiquidateDeltaPct":  round(ttl, 4),
        "preCapDeltas": {
            "liquidityDelta":           round(pre_caps["liquidity"], 4),
            "marketabilityDelta":       round(pre_caps["marketability"], 4),
            "confidenceDelta":          round(pre_caps["confidence"], 4),
            "timeToLiquidateDeltaPct":  round(pre_caps["ttl"], 4),
        },
        "capPolicy": {
            "band":                cap_band_label,
            "relaxPositiveCaps":   bool(relax_positive_caps),
            "positiveCaps":        {
                "liquidity":     caps["liquidity"][1],
                "marketability": caps["marketability"][1],
                "ttl":           caps["ttl"][0],
            },
        },
        "riskFlags":                risk_flags,
        "manualReviewRequired":     review_required,
        "inspectionRoute":          inspection_route,
        "growthSignals":            growth,
        "riskSignals":              risk,
        "neutralSignals":           neutral,
        "watchlistSignals":         watchlist_signals,
        "propertyImpactEvents":      property_impact_events,
        "capAudits":                cap_audits,
        "capAudit":                 cap_audit,
    }
