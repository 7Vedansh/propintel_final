"""Whitelist of trusted sources for Hyperlocal Event Intelligence.

Two tiers:
  - official  : MMRDA, MahaRERA, IMD, NDMA Sachet — verification / trust layer.
  - reputed_media / local_media : Times of India, Hindustan Times, Indian
    Express, Economic Times, Moneycontrol, The Hindu, Mid-Day — live discovery
    layer.  Media signals are scored at a lower trust weight and require
    corroboration before they create meaningful impact.

`validate_url_against_whitelist` strictly rejects any URL whose hostname is
not a suffix-match of an enabled `allowedDomain` AND whose resolved IP is
not public. This is the SSRF boundary for the whole pipeline.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from urllib.parse import urlparse


@dataclass(frozen=True)
class SourceConfig:
    sourceId: str
    sourceName: str
    baseUrl: str
    allowedDomain: str
    sourceType: str                          # infrastructure | real_estate_regulator | weather_risk | disaster_alert | media_realestate | media_general
    sourceTier: str                          # official | reputed_media | local_media
    trustScore: float                        # 0..1
    enabled: bool = True
    fetchMode: str = "html"                  # html | rss | pdf | api | static_page | xml | stub
    supportedEventTypes: Tuple[str, ...] = field(default_factory=tuple)
    parserHint: str = ""
    fetchUrls: Tuple[str, ...] = field(default_factory=tuple)


# ──────────────────────────────────────────────────────────────────────────
# Official sources (verification / trust layer)
# ──────────────────────────────────────────────────────────────────────────
OFFICIAL_SOURCES: List[SourceConfig] = [
    SourceConfig(
        sourceId="mmrda",
        sourceName="MMRDA",
        baseUrl="https://mmrda.maharashtra.gov.in",
        allowedDomain="mmrda.maharashtra.gov.in",
        sourceType="infrastructure",
        sourceTier="official",
        trustScore=0.95,
        fetchMode="html",
        supportedEventTypes=(
            "metro_connectivity",
            "road_infra",
            "infrastructure_delay",
            "redevelopment_activity",
        ),
        parserHint="press_releases_index",
        fetchUrls=(
            "https://mmrda.maharashtra.gov.in/press-releases",
            "https://mmrda.maharashtra.gov.in/whats-new",
        ),
    ),
    SourceConfig(
        sourceId="ndma_sachet",
        sourceName="NDMA Sachet",
        baseUrl="https://sachet.ndma.gov.in",
        allowedDomain="sachet.ndma.gov.in",
        sourceType="disaster_alert",
        sourceTier="official",
        trustScore=0.95,
        fetchMode="html",
        supportedEventTypes=(
            "disaster_alert",
            "flood_warning",
            "heavy_rain_alert",
            "weather_water_risk",
        ),
        parserHint="alerts_index",
        fetchUrls=(
            "https://sachet.ndma.gov.in/",
            "https://sachet.ndma.gov.in/cap_public_website/AlertSearch",
        ),
    ),
    SourceConfig(
        sourceId="maharera",
        sourceName="MahaRERA",
        baseUrl="https://maharera.maharashtra.gov.in",
        allowedDomain="maharera.maharashtra.gov.in",
        sourceType="real_estate_regulator",
        sourceTier="official",
        trustScore=0.95,
        fetchMode="stub",
        supportedEventTypes=(
            "rera_project_risk",
            "revoked_project",
            "delayed_project",
            "deregistered_project",
        ),
        parserHint="javascript_rendered_table",
        fetchUrls=(
            "https://maharera.maharashtra.gov.in/projects/registered",
        ),
    ),
    SourceConfig(
        sourceId="imd",
        sourceName="IMD",
        baseUrl="https://mausam.imd.gov.in",
        allowedDomain="mausam.imd.gov.in",
        sourceType="weather_risk",
        sourceTier="official",
        trustScore=0.90,
        fetchMode="stub",
        supportedEventTypes=(
            "heavy_rain_warning",
            "weather_water_risk",
            "flood_risk",
        ),
        parserHint="region_warning_pages",
        fetchUrls=(
            "https://mausam.imd.gov.in/mumbai/",
        ),
    ),
]

# ──────────────────────────────────────────────────────────────────────────
# Tier-2 media sources (live discovery layer)
# Trust scores per brief:
#   reputed_media: 0.65–0.80
#   local_media:   0.45–0.60
# RSS preferred where stable; HTML index fallback otherwise.
# ──────────────────────────────────────────────────────────────────────────
MEDIA_SOURCES: List[SourceConfig] = [
    SourceConfig(
        sourceId="hindustan_times_mumbai",
        sourceName="Hindustan Times — Mumbai",
        baseUrl="https://www.hindustantimes.com",
        allowedDomain="hindustantimes.com",
        sourceType="media_general",
        sourceTier="reputed_media",
        trustScore=0.75,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "rera_project_risk", "delayed_project", "redevelopment_activity",
            "flood_warning", "waterlogging_risk", "environmental_restriction",
            "commercial_growth", "business_district_growth",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://www.hindustantimes.com/feeds/rss/cities/mumbai-news/rssfeed.xml",
        ),
    ),
    SourceConfig(
        sourceId="the_hindu_mumbai",
        sourceName="The Hindu — Mumbai",
        baseUrl="https://www.thehindu.com",
        allowedDomain="thehindu.com",
        sourceType="media_general",
        sourceTier="reputed_media",
        trustScore=0.78,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "rera_project_risk", "delayed_project", "redevelopment_activity",
            "flood_warning", "waterlogging_risk", "environmental_restriction",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://www.thehindu.com/news/cities/mumbai/feeder/default.rss",
        ),
    ),
    SourceConfig(
        sourceId="indian_express_mumbai",
        sourceName="Indian Express — Mumbai",
        baseUrl="https://indianexpress.com",
        allowedDomain="indianexpress.com",
        sourceType="media_general",
        sourceTier="reputed_media",
        trustScore=0.74,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "rera_project_risk", "delayed_project", "redevelopment_activity",
            "flood_warning", "waterlogging_risk",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://indianexpress.com/section/cities/mumbai/feed/",
        ),
    ),
    SourceConfig(
        sourceId="times_of_india_mumbai",
        sourceName="Times of India — Mumbai",
        baseUrl="https://timesofindia.indiatimes.com",
        allowedDomain="indiatimes.com",
        sourceType="media_general",
        sourceTier="reputed_media",
        trustScore=0.72,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "rera_project_risk", "delayed_project", "redevelopment_activity",
            "flood_warning", "waterlogging_risk", "commercial_growth",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://timesofindia.indiatimes.com/rssfeeds/-2128838597.cms",
        ),
    ),
    SourceConfig(
        sourceId="economic_times_realty",
        sourceName="Economic Times — Realty",
        baseUrl="https://realty.economictimes.indiatimes.com",
        allowedDomain="indiatimes.com",
        sourceType="media_realestate",
        sourceTier="reputed_media",
        trustScore=0.78,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "rera_project_risk", "delayed_project", "revoked_project",
            "deregistered_project", "redevelopment_activity",
            "commercial_growth", "business_district_growth",
            "rental_demand_growth", "oversupply_signal",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://realty.economictimes.indiatimes.com/rss/topstories",
        ),
    ),
    SourceConfig(
        sourceId="moneycontrol_realestate",
        sourceName="Moneycontrol — Real Estate",
        baseUrl="https://www.moneycontrol.com",
        allowedDomain="moneycontrol.com",
        sourceType="media_realestate",
        sourceTier="reputed_media",
        trustScore=0.72,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "rera_project_risk",
            "delayed_project", "redevelopment_activity",
            "commercial_growth", "rental_demand_growth", "oversupply_signal",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://www.moneycontrol.com/rss/realestate.xml",
        ),
    ),
    SourceConfig(
        sourceId="mid_day_mumbai",
        sourceName="Mid-Day — Mumbai",
        baseUrl="https://www.mid-day.com",
        allowedDomain="mid-day.com",
        sourceType="media_general",
        sourceTier="local_media",
        trustScore=0.55,
        fetchMode="rss",
        supportedEventTypes=(
            "metro_connectivity", "road_infra", "infrastructure_delay",
            "flood_warning", "waterlogging_risk", "redevelopment_activity",
        ),
        parserHint="rss_feed",
        fetchUrls=(
            "https://www.mid-day.com/rss/mumbai-news.xml",
        ),
    ),
]


SOURCES: List[SourceConfig] = OFFICIAL_SOURCES + MEDIA_SOURCES


def get_source(source_id: str) -> Optional[SourceConfig]:
    for s in SOURCES:
        if s.sourceId == source_id:
            return s
    return None


def enabled_sources() -> List[SourceConfig]:
    return [s for s in SOURCES if s.enabled]


def official_sources() -> List[SourceConfig]:
    return [s for s in enabled_sources() if s.sourceTier == "official"]


def media_sources() -> List[SourceConfig]:
    return [s for s in enabled_sources() if s.sourceTier in ("reputed_media", "local_media")]


def validate_url_against_whitelist(url: str) -> Tuple[bool, str]:
    """Return (allowed, reason)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "invalid_url"

    if parsed.scheme not in ("http", "https"):
        return False, "unsupported_scheme"
    if not parsed.hostname:
        return False, "missing_hostname"

    host = parsed.hostname.lower()
    matched = False
    for s in enabled_sources():
        d = s.allowedDomain.lower()
        if host == d or host.endswith("." + d):
            matched = True
            break
    if not matched:
        return False, "host_not_in_whitelist"

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        return False, f"dns_resolve_failed: {exc}"

    for info in infos:
        candidate = info[4][0]
        try:
            ip = ipaddress.ip_address(candidate)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            return False, "private_or_local_ip"
    return True, "ok"


def source_matches(source_id: str, url: str) -> bool:
    src = get_source(source_id)
    if src is None:
        return False
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    d = src.allowedDomain.lower()
    return host == d or host.endswith("." + d)
