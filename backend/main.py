from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from sqlalchemy import text
from sqlalchemy.orm import Session
import asyncio
import copy
import hashlib
import uuid
from datetime import datetime, date
from loguru import logger
import os
import sys
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.config import settings
from backend.database import Property, Valuation, FraudCheck, PropertyImage, get_db
from backend.db.repositories import (
    find_nearest_locality,
    get_circle_rate_with_fallback,
    get_historical_case_candidates,
    get_market_norms_with_fallback,
    get_portfolio_concentration_snapshot,
    init_db,
    seed_db,
)
from backend.llm.ollama_client import (
    build_rule_based_fallback,
    generate_underwriter_summary as generate_underwriter_summary_response,
)
from backend.vision import DEFAULT_DAMAGE_LABELS, get_vision_analyzer, load_image_from_bytes, load_image_from_source
from backend.pipeline_dag import PipelineDAG, geo_enrichment_task, circle_rate_task, ipi_compute_task, market_signals_task, vision_analysis_task, fraud_detection_task, xgboost_multiplier_task, narrative_generation_task
from backend.websocket_progress import router as progress_router, ProgressTracker

# ============================================================================
# Request/Response Models
# ============================================================================

class PropertyInput(BaseModel):
    """Initial property input from frontend"""
    address: str = Field(..., min_length=3, max_length=500)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    property_type: str = Field(..., min_length=2, max_length=80)  # apartment, house, etc
    config: Optional[str] = Field(default=None, max_length=80)  # 2BHK, 3BHK
    carpet_area: float = Field(..., gt=0, le=250000)
    age_bucket: Optional[str] = Field(default=None, max_length=80)
    occupancy_status: Optional[str] = Field(default=None, max_length=80)
    legal_status: Optional[str] = Field(default=None, max_length=80)
    pincode: str = Field(..., min_length=3, max_length=12)
    city: str = Field(..., min_length=2, max_length=80)
    images: Optional[List[str]] = None

class ValuationResponse(BaseModel):
    """Valuation response to frontend"""
    property_id: str
    market_value: str
    distress_value: str
    PropIntel: float
    confidence_score: float
    confidence_breakdown: Dict[str, float]
    time_to_sell: str
    risk_level: str
    narrative: str
    fraud_flags: List[Dict[str, Any]]
    pipeline_execution_time: float

class Stage1ResolveContextRequest(BaseModel):
    """Coordinates and property bucket request for SQLite-backed Stage 1 context."""
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    propertyType: str = Field(default="Residential", min_length=2, max_length=80)
    subtype: Optional[str] = Field(default=None, max_length=80)

class HistoricalSimilarCasesRequest(BaseModel):
    """Current case attributes for historical similarity scoring."""
    microMarketId: Optional[str] = Field(default=None, max_length=80)
    localityName: Optional[str] = Field(default=None, max_length=160)
    propertyType: str = Field(default="Residential", min_length=2, max_length=80)
    subtype: Optional[str] = Field(default=None, max_length=80)
    sizeSqft: Optional[float] = Field(default=None, gt=0, le=250000)
    ageBucket: Optional[str] = Field(default=None, max_length=80)
    legalProfile: Optional[str] = Field(default=None, max_length=80)
    baseConfidence: Optional[float] = Field(default=None, ge=0, le=1)

class PortfolioConcentrationRiskRequest(BaseModel):
    """Current case attributes for portfolio concentration scoring."""
    microMarketId: Optional[str] = Field(default=None, max_length=80)
    localityName: Optional[str] = Field(default=None, max_length=160)
    propertyType: str = Field(default="Residential", min_length=2, max_length=80)
    subtype: Optional[str] = Field(default=None, max_length=80)
    estimatedMarketValue: Optional[float] = Field(default=None, gt=0, le=100_000_000_000)
    requestedLoanAmount: Optional[float] = Field(default=None, gt=0, le=100_000_000_000)
    baseLtv: Optional[float] = Field(default=0.65, ge=0, le=1)
    liquidityTier: Optional[str] = Field(default=None, max_length=80)
    liquidityIndex: Optional[float] = Field(default=None, ge=0, le=1)

class LocalityIntelligenceRequest(BaseModel):
    """Locality context to run Hyperlocal Event Intelligence against."""
    locality: str = Field(..., min_length=2, max_length=160)
    microMarketId: Optional[str] = Field(default=None, max_length=80)
    city: Optional[str] = Field(default=None, max_length=80)
    zone: Optional[str] = Field(default=None, max_length=120)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    aliases: Optional[List[str]] = Field(default=None)


class UnderwriterSummaryRequest(BaseModel):
    """Structured deterministic outputs to explain with a local LLM."""
    caseId: Optional[str] = None
    stage1: Dict[str, Any] = Field(default_factory=dict)
    stage2Output: Dict[str, Any] = Field(default_factory=dict)
    valuation: Dict[str, Any] = Field(default_factory=dict)
    historicalCaseSummary: Dict[str, Any] = Field(default_factory=dict)
    portfolioRiskSummary: Dict[str, Any] = Field(default_factory=dict)
    visualEvidence: Dict[str, Any] = Field(default_factory=dict)
    localityIntelligence: Dict[str, Any] = Field(default_factory=dict)
    mode: Literal["fast", "enhanced", "auto"] = "auto"

# ============================================================================
# FastAPI Setup
# ============================================================================

