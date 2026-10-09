"""Property-impact relevance for locality news events.

Event extraction answers: "did an event occur?"
This module answers: "would this event plausibly change what a buyer, lender,
insurer, or investor pays for this specific property?"
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, Optional

from .locality_matcher import locality_radius_profile


VALUATION_RELEVANCE_FLOOR = 0.12

_PERSISTENT_TERMS = (
    "recurring", "persistent", "chronic", "hotspot", "hotspots", "repeated",
    "every monsoon", "low-lying", "long-term", "corridor", "project",
    "approved", "operational", "redevelopment", "zoning", "restriction",
    "revoked", "deregistered", "delayed", "under construction",
)
_ROUTINE_WEATHER_TERMS = (
    "pre-monsoon", "pre monsoon", "showers", "light rain", "moderate rain",
    "drench", "drizzles", "cloudy", "seasonal", "monsoon arrived",
)

_ASSET_RELEVANCE = {
    "metro_connectivity": 0.95,
    "airport_connectivity": 0.88,
    "road_infra": 0.84,
    "commercial_growth": 0.76,
    "business_district_growth": 0.76,
    "rental_demand_growth": 0.78,
    "redevelopment_activity": 0.78,
    "infrastructure_delay": 0.82,
    "rera_project_risk": 0.88,
    "revoked_project": 0.95,
    "delayed_project": 0.78,
    "deregistered_project": 0.95,
    "litigation_redevelopment_risk": 0.86,
    "environmental_restriction": 0.90,
    "oversupply_signal": 0.76,
    "flood_warning": 0.82,
    "flood_risk": 0.82,
    "waterlogging_risk": 0.72,
    "weather_water_risk": 0.38,
    "disaster_alert": 0.70,
    "heavy_rain_alert": 0.22,
    "heavy_rain_warning": 0.22,
    "neutral_update": 0.0,
    "irrelevant": 0.0,
}


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    if value != value:
        return 0.0
    return max(lo, min(hi, value))


def _text(event: Dict[str, Any]) -> str:
    return " ".join(
        str(event.get(k) or "")
        for k in ("title", "summary", "evidence", "project", "impactArea")
    ).lower()


def _distance_decay(distance_km: Optional[float], radius_km: float, match_type: str) -> float:
    if match_type == "exact_locality":
        return 1.0
    if match_type == "alias":
        return 0.82
    if match_type == "project":
        return 0.72
    if distance_km is None:
        return {"zone": 0.30, "city": 0.06}.get(match_type, 0.0)
    if radius_km <= 0:
        return 0.0
    ratio = distance_km / radius_km
    if ratio <= 1.0:
        return 1.0
    if ratio >= 3.0:
        return 0.04
    return _clamp(math.exp(-1.25 * (ratio - 1.0)), 0.04, 1.0)


def _persistence(event: Dict[str, Any], text: str) -> float:
    event_type = event.get("eventType") or "neutral_update"
    status = (event.get("projectStatus") or "unknown").lower()
    if any(term in text for term in _PERSISTENT_TERMS):
        return 1.0
    if event_type in {
        "metro_connectivity", "airport_connectivity", "road_infra",
        "environmental_restriction", "rera_project_risk", "revoked_project",
        "deregistered_project", "oversupply_signal",
    }:
        return 0.90
    if status in ("operational", "completed", "under_construction", "delayed", "stalled"):
        return 0.85
    if event_type in {"waterlogging_risk", "flood_risk"}:
        return 0.70
    if event_type in {"heavy_rain_alert", "heavy_rain_warning", "weather_water_risk"}:
        return 0.18
    if event_type == "disaster_alert":
        return 0.40
    return 0.55


def _asset_relevance(event: Dict[str, Any], text: str) -> float:
    event_type = event.get("eventType") or "neutral_update"
    score = _ASSET_RELEVANCE.get(event_type, 0.0)
    if event_type in {"heavy_rain_alert", "heavy_rain_warning", "weather_water_risk"}:
        if any(term in text for term in ("waterlogging", "flood", "landslide", "red alert", "extremely heavy")):
            score = max(score, 0.55)
        if any(term in text for term in _ROUTINE_WEATHER_TERMS):
            score *= 0.25
    return _clamp(score)


def _impact_channel(event_type: str) -> str:
    if event_type in {"metro_connectivity", "airport_connectivity", "road_infra"}:
        return "infrastructure access and buyer demand"
    if event_type in {"commercial_growth", "business_district_growth", "rental_demand_growth"}:
        return "demand depth and liquidity"
    if event_type in {"redevelopment_activity"}:
        return "redevelopment potential"
    if event_type in {"rera_project_risk", "revoked_project", "delayed_project", "deregistered_project", "litigation_redevelopment_risk"}:
        return "financing, legal risk, and liquidity"
    if event_type in {"flood_warning", "flood_risk", "waterlogging_risk", "weather_water_risk", "heavy_rain_alert", "heavy_rain_warning", "disaster_alert"}:
        return "future risk, insurance, and saleability"
    if event_type in {"environmental_restriction"}:
        return "regulatory restrictions and development potential"
    if event_type in {"oversupply_signal"}:
        return "liquidity and price negotiation power"
    return "no durable valuation channel"


def enrich_property_relevance(event: Dict[str, Any], property_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Add property-impact explainability fields to one extracted event."""
    out = dict(event)
    ctx = property_context or {}
    city = out.get("city") or ctx.get("city")
    zone = out.get("zone") or ctx.get("zone")
    radius_profile, radius_km = locality_radius_profile(city, zone)

    locality_score = _clamp(float(out.get("localityRelevance") or out.get("localityMatchScore") or 0.0))
    match_type = out.get("localityMatchType") or out.get("_matchType")
    if not match_type:
        if locality_score >= 0.88:
            match_type = "exact_locality"
        elif locality_score >= 0.62:
            match_type = "alias"
        elif locality_score >= 0.18:
            match_type = "zone"
        elif locality_score > 0:
            match_type = "city"
        else:
            match_type = "none"
    geographic_overlap = _clamp(float(out.get("geographicOverlap") or locality_score))
    distance_km = out.get("distanceToPropertyKm")
    try:
        distance_km = float(distance_km) if distance_km is not None else None
    except (TypeError, ValueError):
        distance_km = None
    if distance_km is None and match_type in {"exact_locality", "alias", "project", "zone", "city"}:
        distance_km = {
            "exact_locality": 0.25,
            "alias": 0.75,
            "project": 1.0,
            "zone": 2.5,
            "city": 8.0,
        }[match_type] * float(out.get("dynamicRadiusKm") or radius_km)

    text = _text(out)
    severity = _clamp(float(out.get("severity") or 0.0))
    confidence = _clamp(float(out.get("confidence") or 0.0))
    distance_decay = _distance_decay(distance_km, float(out.get("dynamicRadiusKm") or radius_km), match_type)
    persistence = _persistence(out, text)
    asset_relevance = _asset_relevance(out, text)

    routine_weather = (
        out.get("eventType") in {"heavy_rain_alert", "heavy_rain_warning", "weather_water_risk"}
        and any(term in text for term in _ROUTINE_WEATHER_TERMS)
    )
    generic_city_article = bool(out.get("genericCityArticle")) or match_type == "city"
    if generic_city_article:
        geographic_overlap = min(geographic_overlap, 0.08 if radius_profile == "dense_metro" else 0.18)
        distance_decay = min(distance_decay, 0.08)
    if routine_weather:
        persistence = min(persistence, 0.08)
        asset_relevance = min(asset_relevance, 0.14)

    relevance = severity * geographic_overlap * distance_decay * persistence * asset_relevance * confidence
    relevance = _clamp(relevance)
    eligible = relevance >= VALUATION_RELEVANCE_FLOOR

    if not geographic_overlap:
        reason = "Event detected, but no property-local geography was found."
    elif generic_city_article:
        reason = "City-wide event detected; no specific neighbourhood overlap with the property."
    elif routine_weather:
        reason = "Routine seasonal weather detected; no durable demand, insurance, financing, or liquidity channel."
    elif not eligible:
        reason = "Detected event lacks enough locality, persistence, or asset relevance to move this property."
    else:
        reason = f"Property-relevant event with plausible effect on {_impact_channel(out.get('eventType') or '')}."

    out.update({
        "detectedEvent": out.get("eventType") or "unknown",
        "localityMatchScore": round(locality_score, 3),
        "geographicOverlap": round(geographic_overlap, 3),
        "distanceToPropertyKm": round(distance_km, 2) if distance_km is not None else None,
        "distanceToPropertyLabel": (
            f"~{distance_km:.2f} km" if distance_km is not None else "not localized to a measurable neighbourhood"
        ),
        "dynamicRadiusKm": round(float(out.get("dynamicRadiusKm") or radius_km), 2),
        "radiusProfile": out.get("radiusProfile") or radius_profile,
        "distanceDecay": round(distance_decay, 3),
        "persistence": round(persistence, 3),
        "assetRelevance": round(asset_relevance, 3),
        "valuationRelevanceScore": round(relevance, 4),
        "valuationImpactEligible": eligible,
        "impactReason": reason,
        "impactChannel": _impact_channel(out.get("eventType") or ""),
        "genericCityArticle": generic_city_article,
        "routineWeather": routine_weather,
    })
    return out
