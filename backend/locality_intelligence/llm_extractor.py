"""Event extraction layer.

Two paths:
  - ollama_extract:    uses the existing local Ollama setup (qwen / llama)
                       with strict JSON output. Evidence field must quote.
  - rule_based_extract: regex / keyword classifier. Conservative.

The LLM never sees raw scraped text outside this module. It returns only the
structured event JSON. Numbers (scoring) are decided downstream by scoring.py,
not by the LLM. If both paths fail or yield 'irrelevant', the document
contributes zero events.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from loguru import logger

from backend.config import settings
from backend.llm.ollama_client import OllamaSummaryError, call_ollama, list_available_ollama_models, select_available_model

ALLOWED_EVENT_TYPES = {
    "metro_connectivity",
    "road_infra",
    "airport_connectivity",
    "commercial_growth",
    "business_district_growth",
    "redevelopment_activity",
    "rental_demand_growth",
    "infrastructure_delay",
    "rera_project_risk",
    "revoked_project",
    "delayed_project",
    "litigation_redevelopment_risk",
    "environmental_restriction",
    "weather_water_risk",
    "flood_warning",
    "waterlogging_risk",
    "oversupply_signal",
    "heavy_rain_warning",
    "flood_risk",
    "disaster_alert",
    "heavy_rain_alert",
    "deregistered_project",
    "neutral_update",
    "irrelevant",
}
POSITIVE_TYPES = {
    "metro_connectivity", "road_infra", "airport_connectivity", "commercial_growth",
    "business_district_growth", "redevelopment_activity", "rental_demand_growth",
}
NEGATIVE_TYPES = {
    "infrastructure_delay", "rera_project_risk", "revoked_project", "delayed_project",
    "litigation_redevelopment_risk", "environmental_restriction", "weather_water_risk",
    "flood_warning", "waterlogging_risk", "oversupply_signal", "heavy_rain_warning",
    "flood_risk", "disaster_alert", "heavy_rain_alert", "deregistered_project",
}

ALLOWED_DIRECTIONS = {"positive", "negative", "neutral"}
ALLOWED_PROJECT_STATUS = {
    "operational", "completed", "under_construction", "approved",
    "announced", "proposed", "delayed", "stalled", "unknown",
}


def _direction_for(event_type: str) -> str:
    if event_type in POSITIVE_TYPES:
        return "positive"
    if event_type in NEGATIVE_TYPES:
        return "negative"
    return "neutral"


# ──────────────────────────────────────────────────────────────────────────
# Rule-based extractor — conservative keyword classifier.
# Triggered when Ollama is unavailable or returns irrelevant.
# Returns at most one event per document.
# ──────────────────────────────────────────────────────────────────────────

_KEYWORD_RULES: List[Dict[str, Any]] = [
    # severe / structural
    {"any": [r"\bfire\b", r"\bblast\b", r"\bbuilding collapse\b"],
     "eventType": "litigation_redevelopment_risk", "impactArea": "structural", "severity": 0.85, "confidence": 0.7},
    # disasters
    {"any": [r"\bcyclone\b", r"\bnowcast warning\b", r"\bred alert\b", r"\bnarrowcast\b"],
     "eventType": "disaster_alert", "impactArea": "disaster", "severity": 0.85, "confidence": 0.78},
    {"any": [r"\bheavy rain\b", r"\bvery heavy rain\b", r"\bextremely heavy rain\b"],
     "eventType": "heavy_rain_alert", "impactArea": "weather", "severity": 0.7, "confidence": 0.75},
    {"any": [r"\bflood warning\b", r"\bflood alert\b"],
     "eventType": "flood_warning", "impactArea": "weather", "severity": 0.78, "confidence": 0.78},
    {"any": [r"\bwaterlog", r"\bwater\s+logging\b"],
     "eventType": "waterlogging_risk", "impactArea": "weather", "severity": 0.6, "confidence": 0.7},
    # RERA risk
    {"any": [r"\brevoked\b", r"\bregistration cancelled\b", r"\bderegister", r"\blapsed registration\b"],
     "eventType": "revoked_project", "impactArea": "regulatory", "severity": 0.8, "confidence": 0.78},
    {"any": [r"\bproject delayed\b", r"\bdelayed by\b", r"\bextension of completion\b"],
     "eventType": "delayed_project", "impactArea": "regulatory", "severity": 0.65, "confidence": 0.72},
    {"any": [r"\brera\b.*\b(complaint|order|penalty|fine)\b", r"\b(maharera)\b.*\b(complaint|penalty)\b"],
     "eventType": "rera_project_risk", "impactArea": "regulatory", "severity": 0.7, "confidence": 0.72},
    # infrastructure positive
    {"any": [r"\bmetro\s+(line|phase)\b", r"\bmetro line\b", r"\bmetro 7\b", r"\bmetro 2a\b",
             r"\bmetro\s+commission", r"\bmetro extension\b"],
     "eventType": "metro_connectivity", "impactArea": "connectivity", "severity": 0.75, "confidence": 0.78},
    {"any": [r"\bcoastal road\b", r"\bsea link\b", r"\btrans-harbour\b", r"\bflyover\b",
             r"\bexpressway\b", r"\bhighway\b", r"\bjvlr\b"],
     "eventType": "road_infra", "impactArea": "connectivity", "severity": 0.65, "confidence": 0.72},
    {"any": [r"\bairport\b", r"\bnavi mumbai international airport\b", r"\bnmia\b"],
     "eventType": "airport_connectivity", "impactArea": "connectivity", "severity": 0.7, "confidence": 0.75},
    # infrastructure delays
    {"any": [r"\binfrastructure delay\b", r"\bproject delayed\b", r"\bdeadline missed\b",
             r"\bwork halted\b", r"\bsuspended\b"],
     "eventType": "infrastructure_delay", "impactArea": "connectivity", "severity": 0.7, "confidence": 0.72},
    # redevelopment / commercial
    {"any": [r"\bredevelopment\b", r"\bsra\b", r"\bcluster redevelopment\b"],
     "eventType": "redevelopment_activity", "impactArea": "supply", "severity": 0.5, "confidence": 0.68},
    {"any": [r"\boffice tower\b", r"\bcommercial complex\b", r"\bbusiness district\b", r"\bbkc\b"],
     "eventType": "business_district_growth", "impactArea": "demand", "severity": 0.6, "confidence": 0.7},
    {"any": [r"\benvironmental restriction\b", r"\bcrz\b", r"\bmangrove\b.*(restrict|notif)"],
     "eventType": "environmental_restriction", "impactArea": "regulatory", "severity": 0.7, "confidence": 0.72},
]


def rule_based_extract(document: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Return a single event dict (or None) for this document."""
    text = " ".join([(document.get("title") or ""), (document.get("body") or "")]).lower()
    if not text.strip():
        return None
    for rule in _KEYWORD_RULES:
        for pattern in rule["any"]:
            m = re.search(pattern, text)
            if m:
                # Extract a short evidence quote around the match
                start = max(0, m.start() - 40)
                end = min(len(text), m.end() + 80)
                evidence = text[start:end].strip()
                event_type = rule["eventType"]
                return {
                    "eventType": event_type,
                    "direction": _direction_for(event_type),
                    "impactArea": rule["impactArea"],
                    "severity": rule["severity"],
                    "confidence": rule["confidence"],
                    "localityRelevance": 0.0,  # filled by matcher downstream
                    "localities": [],
                    "project": None,
                    "projectStatus": "unknown",
                    "expectedCompletionMonths": None,
                    "evidence": evidence[:280],
                    "summary": (document.get("title") or "")[:240],
                    "_extractor": "rule_based",
                }
    return None