app = FastAPI(
    title="PropIntel Backend",
    description="Production-grade property valuation engine",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_rate_limit_windows: dict[str, list[float]] = {}
_UNDERWRITER_SUMMARY_CACHE: dict[str, Dict[str, Any]] = {}
_UNDERWRITER_SUMMARY_CACHE_ORDER: list[str] = []
_UNDERWRITER_SUMMARY_IN_FLIGHT: dict[str, asyncio.Future] = {}
_UNDERWRITER_SUMMARY_CACHE_LIMIT = 32
_UNDERWRITER_SUMMARY_STATE_LOCK = asyncio.Lock()
_UNDERWRITER_SUMMARY_GENERATION_LOCK = asyncio.Lock()


def _normalize_underwriter_summary_key_payload(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _build_underwriter_summary_request_key(payload: Dict[str, Any], mode: str) -> str:
    key_payload = {
        "mode": str(mode or "auto").strip().lower(),
        "baseUrl": settings.OLLAMA_BASE_URL,
        "primaryModel": settings.OLLAMA_MODEL,
        "fallbackModel": settings.OLLAMA_FALLBACK_MODEL,
        "fastModel": settings.OLLAMA_FAST_MODEL,
        "timeoutSeconds": settings.OLLAMA_TIMEOUT_SECONDS,
        "fastTimeoutSeconds": settings.OLLAMA_FAST_TIMEOUT_SECONDS,
        "payload": _normalize_underwriter_summary_key_payload(payload),
    }
    digest = hashlib.sha256(
        json.dumps(key_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return digest


async def _get_cached_underwriter_summary(request_key: str) -> Optional[Dict[str, Any]]:
    async with _UNDERWRITER_SUMMARY_STATE_LOCK:
        cached = _UNDERWRITER_SUMMARY_CACHE.get(request_key)
        return copy.deepcopy(cached) if cached is not None else None


async def _store_underwriter_summary_result(request_key: str, response: Dict[str, Any]) -> None:
    async with _UNDERWRITER_SUMMARY_STATE_LOCK:
        _UNDERWRITER_SUMMARY_CACHE[request_key] = copy.deepcopy(response)
        if request_key in _UNDERWRITER_SUMMARY_CACHE_ORDER:
            _UNDERWRITER_SUMMARY_CACHE_ORDER.remove(request_key)
        _UNDERWRITER_SUMMARY_CACHE_ORDER.append(request_key)
        while len(_UNDERWRITER_SUMMARY_CACHE_ORDER) > _UNDERWRITER_SUMMARY_CACHE_LIMIT:
            expired_key = _UNDERWRITER_SUMMARY_CACHE_ORDER.pop(0)
            _UNDERWRITER_SUMMARY_CACHE.pop(expired_key, None)


async def _resolve_underwriter_summary_inflight(request_key: str) -> Optional[asyncio.Future]:
    async with _UNDERWRITER_SUMMARY_STATE_LOCK:
        return _UNDERWRITER_SUMMARY_IN_FLIGHT.get(request_key)


async def _register_underwriter_summary_inflight(request_key: str, future: asyncio.Future) -> None:
    async with _UNDERWRITER_SUMMARY_STATE_LOCK:
        _UNDERWRITER_SUMMARY_IN_FLIGHT[request_key] = future


async def _clear_underwriter_summary_inflight(request_key: str) -> None:
    async with _UNDERWRITER_SUMMARY_STATE_LOCK:
        _UNDERWRITER_SUMMARY_IN_FLIGHT.pop(request_key, None)


@app.middleware("http")
async def enforce_request_guardrails(request: Request, call_next):
    """Lightweight demo-safe limits for untrusted collateral submissions."""
    content_length = request.headers.get("content-length")
    try:
        request_bytes = int(content_length) if content_length else 0
    except ValueError:
        request_bytes = 0
    if request_bytes > settings.MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": "Request body exceeds configured size limit"},
        )

    if request.method != "OPTIONS" and settings.RATE_LIMIT_PER_MINUTE > 0:
        client_host = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - 60
        recent = [
            timestamp
            for timestamp in _rate_limit_windows.get(client_host, [])
            if timestamp >= window_start
        ]
        if len(recent) >= settings.RATE_LIMIT_PER_MINUTE:
            _rate_limit_windows[client_host] = recent
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please retry shortly."},
            )
        recent.append(now)
        _rate_limit_windows[client_host] = recent

    return await call_next(request)

# Include WebSocket progress router
app.include_router(progress_router)

# Database
from backend.database import engine, Base, SessionLocal

# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """System health check"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "ollama_available": check_ollama_available(),
        "database_available": check_database_available(SessionLocal()),
        "models_loaded": check_models_loaded()
    }

def check_ollama_available() -> bool:
    """Check if Ollama is running"""
    try:
        request = urllib.request.Request(
            f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags",
            headers={"Content-Type": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return response.status == 200 and isinstance(payload.get("models"), list)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError):
        return False

def check_database_available(session) -> bool:
    """Check if database is accessible"""
    try:
        session.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
    finally:
        session.close()

def check_models_loaded() -> bool:
    """Check if models are pre-loaded"""
    try:
        runtime = get_vision_analyzer().runtime_info()
        return bool(runtime.model)
    except Exception:
        return False


@app.get("/api/vision/status")
async def vision_status():
    """Return configured local vision runtime details without forcing model download."""
    try:
        runtime = get_vision_analyzer().runtime_info()
        return {
            "available": True,
            "model": runtime.model,
            "device": runtime.device,
            "cudaAvailable": runtime.cuda_available,
            "minScore": settings.VISION_MIN_SCORE,
            "maxDetections": settings.VISION_MAX_DETECTIONS,
        }
    except Exception as exc:
        return {
            "available": False,
            "model": settings.VISION_MODEL,
            "device": "unknown",
            "cudaAvailable": False,
            "error": str(exc),
        }


@app.post("/api/vision/scan")
@app.post("/scan")
async def scan_image(request: Request):
    """
    Run local OWL-ViT zero-shot object detection on an uploaded property image.

    Accepts multipart `file`, JSON `{ "url": "..." }`, or JSON `{ "image": "data:image/..." }`.
    The `/scan` alias is kept for older frontend builds; new code should use `/api/vision/scan`.
    """
    content_type = request.headers.get("content-type", "")
    candidate_labels = DEFAULT_DAMAGE_LABELS
    threshold = settings.VISION_MIN_SCORE

    try:
        if "application/json" in content_type:
            data = await request.json()
            candidate_labels = data.get("candidateLabels") or data.get("candidate_labels") or candidate_labels
            threshold = float(data.get("threshold", threshold))
            image_source = data.get("image") or data.get("url")
            image = load_image_from_source(image_source)
        else:
            form = await request.form()
            file = form.get("file")
            if file is None:
                raise ValueError("Multipart request must include a file field")
            labels_value = form.get("candidateLabels") or form.get("candidate_labels")
            if labels_value:
                candidate_labels = json.loads(labels_value) if isinstance(labels_value, str) and labels_value.startswith("[") else str(labels_value).split(",")
            if form.get("threshold"):
                threshold = float(form.get("threshold"))
            image_bytes = await file.read()
            if len(image_bytes) > settings.VISION_MAX_IMAGE_BYTES:
                raise ValueError("Uploaded image exceeds configured size limit")
            image = load_image_from_bytes(image_bytes)

        candidate_labels = [str(label).strip()[:80] for label in candidate_labels if str(label).strip()][:20]
        if not candidate_labels:
            candidate_labels = DEFAULT_DAMAGE_LABELS
        threshold = max(0.01, min(float(threshold), 0.95))

        return await asyncio.to_thread(
            get_vision_analyzer().scan,
            image,
            candidate_labels,
            threshold,
        )
    except Exception as exc:
        logger.warning(f"Vision scan failed: {exc}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Vision scan failed: {exc}")

# ============================================================================
# Stage 1 SQLite Context Resolution
# ============================================================================

@app.post("/api/stage1/resolve-context")
async def resolve_stage1_context(request: Stage1ResolveContextRequest):
    """
    Resolve Stage 1 locality, market norms, and circle-rate context from SQLite.

    This endpoint is intentionally read-only and narrow: frontend Stage 1 treats
    any failure as a signal to continue with existing deterministic fallback.
    """
    try:
        property_type = normalize_stage1_property_type(request.propertyType)
        subtype = normalize_stage1_subtype(request.subtype)

        locality = find_nearest_locality(request.lat, request.lon)
        if not locality:
            return sqlite_context_error("No SQLite locality records found")

        distance_km = locality.get("distance_km")
        match_confidence = location_match_confidence(distance_km)
        market_norms = get_market_norms_with_fallback(
            locality["micro_market_id"],
            property_type,
            subtype,
        )
        circle_rate = get_circle_rate_with_fallback(
            locality["coarse_zone_id"],
            property_type,
        )

        return build_stage1_context_response(
            locality=locality,
            market_norms=market_norms,
            circle_rate=circle_rate,
            distance_km=distance_km,
            match_confidence=match_confidence,
        )
    except Exception as exc:
        logger.warning(f"SQLite Stage 1 context lookup failed: {exc}", exc_info=True)
        return sqlite_context_error("SQLite context lookup failed")


def sqlite_context_error(message: str, status_code: int = 503):
    return JSONResponse(
        status_code=status_code,
        content={
            "source": "sqlite",
            "error": message,
            "fallbackRecommended": True,
        },
    )


def normalize_stage1_property_type(value: str) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"residential", "apartment", "flat", "villa", "house", "bungalow"}:
        return "Residential"
    if raw in {"commercial", "office", "shop", "showroom", "warehouse"}:
        return "Commercial"
    return str(value or "Residential").strip() or "Residential"


def normalize_stage1_subtype(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    compact_bhk = normalized.upper().replace(" ", "")
    if compact_bhk in {"1BHK", "2BHK", "3BHK"}:
        return compact_bhk
    return normalized


def location_match_confidence(distance_km: Optional[float]) -> str:
    if distance_km is None:
        return "low"
    if distance_km <= 2:
        return "high"
    if distance_km <= 5:
        return "medium"
    return "low"


def build_stage1_context_response(
    locality: Dict[str, Any],
    market_norms: Optional[Dict[str, Any]],
    circle_rate: Optional[Dict[str, Any]],
    distance_km: Optional[float],
    match_confidence: str,
) -> Dict[str, Any]:
    locality_payload = {
        "microMarketId": locality.get("micro_market_id"),
        "localityName": locality.get("locality_name"),
        "city": locality.get("city"),
        "pincode": locality.get("pincode"),
        "coarseZoneId": locality.get("coarse_zone_id"),
        "coarseZoneLabel": locality.get("coarse_zone_label"),
        "broadLandUse": locality.get("broad_land_use"),
        "regulatoryRegion": locality.get("regulatory_region"),
        "demandTier": locality.get("demand_tier"),
        "liquidityTier": locality.get("liquidity_tier"),
        "accessQuality": locality.get("access_quality"),
    }
    market_payload = format_market_norms(market_norms)
    circle_payload = format_circle_rate(circle_rate, locality.get("coarse_zone_id"))

    bucket_assignment = {
        "coarseBucket": {
            "id": locality.get("coarse_zone_id"),
            "label": locality.get("coarse_zone_label"),
            "circleRateZone": locality.get("coarse_zone_id"),
            "broadLandUse": locality.get("broad_land_use"),
            "regulatoryRegion": locality.get("regulatory_region"),
            "circleRate": circle_payload.get("ratePerSqft"),
            "source": "sqlite",
        },
        "microMarketBucket": {
            "id": locality.get("micro_market_id"),
            "label": locality.get("locality_name"),
            "subtypePrevalence": market_payload.get("subtypePrevalence"),
            "commonSizeBand": format_size_band(market_norms),
            "localPriceBand": format_price_band(market_norms),
            "liquidityNorm": locality.get("liquidity_tier"),
            "comparableCount": market_payload.get("comparableCount"),
            "dataFreshnessDays": 0,
        },
        "hyperlocalContext": {
            "id": f"HL-{locality.get('micro_market_id')}",
            "roadAccess": road_access_from_quality(locality.get("access_quality")),
            "nearestTransit": "Derived from locality context / unavailable in v1",
            "infraProximity": "Derived from locality context / unavailable in v1",
            "accessQuality": locality.get("access_quality"),
        },
    }

    return {
        "source": "sqlite",
        "matchConfidence": match_confidence,
        "distanceKm": distance_km,
        "locality": locality_payload,
        "bucketAssignment": bucket_assignment,
        "marketNorms": market_payload,
        "circleRate": circle_payload,
    }


def format_market_norms(market_norms: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not market_norms:
        return {
            "sizeP5": None,
            "sizeP50": None,
            "sizeP95": None,
            "pricePsfP25": None,
            "pricePsfP50": None,
            "pricePsfP75": None,
            "subtypePrevalence": None,
            "comparableCount": None,
            "liquidityIndex": None,
        }

    return {
        "sizeP5": market_norms.get("size_p5"),
        "sizeP50": market_norms.get("size_p50"),
        "sizeP95": market_norms.get("size_p95"),
        "pricePsfP25": market_norms.get("price_psf_p25"),
        "pricePsfP50": market_norms.get("price_psf_p50"),
        "pricePsfP75": market_norms.get("price_psf_p75"),
        "subtypePrevalence": market_norms.get("subtype_prevalence"),
        "comparableCount": market_norms.get("comparable_count"),
        "liquidityIndex": market_norms.get("liquidity_index"),
    }


def format_circle_rate(
    circle_rate: Optional[Dict[str, Any]],
    fallback_zone_id: Optional[str],
) -> Dict[str, Any]:
    if not circle_rate:
        return {
            "zoneId": fallback_zone_id,
            "ratePerSqft": None,
            "effectiveYear": None,
            "sourceLabel": None,
        }

    return {
        "zoneId": circle_rate.get("zone_id") or fallback_zone_id,
        "ratePerSqft": circle_rate.get("rate_per_sqft"),
        "effectiveYear": circle_rate.get("effective_year"),
        "sourceLabel": circle_rate.get("source_label"),
    }


def format_size_band(market_norms: Optional[Dict[str, Any]]) -> str:
    if not market_norms:
        return "Unavailable"
    size_p5 = market_norms.get("size_p5")
    size_p95 = market_norms.get("size_p95")
    if size_p5 is None or size_p95 is None:
        return "Unavailable"
    return f"{round(size_p5)}-{round(size_p95)} sqft"


def format_price_band(market_norms: Optional[Dict[str, Any]]) -> str:
    if not market_norms:
        return "Unavailable"
    price_p25 = market_norms.get("price_psf_p25")
    price_p75 = market_norms.get("price_psf_p75")
    if price_p25 is None or price_p75 is None:
        return "Unavailable"
    return f"INR {round(price_p25):,}-{round(price_p75):,} / sqft"


def road_access_from_quality(access_quality: Optional[str]) -> str:
    if access_quality == "Excellent":
        return "Strong arterial and transit-led access"
    if access_quality == "Good":
        return "Good arterial and neighborhood access"
    return "Standard local road access"

# ============================================================================
# Historical Similar Cases
# ============================================================================

@app.post("/api/historical/similar-cases")
async def resolve_historical_similar_cases(request: HistoricalSimilarCasesRequest):
    """Resolve similar historical cases from SQLite with recency decay."""
    try:
        property_type = normalize_historical_property_type(request.propertyType)
        subtype = normalize_historical_subtype(request.subtype)
        candidates = get_historical_case_candidates(
            request.microMarketId,
            property_type,
            subtype,
            limit=100,
        )
        scored_cases = [
            score_historical_case(request, row, property_type, subtype)
            for row in candidates
        ]
        scored_cases.sort(
            key=lambda item: (item["similarityScoreRaw"], item["influenceWeightRaw"]),
            reverse=True,
        )
        selected_cases = scored_cases[:10]
        displayed_cases = selected_cases[:5]
        raw_adjustment = sum(case["confidenceContributionRaw"] for case in selected_cases)
        confidence_adjustment = clamp_float(raw_adjustment, -0.08, 0.08)
        base_confidence = request.baseConfidence
        final_confidence = None
        if base_confidence is not None:
            final_confidence = clamp_float(base_confidence + confidence_adjustment, 0.25, 0.95)

        overall_signal = "Mixed"
        if confidence_adjustment >= 0.025:
            overall_signal = "Positive"
        elif confidence_adjustment <= -0.025:
            overall_signal = "Caution"

        return {
            "source": "sqlite_historical_cases",
            "candidateCount": len(candidates),
            "displayedCount": len(displayed_cases),
            "casesFound": len(displayed_cases),
            "overallSignal": overall_signal,
            "baseConfidence": round(base_confidence, 3) if base_confidence is not None else None,
            "confidenceAdjustment": round(confidence_adjustment, 3),
            "liquidityAdjustment": 0,
            "distressAdjustment": 0,
            "finalConfidence": round(final_confidence, 3) if final_confidence is not None else None,
            "sparse": len(displayed_cases) < 3 or (displayed_cases[0]["similarityScore"] < 0.55 if displayed_cases else True),
            "note": "Limited historical matches found. Historical confidence impact is small."
            if len(displayed_cases) < 3
            else "SQLite historical cases found with enough overlap to influence confidence.",
            "currentCaseProfile": {
                "location": request.localityName,
                "microMarket": request.microMarketId,
                "propertyType": property_type,
                "subtype": subtype,
                "sizeBand": None,
                "ageBucket": request.ageBucket,
                "legalProfile": request.legalProfile,
            },
            "similarCases": [strip_internal_case_fields(case) for case in displayed_cases],
        }
    except Exception as exc:
        logger.warning(f"Historical case lookup failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content={
                "source": "sqlite_historical_cases",
                "error": "Historical case lookup failed",
                "fallbackRecommended": True,
            },
        )


def normalize_historical_property_type(value: Optional[str]) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"residential", "apartment", "flat", "villa", "house", "bungalow"}:
        return "Residential"
    if raw in {"commercial", "office", "shop", "showroom", "warehouse"}:
        return "Commercial"
    return str(value or "Residential").strip() or "Residential"


def normalize_historical_subtype(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip()
    compact = raw.upper().replace(" ", "")
    if compact in {"1BHK", "2BHK", "3BHK"}:
        return compact
    return raw


def normalize_historical_age_bucket(value: Optional[str]) -> str:
    text = str(value or "").strip().lower()
    if text in {"new", "0-5 years"} or "0-5" in text:
        return "new"
    if text in {"mid-age", "mid", "6-15 years"} or "6-15" in text:
        return "mid"
    if text in {"old", "16-30 years"} or "16-30" in text:
        return "old"
    if "30+" in text or "30" in text:
        return "old"
    return "unknown"


def score_historical_case(
    request: HistoricalSimilarCasesRequest,
    row: Dict[str, Any],
    property_type: str,
    subtype: Optional[str],
) -> Dict[str, Any]:
    match_reasons: list[str] = []

    location_score = 0.2
    if request.microMarketId and request.microMarketId == row.get("micro_market_id"):
        location_score = 1.0
        match_reasons.append("Same micro-market")
    elif request.localityName and str(request.localityName).lower() == str(row.get("locality_name")).lower():
        location_score = 0.6
        match_reasons.append("Same locality")

    type_score = 1.0 if property_type == row.get("property_type") else 0.0
    if type_score:
        match_reasons.append("Same property type")

    subtype_score = 0.0
    if subtype and subtype == row.get("subtype"):
        subtype_score = 1.0
        match_reasons.append("Same subtype")
    elif property_type == row.get("property_type"):
        subtype_score = 0.5
        match_reasons.append("Same property family")

    size_score = size_similarity_score(request.sizeSqft, row.get("size_sqft"))
    if size_score >= 0.8:
        match_reasons.append("Similar size")

    current_age_bucket = normalize_historical_age_bucket(request.ageBucket)
    historical_age_bucket = normalize_historical_age_bucket(row.get("age_bucket"))
    age_score = age_bucket_score(current_age_bucket, historical_age_bucket)
    if age_score == 1.0:
        match_reasons.append("Same age bucket")
    elif age_score == 0.5:
        match_reasons.append("Nearby or unknown age bucket")

    legal_score = legal_similarity_score(request.legalProfile, row.get("legal_profile"))
    if legal_score == 1.0:
        match_reasons.append("Similar legal profile")
    elif legal_score == 0.5:
        match_reasons.append("Legal profile partly comparable")

    similarity = (
        0.35 * location_score
        + 0.20 * type_score
        + 0.15 * subtype_score
        + 0.15 * size_score
        + 0.10 * age_score
        + 0.05 * legal_score
    )
    similarity = apply_severe_size_mismatch_cap(similarity, size_score)
    case_age_years = case_age_from_closed_date(row.get("closed_date"))
    recency_weight = recency_weight_for_age(case_age_years)
    influence_weight = similarity * recency_weight
    outcome_score = outcome_score_from_row(row)
    confidence_contribution = influence_weight * outcome_score * 0.04
    direction = "Positive" if confidence_contribution > 0.005 else "Negative" if confidence_contribution < -0.005 else "Mixed"

    return {
        "caseId": row.get("historical_case_id"),
        "localityName": row.get("locality_name"),
        "location": row.get("locality_name"),
        "microMarketId": row.get("micro_market_id"),
        "microMarket": row.get("micro_market_id"),
        "propertyType": row.get("property_type"),
        "subtype": row.get("subtype"),
        "config": row.get("subtype"),
        "sizeSqft": row.get("size_sqft"),
        "sizeBand": row.get("size_band"),
        "ageBucket": row.get("age_bucket"),
        "legalProfile": row.get("legal_profile"),
        "closedDate": row.get("closed_date"),
        "caseAgeYears": round(case_age_years, 1),
        "recencyWeight": round(recency_weight, 2),
        "similarityScoreRaw": similarity,
        "similarityScore": round(similarity, 2),
        "similarityPct": round(similarity * 100),
        "influenceWeightRaw": influence_weight,
        "influenceWeight": round(influence_weight, 2),
        "outcomeScore": round(outcome_score, 2),
        "confidenceContributionRaw": confidence_contribution,
        "confidenceContribution": round(confidence_contribution, 3),
        "matchReasons": match_reasons or ["Broad historical profile overlap"],
        "matchReason": match_reasons or ["Broad historical profile overlap"],
        "matchBasis": ", ".join((match_reasons or ["Broad historical profile overlap"])[:3]),
        "recencyExplanation": recency_explanation(case_age_years),
        "reliabilityDirection": direction,
        "currentCaseImpact": {
            "similarityWeight": round(similarity, 2),
            "recencyWeight": round(recency_weight, 2),
            "influenceWeight": round(influence_weight, 2),
            "reliabilityDirection": direction,
            "confidenceContribution": round(confidence_contribution, 3),
            "liquidityEffect": 0,
            "distressEffect": 0,
        },
        "outcome": {
            "approvalStatus": row.get("approval_status"),
            "defaultStatus": row.get("default_status"),
            "liquidationDays": row.get("liquidation_days"),
            "valuationDeviationPct": row.get("valuation_deviation_pct"),
            "recoveryRatio": row.get("recovery_ratio"),
            "recoveryQuality": recovery_quality_label(row.get("recovery_ratio")),
        },
        "outcomeSummary": format_outcome_summary(row),
    }


def strip_internal_case_fields(case: Dict[str, Any]) -> Dict[str, Any]:
    clean = dict(case)
    clean.pop("similarityScoreRaw", None)
    clean.pop("influenceWeightRaw", None)
    clean.pop("confidenceContributionRaw", None)
    return clean


def size_similarity_score(current_size: Optional[float], historical_size: Optional[float]) -> float:
    current = float(current_size or 0)
    historical = float(historical_size or 0)
    if current <= 0 or historical <= 0:
        return 0.0
    return clamp_float(min(current, historical) / max(current, historical), 0, 1)


def apply_severe_size_mismatch_cap(similarity_score: float, size_ratio: float) -> float:
    if size_ratio < 0.25:
        return min(similarity_score, 0.65)
    if size_ratio < 0.35:
        return min(similarity_score, 0.72)
    return similarity_score


def age_bucket_score(current: str, historical: str) -> float:
    if current == historical and current != "unknown":
        return 1.0
    if "unknown" in {current, historical}:
        return 0.5
    adjacent = {("new", "mid"), ("mid", "old")}
    return 0.5 if (current, historical) in adjacent or (historical, current) in adjacent else 0.0


def legal_similarity_score(current: Optional[str], historical: Optional[str]) -> float:
    current_text = str(current or "").strip().lower()
    historical_text = str(historical or "").strip().lower()
    if not current_text or current_text in {"unknown", "not_provided", "not provided"}:
        return 0.5
    if not historical_text or historical_text in {"unknown", "not_provided", "not provided"}:
        return 0.5
    return 1.0 if current_text == historical_text else 0.0


def case_age_from_closed_date(closed_date: Optional[str]) -> float:
    if not closed_date:
        return 8.0
    closed = date.fromisoformat(str(closed_date)[:10])
    return max(0.0, (date.today() - closed).days / 365.25)


def recency_weight_for_age(case_age_years: float) -> float:
    if case_age_years <= 1:
        return 1.0
    if case_age_years <= 3:
        return 0.85
    if case_age_years <= 5:
        return 0.65
    if case_age_years <= 7:
        return 0.45
    return 0.25


def outcome_score_from_row(row: Dict[str, Any]) -> float:
    quality = row.get("outcome_quality_score")
    if quality is not None:
        quality_value = float(quality)
        if 0 <= quality_value <= 1:
            return clamp_float((quality_value - 0.5) * 2, -1, 1)
        return clamp_float(quality_value, -1, 1)

    score = 0.0
    approval = str(row.get("approval_status") or "").lower()
    default = str(row.get("default_status") or "").lower()
    recovery_ratio = float(row.get("recovery_ratio") or 0)
    liquidation_days = row.get("liquidation_days")
    liquidation_days = int(liquidation_days) if liquidation_days is not None else None
    deviation = abs(float(row.get("valuation_deviation_pct") or 0))

    if "approved" in approval and "rejected" not in approval:
        score += 0.15
    if "rejected" in approval:
        score -= 0.20
    if "performing" in default or "no default" in default:
        score += 0.30
    if "defaulted" in default or default == "default":
        score -= 0.40
    if recovery_ratio >= 0.9:
        score += 0.25
    if recovery_ratio < 0.75:
        score -= 0.25
    if liquidation_days is not None and liquidation_days <= 90:
        score += 0.15
    if liquidation_days is not None and liquidation_days > 180:
        score -= 0.15
    if deviation <= 10:
        score += 0.15
    if deviation > 20:
        score -= 0.15

    return clamp_float(score, -1, 1)


def recency_explanation(case_age_years: float) -> str:
    if case_age_years <= 1:
        return "This case is recent, so it carries full influence."
    if case_age_years <= 3:
        return "This case is recent enough to carry strong influence."
    if case_age_years <= 7:
        return f"This case is {case_age_years:.1f} years old, so its influence is reduced."
    return "This case is older than 7 years, so it is treated as weak historical evidence."


def recovery_quality_label(recovery_ratio: Optional[float]) -> str:
    if recovery_ratio is None:
        return "Recovery not available"
    value = float(recovery_ratio)
    if value >= 0.9:
        return "Strong recovery"
    if value >= 0.75:
        return "Moderate recovery"
    return "Weak recovery"


def format_outcome_summary(row: Dict[str, Any]) -> str:
    parts = [
        row.get("approval_status"),
        row.get("default_status"),
        f"liquidated in {row.get('liquidation_days')} days" if row.get("liquidation_days") else None,
    ]
    return ", ".join(str(part) for part in parts if part)


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))

