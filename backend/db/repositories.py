"""Repository functions for the local SQLite data foundation."""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from .sqlite import get_connection, get_db_path, schema_path
except ImportError:  # Allows direct script execution during local prototyping.
    from sqlite import get_connection, get_db_path, schema_path


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_json(value: Any) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value, sort_keys=True)


def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict[str, Any]]:
    return dict(row) if row else None


def init_db() -> Path:
    """Create the SQLite database and all tables/indexes if needed."""
    db_path = get_db_path()
    with get_connection(db_path) as conn:
        conn.executescript(schema_path().read_text(encoding="utf-8"))
        conn.commit()
    return db_path


def seed_db() -> dict[str, int]:
    """Initialize and seed deterministic Mumbai prototype data."""
    try:
        from .seed_sqlite import seed_database
    except ImportError:
        from seed_sqlite import seed_database

    return seed_database()


def get_locality_by_micro_market(micro_market_id: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM locality_master WHERE micro_market_id = ?",
            (micro_market_id,),
        ).fetchone()
    return _row_to_dict(row)


def find_nearest_locality(lat: float, lon: float) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM locality_master").fetchall()

    nearest = None
    nearest_distance = math.inf
    for row in rows:
        distance = _haversine_km(lat, lon, row["center_lat"], row["center_lon"])
        if distance < nearest_distance:
            nearest_distance = distance
            nearest = dict(row)

    if nearest is not None:
        nearest["distance_km"] = round(nearest_distance, 3)
    return nearest


def get_market_norms(
    micro_market_id: str,
    property_type: str,
    subtype: str,
) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT *
            FROM market_norms
            WHERE micro_market_id = ?
              AND property_type = ?
              AND subtype = ?
            """,
            (micro_market_id, property_type, subtype),
        ).fetchone()
    return _row_to_dict(row)


def get_market_norms_with_fallback(
    micro_market_id: str,
    property_type: str,
    subtype: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Resolve market norms using the Stage 1 fallback hierarchy."""
    subtype = subtype or ""
    exact = get_market_norms(micro_market_id, property_type, subtype) if subtype else None
    if exact:
        exact["match_level"] = "exact"
        return exact

    queries = [
        (
            "same_micro_market_property_type",
            """
            SELECT *
            FROM market_norms
            WHERE micro_market_id = ?
              AND property_type = ?
            ORDER BY comparable_count DESC
            LIMIT 1
            """,
            (micro_market_id, property_type),
        ),
        (
            "city_property_type_subtype",
            """
            SELECT mn.*
            FROM market_norms mn
            JOIN locality_master lm ON lm.micro_market_id = mn.micro_market_id
            WHERE lm.city = ?
              AND mn.property_type = ?
              AND mn.subtype = ?
            ORDER BY mn.comparable_count DESC
            LIMIT 1
            """,
            ("Mumbai", property_type, subtype),
        ),
        (
            "city_property_type",
            """
            SELECT mn.*
            FROM market_norms mn
            JOIN locality_master lm ON lm.micro_market_id = mn.micro_market_id
            WHERE lm.city = ?
              AND mn.property_type = ?
            ORDER BY mn.comparable_count DESC
            LIMIT 1
            """,
            ("Mumbai", property_type),
        ),
    ]

    with get_connection() as conn:
        for match_level, sql, params in queries:
            if match_level == "city_property_type_subtype" and not subtype:
                continue
            row = conn.execute(sql, params).fetchone()
            if row:
                result = dict(row)
                result["match_level"] = match_level
                return result
    return None


