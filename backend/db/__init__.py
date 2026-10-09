"""Local SQLite data foundation for the Mumbai prototype."""

from .repositories import (
    find_nearest_locality,
    get_circle_rate,
    get_connection,
    get_historical_case_candidates,
    get_historical_cases_by_bucket,
    get_locality_by_micro_market,
    get_market_norms,
    get_market_norms_with_fallback,
    get_portfolio_concentration_snapshot,
    get_portfolio_exposure_by_bucket,
    get_circle_rate_with_fallback,
    init_db,
    save_audit_log,
    save_case,
    save_valuation_output,
    seed_db,
)

__all__ = [
    "find_nearest_locality",
    "get_circle_rate",
    "get_connection",
    "get_historical_case_candidates",
    "get_historical_cases_by_bucket",
    "get_locality_by_micro_market",
    "get_market_norms",
    "get_market_norms_with_fallback",
    "get_portfolio_concentration_snapshot",
    "get_portfolio_exposure_by_bucket",
    "get_circle_rate_with_fallback",
    "init_db",
    "save_audit_log",
    "save_case",
    "save_valuation_output",
    "seed_db",
]