# ============================================================================
# Portfolio Concentration Risk
# ============================================================================

PORTFOLIO_POLICY_CAPS = {
    "micro_market": 0.15,
    "property_type": 0.80,
    "subtype": 0.25,
    "low_liquidity": 0.12,
    "delinquency": 0.28,
    "default": 0.08,
}

LENS_SEVERITY = {
    "Safe": 0.15,
    "Watch": 0.45,
    "High": 0.75,
    "Critical": 1.0,
    "Unavailable": 0.25,
}


@app.post("/api/portfolio/concentration-risk")
async def resolve_portfolio_concentration_risk(request: PortfolioConcentrationRiskRequest):
    """Assess portfolio concentration using active SQLite portfolio exposure."""
    try:
        property_type = normalize_historical_property_type(request.propertyType)
        subtype = normalize_historical_subtype(request.subtype)
        snapshot = get_portfolio_concentration_snapshot(request.microMarketId, property_type, subtype)
        total_active_exposure = float(snapshot["total"]["exposure"] or 0)
        base_ltv = float(request.baseLtv if request.baseLtv is not None else 0.65)
        proposed_exposure = estimate_proposed_exposure(request, base_ltv)

        if total_active_exposure <= 0:
            return {
                "source": "sqlite_portfolio_exposure",
                "portfolioSummary": {
                    "totalActiveExposure": 0,
                    "proposedExposure": proposed_exposure,
                    "baseLtv": base_ltv,
                    "recommendedLtv": base_ltv,
                    "ltvAdjustmentPct": 0,
                    "portfolioRiskScore": 0,
                    "riskLevel": "Unavailable",
                    "reviewRecommendation": "Portfolio concentration data unavailable. Single-case assessment still available.",
                },
                "riskLenses": [],
                "riskFlags": ["Portfolio exposure data is sparse or unavailable."],
                "decisionImpact": {
                    "confidencePenalty": 0,
                    "ltvPenaltyPct": 0,
                    "seniorReviewRequired": False,
                },
            }

        total_after = total_active_exposure + proposed_exposure
        micro_lens = build_exposure_lens(
            "micro_market",
            "Micro-market exposure",
            snapshot["micro_market"]["exposure"],
            proposed_exposure,
            total_active_exposure,
            total_after,
            PORTFOLIO_POLICY_CAPS["micro_market"],
        )
        property_type_lens = build_exposure_lens(
            "property_type",
            "Property type exposure",
            snapshot["property_type"]["exposure"],
            proposed_exposure,
            total_active_exposure,
            total_after,
            PORTFOLIO_POLICY_CAPS["property_type"],
        )
        subtype_lens = build_exposure_lens(
            "subtype",
            "Subtype exposure",
            snapshot["subtype"]["exposure"],
            proposed_exposure,
            total_active_exposure,
            total_after,
            PORTFOLIO_POLICY_CAPS["subtype"],
        )
        delinquency_lens = build_delinquency_lens(snapshot["similar_bucket"])
        low_liquidity_lens = build_low_liquidity_lens(
            request,
            snapshot["subtype"]["exposure"],
            proposed_exposure,
            total_active_exposure,
            total_after,
        )

        risk_lenses = [
            micro_lens,
            property_type_lens,
            subtype_lens,
            delinquency_lens,
            low_liquidity_lens,
        ]
        score = round(100 * (
            0.35 * LENS_SEVERITY[micro_lens["signal"]]
            + 0.25 * LENS_SEVERITY[property_type_lens["signal"]]
            + 0.20 * LENS_SEVERITY[subtype_lens["signal"]]
            + 0.10 * LENS_SEVERITY[delinquency_lens["signal"]]
            + 0.10 * LENS_SEVERITY[low_liquidity_lens["signal"]]
        ))
        risk_level = portfolio_risk_level(score)
        ltv_penalty_pct = min(12, max(0, round(score / 10)))
        recommended_ltv = max(0.40, base_ltv - (ltv_penalty_pct / 100))
        confidence_penalty = min(0.08, score * 0.0005)
        senior_review_required = (
            risk_level in {"High", "Critical"}
            or any(lens["signal"] == "Critical" for lens in risk_lenses)
            or micro_lens["postLoanShare"] > micro_lens["policyCap"]
            or delinquency_lens["signal"] in {"High", "Critical"}
        )

        return {
            "source": "sqlite_portfolio_exposure",
            "portfolioSummary": {
                "totalActiveExposure": round(total_active_exposure, 2),
                "proposedExposure": round(proposed_exposure, 2),
                "baseLtv": round(base_ltv, 3),
                "recommendedLtv": round(recommended_ltv, 3),
                "ltvAdjustmentPct": -float(ltv_penalty_pct),
                "portfolioRiskScore": score,
                "riskLevel": risk_level,
                "reviewRecommendation": portfolio_review_recommendation(risk_level),
            },
            "riskLenses": risk_lenses,
            "riskFlags": build_portfolio_risk_flags(risk_lenses),
            "decisionImpact": {
                "confidencePenalty": round(confidence_penalty, 3),
                "ltvPenaltyPct": float(ltv_penalty_pct),
                "seniorReviewRequired": senior_review_required,
            },
        }
    except Exception as exc:
        logger.warning(f"Portfolio concentration lookup failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=503,
            content={
                "source": "sqlite_portfolio_exposure",
                "error": "Portfolio concentration lookup failed",
                "fallbackRecommended": True,
            },
        )


