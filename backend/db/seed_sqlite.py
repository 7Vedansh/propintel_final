"""Create and seed the local SQLite database for Mumbai prototype data."""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta, timezone
from typing import Any

try:
    from .sqlite import get_connection, get_db_path, schema_path
except ImportError:  # Supports: python backend/db/seed_sqlite.py
    from sqlite import get_connection, get_db_path, schema_path

SEED = 42
BASE_DATE = date(2026, 5, 2)
SOURCE_LABEL = "Seeded reference data for prototype"

LOCALITIES: list[dict[str, Any]] = [
    {
        "micro_market_id": "MM-MUM-ANDHERI-E",
        "locality_name": "Andheri East",
        "pincode": "400069",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Suburbs",
        "broad_land_use": "Mixed residential-commercial",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1136,
        "center_lon": 72.8697,
        "radius_km": 3.2,
        "demand_tier": "High",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 24500,
    },
    {
        "micro_market_id": "MM-MUM-ANDHERI-W",
        "locality_name": "Andheri West",
        "pincode": "400053",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Suburbs",
        "broad_land_use": "Residential with retail high streets",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1364,
        "center_lon": 72.8277,
        "radius_km": 3.0,
        "demand_tier": "High",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 30000,
    },
    {
        "micro_market_id": "MM-MUM-BANDRA-W",
        "locality_name": "Bandra West",
        "pincode": "400050",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Premium",
        "broad_land_use": "Premium residential and retail",
        "regulatory_region": "MCGM Island-Suburban Edge",
        "center_lat": 19.0607,
        "center_lon": 72.8362,
        "radius_km": 2.2,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 56500,
    },
    {
        "micro_market_id": "MM-MUM-BANDRA-E",
        "locality_name": "Bandra East",
        "pincode": "400051",
        "coarse_zone_id": "MUM-CENTRAL-BUSINESS",
        "coarse_zone_label": "BKC Influence Zone",
        "broad_land_use": "Commercial-office with residential pockets",
        "regulatory_region": "MCGM Island-Suburban Edge",
        "center_lat": 19.0622,
        "center_lon": 72.8654,
        "radius_km": 2.6,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 47500,
    },
    {
        "micro_market_id": "MM-MUM-POWAI",
        "locality_name": "Powai",
        "pincode": "400076",
        "coarse_zone_id": "MUM-CENTRAL-SUBURBS",
        "coarse_zone_label": "Central Suburbs",
        "broad_land_use": "Planned residential-office",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1176,
        "center_lon": 72.9060,
        "radius_km": 3.1,
        "demand_tier": "High",
        "liquidity_tier": "High",
        "access_quality": "Good",
        "price_anchor": 33500,
    },
    {
        "micro_market_id": "MM-MUM-GOREGAON-E",
        "locality_name": "Goregaon East",
        "pincode": "400063",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Suburbs",
        "broad_land_use": "Residential-office corridor",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1663,
        "center_lon": 72.8526,
        "radius_km": 3.0,
        "demand_tier": "High",
        "liquidity_tier": "High",
        "access_quality": "Good",
        "price_anchor": 26000,
    },
    {
        "micro_market_id": "MM-MUM-GOREGAON-W",
        "locality_name": "Goregaon West",
        "pincode": "400104",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Suburbs",
        "broad_land_use": "Residential with neighborhood retail",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1649,
        "center_lon": 72.8424,
        "radius_km": 2.7,
        "demand_tier": "Medium-High",
        "liquidity_tier": "High",
        "access_quality": "Good",
        "price_anchor": 24000,
    },
    {
        "micro_market_id": "MM-MUM-MALAD-W",
        "locality_name": "Malad West",
        "pincode": "400064",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Suburbs",
        "broad_land_use": "Residential with retail malls",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1874,
        "center_lon": 72.8484,
        "radius_km": 3.2,
        "demand_tier": "Medium-High",
        "liquidity_tier": "High",
        "access_quality": "Good",
        "price_anchor": 22000,
    },
    {
        "micro_market_id": "MM-MUM-BORIVALI-W",
        "locality_name": "Borivali West",
        "pincode": "400092",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Outer Western Suburbs",
        "broad_land_use": "Residential",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.2307,
        "center_lon": 72.8567,
        "radius_km": 3.4,
        "demand_tier": "Medium-High",
        "liquidity_tier": "Medium-High",
        "access_quality": "Good",
        "price_anchor": 20500,
    },
    {
        "micro_market_id": "MM-MUM-CHEMBUR",
        "locality_name": "Chembur",
        "pincode": "400071",
        "coarse_zone_id": "MUM-HARBOUR",
        "coarse_zone_label": "Harbour Suburbs",
        "broad_land_use": "Residential with commercial nodes",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.0522,
        "center_lon": 72.9005,
        "radius_km": 3.0,
        "demand_tier": "High",
        "liquidity_tier": "Medium-High",
        "access_quality": "Good",
        "price_anchor": 27500,
    },
    {
        "micro_market_id": "MM-MUM-GHATKOPAR-E",
        "locality_name": "Ghatkopar East",
        "pincode": "400077",
        "coarse_zone_id": "MUM-CENTRAL-SUBURBS",
        "coarse_zone_label": "Central Suburbs",
        "broad_land_use": "Residential-retail transit node",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.0790,
        "center_lon": 72.9080,
        "radius_km": 2.7,
        "demand_tier": "High",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 28500,
    },
    {
        "micro_market_id": "MM-MUM-MULUND-W",
        "locality_name": "Mulund West",
        "pincode": "400080",
        "coarse_zone_id": "MUM-CENTRAL-SUBURBS",
        "coarse_zone_label": "Outer Central Suburbs",
        "broad_land_use": "Residential",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1726,
        "center_lon": 72.9425,
        "radius_km": 3.2,
        "demand_tier": "Medium-High",
        "liquidity_tier": "Medium-High",
        "access_quality": "Good",
        "price_anchor": 21500,
    },
    {
        "micro_market_id": "MM-MUM-DADAR-W",
        "locality_name": "Dadar West",
        "pincode": "400028",
        "coarse_zone_id": "MUM-ISLAND-CITY",
        "coarse_zone_label": "Island City",
        "broad_land_use": "Dense residential-retail",
        "regulatory_region": "MCGM Island City",
        "center_lat": 19.0193,
        "center_lon": 72.8424,
        "radius_km": 2.1,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 45500,
    },
    {
        "micro_market_id": "MM-MUM-LOWER-PAREL",
        "locality_name": "Lower Parel",
        "pincode": "400013",
        "coarse_zone_id": "MUM-ISLAND-CITY",
        "coarse_zone_label": "Central Mumbai",
        "broad_land_use": "CBD-office and premium residential",
        "regulatory_region": "MCGM Island City",
        "center_lat": 18.9959,
        "center_lon": 72.8304,
        "radius_km": 2.2,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 52000,
    },
    {
        "micro_market_id": "MM-MUM-WORLI",
        "locality_name": "Worli",
        "pincode": "400018",
        "coarse_zone_id": "MUM-ISLAND-CITY",
        "coarse_zone_label": "Central Mumbai",
        "broad_land_use": "Premium residential-office",
        "regulatory_region": "MCGM Island City",
        "center_lat": 19.0176,
        "center_lon": 72.8170,
        "radius_km": 2.4,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 61000,
    },
    {
        "micro_market_id": "MM-MUM-VIKHROLI",
        "locality_name": "Vikhroli",
        "pincode": "400083",
        "coarse_zone_id": "MUM-CENTRAL-SUBURBS",
        "coarse_zone_label": "Central Suburbs",
        "broad_land_use": "Residential-office redevelopment",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.1115,
        "center_lon": 72.9280,
        "radius_km": 2.8,
        "demand_tier": "Medium-High",
        "liquidity_tier": "Medium",
        "access_quality": "Good",
        "price_anchor": 20500,
    },
    {
        "micro_market_id": "MM-MUM-KURLA",
        "locality_name": "Kurla",
        "pincode": "400070",
        "coarse_zone_id": "MUM-CENTRAL-SUBURBS",
        "coarse_zone_label": "Central Suburbs",
        "broad_land_use": "Affordable residential-commercial",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.0726,
        "center_lon": 72.8845,
        "radius_km": 3.0,
        "demand_tier": "Medium",
        "liquidity_tier": "Medium",
        "access_quality": "Good",
        "price_anchor": 17500,
    },
    {
        "micro_market_id": "MM-MUM-SANTACRUZ-W",
        "locality_name": "Santacruz West",
        "pincode": "400054",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Western Premium",
        "broad_land_use": "Premium residential",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.0822,
        "center_lon": 72.8376,
        "radius_km": 2.4,
        "demand_tier": "Prime",
        "liquidity_tier": "High",
        "access_quality": "Excellent",
        "price_anchor": 50500,
    },
    {
        "micro_market_id": "MM-MUM-KANDIVALI-E",
        "locality_name": "Kandivali East",
        "pincode": "400101",
        "coarse_zone_id": "MUM-WESTERN-SUBURBS",
        "coarse_zone_label": "Outer Western Suburbs",
        "broad_land_use": "Residential with office pockets",
        "regulatory_region": "MCGM Suburban",
        "center_lat": 19.2058,
        "center_lon": 72.8661,
        "radius_km": 3.3,
        "demand_tier": "Medium-High",
        "liquidity_tier": "Medium-High",
        "access_quality": "Good",
        "price_anchor": 19000,
    },
    {
        "micro_market_id": "MM-NMM-VASHI",
        "locality_name": "Vashi",
        "pincode": "400703",
        "coarse_zone_id": "NMM-VASHI-BELAPUR",
        "coarse_zone_label": "Navi Mumbai",
        "broad_land_use": "Planned residential-commercial",
        "regulatory_region": "NMMC",
        "center_lat": 19.0771,
        "center_lon": 72.9986,
        "radius_km": 3.4,
        "demand_tier": "Medium-High",
        "liquidity_tier": "Medium-High",
        "access_quality": "Good",
        "price_anchor": 18500,
    },
]

