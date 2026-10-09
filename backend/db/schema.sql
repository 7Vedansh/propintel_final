PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT UNIQUE,
    created_at TEXT,
    raw_input_json TEXT,
    normalized_profile_json TEXT,
    bucket_assignment_json TEXT,
    stage2_output_json TEXT,
    valuation_summary_json TEXT,
    final_decision TEXT,
    confidence_score REAL
);

CREATE TABLE IF NOT EXISTS geocode_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_address TEXT,
    normalized_address TEXT,
    lat REAL,
    lon REAL,
    source TEXT,
    confidence REAL,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS locality_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    micro_market_id TEXT UNIQUE,
    locality_name TEXT,
    city TEXT,
    pincode TEXT,
    coarse_zone_id TEXT,
    coarse_zone_label TEXT,
    broad_land_use TEXT,
    regulatory_region TEXT,
    center_lat REAL,
    center_lon REAL,
    radius_km REAL,
    demand_tier TEXT,
    liquidity_tier TEXT,
    access_quality TEXT
);

CREATE TABLE IF NOT EXISTS market_norms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    micro_market_id TEXT,
    property_type TEXT,
    subtype TEXT,
    size_p5 REAL,
    size_p50 REAL,
    size_p95 REAL,
    price_psf_p25 REAL,
    price_psf_p50 REAL,
    price_psf_p75 REAL,
    subtype_prevalence REAL,
    comparable_count INTEGER,
    listing_churn_proxy REAL,
    liquidity_index REAL,
    last_refreshed TEXT
);

CREATE TABLE IF NOT EXISTS circle_rate_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT,
    city TEXT,
    locality_name TEXT,
    property_type TEXT,
    rate_per_sqft REAL,
    effective_year INTEGER,
    source_label TEXT
);

CREATE TABLE IF NOT EXISTS historical_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    historical_case_id TEXT UNIQUE,
    closed_date TEXT,
    micro_market_id TEXT,
    locality_name TEXT,
    property_type TEXT,
    subtype TEXT,
    size_sqft REAL,
    size_band TEXT,
    age_years REAL,
    age_bucket TEXT,
    legal_profile TEXT,
    approval_status TEXT,
    default_status TEXT,
    liquidation_days INTEGER,
    valuation_deviation_pct REAL,
    recovery_ratio REAL,
    outcome_quality_score REAL
);

CREATE TABLE IF NOT EXISTS portfolio_exposure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id TEXT UNIQUE,
    micro_market_id TEXT,
    locality_name TEXT,
    property_type TEXT,
    subtype TEXT,
    outstanding_exposure REAL,
    sanctioned_amount REAL,
    collateral_value REAL,
    current_ltv REAL,
    delinquency_status TEXT,
    default_flag INTEGER,
    loan_status TEXT
);

CREATE TABLE IF NOT EXISTS valuation_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT,
    created_at TEXT,
    market_value REAL,
    distress_value REAL,
    resale_potential_index REAL,
    time_to_liquidate_days INTEGER,
    confidence_score REAL,
    historical_adjustment REAL,
    portfolio_penalty REAL,
    output_json TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id TEXT,
    created_at TEXT,
    stage_name TEXT,
    rule_id TEXT,
    input_snapshot_json TEXT,
    result TEXT,
    score_contribution REAL,
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS locality_event_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    micro_market_id TEXT,
    locality_name TEXT,
    city TEXT,
    zone TEXT,
    source_name TEXT,
    source_url TEXT,
    source_trust REAL,
    source_tier TEXT,
    corroboration_status TEXT,
    corroboration_weight REAL,
    matched_group_id TEXT,
    grouped_event_key TEXT,
    is_watchlist INTEGER DEFAULT 0,
    title TEXT,
    summary TEXT,
    event_type TEXT,
    direction TEXT,
    impact_area TEXT,
    severity REAL,
    confidence REAL,
    locality_relevance REAL,
    project TEXT,
    project_status TEXT,
    expected_completion_months INTEGER,
    published_days_ago INTEGER,
    published_date TEXT,
    evidence TEXT,
    event_weight REAL,
    liquidity_delta REAL,
    marketability_delta REAL,
    confidence_delta REAL,
    time_to_liquidate_delta_pct REAL,
    risk_flag TEXT,
    manual_review_required INTEGER,
    inspection_route TEXT,
    accepted INTEGER,
    rejection_reason TEXT,
    created_at TEXT,
    fetched_at TEXT,
    raw_doc_hash TEXT,
    audit_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_cases_case_id ON cases(case_id);
CREATE INDEX IF NOT EXISTS idx_valuation_outputs_case_id ON valuation_outputs(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_case_id ON audit_logs(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_case_stage ON audit_logs(case_id, stage_name);

CREATE INDEX IF NOT EXISTS idx_geocode_raw_address ON geocode_cache(raw_address);
CREATE INDEX IF NOT EXISTS idx_geocode_normalized_address ON geocode_cache(normalized_address);

CREATE INDEX IF NOT EXISTS idx_locality_micro_market_id ON locality_master(micro_market_id);
CREATE INDEX IF NOT EXISTS idx_locality_city_pincode ON locality_master(city, pincode);

CREATE INDEX IF NOT EXISTS idx_market_norms_micro_market_id ON market_norms(micro_market_id);
CREATE INDEX IF NOT EXISTS idx_market_norms_type_subtype ON market_norms(property_type, subtype);
CREATE INDEX IF NOT EXISTS idx_market_norms_bucket ON market_norms(micro_market_id, property_type, subtype);

CREATE INDEX IF NOT EXISTS idx_circle_rate_zone_type ON circle_rate_master(zone_id, property_type);
CREATE INDEX IF NOT EXISTS idx_circle_rate_city_locality ON circle_rate_master(city, locality_name);

CREATE INDEX IF NOT EXISTS idx_historical_case_id ON historical_cases(historical_case_id);
CREATE INDEX IF NOT EXISTS idx_historical_micro_market_id ON historical_cases(micro_market_id);
CREATE INDEX IF NOT EXISTS idx_historical_type_subtype ON historical_cases(property_type, subtype);
CREATE INDEX IF NOT EXISTS idx_historical_bucket ON historical_cases(micro_market_id, property_type, subtype);

CREATE INDEX IF NOT EXISTS idx_locality_event_cache_micro_market ON locality_event_cache(micro_market_id);
CREATE INDEX IF NOT EXISTS idx_locality_event_cache_event_id ON locality_event_cache(event_id);
CREATE INDEX IF NOT EXISTS idx_locality_event_cache_fetched_at ON locality_event_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_locality_event_cache_accepted ON locality_event_cache(accepted);

CREATE INDEX IF NOT EXISTS idx_portfolio_loan_id ON portfolio_exposure(loan_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_micro_market_id ON portfolio_exposure(micro_market_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_type_subtype ON portfolio_exposure(property_type, subtype);
CREATE INDEX IF NOT EXISTS idx_portfolio_bucket ON portfolio_exposure(micro_market_id, property_type, subtype);