def estimate_proposed_exposure(request: PortfolioConcentrationRiskRequest, base_ltv: float) -> float:
    if request.requestedLoanAmount and request.requestedLoanAmount > 0:
        return float(request.requestedLoanAmount)
    if request.estimatedMarketValue and request.estimatedMarketValue > 0:
        return float(request.estimatedMarketValue) * base_ltv
    return 5_000_000.0


def safe_share(exposure: float, total: float) -> float:
    return float(exposure / total) if total > 0 else 0.0


def exposure_signal(post_share: float, policy_cap: float) -> str:
    if post_share <= 0.70 * policy_cap:
        return "Safe"
    if post_share <= policy_cap:
        return "Watch"
    if post_share <= 1.2 * policy_cap:
        return "High"
    return "Critical"


def rate_signal(rate: float, target: float) -> str:
    if rate <= target:
        return "Safe"
    if rate <= 1.5 * target:
        return "Watch"
    if rate <= 2.5 * target:
        return "High"
    return "Critical"


def build_exposure_lens(
    lens_id: str,
    label: str,
    current_exposure: float,
    proposed_exposure: float,
    total_active_exposure: float,
    total_after: float,
    policy_cap: float,
) -> Dict[str, Any]:
    current = float(current_exposure or 0)
    post = current + proposed_exposure
    current_share = safe_share(current, total_active_exposure)
    post_share = safe_share(post, total_after)
    signal = exposure_signal(post_share, policy_cap)
    return {
        "id": lens_id,
        "label": label,
        "currentExposure": round(current, 2),
        "postLoanExposure": round(post, 2),
        "currentShare": round(current_share, 4),
        "postLoanShare": round(post_share, 4),
        "policyCap": policy_cap,
        "signal": signal,
        "explanation": exposure_explanation(signal, post_share, policy_cap),
    }