MARKET_SUBTYPES = [
    ("Residential", "1BHK", 420, 560, 760, 0.21),
    ("Residential", "2BHK", 650, 910, 1250, 0.34),
    ("Residential", "3BHK", 980, 1350, 1900, 0.18),
    ("Residential", "Apartment", 550, 875, 1600, 0.17),
    ("Commercial", "Shop", 180, 360, 850, 0.05),
    ("Commercial", "Office", 450, 950, 2400, 0.05),
]


def seed_database() -> dict[str, int]:
    random.seed(SEED)
    db_path = get_db_path()
    with get_connection(db_path) as conn:
        conn.executescript(schema_path().read_text(encoding="utf-8"))
        _clear_seeded_tables(conn)
        _insert_localities(conn)
        _insert_market_norms(conn)
        _insert_circle_rates(conn)
        _insert_geocode_cache(conn)
        _insert_historical_cases(conn)
        _insert_portfolio_exposure(conn)
        conn.commit()
        return _table_counts(conn)


def _clear_seeded_tables(conn) -> None:
    tables = [
        "geocode_cache",
        "portfolio_exposure",
        "historical_cases",
        "circle_rate_master",
        "market_norms",
        "locality_master",
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
        conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))


def _insert_localities(conn) -> None:
    rows = [
        (
            locality["micro_market_id"],
            locality["locality_name"],
            "Mumbai",
            locality["pincode"],
            locality["coarse_zone_id"],
            locality["coarse_zone_label"],
            locality["broad_land_use"],
            locality["regulatory_region"],
            locality["center_lat"],
            locality["center_lon"],
            locality["radius_km"],
            locality["demand_tier"],
            locality["liquidity_tier"],
            locality["access_quality"],
        )
        for locality in LOCALITIES
    ]
    conn.executemany(
        """
        INSERT INTO locality_master (
            micro_market_id,
            locality_name,
            city,
            pincode,
            coarse_zone_id,
            coarse_zone_label,
            broad_land_use,
            regulatory_region,
            center_lat,
            center_lon,
            radius_km,
            demand_tier,
            liquidity_tier,
            access_quality
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _insert_market_norms(conn) -> None:
    rows = []
    for locality in LOCALITIES:
        for property_type, subtype, size_p5, size_p50, size_p95, prevalence in MARKET_SUBTYPES:
            subtype_price_factor = {
                "1BHK": 0.97,
                "2BHK": 1.0,
                "3BHK": 1.06,
                "Apartment": 1.01,
                "Shop": 1.55,
                "Office": 1.25,
            }[subtype]
            demand_factor = {
                "Prime": 1.12,
                "High": 1.06,
                "Medium-High": 1.0,
                "Medium": 0.92,
            }[locality["demand_tier"]]
            median = locality["price_anchor"] * subtype_price_factor * random.uniform(0.94, 1.07)
            p25 = median * random.uniform(0.84, 0.91)
            p75 = median * random.uniform(1.09, 1.22)
            comparable_count = int(random.randint(22, 95) * demand_factor)
            liquidity_index = min(
                0.98,
                {
                    "High": 0.78,
                    "Medium-High": 0.66,
                    "Medium": 0.54,
                }[locality["liquidity_tier"]]
                + random.uniform(-0.05, 0.08),
            )
            rows.append(
                (
                    locality["micro_market_id"],
                    property_type,
                    subtype,
                    round(size_p5 * random.uniform(0.92, 1.05), 1),
                    round(size_p50 * random.uniform(0.95, 1.08), 1),
                    round(size_p95 * random.uniform(0.98, 1.15), 1),
                    round(p25, 2),
                    round(median, 2),
                    round(p75, 2),
                    round(prevalence * random.uniform(0.75, 1.25), 3),
                    comparable_count,
                    round(random.uniform(0.28, 0.78), 3),
                    round(liquidity_index, 3),
                    BASE_DATE.isoformat(),
                )
            )

    conn.executemany(
        """
        INSERT INTO market_norms (
            micro_market_id,
            property_type,
            subtype,
            size_p5,
            size_p50,
            size_p95,
            price_psf_p25,
            price_psf_p50,
            price_psf_p75,
            subtype_prevalence,
            comparable_count,
            listing_churn_proxy,
            liquidity_index,
            last_refreshed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _insert_circle_rates(conn) -> None:
    rows = []
    for locality in LOCALITIES:
        anchor = locality["price_anchor"]
        zone_id = locality["coarse_zone_id"]
        rows.extend(
            [
                (
                    zone_id,
                    "Mumbai",
                    locality["locality_name"],
                    "Residential",
                    round(anchor * random.uniform(0.42, 0.58), 2),
                    2025,
                    SOURCE_LABEL,
                ),
                (
                    zone_id,
                    "Mumbai",
                    locality["locality_name"],
                    "Commercial",
                    round(anchor * random.uniform(0.62, 0.82), 2),
                    2025,
                    SOURCE_LABEL,
                ),
                (
                    zone_id,
                    "Mumbai",
                    locality["locality_name"],
                    "Retail",
                    round(anchor * random.uniform(0.72, 0.94), 2),
                    2025,
                    SOURCE_LABEL,
                ),
            ]
        )

    conn.executemany(
        """
        INSERT INTO circle_rate_master (
            zone_id,
            city,
            locality_name,
            property_type,
            rate_per_sqft,
            effective_year,
            source_label
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _insert_geocode_cache(conn) -> None:
    wanted = {
        "Andheri East",
        "Bandra West",
        "Powai",
        "Lower Parel",
        "Worli",
    }
    rows = []
    for locality in LOCALITIES:
        if locality["locality_name"] in wanted:
            raw_address = f"{locality['locality_name']}, Mumbai"
            rows.append(
                (
                    raw_address,
                    raw_address.lower(),
                    locality["center_lat"],
                    locality["center_lon"],
                    "seeded-locality-centroid",
                    0.92,
                    datetime.now(timezone.utc).isoformat(),
                )
            )

    conn.executemany(
        """
        INSERT INTO geocode_cache (
            raw_address,
            normalized_address,
            lat,
            lon,
            source,
            confidence,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _insert_historical_cases(conn) -> None:
    rows = []
    legal_profiles = ["Clear", "Minor documentation gap", "Society NOC pending", "Title risk flagged"]
    approvals = ["Approved", "Approved with conditions", "Rejected"]
    default_statuses = ["Performing", "Resolved default", "Defaulted"]

    for idx in range(1, 501):
        locality = random.choice(LOCALITIES)
        property_type, subtype, s5, s50, s95, _ = random.choice(MARKET_SUBTYPES)
        size = _triangular(s5, s50, s95)
        age_years = round(random.triangular(1, 45, 12), 1)
        legal_profile = random.choices(legal_profiles, weights=[72, 16, 8, 4], k=1)[0]
        default_status = random.choices(default_statuses, weights=[82, 12, 6], k=1)[0]
        approval_status = random.choices(approvals, weights=[78, 16, 6], k=1)[0]
        default_penalty = 0.18 if default_status == "Defaulted" else 0.06 if default_status == "Resolved default" else 0
        legal_penalty = 0.12 if legal_profile == "Title risk flagged" else 0.04 if legal_profile != "Clear" else 0
        recovery_ratio = max(
            0.42,
            min(1.08, random.normalvariate(0.91 - default_penalty - legal_penalty, 0.08)),
        )
        liquidation_days = int(
            random.triangular(35, 270, 85)
            + (35 if locality["liquidity_tier"] == "Medium" else 0)
            + (45 if default_status == "Defaulted" else 0)
        )
        deviation = random.normalvariate(0, 7.5 + (4 if legal_profile != "Clear" else 0))
        closed_date = BASE_DATE - timedelta(days=random.randint(1, 8 * 365))
        quality = max(
            0.1,
            min(
                0.99,
                0.82
                - abs(deviation) / 100
                - (liquidation_days / 700)
                + (recovery_ratio - 0.8) * 0.22,
            ),
        )
        rows.append(
            (
                f"HC-MUM-{idx:05d}",
                closed_date.isoformat(),
                locality["micro_market_id"],
                locality["locality_name"],
                property_type,
                subtype,
                round(size, 1),
                _size_band(size),
                age_years,
                _age_bucket(age_years),
                legal_profile,
                approval_status,
                default_status,
                liquidation_days,
                round(deviation, 2),
                round(recovery_ratio, 3),
                round(quality, 3),
            )
        )

    conn.executemany(
        """
        INSERT INTO historical_cases (
            historical_case_id,
            closed_date,
            micro_market_id,
            locality_name,
            property_type,
            subtype,
            size_sqft,
            size_band,
            age_years,
            age_bucket,
            legal_profile,
            approval_status,
            default_status,
            liquidation_days,
            valuation_deviation_pct,
            recovery_ratio,
            outcome_quality_score
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _insert_portfolio_exposure(conn) -> None:
    rows = []
    delinquency_statuses = ["Current", "SMA-0", "SMA-1", "SMA-2", "NPA"]

    for idx in range(1, 1001):
        locality = random.choice(LOCALITIES)
        property_type, subtype, s5, s50, s95, _ = random.choice(MARKET_SUBTYPES)
        size = _triangular(s5, s50, s95)
        market_norm = locality["price_anchor"] * (1.5 if subtype == "Shop" else 1.22 if subtype == "Office" else 1)
        collateral_value = size * market_norm * random.uniform(0.88, 1.16)
        ltv = random.triangular(0.42, 0.86, 0.64)
        sanctioned_amount = collateral_value * min(0.88, ltv + random.uniform(0.02, 0.12))
        outstanding = sanctioned_amount * random.uniform(0.48, 0.98)
        delinquency = random.choices(
            delinquency_statuses,
            weights=[78, 9, 6, 4, 3],
            k=1,
        )[0]
        default_flag = 1 if delinquency == "NPA" else 0
        loan_status = "Active" if delinquency != "NPA" else random.choice(["Active", "Recovery"])
        rows.append(
            (
                f"LN-MUM-{idx:06d}",
                locality["micro_market_id"],
                locality["locality_name"],
                property_type,
                subtype,
                round(outstanding, 2),
                round(sanctioned_amount, 2),
                round(collateral_value, 2),
                round(outstanding / collateral_value, 3),
                delinquency,
                default_flag,
                loan_status,
            )
        )

    conn.executemany(
        """
        INSERT INTO portfolio_exposure (
            loan_id,
            micro_market_id,
            locality_name,
            property_type,
            subtype,
            outstanding_exposure,
            sanctioned_amount,
            collateral_value,
            current_ltv,
            delinquency_status,
            default_flag,
            loan_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def _table_counts(conn) -> dict[str, int]:
    tables = [
        "locality_master",
        "market_norms",
        "circle_rate_master",
        "historical_cases",
        "portfolio_exposure",
        "geocode_cache",
        "cases",
        "valuation_outputs",
        "audit_logs",
    ]
    return {
        table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in tables
    }


def _triangular(low: float, mode: float, high: float) -> float:
    return random.triangular(low, high, mode)


def _size_band(size: float) -> str:
    if size < 500:
        return "Compact"
    if size < 900:
        return "Mid"
    if size < 1400:
        return "Large"
    return "Premium Large"


def _age_bucket(age_years: float) -> str:
    if age_years <= 5:
        return "0-5 years"
    if age_years <= 15:
        return "6-15 years"
    if age_years <= 30:
        return "16-30 years"
    return "30+ years"


def main() -> None:
    counts = seed_database()
    print(f"SQLite DB initialized at: {get_db_path()}")
    for table, count in counts.items():
        print(f"- {table}: {count} rows")


if __name__ == "__main__":
    main()
