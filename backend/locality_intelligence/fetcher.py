"""Live HTTP fetchers for whitelisted official + media sources.

- Each source has its own strategy (`fetchMode`). One source failing never
  kills the others.
- Every URL re-validated against the whitelist before request (SSRF defence).
- Hard per-request timeout + response size cap. Redirects to non-whitelisted
  hosts are blocked.
- RSS is preferred for media sources (parsed with stdlib ElementTree — no new
  deps). HTML fallback used for official sources and as a generic last resort.
- MahaRERA + IMD remain `fetchMode='stub'`: they're registered but require a
  headless browser or PDF parsing to scrape properly; their slots fall through
  to the cache layer.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from loguru import logger

from .source_registry import (
    SourceConfig,
    enabled_sources,
    validate_url_against_whitelist,
)

REQUEST_TIMEOUT_SECONDS = 8
MAX_BYTES_PER_RESPONSE = 1_500_000  # 1.5 MB hard cap
MAX_DOCS_PER_SOURCE = 5
USER_AGENT = "PropIntelLocalityIntelligence/1.0 (+research)"


@dataclass
class FetchedDocument:
    sourceId: str
    sourceName: str
    sourceTier: str
    sourceTrust: float
    sourceType: str
    url: str
    title: str
    body: str
    publishedDate: Optional[str]
    publishedDaysAgo: Optional[int]
    fetchedAt: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_get(url: str) -> Tuple[Optional[bytes], Optional[str], Optional[str]]:
    """GET with strict whitelist + size cap. Returns (raw_bytes, content_type, error)."""
    allowed, reason = validate_url_against_whitelist(url)
    if not allowed:
        return None, None, f"url_blocked:{reason}"
    try:
        resp = requests.get(
            url,
            timeout=REQUEST_TIMEOUT_SECONDS,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xml,application/rss+xml,application/atom+xml,*/*",
            },
            allow_redirects=False,
            stream=True,
        )
        if 300 <= resp.status_code < 400:
            return None, None, f"redirect_blocked:{resp.status_code}"
        if resp.status_code != 200:
            return None, None, f"http_{resp.status_code}"
        content_type = (resp.headers.get("Content-Type") or "").lower()
        chunks: List[bytes] = []
        total = 0
        for chunk in resp.iter_content(chunk_size=16384):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_BYTES_PER_RESPONSE:
                return None, content_type, "response_too_large"
            chunks.append(chunk)
        return b"".join(chunks), content_type, None
    except requests.Timeout:
        return None, None, "timeout"
    except requests.RequestException as exc:
        return None, None, f"request_failed:{type(exc).__name__}"
    except Exception as exc:
        return None, None, f"unexpected:{type(exc).__name__}"


def _decode(raw: Optional[bytes]) -> str:
    if not raw:
        return ""
    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return raw.decode("latin-1", errors="replace")


def _extract_text_block(soup: BeautifulSoup, max_chars: int = 1500) -> str:
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    return text[:max_chars]


def _parse_pub_date(value: Optional[str]) -> Tuple[Optional[str], Optional[int]]:
    """Parse RSS/HTML date strings; return (iso_string, days_ago)."""
    if not value:
        return None, None
    txt = value.strip()
    if not txt:
        return None, None
    parsed: Optional[datetime] = None
    try:
        parsed = parsedate_to_datetime(txt)
    except Exception:
        parsed = None
    if parsed is None:
        # Try ISO-8601
        try:
            parsed = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        except Exception:
            parsed = None
    if parsed is None:
        return None, None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    days = max(0, int((datetime.now(timezone.utc) - parsed).total_seconds() // 86400))
    return parsed.isoformat(), days


# ──────────────────────────────────────────────────────────────────────────
# RSS fetcher
# ──────────────────────────────────────────────────────────────────────────

def _strip_tags(html_or_text: str, max_chars: int = 1500) -> str:
    if not html_or_text:
        return ""
    soup = BeautifulSoup(html_or_text, "html.parser")
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    return text[:max_chars]


def _fetch_rss(source: SourceConfig, max_documents: int = MAX_DOCS_PER_SOURCE) -> Tuple[List[FetchedDocument], Dict[str, Any]]:
    documents: List[FetchedDocument] = []
    errors: List[str] = []
    pages = 0
    for feed_url in source.fetchUrls:
        raw, _content_type, err = _safe_get(feed_url)
        if err or not raw:
            errors.append(f"{feed_url} -> {err or 'empty'}")
            continue
        pages += 1
        # Parse XML defensively
        try:
            # Some feeds wrap content with XML declaration variants; pass bytes directly.
            root = ET.fromstring(raw)
        except ET.ParseError as exc:
            errors.append(f"{feed_url} -> xml_parse_error:{exc}")
            continue

        # Support both RSS 2.0 (<item>) and Atom (<entry>).
        items = root.findall(".//item")
        atom_ns = ""
        if not items:
            # Try Atom — namespaced
            for ns in ("{http://www.w3.org/2005/Atom}", ""):
                items = root.findall(f".//{ns}entry")
                if items:
                    atom_ns = ns
                    break
        for item in items:
            if len(documents) >= max_documents:
                break
            if atom_ns:
                title = (item.findtext(f"{atom_ns}title") or "").strip()
                link_el = item.find(f"{atom_ns}link")
                link = (link_el.get("href") if link_el is not None else "") or ""
                summary = (item.findtext(f"{atom_ns}summary") or item.findtext(f"{atom_ns}content") or "").strip()
                pubdate = (item.findtext(f"{atom_ns}published") or item.findtext(f"{atom_ns}updated") or "").strip()
            else:
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                summary = (item.findtext("description") or "").strip()
                pubdate = (item.findtext("pubDate") or "").strip()

            if not title or not link:
                continue
            # Ensure link belongs to source's whitelist (some feeds embed external links)
            allowed, _ = validate_url_against_whitelist(link)
            if not allowed:
                continue
            iso, days_ago = _parse_pub_date(pubdate)
            body = _strip_tags(summary or "", max_chars=1500)
            documents.append(FetchedDocument(
                sourceId=source.sourceId,
                sourceName=source.sourceName,
                sourceTier=source.sourceTier,
                sourceTrust=source.trustScore,
                sourceType=source.sourceType,
                url=link,
                title=title[:240],
                body=body if body else title[:240],
                publishedDate=iso,
                publishedDaysAgo=days_ago,
                fetchedAt=_utc_now_iso(),
            ))
        if len(documents) >= max_documents:
            break

    status: Dict[str, Any] = {
        "sourceName": source.sourceName,
        "sourceTier": source.sourceTier,
        "documentsFetched": len(documents),
        "pagesProbed": pages,
    }
    if not documents:
        status["status"] = "failed"
        status["errorMessage"] = "; ".join(errors[:3]) or "no_items_parsed"
    else:
        status["status"] = "success"
    return documents, status


# ──────────────────────────────────────────────────────────────────────────
# HTML index + detail fetcher (used by official MMRDA + NDMA Sachet)
# ──────────────────────────────────────────────────────────────────────────

def _parse_links_from_index(html: str, base_url: str, max_links: int = 6) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    links: List[Dict[str, str]] = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("javascript:", "mailto:", "#")):
            continue
        full = urljoin(base_url, href)
        try:
            if urlparse(full).hostname != urlparse(base_url).hostname:
                continue
        except Exception:
            continue
        title = a.get_text(" ", strip=True)
        if not title or len(title) < 6:
            continue
        key = (full, title[:120])
        if key in seen:
            continue
        seen.add(key)
        links.append({"url": full, "title": title[:240]})
        if len(links) >= max_links:
            break
    return links


def _fetch_html_index_then_details(source: SourceConfig, max_documents: int = MAX_DOCS_PER_SOURCE) -> Tuple[List[FetchedDocument], Dict[str, Any]]:
    documents: List[FetchedDocument] = []
    errors: List[str] = []
    pages_fetched = 0

    for index_url in source.fetchUrls:
        raw, _ct, err = _safe_get(index_url)
        if err or not raw:
            errors.append(f"{index_url} -> {err or 'empty'}")
            continue
        pages_fetched += 1
        text = _decode(raw)
        soup = BeautifulSoup(text, "html.parser")

        index_title = (soup.title.string.strip() if soup.title and soup.title.string else source.sourceName)
        index_body = _extract_text_block(soup, max_chars=1500)
        documents.append(FetchedDocument(
            sourceId=source.sourceId,
            sourceName=source.sourceName,
            sourceTier=source.sourceTier,
            sourceTrust=source.trustScore,
            sourceType=source.sourceType,
            url=index_url,
            title=index_title[:240],
            body=index_body,
            publishedDate=None,
            publishedDaysAgo=None,
            fetchedAt=_utc_now_iso(),
        ))

        for link in _parse_links_from_index(text, index_url, max_links=4):
            if len(documents) >= max_documents:
                break
            d_raw, _ct, derr = _safe_get(link["url"])
            if derr or not d_raw:
                continue
            d_text = _decode(d_raw)
            dsoup = BeautifulSoup(d_text, "html.parser")
            body = _extract_text_block(dsoup, max_chars=1500)
            if len(body) < 120:
                continue
            documents.append(FetchedDocument(
                sourceId=source.sourceId,
                sourceName=source.sourceName,
                sourceTier=source.sourceTier,
                sourceTrust=source.trustScore,
                sourceType=source.sourceType,
                url=link["url"],
                title=link["title"],
                body=body,
                publishedDate=None,
                publishedDaysAgo=None,
                fetchedAt=_utc_now_iso(),
            ))
        if len(documents) >= max_documents:
            break

    status: Dict[str, Any] = {
        "sourceName": source.sourceName,
        "sourceTier": source.sourceTier,
        "documentsFetched": len(documents),
        "pagesProbed": pages_fetched,
    }
    if not documents:
        status["status"] = "failed"
        status["errorMessage"] = "; ".join(errors[:3]) or "no_documents_extracted"
    else:
        status["status"] = "success"
    return documents, status


def _fetch_stub(source: SourceConfig) -> Tuple[List[FetchedDocument], Dict[str, Any]]:
    return [], {
        "sourceName": source.sourceName,
        "sourceTier": source.sourceTier,
        "status": "skipped",
        "documentsFetched": 0,
        "errorMessage": f"fetcher_not_implemented ({source.parserHint})",
    }


def fetch_all_sources(max_documents_per_source: int = MAX_DOCS_PER_SOURCE) -> Tuple[List[FetchedDocument], List[Dict[str, Any]]]:
    all_documents: List[FetchedDocument] = []
    statuses: List[Dict[str, Any]] = []
    for source in enabled_sources():
        try:
            if source.fetchMode == "stub" or not source.fetchUrls:
                docs, status = _fetch_stub(source)
            elif source.fetchMode == "rss":
                docs, status = _fetch_rss(source, max_documents_per_source)
            else:
                docs, status = _fetch_html_index_then_details(source, max_documents_per_source)
            all_documents.extend(docs)
            statuses.append(status)
        except Exception as exc:
            logger.warning(f"Source {source.sourceName} fetch crashed: {exc}", exc_info=True)
            statuses.append({
                "sourceName": source.sourceName,
                "sourceTier": source.sourceTier,
                "status": "failed",
                "documentsFetched": 0,
                "errorMessage": f"unhandled_exception:{type(exc).__name__}",
            })
    return all_documents, statuses


def fetched_document_to_dict(doc: FetchedDocument) -> Dict[str, Any]:
    return {
        "sourceId": doc.sourceId,
        "sourceName": doc.sourceName,
        "sourceTier": doc.sourceTier,
        "sourceTrust": doc.sourceTrust,
        "sourceType": doc.sourceType,
        "url": doc.url,
        "title": doc.title,
        "body": doc.body,
        "publishedDate": doc.publishedDate,
        "publishedDaysAgo": doc.publishedDaysAgo,
        "fetchedAt": doc.fetchedAt,
    }