# ──────────────────────────────────────────────────────────────────────────
# Ollama-based extractor
# ──────────────────────────────────────────────────────────────────────────

_PROMPT_TEMPLATE = """You are an information extraction engine for a real-estate
underwriting system. You extract ONLY events that are explicitly supported by the
provided source text. You do not infer, you do not predict price, you do not
recommend valuation. Return STRICT JSON only.

Allowed eventType values:
{allowed_event_types}

Allowed direction values: positive, negative, neutral.

Allowed projectStatus values: operational, completed, under_construction,
approved, announced, proposed, delayed, stalled, unknown.

Rules:
1. If no event is clearly supported by the text, set eventType = "irrelevant".
2. The "evidence" field MUST be an exact substring or near-exact short quote
   from the provided source text. Maximum 280 characters.
3. Numeric scores (severity, confidence, localityRelevance) are decimals in
   [0, 1]. Be conservative.
4. Never recommend valuation, price, LTV, approval. Never invent localities.
5. Return JSON only — no preamble, no markdown, no commentary.

Output JSON shape exactly:
{{
  "eventType": "string",
  "direction": "positive|negative|neutral",
  "impactArea": "connectivity|demand|supply|regulatory|weather|disaster|structural",
  "severity": 0.0,
  "confidence": 0.0,
  "localityRelevance": 0.0,
  "localities": ["string"],
  "project": "string or null",
  "projectStatus": "string",
  "expectedCompletionMonths": 0,
  "evidence": "string",
  "summary": "string"
}}

Locality context (the property being underwritten):
locality: {locality}
city: {city}
zone: {zone}
aliases: {aliases}

Source text:
{source_text}
"""


