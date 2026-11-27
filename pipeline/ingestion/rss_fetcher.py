"""
Pipe 1: Verified Facts RSS Ingestion (status='verified').
Fetches official AI company blogs, ArXiv papers, and major tech media directly
without keyword filtering in Python (per Decision 3B — Stage 1 Haiku handles noise filtering).
"""

from __future__ import annotations

import hashlib
import logging
import re
from calendar import timegm
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

from pipeline.config import ICT_TZ, UTC_TZ, PipelineConfig
from pipeline.ingestion.http_safety import (
    matches_allowed_domains,
    safe_stream_get,
    validate_public_http_url,
)
from pipeline.ingestion.image_extractor import (
    enrich_missing_images_with_og,
    extract_image_from_rss_entry,
)
from pipeline.schemas import RawScrapedItem
from pipeline.sources import RssSource, VERIFIED_RSS_SOURCES

logger = logging.getLogger(__name__)

# Press articles explicitly flagged as unconfirmed rumors/leaks (e.g. Blognone "[ลือ]")
# must be routed to status='rumor' instead of verified facts.
_PRESS_RUMOR_TITLE_RE = re.compile(
    r"^\s*(?:\[(?:ลือ|ข่าวลือ|rumor|leak)\]|(?:rumor|leak)\s*:)",
    re.IGNORECASE,
)


def classify_rss_item_status(title: str, is_official: bool) -> str:
    if not is_official and _PRESS_RUMOR_TITLE_RE.match(title or ""):
        return "rumor"
    return "verified"


def _clean_html_to_text(raw_html: str, max_chars: int = 3500) -> str:
    if not raw_html:
        return ""
    soup = BeautifulSoup(raw_html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] + "..."
    return text


def _parse_entry_datetime_utc(entry: Dict[str, Any]) -> Optional[datetime]:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        ts_struct = entry.get(key)
        if ts_struct:
            try:
                return datetime.fromtimestamp(timegm(ts_struct), tz=UTC_TZ)
            except Exception:
                continue
    return None


def _hash_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _fetch_single_rss_source(
    source: RssSource,
    window_start_utc: datetime,
    window_end_utc: datetime,
    user_agent: str,
) -> Tuple[RssSource, List[RawScrapedItem]]:
    items: List[RawScrapedItem] = []
    try:
        headers = {
            "User-Agent": user_agent,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        }
        fetched = safe_stream_get(
            source.url,
            headers=headers,
            timeout_seconds=15.0,
            max_bytes=5_000_000,
            max_redirects=3,
        )
        if not fetched:
            raise RuntimeError(f"RSS fetch returned empty/blocked response for {source.url}")
        _, content_bytes = fetched
        feed = feedparser.parse(content_bytes)

        for entry in feed.entries:
            published_utc = _parse_entry_datetime_utc(entry)
            if published_utc is None:
                continue

            # Strict time-windowing boundary check
            if not (window_start_utc <= published_utc <= window_end_utc):
                continue

            title = _clean_html_to_text(str(entry.get("title") or ""), max_chars=300)
            link = str(entry.get("link") or "").strip()
            if not title or not validate_public_http_url(link, resolve_dns=False):
                continue
            if source.allowed_link_domains and not matches_allowed_domains(
                link, source.allowed_link_domains
            ):
                logger.warning(
                    "Dropped untrusted domain link from mirrored feed '%s': %s",
                    source.name,
                    link,
                )
                continue

            # Combine richest available content field
            content_parts: List[str] = []
            for c_item in entry.get("content", []) or []:
                if isinstance(c_item, dict) and c_item.get("value"):
                    content_parts.append(str(c_item["value"]))
            if not content_parts and entry.get("summary"):
                content_parts.append(str(entry["summary"]))
            if not content_parts and entry.get("description"):
                content_parts.append(str(entry["description"]))

            clean_content = _clean_html_to_text(" ".join(content_parts), max_chars=3500)
            if not clean_content:
                clean_content = title

            # Tier-1 image extraction from RSS entry
            image_url = extract_image_from_rss_entry(entry, base_url=link)
            published_ict = published_utc.astimezone(ICT_TZ)

            item_status = classify_rss_item_status(title, source.is_official)
            items.append(
                RawScrapedItem(
                    raw_id=_hash_id(f"{item_status}|{link}"),
                    status=item_status,
                    source_name=source.name,
                    is_official_source=source.is_official,
                    default_company_tag=source.default_company_tag,
                    title=title,
                    url=link,
                    image_url=image_url,
                    image_credit=source.name if image_url else None,
                    published_at_utc=published_utc.isoformat(),
                    published_at_ict=published_ict.isoformat(),
                    raw_content=clean_content,
                )
            )

        logger.info("RSS %-35s -> %d items within window", source.name, len(items))
    except Exception as exc:
        logger.warning("Failed fetching RSS feed '%s' (%s): %s", source.name, source.url, exc)

    return source, items


def fetch_verified_rss_items(
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
) -> List[RawScrapedItem]:
    """
    Fetches all configured RSS feeds, prioritizes official AI labs & tech press over
    high-volume ArXiv feeds when capping to max_verified_items (125), and runs
    Tier-2 og:image enrichment for articles missing an RSS image.
    """
    weighted_items: List[Tuple[int, RawScrapedItem]] = []

    for source in VERIFIED_RSS_SOURCES:
        _, fetched = _fetch_single_rss_source(
            source=source,
            window_start_utc=window_start_utc,
            window_end_utc=window_end_utc,
            user_agent=config.http_user_agent,
        )
        for item in fetched:
            weighted_items.append((source.priority_weight, item))

    # Deduplicate by canonical host+path before capping
    seen_keys: set[str] = set()
    unique_weighted: List[Tuple[int, RawScrapedItem]] = []
    # Sort by priority_weight DESC, then newest published_at_utc DESC
    weighted_items.sort(key=lambda pair: (pair[0], pair[1].published_at_utc), reverse=True)

    for weight, item in weighted_items:
        parsed = urlparse(item.url)
        canonical_key = f"{(parsed.hostname or '').lower()}{parsed.path.rstrip('/')}"
        if canonical_key in seen_keys:
            continue
        seen_keys.add(canonical_key)
        unique_weighted.append((weight, item))

    # Enforce per-ArXiv cap so ArXiv never floods out official blogs/press while filling up to 125
    selected: List[RawScrapedItem] = []
    arxiv_count = 0
    max_arxiv_share = max(25, config.max_verified_items // 3)

    for weight, item in unique_weighted:
        if len(selected) >= config.max_verified_items:
            break
        is_arxiv = "arxiv.org" in item.url.lower()
        if is_arxiv:
            if arxiv_count >= max_arxiv_share:
                continue
            arxiv_count += 1
        selected.append(item)

    logger.info(
        "Pipe 1 (Verified RSS) selected %d / %d raw items (cap=%d).",
        len(selected),
        len(unique_weighted),
        config.max_verified_items,
    )

    # Tier-2 og:image extraction for selected items without Tier-1 RSS images
    if config.enable_og_image_fetch and selected:
        selected = enrich_missing_images_with_og(
            items=selected,
            user_agent=config.http_user_agent,
            timeout_seconds=config.og_image_timeout_seconds,
            max_fetches=config.og_image_max_fetches,
        )

    return selected