def get_circle_rate(zone_id: str, property_type: str) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                zone_id,
                city,
                NULL AS locality_name,
                property_type,
                AVG(rate_per_sqft) AS rate_per_sqft,
                MAX(effective_year) AS effective_year,
                MIN(source_label) AS source_label,
                COUNT(*) AS locality_count
            FROM circle_rate_master
            WHERE zone_id = ?
              AND property_type = ?
            GROUP BY zone_id, city, property_type
            """,
            (zone_id, property_type),
        ).fetchone()
    return _row_to_dict(row)


def get_circle_rate_with_fallback(zone_id: str, property_type: str) -> Optional[dict[str, Any]]:
    """Resolve circle rates using zone/type first, then broader references."""
    exact = get_circle_rate(zone_id, property_type)
    if exact:
        exact["match_level"] = "exact"
        return exact

    queries = [
        (
            "same_zone_any_property_type",
            """
            SELECT
                zone_id,
                city,
                NULL AS locality_name,
                NULL AS property_type,
                AVG(rate_per_sqft) AS rate_per_sqft,
                MAX(effective_year) AS effective_year,
                MIN(source_label) AS source_label,
                COUNT(*) AS locality_count
            FROM circle_rate_master
            WHERE zone_id = ?
            GROUP BY zone_id, city
            """,
            (zone_id,),
        ),
        (
            "city_property_type",
            """
            SELECT
                NULL AS zone_id,
                city,
                NULL AS locality_name,
                property_type,
                AVG(rate_per_sqft) AS rate_per_sqft,
                MAX(effective_year) AS effective_year,
                MIN(source_label) AS source_label,
                COUNT(*) AS locality_count
            FROM circle_rate_master
            WHERE city = ?
              AND property_type = ?
            GROUP BY city, property_type
            """,
            ("Mumbai", property_type),
        ),
    ]

    with get_connection() as conn:
        for match_level, sql, params in queries:
            row = conn.execute(sql, params).fetchone()
            if row:
                result = dict(row)
                result["match_level"] = match_level
                return result
    return None


def get_historical_cases_by_bucket(
    micro_market_id: str,
    property_type: Optional[str] = None,
    subtype: Optional[str] = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM historical_cases WHERE micro_market_id = ?"
    params: list[Any] = [micro_market_id]

    if property_type:
        sql += " AND property_type = ?"
        params.append(property_type)
    if subtype:
        sql += " AND subtype = ?"
        params.append(subtype)

    sql += " ORDER BY closed_date DESC LIMIT ?"
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def get_historical_case_candidates(
    micro_market_id: Optional[str],
    property_type: Optional[str] = None,
    subtype: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Fetch a bounded candidate pool for historical similarity scoring."""
    candidates: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    queries: list[tuple[str, list[Any]]] = []
    if micro_market_id and property_type and subtype:
        queries.append(
            (
                """
                SELECT *
                FROM historical_cases
                WHERE micro_market_id = ?
                  AND property_type = ?
                  AND subtype = ?
                ORDER BY closed_date DESC
                LIMIT ?
                """,
                [micro_market_id, property_type, subtype, limit],
            )
        )
    if micro_market_id and property_type:
        queries.append(
            (
                """
                SELECT *
                FROM historical_cases
                WHERE micro_market_id = ?
                  AND property_type = ?
                ORDER BY closed_date DESC
                LIMIT ?
                """,
                [micro_market_id, property_type, limit],
            )
        )
    if micro_market_id:
        queries.append(
            (
                """
                SELECT *
                FROM historical_cases
                WHERE micro_market_id = ?
                ORDER BY closed_date DESC
                LIMIT ?
                """,
                [micro_market_id, limit],
            )
        )
    if property_type and subtype:
        queries.append(
            (
                """
                SELECT *
                FROM historical_cases
                WHERE property_type = ?
                  AND subtype = ?
                ORDER BY closed_date DESC
                LIMIT ?
                """,
                [property_type, subtype, limit],
            )
        )
    if property_type:
        queries.append(
            (
                """
                SELECT *
                FROM historical_cases
                WHERE property_type = ?
                ORDER BY closed_date DESC
                LIMIT ?
                """,
                [property_type, limit],
            )
        )

    with get_connection() as conn:
        for sql, params in queries:
            for row in conn.execute(sql, params).fetchall():
                row_dict = dict(row)
                case_id = row_dict.get("historical_case_id")
                if case_id in seen_ids:
                    continue
                seen_ids.add(case_id)
                candidates.append(row_dict)
                if len(candidates) >= limit:
                    return candidates

    return candidates


def get_portfolio_exposure_by_bucket(
    micro_market_id: str,
    property_type: Optional[str] = None,
    subtype: Optional[str] = None,
) -> dict[str, Any]:
    sql = """
        SELECT
            COUNT(*) AS loan_count,
            SUM(outstanding_exposure) AS total_outstanding_exposure,
            SUM(sanctioned_amount) AS total_sanctioned_amount,
            SUM(collateral_value) AS total_collateral_value,
            AVG(current_ltv) AS avg_current_ltv,
            SUM(default_flag) AS default_count
        FROM portfolio_exposure
        WHERE micro_market_id = ?
    """
    params: list[Any] = [micro_market_id]

    if property_type:
        sql += " AND property_type = ?"
        params.append(property_type)
    if subtype:
        sql += " AND subtype = ?"
        params.append(subtype)

    with get_connection() as conn:
        row = conn.execute(sql, params).fetchone()
    result = dict(row) if row else {}
    for key in (
        "total_outstanding_exposure",
        "total_sanctioned_amount",
        "total_collateral_value",
        "avg_current_ltv",
    ):
        result[key] = result[key] or 0
    result["loan_count"] = result.get("loan_count") or 0
    result["default_count"] = result.get("default_count") or 0
    return result