def build_delinquency_lens(similar_bucket: Dict[str, Any]) -> Dict[str, Any]:
    loan_count = int(similar_bucket.get("loan_count") or 0)
    delinquent_count = int(similar_bucket.get("delinquent_count") or 0)
    default_count = int(similar_bucket.get("default_count") or 0)
    delinquency_rate = delinquent_count / loan_count if loan_count else 0
    default_rate = default_count / loan_count if loan_count else 0
    delinquency_signal = rate_signal(delinquency_rate, PORTFOLIO_POLICY_CAPS["delinquency"]) if loan_count else "Unavailable"
    default_signal = rate_signal(default_rate, PORTFOLIO_POLICY_CAPS["default"]) if loan_count else "Unavailable"
    signal = worse_signal(delinquency_signal, default_signal)
    return {
        "id": "similar_bucket_performance",
        "label": "Similar bucket delinquency/default",
        "currentExposure": round(float(similar_bucket.get("exposure") or 0), 2),
        "postLoanExposure": round(float(similar_bucket.get("exposure") or 0), 2),
        "currentShare": round(delinquency_rate, 4),
        "postLoanShare": round(default_rate, 4),
        "policyCap": PORTFOLIO_POLICY_CAPS["default"],
        "signal": signal,
        "delinquencyRate": round(delinquency_rate, 4),
        "defaultRate": round(default_rate, 4),
        "loanCount": loan_count,
        "explanation": "Historical performance for this specific asset profile within the micro-market.",
    }