def _ollama_pick_model() -> Optional[str]:
    available = list_available_ollama_models(settings.OLLAMA_BASE_URL)
    if not available:
        return None
    return select_available_model(available, [settings.OLLAMA_MODEL, settings.OLLAMA_FAST_MODEL, "qwen2.5:7b", "llama3.2:3b"])


def ollama_extract(document: Dict[str, Any], locality_context: Dict[str, Any], *, timeout_seconds: float = 60) -> Optional[Dict[str, Any]]:
    """Call Ollama with strict-JSON instruction. Returns parsed event dict or None."""
    model = _ollama_pick_model()
    if not model:
        return None
    source_text = (document.get("title") or "") + "\n\n" + (document.get("body") or "")
    source_text = source_text[:6000]  # keep prompt small
    prompt = _PROMPT_TEMPLATE.format(
        allowed_event_types=", ".join(sorted(ALLOWED_EVENT_TYPES)),
        locality=locality_context.get("locality") or "",
        city=locality_context.get("city") or "",
        zone=locality_context.get("zone") or "",
        aliases=", ".join(locality_context.get("aliases") or []),
        source_text=source_text,
    )
    try:
        raw = call_ollama(
            base_url=settings.OLLAMA_BASE_URL,
            model=model,
            prompt=prompt,
            timeout_seconds=timeout_seconds,
            request_json_format=True,
            caller_source="locality-intelligence",
        )
    except OllamaSummaryError as exc:
        logger.warning(f"Ollama event extraction failed: {exc}")
        return None
    except Exception as exc:
        logger.warning(f"Ollama event extraction crashed: {type(exc).__name__}: {exc}")
        return None

    # Parse the response
    try:
        # Try strict json first, then fall back to greedy object extraction
        obj = json.loads(raw)
    except Exception:
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except Exception:
            return None

    if not isinstance(obj, dict):
        return None

    obj.setdefault("_extractor", "ollama")
    obj["_extractorModel"] = model
    return obj


def extract_event(document: Dict[str, Any], locality_context: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Try Ollama first; fall back to rule-based. Returns None for empty / irrelevant."""
    event = ollama_extract(document, locality_context)
    if event and (event.get("eventType") or "") not in ("", "irrelevant"):
        return event
    return rule_based_extract(document)
