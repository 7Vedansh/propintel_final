"""Orchestrator: live fetch → match → extract → validate → score → cache.

This is the only module main.py imports for the endpoint. Every failure is
trapped and converted to a safe response so the core valuation pipeline can
never be taken down by a flaky source.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from loguru import logger

from . import cache
from .corroboration import (
    annotate_corroboration,
    corroboration_counts,
    source_tier_counts,
)
from .scoring import aggregate, apply_cache_dampener, score_event
from .property_relevance import enrich_property_relevance
from .source_registry import enabled_sources, get_source
from .validator import validate_event


def _bucket_rejection(reason: Optional[str]) -> str:
    """Map a raw validator rejectionReason into one of the user-facing buckets
    surfaced in the Live Scan Diagnostics panel."""
    if not reason:
        return "other"
    r = str(reason).lower()
    if "locality_relevance_below_threshold" in r or "no_property_geography_signal" in r:
        return "weak_locality_relevance"
    if "confidence_below_threshold" in r:
        return "low_confidence"
    if r.startswith("missing_evidence") or "evidence_not_in_source_text" in r:
        return "missing_evidence_quote"
    if "event_type_irrelevant" in r or "event_type_not_allowed" in r:
        return "irrelevant_event_type"
    if (
        "source_url_not_whitelisted" in r
        or "missing_source_trust" in r
        or "host_not_in_whitelist" in r
    ):
        return "unsupported_source"
    return "other"


def _empty_rejection_bucket_counts() -> Dict[str, int]:
    return {
        "weak_locality_relevance": 0,
        "low_confidence": 0,
        "missing_evidence_quote": 0,
        "irrelevant_event_type": 0,
        "unsupported_source": 0,
        "other": 0,
    }


def _compute_live_diagnostics(
    scored: List[Dict[str, Any]],
    source_statuses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build the Live Scan Diagnostics block from the live extraction pass.

    `scored` is the list of events produced by the live fetch+extract+validate
    pipeline for this run (NOT the cached events). Diagnostics are stable even
    when the run falls back to cache: they describe what live actually did.
    """
    docs_fetched_total = sum(int(s.get("documentsFetched") or 0) for s in source_statuses)
    accepted_events = [e for e in scored if e.get("accepted")]
    rejected_events = [e for e in scored if not e.get("accepted")]

    rejection_counts = _empty_rejection_bucket_counts()
    for ev in rejected_events:
        bucket = _bucket_rejection(ev.get("rejectionReason"))
        rejection_counts[bucket] = rejection_counts.get(bucket, 0) + 1

    per_source: List[Dict[str, Any]] = []
    for s in source_statuses:
        name = s.get("sourceName") or "Unknown"
        fetched = int(s.get("documentsFetched") or 0)
        s_accepted = sum(1 for e in accepted_events if e.get("sourceName") == name)
        s_rejected_explicit = sum(1 for e in rejected_events if e.get("sourceName") == name)
        # "rejected" from a lender's POV = fetched but didn't survive (either
        # explicitly rejected by the validator, OR no event extracted at all).
        per_source.append({
            "sourceName": name,
            "sourceTier": s.get("sourceTier"),
            "status": s.get("status"),
            "fetched": fetched,
            "accepted": s_accepted,
            "rejected": max(0, fetched - s_accepted),
            "explicitlyRejected": s_rejected_explicit,
        })

    return {
        "liveDocumentsFetched":   docs_fetched_total,
        "liveDocumentsAccepted":  len(accepted_events),
        "liveDocumentsRejected":  max(0, docs_fetched_total - len(accepted_events)),
        "explicitlyRejectedEvents": len(rejected_events),
        "rejectionReasonCounts":  rejection_counts,
        "perSourceCounts":        per_source,
    }


def _has_live_official_event(scored_events: List[Dict[str, Any]]) -> bool:
    """True if any accepted event in this LIVE run has an official-tier
    corroboration status (official_only or official_plus_media)."""
    for ev in scored_events:
        if not ev.get("accepted"):
            continue
        status = ev.get("corroborationStatus") or ""
        if status in ("official_only", "official_plus_media"):
            return True
    return False