def build_low_liquidity_lens(
    request: PortfolioConcentrationRiskRequest,
    subtype_exposure: float,
    proposed_exposure: float,
    total_active_exposure: float,
    total_after: float,
) -> Dict[str, Any]:
    liquidity_index = request.liquidityIndex
    liquidity_tier = str(request.liquidityTier or "").lower()
    weak_liquidity = (liquidity_index is not None and liquidity_index < 0.45) or "low" in liquidity_tier
    if not weak_liquidity:
        return {
            "id": "low_liquidity",
            "label": "Low-liquidity concentration",
            "currentExposure": 0,
            "postLoanExposure": 0,
            "currentShare": 0,
            "postLoanShare": 0,
            "policyCap": PORTFOLIO_POLICY_CAPS["low_liquidity"],
            "signal": "Safe",
            "explanation": "Liquidity concentration not elevated for this collateral bucket.",
        }
    return build_exposure_lens(
        "low_liquidity",
        "Low-liquidity concentration",
        subtype_exposure,
        proposed_exposure,
        total_active_exposure,
        total_after,
        PORTFOLIO_POLICY_CAPS["low_liquidity"],
    )


def worse_signal(*signals: str) -> str:
    order = {"Safe": 0, "Watch": 1, "Unavailable": 1, "High": 2, "Critical": 3}
    return max(signals, key=lambda signal: order.get(signal, 1))


def exposure_explanation(signal: str, post_share: float, policy_cap: float) -> str:
    if signal == "Safe":
        return "Exposure remains comfortably below the internal policy cap."
    if signal == "Watch":
        return "Exposure remains below the internal cap but is approaching the watch range."
    if signal == "High":
        return "Post-loan exposure would breach the internal policy cap."
    return "Post-loan exposure would materially exceed the internal policy cap."


def portfolio_risk_level(score: int) -> str:
    if score <= 30:
        return "Low"
    if score <= 60:
        return "Moderate"
    if score <= 80:
        return "High"
    return "Critical"


def portfolio_review_recommendation(risk_level: str) -> str:
    if risk_level == "Low":
        return "Proceed — portfolio exposure remains comfortable."
    if risk_level == "Moderate":
        return "Proceed with portfolio watch."
    if risk_level == "High":
        return "Senior credit review recommended due to concentration risk."
    if risk_level == "Critical":
        return "Approval should require senior credit approval and reduced LTV."
    return "Portfolio concentration data unavailable. Single-case assessment still available."


def build_portfolio_risk_flags(risk_lenses: list[Dict[str, Any]]) -> list[str]:
    flags: list[str] = []
    for lens in risk_lenses:
        signal = lens.get("signal")
        label = lens.get("label", "Portfolio lens")
        if signal == "Watch":
            flags.append(f"{label} is approaching the internal policy cap.")
        elif signal == "High":
            flags.append(f"{label} breaches the internal policy cap.")
        elif signal == "Critical":
            flags.append(f"{label} materially exceeds the internal policy cap.")
    return flags or ["Similar collateral exposure remains within policy cap."]

# ============================================================================
# Hyperlocal Event Intelligence
# ============================================================================

@app.post("/api/locality/live-intelligence")
async def resolve_locality_intelligence(request: LocalityIntelligenceRequest):
    """Run the whitelisted-source locality intelligence pipeline.

    Always returns a safe payload, even if every source fails. Core valuation
    pipeline must never be broken by this endpoint.
    """
    from backend.locality_intelligence.pipeline import run_locality_intelligence

    try:
        result = await run_locality_intelligence(
            locality=request.locality,
            micro_market_id=request.microMarketId,
            city=request.city,
            zone=request.zone,
            lat=request.lat,
            lon=request.lon,
            aliases=request.aliases or [],
        )
        return result
    except Exception as exc:
        logger.warning(f"Locality intelligence endpoint failed: {exc}", exc_info=True)
        return {
            "source": "live_whitelisted_sources",
            "status": "live_unavailable_no_cached_events",
            "microMarketId": request.microMarketId,
            "locality": request.locality,
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
            "events": [],
            "auditTrail": [{
                "ruleId": "NEWS_PIPELINE_ERROR",
                "source": "endpoint",
                "input": str(exc)[:120],
                "effect": "all deltas = 0",
                "explanation": "Locality intelligence pipeline error; core valuation unaffected.",
            }],
            "sourceStatuses": [],
        }


# ============================================================================
# AI Underwriter Summary
# ============================================================================