def get_portfolio_concentration_snapshot(
    micro_market_id: Optional[str],
    property_type: Optional[str],
    subtype: Optional[str],
) -> dict[str, Any]:
    """Aggregate active portfolio exposure for concentration risk lenses."""

    def fetch_one(conn: sqlite3.Connection, sql: str, params: list[Any] | tuple[Any, ...] = ()) -> dict[str, Any]:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else {}

    active_filter = "loan_status IS NULL OR loan_status != 'Closed'"
    with get_connection() as conn:
        total = fetch_one(
            conn,
            f"""
            SELECT
                COUNT(*) AS loan_count,
                SUM(outstanding_exposure) AS exposure
            FROM portfolio_exposure
            WHERE {active_filter}
            """,
        )
        micro_market = fetch_one(
            conn,
            f"""
            SELECT
                COUNT(*) AS loan_count,
                SUM(outstanding_exposure) AS exposure
            FROM portfolio_exposure
            WHERE ({active_filter})
              AND micro_market_id = ?
            """,
            (micro_market_id,),
        ) if micro_market_id else {"loan_count": 0, "exposure": 0}
        property_type_row = fetch_one(
            conn,
            f"""
            SELECT
                COUNT(*) AS loan_count,
                SUM(outstanding_exposure) AS exposure
            FROM portfolio_exposure
            WHERE ({active_filter})
              AND property_type = ?
            """,
            (property_type,),
        ) if property_type else {"loan_count": 0, "exposure": 0}
        subtype_row = fetch_one(
            conn,
            f"""
            SELECT
                COUNT(*) AS loan_count,
                SUM(outstanding_exposure) AS exposure
            FROM portfolio_exposure
            WHERE ({active_filter})
              AND property_type = ?
              AND subtype = ?
            """,
            (property_type, subtype),
        ) if property_type and subtype else {"loan_count": 0, "exposure": 0}
        similar_bucket = fetch_one(
            conn,
            f"""
            SELECT
                COUNT(*) AS loan_count,
                SUM(outstanding_exposure) AS exposure,
                SUM(CASE WHEN delinquency_status IS NOT NULL AND delinquency_status != 'Current' THEN 1 ELSE 0 END) AS delinquent_count,
                SUM(CASE WHEN default_flag = 1 THEN 1 ELSE 0 END) AS default_count
            FROM portfolio_exposure
            WHERE ({active_filter})
              AND micro_market_id = ?
              AND property_type = ?
              AND subtype = ?
            """,
            (micro_market_id, property_type, subtype),
        ) if micro_market_id and property_type and subtype else {"loan_count": 0, "exposure": 0, "delinquent_count": 0, "default_count": 0}

    def clean(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "loan_count": row.get("loan_count") or 0,
            "exposure": row.get("exposure") or 0,
            "delinquent_count": row.get("delinquent_count") or 0,
            "default_count": row.get("default_count") or 0,
        }

    return {
        "total": clean(total),
        "micro_market": clean(micro_market),
        "property_type": clean(property_type_row),
        "subtype": clean(subtype_row),
        "similar_bucket": clean(similar_bucket),
    }


def save_case(case_payload: dict[str, Any]) -> str:
    case_id = case_payload.get("case_id")
    if not case_id:
        raise ValueError("case_payload must include case_id")

    created_at = case_payload.get("created_at") or _utc_now()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO cases (
                case_id,
                created_at,
                raw_input_json,
                normalized_profile_json,
                bucket_assignment_json,
                stage2_output_json,
                valuation_summary_json,
                final_decision,
                confidence_score
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(case_id) DO UPDATE SET
                raw_input_json = excluded.raw_input_json,
                normalized_profile_json = excluded.normalized_profile_json,
                bucket_assignment_json = excluded.bucket_assignment_json,
                stage2_output_json = excluded.stage2_output_json,
                valuation_summary_json = excluded.valuation_summary_json,
                final_decision = excluded.final_decision,
                confidence_score = excluded.confidence_score
            """,
            (
                case_id,
                created_at,
                _to_json(case_payload.get("raw_input")),
                _to_json(case_payload.get("normalized_profile")),
                _to_json(case_payload.get("bucket_assignment")),
                _to_json(case_payload.get("stage2_output")),
                _to_json(case_payload.get("valuation_summary")),
                case_payload.get("final_decision"),
                case_payload.get("confidence_score"),
            ),
        )
        conn.commit()
    return case_id


def save_valuation_output(case_id: str, output_payload: dict[str, Any]) -> int:
    created_at = output_payload.get("created_at") or _utc_now()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO valuation_outputs (
                case_id,
                created_at,
                market_value,
                distress_value,
                resale_potential_index,
                time_to_liquidate_days,
                confidence_score,
                historical_adjustment,
                portfolio_penalty,
                output_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                created_at,
                output_payload.get("market_value"),
                output_payload.get("distress_value"),
                output_payload.get("resale_potential_index"),
                output_payload.get("time_to_liquidate_days"),
                output_payload.get("confidence_score"),
                output_payload.get("historical_adjustment"),
                output_payload.get("portfolio_penalty"),
                _to_json(output_payload),
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def save_audit_log(
    case_id: str,
    stage_name: str,
    rule_id: str,
    result: str,
    explanation: str,
    score_contribution: float = 0,
) -> int:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO audit_logs (
                case_id,
                created_at,
                stage_name,
                rule_id,
                input_snapshot_json,
                result,
                score_contribution,
                explanation
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                case_id,
                _utc_now(),
                stage_name,
                rule_id,
                None,
                result,
                score_contribution,
                explanation,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