def _build_cache_dampener_audit(log: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Summary audit entry covering the per-event cache dampener pass."""
    by_status: Dict[str, int] = {}
    for entry in log:
        s = entry.get("corroborationStatus") or "unknown"
        by_status[s] = by_status.get(s, 0) + 1
    return {
        "ruleId": "NEWS_CACHE_DAMPENER_001",
        "source": "scoring_engine",
        "input": f"cached events dampened by tier: {by_status}",
        "formula": "per-event multiplier: official 0.75, media_corroborated 0.40, media_only 0.40, local_media_only 0.20 (0.00 unless severe)",
        "effect": f"{len(log)} cached event(s) had their deltas dampened before aggregation",
        "explanation": (
            "Cache-fallback events are dampened before aggregation so cached-only "
            "intelligence cannot match the strength of a live official-confirmed scan. "
            "Live official-tier events would skip this dampener."
        ),
    }


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_response(
    locality: str,
    micro_market_id: Optional[str],
    status: str,
    source_statuses: List[Dict[str, Any]],
    note: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "source": "live_whitelisted_sources",
        "status": status,
        "microMarketId": micro_market_id,
        "locality": locality,
        "eventsFound": 0,
        "acceptedEvents": 0,
        "rejectedEvents": 0,
        "growthSignals": 0,
        "riskSignals": 0,
        "neutralSignals": 0,
        "propertyImpactEvents": 0,
        "liquidityDelta": 0,
        "marketabilityDelta": 0,
        "confidenceDelta": 0,
        "timeToLiquidateDeltaPct": 0,
        "manualReviewRequired": False,
        "inspectionRoute": "none",
        "riskFlags": [],
        "sourceTierCounts": {"official": 0, "reputed_media": 0, "local_media": 0},
        "corroborationCounts": {
            "official_only": 0, "official_plus_media": 0,
            "media_corroborated": 0, "media_only": 0,
            "local_media_only": 0, "unconfirmed": 0,
        },
        "watchlistSignals": [],
        "events": [],
        "auditTrail": [{
            "ruleId": "NEWS_NO_IMPACT",
            "source": "pipeline",
            "input": status,
            "effect": "all deltas = 0",
            "explanation": note or "No accepted locality events; core valuation unaffected.",
        }],
        "sourceStatuses": source_statuses or [{
            "sourceName": s.sourceName,
            "sourceTier": s.sourceTier,
            "status": "skipped",
            "documentsFetched": 0,
        } for s in enabled_sources()],
        "generatedAt": _utc_now_iso(),
    }


def _document_to_locality_context(
    doc_text: str,
    locality: str,
    aliases: List[str],
    zone: Optional[str],
    city: Optional[str],
):
    from .locality_matcher import match_document_to_locality

    match = match_document_to_locality(
        doc_text,
        locality=locality,
        aliases=aliases,
        zone=zone,
        city=city,
    )
    return match


def _published_days_ago(doc: FetchedDocument) -> int:
    # We don't have reliable published dates from index scrapes. Use the
    # fetched timestamp as a proxy ('just published') for live-scraped docs;
    # cached events carry their own publishedDaysAgo.
    return 1


def _build_event_for_document(
    doc: FetchedDocument,
    locality: str,
    aliases: List[str],
    zone: Optional[str],
    city: Optional[str],
    micro_market_id: Optional[str],
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Run matcher → extractor → validator for one document. Returns event or None."""
    from .fetcher import fetched_document_to_dict
    from .llm_extractor import extract_event

    doc_text = (doc.title or "") + "\n" + (doc.body or "")
    match = _document_to_locality_context(doc_text, locality, aliases, zone, city)

    locality_ctx = {
        "locality": locality,
        "city": city,
        "zone": zone,
        "aliases": aliases,
    }
    extracted = extract_event(fetched_document_to_dict(doc), locality_ctx)
    if not extracted:
        return None

    # Stamp matcher-derived locality relevance + matched terms
    extracted["localityRelevance"] = max(
        float(extracted.get("localityRelevance") or 0.0),
        float(match.relevance),
    )
    extracted["_matchReason"] = match.matchReason
    extracted["_matchedTerms"] = match.matchedTerms
    extracted["localityMatchType"] = match.matchType
    extracted["localityMatchScore"] = match.relevance
    extracted["geographicOverlap"] = match.geographicOverlap
    extracted["distanceToPropertyKm"] = match.distanceToPropertyKm
    extracted["dynamicRadiusKm"] = match.dynamicRadiusKm
    extracted["radiusProfile"] = match.radiusProfile
    extracted["genericCityArticle"] = match.genericCityArticle

    # Stamp source fields
    extracted.setdefault("sourceName", doc.sourceName)
    extracted.setdefault("sourceUrl", doc.url)
    extracted.setdefault("sourceTrust", doc.sourceTrust)
    extracted.setdefault("title", doc.title)

    published_days_ago = _published_days_ago(doc)
    extracted.setdefault("publishedDaysAgo", published_days_ago)

    document_for_validator = {
        "url": doc.url,
        "title": doc.title,
        "body": doc.body,
        "sourceTrust": doc.sourceTrust,
    }
    validated = validate_event(
        extracted,
        document=document_for_validator,
        source_id=doc.sourceId,
        published_days_ago=published_days_ago,
    )
    validated = enrich_property_relevance(validated, {
        "locality": locality,
        "city": city,
        "zone": zone,
        "lat": lat,
        "lon": lon,
    })
    return validated


def _run_live_pipeline(
    locality: str,
    micro_market_id: Optional[str],
    city: Optional[str],
    zone: Optional[str],
    aliases: List[str],
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    """Execute the full live pipeline. Cache fallback decided by caller."""
    from .fetcher import fetch_all_sources

    documents, source_statuses = fetch_all_sources(max_documents_per_source=5)

    events: List[Dict[str, Any]] = []

    # Aggregate documents by source to reduce LLM calls
    from collections import defaultdict
    by_source = defaultdict(list)
    for doc in documents:
        by_source[doc.sourceName].append(doc)

    for source_name, source_docs in by_source.items():
        if not source_docs: continue

        # Combine texts from the same source
        combined_title = " | ".join(d.title or "" for d in source_docs)
        combined_body = "\n\n".join(d.body or "" for d in source_docs)

        rep_doc = source_docs[0]
        # create a synthetic document for extraction to avoid 1 Ollama call per scraped article
        import copy
        agg_doc = copy.copy(rep_doc)
        agg_doc.title = combined_title[:500]
        agg_doc.body = combined_body[:5500]

        try:
            ev = _build_event_for_document(agg_doc, locality, aliases, zone, city, micro_market_id, lat, lon)
            if ev:
                ev["microMarketId"] = micro_market_id
                ev["locality"] = locality
                ev["city"] = city
                ev["zone"] = zone
                events.append(ev)
        except Exception as exc:
            logger.warning(f"Event build failed for {agg_doc.url}: {exc}")
            continue

    # Corroboration runs AFTER validation, BEFORE scoring — so scoring sees the
    # corroborationWeight in the eventWeight formula.
    annotate_corroboration(events)

    # Score every event (rejected events get all-zero deltas + audit)
    scored = [score_event(e) for e in events]
    # Live runs: relax positive caps only when at least one accepted event is
    # official-tier; cached fallback is never relaxed.
    relax = _has_live_official_event(scored)
    summary = aggregate(scored, relax_positive_caps=relax)
    tier_counts = source_tier_counts(scored)
    corr_counts = corroboration_counts(scored)

    audit_trail: List[Dict[str, Any]] = []
    for ev in scored:
        if ev.get("audit"):
            audit_trail.append(ev["audit"])
    for entry in summary.get("capAudits") or []:
        audit_trail.append(entry)

    accepted = [e for e in scored if e.get("accepted")]
    rejected = [e for e in scored if not e.get("accepted")]

    # Persist accepted events to cache for future cold runs
    try:
        if accepted and micro_market_id:
            cache.write_events_batch(accepted)
    except Exception as exc:
        logger.warning(f"Cache write failed: {exc}")

    status = "completed" if accepted else (
        "completed_no_accepted_events" if documents else "live_unavailable_no_cached_events"
    )

    return {
        "source": "live_whitelisted_sources",
        "status": status,
        "microMarketId": micro_market_id,
        "locality": locality,
        "eventsFound": len(scored),
        "acceptedEvents": len(accepted),
        "rejectedEvents": len(rejected),
        "growthSignals": summary["growthSignals"],
        "riskSignals": summary["riskSignals"],
        "neutralSignals": summary["neutralSignals"],
        "liquidityDelta": summary["liquidityDelta"],
        "marketabilityDelta": summary["marketabilityDelta"],
        "confidenceDelta": summary["confidenceDelta"],
        "timeToLiquidateDeltaPct": summary["timeToLiquidateDeltaPct"],
        "manualReviewRequired": summary["manualReviewRequired"],
        "inspectionRoute": summary["inspectionRoute"],
        "riskFlags": summary["riskFlags"],
        "sourceTierCounts": tier_counts,
        "corroborationCounts": corr_counts,
        "watchlistSignals": summary.get("watchlistSignals", []),
        "propertyImpactEvents": summary.get("propertyImpactEvents", 0),
        "preCapDeltas": summary.get("preCapDeltas"),
        "capPolicy": summary.get("capPolicy"),
        "cacheDampenerApplied": False,
        "runMode": "live",
        "diagnostics": _compute_live_diagnostics(scored, source_statuses),
        "events": scored,
        "auditTrail": audit_trail,
        "sourceStatuses": source_statuses,
        "generatedAt": _utc_now_iso(),
    }


def _build_from_cached_events(
    locality: str,
    micro_market_id: Optional[str],
    city: Optional[str],
    zone: Optional[str],
    source_statuses: List[Dict[str, Any]],
    live_diagnostics: Optional[Dict[str, Any]] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> Dict[str, Any]:
    """Build response from cached events only — same scoring path, no fetch.

    `live_diagnostics`, if provided, is the diagnostics block from the live
    attempt that just failed to yield accepted events. We pass it through so
    the UI can still tell the user what live actually did.
    """
    events = cache.get_cached_events_for_micro_market(micro_market_id or "", only_accepted=True)
    if not events:
        empty = _empty_response(
            locality, micro_market_id, "live_unavailable_no_cached_events", source_statuses,
            "Live sources unavailable and no cached events for this micro-market."
        )
        if live_diagnostics:
            empty["diagnostics"] = live_diagnostics
        return empty

    # Re-run corroboration on cached events so persisted status reflects the
    # current cache contents (e.g. media events added later that corroborate
    # an older official event).
    for e in events:
        e.setdefault("accepted", True)
        e.setdefault("city", city)
        e.setdefault("zone", zone)
        e.setdefault("locality", locality)
        e.update(enrich_property_relevance(e, {
            "locality": locality,
            "city": city,
            "zone": zone,
            "lat": lat,
            "lon": lon,
        }))
    annotate_corroboration(events)

    rescored: List[Dict[str, Any]] = [score_event(e) for e in events]
    # Cached runs are never allowed to hit the relaxed positive caps AND each
    # event gets a tier-based dampener applied to its scored deltas BEFORE
    # aggregation.
    dampener_log = apply_cache_dampener(rescored)
    summary = aggregate(rescored, relax_positive_caps=False)
    tier_counts = source_tier_counts(rescored)
    corr_counts = corroboration_counts(rescored)
    audit_trail = [e["audit"] for e in rescored if e.get("audit")]
    if dampener_log:
        audit_trail.append(_build_cache_dampener_audit(dampener_log))
    for entry in summary.get("capAudits") or []:
        audit_trail.append(entry)

    return {
        "source": "live_whitelisted_sources",
        "status": "live_unavailable_cached",
        "microMarketId": micro_market_id,
        "locality": locality,
        "eventsFound": len(rescored),
        "acceptedEvents": len(rescored),
        "rejectedEvents": 0,
        "growthSignals": summary["growthSignals"],
        "riskSignals": summary["riskSignals"],
        "neutralSignals": summary["neutralSignals"],
        "liquidityDelta": summary["liquidityDelta"],
        "marketabilityDelta": summary["marketabilityDelta"],
        "confidenceDelta": summary["confidenceDelta"],
        "timeToLiquidateDeltaPct": summary["timeToLiquidateDeltaPct"],
        "manualReviewRequired": summary["manualReviewRequired"],
        "inspectionRoute": summary["inspectionRoute"],
        "riskFlags": summary["riskFlags"],
        "sourceTierCounts": tier_counts,
        "corroborationCounts": corr_counts,
        "watchlistSignals": summary.get("watchlistSignals", []),
        "propertyImpactEvents": summary.get("propertyImpactEvents", 0),
        "preCapDeltas": summary.get("preCapDeltas"),
        "capPolicy": summary.get("capPolicy"),
        "cacheDampenerApplied": bool(dampener_log),
        "runMode": "cache",
        "diagnostics": live_diagnostics or {
            "liveDocumentsFetched": sum(int(s.get("documentsFetched") or 0) for s in source_statuses),
            "liveDocumentsAccepted": 0,
            "liveDocumentsRejected": sum(int(s.get("documentsFetched") or 0) for s in source_statuses),
            "explicitlyRejectedEvents": 0,
            "rejectionReasonCounts": _empty_rejection_bucket_counts(),
            "perSourceCounts": [
                {
                    "sourceName": s.get("sourceName"),
                    "sourceTier": s.get("sourceTier"),
                    "status": s.get("status"),
                    "fetched": int(s.get("documentsFetched") or 0),
                    "accepted": 0,
                    "rejected": int(s.get("documentsFetched") or 0),
                    "explicitlyRejected": 0,
                }
                for s in source_statuses
            ],
        },
        "events": rescored,
        "auditTrail": audit_trail,
        "sourceStatuses": source_statuses,
        "generatedAt": _utc_now_iso(),
    }


async def run_locality_intelligence(
    locality: str,
    micro_market_id: Optional[str],
    city: Optional[str],
    zone: Optional[str],
    lat: Optional[float],
    lon: Optional[float],
    aliases: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Public async entry point. Never raises — always returns a safe payload.

    Respects two env toggles:
      - ENABLE_LIVE_LOCALITY_SCAN=false → skip live scrape, go straight to cache.
      - ENABLE_LOCALITY_CACHE=false     → never read from cache (live-only).
    Both default to true.
    """
    from backend.config import settings  # local import — avoid module-load order issues

    locality = (locality or "").strip()
    alias_pool: List[str] = []

    # The underwriting screen must not depend on external sites being fast.
    # Seed and serve the scored cache first when available; live-only markets
    # still get a short bounded scan below.
    if settings.ENABLE_LOCALITY_CACHE:
        try:
            from .seed import seed_locality_events_if_empty

            await asyncio.to_thread(seed_locality_events_if_empty)
            cached = await asyncio.to_thread(
                _build_from_cached_events, locality, micro_market_id, city, zone, [], None, lat, lon
            )
            if cached and cached.get("acceptedEvents", 0) > 0:
                cached["status"] = "cached_baseline"
                cached["runMode"] = "cache"
                cached["auditTrail"].append({
                    "ruleId": "NEWS_CACHE_FIRST_001",
                    "source": "pipeline",
                    "input": "validated cached locality events available",
                    "effect": "served scored locality baseline without blocking on external websites",
                    "explanation": (
                        "Validated cached locality events were served immediately so the "
                        "underwriting flow remains responsive and auditable."
                    ),
                })
                return cached
        except Exception as exc:
            logger.warning(f"Cache-first locality baseline unavailable: {exc}", exc_info=True)

    result: Optional[Dict[str, Any]] = None
    if settings.ENABLE_LIVE_LOCALITY_SCAN:
        try:
            from .locality_matcher import build_alias_pool

            alias_pool = build_alias_pool(locality, aliases)
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    _run_live_pipeline, locality, micro_market_id, city, zone, alias_pool, lat, lon
                ),
                timeout=max(1, settings.LOCALITY_LIVE_SCAN_TIMEOUT_SECONDS),
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Live locality pipeline exceeded {}s; using safe fallback.",
                settings.LOCALITY_LIVE_SCAN_TIMEOUT_SECONDS,
            )
            result = None
        except Exception as exc:
            logger.warning(f"Live locality pipeline crashed: {exc}", exc_info=True)
            result = None
    else:
        logger.info("ENABLE_LIVE_LOCALITY_SCAN=false; skipping live fetch.")

    # If live yielded nothing accepted, fall back to cache (unless disabled).
    if result is None or (
        result.get("acceptedEvents", 0) == 0
        and result.get("status") in ("completed_no_accepted_events", "live_unavailable_no_cached_events")
    ):
        if not settings.ENABLE_LOCALITY_CACHE:
            logger.info("ENABLE_LOCALITY_CACHE=false; not consulting cache fallback.")
            statuses = (result or {}).get("sourceStatuses", [])
            empty = _empty_response(
                locality, micro_market_id,
                "live_unavailable_no_cached_events",
                statuses,
                "Cache fallback disabled by ENABLE_LOCALITY_CACHE=false; live run yielded no accepted events.",
            )
            if (result or {}).get("diagnostics"):
                empty["diagnostics"] = result["diagnostics"]
            return empty
        try:
            statuses = (result or {}).get("sourceStatuses", [])
            live_diagnostics = (result or {}).get("diagnostics")
            cached = await asyncio.to_thread(
                _build_from_cached_events, locality, micro_market_id, city, zone, statuses, live_diagnostics, lat, lon
            )
            if cached and cached.get("acceptedEvents", 0) > 0:
                return cached
            # No cached either — return safe empty
            return cached if cached else _empty_response(
                locality, micro_market_id, "live_unavailable_no_cached_events", statuses,
            )
        except Exception as exc:
            logger.warning(f"Cache fallback crashed: {exc}", exc_info=True)
            return _empty_response(
                locality, micro_market_id, "live_unavailable_no_cached_events", [],
            )

    return result