@app.post("/api/llm/underwriter-summary")
async def generate_llm_underwriter_summary(request: UnderwriterSummaryRequest):
    """
    Generate an underwriter-facing explanation of deterministic outputs.

    Ollama is used only for narrative, evidence recommendations, and review
    route wording. Valuation, scores, flags, LTV, and portfolio risk remain
    deterministic outputs supplied in the request payload.
    """
    mode = request.mode or "auto"
    payload = (
        request.model_dump(exclude={"mode"})
        if hasattr(request, "model_dump")
        else request.dict(exclude={"mode"})
    )
    request_key = _build_underwriter_summary_request_key(payload, mode)

    cached_response = await _get_cached_underwriter_summary(request_key)
    if cached_response is not None:
        logger.info(f"AI underwriter cache hit request_key={request_key}")
        return cached_response

    existing_future = await _resolve_underwriter_summary_inflight(request_key)
    if existing_future is not None:
        logger.info(f"AI underwriter duplicate request joined in-flight execution request_key={request_key}")
        return copy.deepcopy(await asyncio.shield(existing_future))

    loop = asyncio.get_running_loop()
    request_future = loop.create_future()
    await _register_underwriter_summary_inflight(request_key, request_future)

    if settings.LLM_DEBUG:
        logger.info(
            "AI underwriter endpoint mode={} payload_bytes={} fast_model={} primary_model={} timeout={}s fast_timeout={}s",
            mode,
            len(json.dumps(payload, ensure_ascii=False, default=str)),
            settings.OLLAMA_FAST_MODEL,
            settings.OLLAMA_MODEL,
            settings.OLLAMA_TIMEOUT_SECONDS,
            settings.OLLAMA_FAST_TIMEOUT_SECONDS,
        )
    try:
        if _UNDERWRITER_SUMMARY_GENERATION_LOCK.locked():
            logger.info(f"AI underwriter request queued behind active generation request_key={request_key}")

        async with _UNDERWRITER_SUMMARY_GENERATION_LOCK:
            response = await asyncio.to_thread(
                generate_underwriter_summary_response,
                payload,
                base_url=settings.OLLAMA_BASE_URL,
                primary_model=settings.OLLAMA_MODEL,
                fallback_model=settings.OLLAMA_FALLBACK_MODEL,
                fast_model=settings.OLLAMA_FAST_MODEL,
                timeout_seconds=settings.OLLAMA_TIMEOUT_SECONDS,
                fast_timeout_seconds=settings.OLLAMA_FAST_TIMEOUT_SECONDS,
                mode=mode,
                debug_enabled=settings.LLM_DEBUG,
            )
        await _store_underwriter_summary_result(request_key, response)
        if not request_future.done():
            request_future.set_result(copy.deepcopy(response))
        return response
    except Exception as exc:
        logger.warning(f"AI underwriter summary fallback used: {exc}", exc_info=True)
        if mode == "enhanced":
            response = {
                "source": "unavailable",
                "modelUsed": settings.OLLAMA_MODEL,
                "fallbackUsed": False,
                "mode": "enhanced",
                "summaryQuality": "unavailable",
                "upgradeAvailable": False,
                "error": "Enhanced summary unavailable",
                "summary": None,
            }
        else:
            response = {
                "source": "rule_based_fallback",
                "modelUsed": None,
                "fallbackUsed": True,
                "mode": mode,
                "summaryQuality": "fallback",
                "upgradeAvailable": mode == "fast" and settings.OLLAMA_MODEL != settings.OLLAMA_FAST_MODEL,
                "summary": build_rule_based_fallback(payload),
            }
        if settings.LLM_DEBUG:
            response["llmDebug"] = {
                "mode": mode,
                "primaryModel": settings.OLLAMA_MODEL,
                "fallbackModel": settings.OLLAMA_FALLBACK_MODEL,
                "fastModel": settings.OLLAMA_FAST_MODEL,
                "timeoutSeconds": settings.OLLAMA_TIMEOUT_SECONDS,
                "fastTimeoutSeconds": settings.OLLAMA_FAST_TIMEOUT_SECONDS,
                "attempts": [],
                "error": str(exc),
            }
        await _store_underwriter_summary_result(request_key, response)
        if not request_future.done():
            request_future.set_result(copy.deepcopy(response))
        return response
    finally:
        await _clear_underwriter_summary_inflight(request_key)

