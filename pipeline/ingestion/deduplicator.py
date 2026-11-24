"""
URL Canonicalization & Cross-Feed Deduplication before AI Stage 1.
Preserves strict isolation between status='verified' and status='rumor' streams.
"""

from __future__ import annotations

import logging
import re
from typing import List, Set, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pipeline.schemas import RawScrapedItem

logger = logging.getLogger(__name__)

TRACKING_QUERY_PREFIXES = ("utm_", "fbclid", "gclid", "mc_cid", "mc_eid", "ref")


def canonicalize_url(url: str) -> str:
    parsed = urlparse(url.strip())
    clean_params = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=False)
        if not any(k.lower().startswith(p) for p in TRACKING_QUERY_PREFIXES)
    ]
    clean_path = parsed.path.rstrip("/")
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            clean_path,
            "",
            urlencode(clean_params),
            "",
        )
    )


def _normalize_title_key(title: str) -> str:
    lowered = re.sub(r"[^a-z0-9ก-๙]+", " ", title.lower()).strip()
    return lowered[:120]


def deduplicate_stream(items: List[RawScrapedItem]) -> List[RawScrapedItem]:
    """Removes duplicate URLs and identical normalized titles within a single stream."""
    seen_urls: Set[str] = set()
    seen_titles: Set[str] = set()
    result: List[RawScrapedItem] = []

    for item in items:
        canon_url = canonicalize_url(item.url)
        title_key = _normalize_title_key(item.title)

        if canon_url in seen_urls or title_key in seen_titles:
            continue

        seen_urls.add(canon_url)
        seen_titles.add(title_key)
        result.append(item.model_copy(update={"url": canon_url}))

    return result


def filter_out_published_urls(
    items: List[RawScrapedItem],
    published_urls: Set[str],
) -> Tuple[List[RawScrapedItem], int]:
    """
    Zero-cost pre-AI dedup: drops any raw item whose canonical URL is already stored
    in Supabase public.news_items from recent runs.
    """
    if not published_urls:
        return items, 0

    kept: List[RawScrapedItem] = []
    dropped = 0
    for item in items:
        if canonicalize_url(item.url) in published_urls:
            dropped += 1
            continue
        kept.append(item)
    return kept, dropped


def prepare_ingestion_streams(
    verified_items: List[RawScrapedItem],
    rumor_items: List[RawScrapedItem],
    max_verified: int = 125,
    max_rumor: int = 25,
) -> Tuple[List[RawScrapedItem], List[RawScrapedItem]]:
    clean_verified = deduplicate_stream(verified_items)[:max_verified]
    clean_rumor = deduplicate_stream(rumor_items)[:max_rumor]

    logger.info(
        "Deduplicated streams ready -> verified=%d (cap %d), rumor=%d (cap %d), total=%d",
        len(clean_verified),
        max_verified,
        len(clean_rumor),
        max_rumor,
        len(clean_verified) + len(clean_rumor),
    )
    return clean_verified, clean_rumor
