"""SQLite cache for accepted locality events (official + media + watchlist).

Idempotent in-place migration for new columns so existing databases don't need
to be reseeded after this feature lands.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.db.sqlite import get_connection, schema_path


# Columns we expect on the cache table beyond the original Phase-1 set.
EXTRA_COLUMNS: Dict[str, str] = {
    "source_tier":           "TEXT",
    "corroboration_status":  "TEXT",
    "corroboration_weight":  "REAL",
    "matched_group_id":      "TEXT",
    "grouped_event_key":     "TEXT",
    "is_watchlist":          "INTEGER DEFAULT 0",
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_extra_columns(conn: sqlite3.Connection) -> None:
    """Run idempotent ALTER TABLE ADD COLUMN for any new columns we need."""
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(locality_event_cache)").fetchall()}
    except sqlite3.OperationalError:
        # Table missing entirely — let schema.sql handle creation elsewhere.
        return
    for name, decl in EXTRA_COLUMNS.items():
        if name in cols:
            continue
        try:
            conn.execute(f"ALTER TABLE locality_event_cache ADD COLUMN {name} {decl}")
        except sqlite3.OperationalError:
            # Already there or unsupported; safe to ignore.
            pass


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(schema_path().read_text(encoding="utf-8"))
    _ensure_extra_columns(conn)


def _row_to_event(row: sqlite3.Row) -> Dict[str, Any]:
    d = dict(row)
    audit = {}
    try:
        if d.get("audit_json"):
            audit = json.loads(d["audit_json"])
    except Exception:
        audit = {}
    return {
        "eventId": d.get("event_id"),
        "microMarketId": d.get("micro_market_id"),
        "locality": d.get("locality_name"),
        "city": d.get("city"),
        "zone": d.get("zone"),
        "sourceName": d.get("source_name"),
        "sourceUrl": d.get("source_url"),
        "sourceTrust": d.get("source_trust"),
        "sourceTier": d.get("source_tier") or "official",
        "corroborationStatus": d.get("corroboration_status"),
        "corroborationWeight": d.get("corroboration_weight"),
        "matchedGroupId": d.get("matched_group_id"),
        "groupedEventKey": d.get("grouped_event_key"),
        "isWatchlist": bool(d.get("is_watchlist") or 0),
        "title": d.get("title"),
        "summary": d.get("summary"),
        "eventType": d.get("event_type"),
        "direction": d.get("direction"),
        "impactArea": d.get("impact_area"),
        "severity": d.get("severity"),
        "confidence": d.get("confidence"),
        "localityRelevance": d.get("locality_relevance"),
        "project": d.get("project"),
        "projectStatus": d.get("project_status"),
        "expectedCompletionMonths": d.get("expected_completion_months"),
        "publishedDaysAgo": d.get("published_days_ago"),
        "publishedDate": d.get("published_date"),
        "evidence": d.get("evidence"),
        "eventWeight": d.get("event_weight"),
        "liquidityDelta": d.get("liquidity_delta"),
        "marketabilityDelta": d.get("marketability_delta"),
        "confidenceDelta": d.get("confidence_delta"),
        "timeToLiquidateDeltaPct": d.get("time_to_liquidate_delta_pct"),
        "riskFlag": d.get("risk_flag"),
        "manualReviewRequired": bool(d.get("manual_review_required")),
        "inspectionRoute": d.get("inspection_route"),
        "accepted": bool(d.get("accepted")),
        "rejectionReason": d.get("rejection_reason"),
        "createdAt": d.get("created_at"),
        "fetchedAt": d.get("fetched_at"),
        "audit": audit,
    }


def make_event_id(source_id: str, source_url: str, title: str) -> str:
    raw = f"{source_id}|{source_url}|{title}".encode("utf-8", errors="ignore")
    return "evt-" + hashlib.sha1(raw).hexdigest()[:16]


def upsert_event(conn: sqlite3.Connection, event: Dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT INTO locality_event_cache (
            event_id, micro_market_id, locality_name, city, zone,
            source_name, source_url, source_trust, source_tier,
            corroboration_status, corroboration_weight,
            matched_group_id, grouped_event_key, is_watchlist,
            title, summary, event_type, direction, impact_area,
            severity, confidence, locality_relevance,
            project, project_status, expected_completion_months,
            published_days_ago, published_date, evidence,
            event_weight, liquidity_delta, marketability_delta, confidence_delta,
            time_to_liquidate_delta_pct, risk_flag, manual_review_required,
            inspection_route, accepted, rejection_reason,
            created_at, fetched_at, raw_doc_hash, audit_json
        ) VALUES (
            :event_id, :micro_market_id, :locality_name, :city, :zone,
            :source_name, :source_url, :source_trust, :source_tier,
            :corroboration_status, :corroboration_weight,
            :matched_group_id, :grouped_event_key, :is_watchlist,
            :title, :summary, :event_type, :direction, :impact_area,
            :severity, :confidence, :locality_relevance,
            :project, :project_status, :expected_completion_months,
            :published_days_ago, :published_date, :evidence,
            :event_weight, :liquidity_delta, :marketability_delta, :confidence_delta,
            :time_to_liquidate_delta_pct, :risk_flag, :manual_review_required,
            :inspection_route, :accepted, :rejection_reason,
            :created_at, :fetched_at, :raw_doc_hash, :audit_json
        )
        ON CONFLICT(event_id) DO UPDATE SET
            source_tier = excluded.source_tier,
            corroboration_status = excluded.corroboration_status,
            corroboration_weight = excluded.corroboration_weight,
            matched_group_id = excluded.matched_group_id,
            grouped_event_key = excluded.grouped_event_key,
            is_watchlist = excluded.is_watchlist,
            event_weight = excluded.event_weight,
            liquidity_delta = excluded.liquidity_delta,
            marketability_delta = excluded.marketability_delta,
            confidence_delta = excluded.confidence_delta,
            time_to_liquidate_delta_pct = excluded.time_to_liquidate_delta_pct,
            risk_flag = excluded.risk_flag,
            manual_review_required = excluded.manual_review_required,
            inspection_route = excluded.inspection_route,
            accepted = excluded.accepted,
            rejection_reason = excluded.rejection_reason,
            fetched_at = excluded.fetched_at,
            audit_json = excluded.audit_json
        """,
        {
            "event_id": event.get("eventId") or make_event_id(
                event.get("sourceName") or "", event.get("sourceUrl") or "", event.get("title") or ""
            ),
            "micro_market_id": event.get("microMarketId"),
            "locality_name": event.get("locality"),
            "city": event.get("city"),
            "zone": event.get("zone"),
            "source_name": event.get("sourceName"),
            "source_url": event.get("sourceUrl"),
            "source_trust": event.get("sourceTrust"),
            "source_tier": event.get("sourceTier") or "official",
            "corroboration_status": event.get("corroborationStatus"),
            "corroboration_weight": event.get("corroborationWeight"),
            "matched_group_id": event.get("matchedGroupId"),
            "grouped_event_key": event.get("groupedEventKey"),
            "is_watchlist": 1 if event.get("isWatchlist") else 0,
            "title": event.get("title"),
            "summary": event.get("summary"),
            "event_type": event.get("eventType"),
            "direction": event.get("direction"),
            "impact_area": event.get("impactArea"),
            "severity": event.get("severity"),
            "confidence": event.get("confidence"),
            "locality_relevance": event.get("localityRelevance"),
            "project": event.get("project"),
            "project_status": event.get("projectStatus"),
            "expected_completion_months": event.get("expectedCompletionMonths"),
            "published_days_ago": event.get("publishedDaysAgo"),
            "published_date": event.get("publishedDate"),
            "evidence": event.get("evidence"),
            "event_weight": event.get("eventWeight"),
            "liquidity_delta": event.get("liquidityDelta"),
            "marketability_delta": event.get("marketabilityDelta"),
            "confidence_delta": event.get("confidenceDelta"),
            "time_to_liquidate_delta_pct": event.get("timeToLiquidateDeltaPct"),
            "risk_flag": event.get("riskFlag"),
            "manual_review_required": 1 if event.get("manualReviewRequired") else 0,
            "inspection_route": event.get("inspectionRoute"),
            "accepted": 1 if event.get("accepted") else 0,
            "rejection_reason": event.get("rejectionReason"),
            "created_at": event.get("createdAt") or _utc_now_iso(),
            "fetched_at": event.get("fetchedAt") or _utc_now_iso(),
            "raw_doc_hash": event.get("rawDocHash"),
            "audit_json": json.dumps(event.get("audit") or {}, ensure_ascii=False),
        },
    )


def get_cached_events_for_micro_market(
    micro_market_id: str,
    max_age_days: int = 180,
    only_accepted: bool = True,
) -> List[Dict[str, Any]]:
    if not micro_market_id:
        return []
    sql = "SELECT * FROM locality_event_cache WHERE micro_market_id = ?"
    params: List[Any] = [micro_market_id]
    if only_accepted:
        sql += " AND accepted = 1"
    sql += " ORDER BY fetched_at DESC LIMIT 60"
    with get_connection() as conn:
        _ensure_schema(conn)
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_event(r) for r in rows]


def cache_has_any_events() -> bool:
    with get_connection() as conn:
        _ensure_schema(conn)
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM locality_event_cache"
        ).fetchone()
    return bool(row and row["n"] > 0)


def write_events_batch(events: List[Dict[str, Any]]) -> int:
    if not events:
        return 0
    with get_connection() as conn:
        _ensure_schema(conn)
        for ev in events:
            upsert_event(conn, ev)
        conn.commit()
    return len(events)