@app.post("/valuate", response_model=ValuationResponse)
async def run_valuation(
    property_input: PropertyInput,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """
    Main valuation endpoint
    
    Accepts property details, runs full parallel inference pipeline,
    returns valuation + fraud flags + confidence scores
    """
    logger.info(f"Valuation request received for {property_input.address}")
    
    try:
        if property_input.images and len(property_input.images) > settings.VISION_MAX_IMAGES_PER_CASE:
            raise HTTPException(
                status_code=422,
                detail=f"At most {settings.VISION_MAX_IMAGES_PER_CASE} images can be submitted per case",
            )

        Base.metadata.create_all(bind=engine)

        # 1. Store property in database
        property_record = Property(
            address=property_input.address,
            latitude=property_input.latitude,
            longitude=property_input.longitude,
            property_type=property_input.property_type,
            config=property_input.config,
            carpet_area=property_input.carpet_area,
            age_bucket=property_input.age_bucket,
            pincode=property_input.pincode,
            city=property_input.city,
            status="submitted"
        )
        db.add(property_record)
        db.commit()
        db.refresh(property_record)
        
        logger.info(f"Property stored with ID: {property_record.id}")
        
        # 2. Build and execute parallel pipeline
        pipeline = build_pipeline(
            property_record.id,
            property_input,
            db
        )
        
        pipeline_results = await pipeline.execute()
        
        # 3. Aggregate results into valuation
        valuation = aggregate_results(
            property_record.id,
            property_input,
            pipeline_results,
            db
        )
        
        # 4. Store fraud flags
        fraud_flags = store_fraud_flags(
            property_record.id,
            valuation.id,
            pipeline_results,
            db
        )
        
        logger.info(f"Valuation completed: {valuation.id}")
        
        return ValuationResponse(
            property_id=property_record.id,
            market_value=valuation.market_value,
            distress_value=valuation.distress_value,
            PropIntel=valuation.PropIntel,
            confidence_score=valuation.confidence_score,
            confidence_breakdown=valuation.confidence_breakdown,
            time_to_sell=valuation.time_to_sell,
            risk_level=fraud_flags.risk_level,
            narrative=task_result(
                pipeline_results["tasks"],
                "narrative_generation",
                {"executive_summary": "Valuation completed; narrative model unavailable."},
            ).get("executive_summary", "Valuation completed."),
            fraud_flags=fraud_flags.all_flags or [],
            pipeline_execution_time=pipeline_results["total_execution_time"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Valuation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/report/{property_id}")
async def get_case_report(property_id: str, db: Session = Depends(get_db)):
    """
    Return a machine-readable collateral audit report for a stored valuation.

    The hackathon UI can export a client-side audit pack, while this endpoint
    gives API users a stable backend report contract for stored `/valuate` runs.
    """
    property_record = db.query(Property).filter(Property.id == property_id).first()
    if not property_record:
        raise HTTPException(status_code=404, detail="Property report not found")

    valuation = (
        db.query(Valuation)
        .filter(Valuation.property_id == property_id)
        .order_by(Valuation.created_at.desc())
        .first()
    )
    fraud_check = (
        db.query(FraudCheck)
        .filter(FraudCheck.property_id == property_id)
        .order_by(FraudCheck.created_at.desc())
        .first()
    )
    if not valuation:
        raise HTTPException(status_code=404, detail="No valuation report exists for this property")

    return {
        "reportType": "PropIntel collateral audit report",
        "generatedAt": datetime.utcnow().isoformat(),
        "property": {
            "id": property_record.id,
            "address": property_record.address,
            "city": property_record.city,
            "pincode": property_record.pincode,
            "propertyType": property_record.property_type,
            "config": property_record.config,
            "carpetArea": property_record.carpet_area,
            "status": property_record.status,
            "createdAt": property_record.created_at.isoformat() if property_record.created_at else None,
        },
        "valuation": {
            "id": valuation.id,
            "marketValue": valuation.market_value,
            "distressValue": valuation.distress_value,
            "PropIntel": valuation.PropIntel,
            "confidenceScore": valuation.confidence_score,
            "confidenceBreakdown": valuation.confidence_breakdown,
            "circleRate": valuation.circle_rate,
            "marketMultiplier": valuation.market_multiplier,
            "timeToSell": valuation.time_to_sell,
            "pipelineExecutionTime": valuation.pipeline_execution_time,
            "hasImages": valuation.has_images,
            "createdAt": valuation.created_at.isoformat() if valuation.created_at else None,
        },
        "fraudReview": {
            "riskLevel": fraud_check.risk_level if fraud_check else "unavailable",
            "flags": fraud_check.all_flags if fraud_check else [],
            "sizeSanityPass": fraud_check.size_sanity_pass if fraud_check else None,
            "listingPhotoDetected": fraud_check.listing_photo_detected if fraud_check else None,
            "locationConsistencyScore": fraud_check.location_consistency_score if fraud_check else None,
        },
        "deterministicBoundary": (
            "Numeric scores, value estimates, LTV adjustments, and risk flags are deterministic. "
            "AI only explains computed outputs and recommends evidence."
        ),
        "rawPipeline": valuation.raw_output,
    }

# ============================================================================
# Helper Functions
# ============================================================================

def build_pipeline(property_id: str, prop_input: PropertyInput, db: Session) -> PipelineDAG:
    """
    Build the parallel inference DAG
    
    Task graph:
    - geo_enrichment (independent)
    - circle_rate (independent)
    - ipi_compute (depends: geo_enrichment)
    - market_signals (independent)
    - vision_analysis (depends: images)
    - fraud_detection (depends: vision_analysis, circle_rate)
    - xgboost_multiplier (depends: market_signals, ipi_compute)
    - narrative_generation (depends: ALL OTHERS)
    """
    
    # Create progress tracker for this valuation
    progress_tracker = ProgressTracker(property_id)
    
    input_context = {
        "property_id": property_id,
        "address": prop_input.address,
        "property_type": prop_input.property_type,
        "config": prop_input.config,
        "carpet_area": prop_input.carpet_area,
        "age_bucket": prop_input.age_bucket,
        "pincode": prop_input.pincode,
        "city": prop_input.city,
        "has_images": bool(prop_input.images),
        "images": prop_input.images or [],
    }

    dag = PipelineDAG(
        max_workers=settings.MAX_WORKERS,
        progress_tracker=progress_tracker,
        initial_context=input_context,
    )
    
    # Add tasks in dependency order
    dag.add_task(
        "geo_enrichment",
        lambda ctx: geo_enrichment_task(ctx),
        dependencies=[],
        is_async=True,
        timeout=10
    )
    
    dag.add_task(
        "circle_rate",
        lambda ctx: circle_rate_task(ctx),
        dependencies=[],
        is_async=True,
        timeout=5
    )
    
    dag.add_task(
        "ipi_compute",
        lambda ctx: ipi_compute_task(ctx),
        dependencies=["geo_enrichment"],
        is_async=True,
        timeout=15
    )
    
    dag.add_task(
        "market_signals",
        lambda ctx: market_signals_task(ctx),
        dependencies=[],
        is_async=True,
        timeout=10
    )
    
    dag.add_task(
        "vision_analysis",
        lambda ctx: vision_analysis_task(ctx),
        dependencies=[],
        is_async=True,
        timeout=60  # VLM takes time
    )
    
    dag.add_task(
        "fraud_detection",
        lambda ctx: fraud_detection_task(ctx),
        dependencies=["vision_analysis", "circle_rate"],
        is_async=True,
        timeout=30
    )
    
    dag.add_task(
        "xgboost_multiplier",
        lambda ctx: xgboost_multiplier_task(ctx),
        dependencies=["market_signals", "ipi_compute"],
        is_async=True,
        timeout=10
    )
    
    dag.add_task(
        "narrative_generation",
        lambda ctx: narrative_generation_task(ctx),
        dependencies=["geo_enrichment", "circle_rate", "ipi_compute", "market_signals", "vision_analysis", "fraud_detection", "xgboost_multiplier"],
        is_async=True,
        timeout=30
    )
    
    return dag

def aggregate_results(
    property_id: str,
    prop_input: PropertyInput,
    pipeline_results: Dict[str, Any],
    db: Session
) -> Valuation:
    """Aggregate parallel task results into final valuation"""
    
    tasks = pipeline_results["tasks"]
    
    # Extract key results, preserving deterministic fallbacks when an optional model is unavailable.
    circle_rate_result = task_result(tasks, "circle_rate", {"circle_rate": 45000})
    xgb_result = task_result(tasks, "xgboost_multiplier", {"market_multiplier": 1.0})
    vision = task_result(tasks, "vision_analysis", {"has_images": False, "condition_score": None})
    market = task_result(tasks, "market_signals", {})
    circle_rate = float(circle_rate_result.get("circle_rate") or 45000)
    xgb_multiplier = float(xgb_result.get("market_multiplier") or 1.0)
    
    # Calculate valuations
    base_value = circle_rate * prop_input.carpet_area
    market_value = base_value * xgb_multiplier
    distress_value = market_value * 0.80  # 20% discount
    
    # Calculate confidence
    confidence = calculate_confidence(vision, prop_input)
    
    # Create valuation record
    valuation = Valuation(
        property_id=property_id,
        market_value=format_currency(market_value),
        distress_value=format_currency(distress_value),
        PropIntel=calculate_PropIntel(market, circle_rate, vision),
        confidence_score=confidence,
        confidence_breakdown={
            "base": 0.6,
            "legal": 0.15,
            "visual": 0.15 if vision.get("has_images") else 0,
            "historical": 0.1
        },
        circle_rate=circle_rate,
        market_multiplier=xgb_multiplier,
        time_to_sell="45-60 days",
        pipeline_execution_time=pipeline_results["total_execution_time"],
        has_images=bool(vision.get("has_images")),
        raw_output=pipeline_results
    )
    
    db.add(valuation)
    db.commit()
    db.refresh(valuation)
    
    return valuation


def task_result(tasks: Dict[str, Any], name: str, default: Dict[str, Any]) -> Dict[str, Any]:
    task = tasks.get(name) or {}
    result = task.get("result")
    return result if isinstance(result, dict) else default

def calculate_confidence(vision: Dict, prop_input: PropertyInput) -> float:
    """Calculate confidence score based on available data"""
    confidence = 0.55  # Base
    
    if vision.get("has_images"):
        confidence += 0.15
    
    if prop_input.age_bucket:
        confidence += 0.05
    
    if prop_input.legal_status == "clear":
        confidence += 0.05
    
    return min(0.95, confidence)

def calculate_PropIntel(market: Dict, circle_rate: float, vision: Dict) -> float:
    """Calculate PropIntel (0-100)"""
    # Formula: based on market demand, supply, location quality
    base = 50
    
    if market.get("demand_proxy", 0) > 0.7:
        base += 15
    
    if market.get("listing_density", 0) > 0.8:
        base += 10
    
    condition_score = vision.get("condition_score")
    if condition_score is None:
        condition_score = 5
    if condition_score >= 7:
        base += 10
    
    return min(100, max(0, base))

def format_currency(value: float) -> str:
    """Format value as ₹ currency"""
    if value >= 1e7:  # >= 1 Cr
        return f"₹{value/1e7:.1f} Cr"
    elif value >= 1e5:  # >= 1 Lakh
        return f"₹{value/1e5:.1f} Lakh"
    else:
        return f"₹{value:,.0f}"

def store_fraud_flags(
    property_id: str,
    valuation_id: str,
    pipeline_results: Dict,
    db: Session
) -> FraudCheck:
    """Store fraud detection results"""
    
    fraud = task_result(pipeline_results.get("tasks", {}), "fraud_detection", {
        "phash_flag": False,
        "clip_similarity": 0,
        "listing_photo_detected": False,
        "size_sanity_pass": True,
        "location_consistency": 1,
        "risk_level": "low",
        "flags": [],
    })
    
    fraud_record = FraudCheck(
        property_id=property_id,
        valuation_id=valuation_id,
        phash_match=fraud.get("phash_flag", False),
        phash_score=fraud.get("phash_score"),
        clip_similarity=fraud.get("clip_similarity"),
        clip_flag=fraud.get("clip_similarity", 0) > 0.85,
        listing_photo_detected=fraud.get("listing_photo_detected", False),
        size_sanity_pass=fraud.get("size_sanity_pass", True),
        location_consistency_score=fraud.get("location_consistency"),
        location_consistency_flag=fraud.get("location_consistency", 1.0) < 0.70,
        risk_level=fraud.get("risk_level", "low"),
        all_flags=fraud.get("flags", [])
    )
    
    db.add(fraud_record)
    db.commit()
    
    return fraud_record

# ============================================================================
# Startup/Shutdown
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("PropIntel backend starting up")
    
    # GPU detection
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            logger.info(f"GPU detected: {gpu_name}")
            logger.info("Selected inference backend: CUDA")
            logger.info("Model load device: GPU/CUDA")
        else:
            logger.warning("No GPU detected unexpectedly. Selected inference backend: CPU")
            logger.warning("Model load device: CPU")
    except ImportError:
        logger.warning("PyTorch not installed. Cannot verify GPU.")

    # Create tables
    from backend.database import Base
    Base.metadata.create_all(bind=engine)
    init_db()
    try:
        locality = find_nearest_locality(19.1136, 72.8697)
        if not locality:
            counts = seed_db()
            logger.info(f"SQLite reference database seeded: {counts}")
    except Exception as exc:
        logger.warning(f"SQLite reference database initialization skipped: {exc}")

    # Seed the locality_event_cache with demo events when empty (idempotent).
    try:
        from backend.locality_intelligence.seed import seed_locality_events_if_empty
        seeded = seed_locality_events_if_empty()
        if seeded:
            logger.info(f"Locality event cache seeded with {seeded} demo events")
    except Exception as exc:
        logger.warning(f"Locality event cache seeding skipped: {exc}")

    logger.info("Database tables created")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
