"""
Pipe 2: Rumor Radar Community Ingestion (status='rumor').
Uses official, free, zero-key public APIs/feeds that work reliably on GitHub Actions:
  1. Hacker News Official Algolia API (https://hn.algolia.com/api/v1/search_by_date)
  2. Lobste.rs AI Developer Community Feed (https://lobste.rs/t/ai.rss)
  3. Optional Reddit OAuth2 (via reddit_fetcher.py) automatically enabled if REDDIT_CLIENT_ID/SECRET exist.
"""

from __future__ import annotations

import hashlib
import logging
import re
from calendar import timegm
from datetime import datetime
from typing import Dict, List, Tuple

import feedparser
import httpx

from pipeline.config import ICT_TZ, UTC_TZ, PipelineConfig
from pipeline.ingestion.image_extractor import enrich_missing_images_with_og
from pipeline.ingestion.reddit_fetcher import fetch_rumor_reddit_items
from pipeline.schemas import RawScrapedItem
from pipeline.sources import OFFICIAL_DOMAIN_SUFFIXES

logger = logging.getLogger(__name__)

# AI domain relevance terms for community filtering
AI_ENTITY_REGEX = re.compile(
    r"\b(ai|llm|llms|gpt|gpt-\d|o[1-4]|openai|anthropic|claude|google|gemini|deepmind|"
    r"meta|llama|xai|grok|deepseek|qwen|mistral|nvidia|gpu|vllm|open[- ]weight|agi|"
    r"agent|agents|reasoning|benchmark|benchmarks|model|models|inference|quantization|"
    r"fp4|moe|transformer|diffusion|trainium|tpu|neural|coding agent)\b",
    re.IGNORECASE,
)

# Signals indicating rumors, leaks, unconfirmed reports, insider scoops, or hot community speculation
RUMOR_SIGNAL_REGEX = re.compile(
    r"\b(rumor|rumour|rumored|leak|leaked|leaks|speculation|unconfirmed|insider|"
    r"spotted|commit|ab[- ]test|preview|codename|reportedly|allegedly|scoop|"
    r"exclusive|testing|secret|stealth|upcoming|next[- ]gen|scandal|reverses|"
    r"considering|plans to|preparing|eyes|talks|sources say|whisper|drama|ban|blacklist)\b",
    re.IGNORECASE,
)


def _hash_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _clean_text(text: str, max_chars: int = 2400) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rsplit(" ", 1)[0] + "..."
    return cleaned


def _is_official_url(url: str) -> bool:
    lower = (url or "").lower()
    return any(dom in lower for dom in OFFICIAL_DOMAIN_SUFFIXES)


def _fetch_hacker_news_rumors(
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
) -> List[Tuple[int, RawScrapedItem]]:
    """
    Queries the official Hacker News Algolia API using proper Algolia parameters:
      - Broad top-story sweep (query='', points>=25, pages 0..2) filtered by AI_ENTITY_REGEX
      - Single-keyword rumor/leak/reportedly sweeps (points>=8)
    """
    start_ts = int(window_start_utc.timestamp())
    end_ts = int(window_end_utc.timestamp())
    endpoint = "https://hn.algolia.com/api/v1/search_by_date"

    search_jobs: List[Dict[str, object]] = [
        # Broad sweep of top stories in window (3 pages x 100 = 300 top HN stories)
        {"query": "", "page": 0, "min_points": 25, "hits": 100},
        {"query": "", "page": 1, "min_points": 25, "hits": 100},
        {"query": "", "page": 2, "min_points": 25, "hits": 100},
        # Targeted single-term rumor/leak/scoop searches (Algolia requires single terms, not OR)
        {"query": "leak", "page": 0, "min_points": 8, "hits": 50},
        {"query": "rumor", "page": 0, "min_points": 8, "hits": 50},
        {"query": "reportedly", "page": 0, "min_points": 10, "hits": 50},
        {"query": "unconfirmed", "page": 0, "min_points": 5, "hits": 50},
    ]

    seen_ids: set[str] = set()
    matched: List[Tuple[int, RawScrapedItem]] = []
    headers = {"User-Agent": config.http_user_agent, "Accept": "application/json"}

    with httpx.Client(timeout=15.0, headers=headers) as client:
        for job in search_jobs:
            try:
                params = {
                    "query": str(job["query"]),
                    "tags": "story",
                    "page": int(job["page"]),  # type: ignore[arg-type]
                    "hitsPerPage": int(job["hits"]),  # type: ignore[arg-type]
                    "numericFilters": (
                        f"created_at_i>={start_ts},created_at_i<={end_ts},"
                        f"points>={int(job['min_points'])}"  # type: ignore[arg-type]
                    ),
                }
                resp = client.get(endpoint, params=params)
                resp.raise_for_status()
                hits = resp.json().get("hits") or []

                for hit in hits:
                    obj_id = str(hit.get("objectID") or "")
                    if not obj_id or obj_id in seen_ids:
                        continue

                    title = _clean_text(str(hit.get("title") or ""), max_chars=300)
                    story_text = _clean_text(str(hit.get("story_text") or ""), max_chars=2200)
                    ext_url = str(hit.get("url") or "").strip()
                    hn_url = f"https://news.ycombinator.com/item?id={obj_id}"
                    combined_text = f"{title} {story_text}"

                    if not title or not AI_ENTITY_REGEX.search(combined_text):
                        continue

                    # Exclude direct official lab blogs (they belong strictly in Pipe 1 Verified)
                    if ext_url and _is_official_url(ext_url):
                        continue

                    points = int(hit.get("points") or 0)
                    comments = int(hit.get("num_comments") or 0)
                    has_rumor_signal = bool(RUMOR_SIGNAL_REGEX.search(combined_text))

                    # Accept explicit rumor/leak signals OR high-heat community discussions
                    if not has_rumor_signal and (points < 60 or comments < 30):
                        continue

                    created_ts = hit.get("created_at_i")
                    if not created_ts:
                        continue
                    published_utc = datetime.fromtimestamp(float(created_ts), tz=UTC_TZ)
                    published_ict = published_utc.astimezone(ICT_TZ)

                    seen_ids.add(obj_id)
                    body_parts = [story_text] if story_text else [title]
                    if ext_url:
                        body_parts.append(f"Linked discussion target: {ext_url}")
                    body_parts.append(f"Hacker News thread: {hn_url}")

                    signal_tag = "Rumor/Leak Signal" if has_rumor_signal else "Community Buzz"
                    item = RawScrapedItem(
                        raw_id=_hash_id(f"rumor|hn|{obj_id}"),
                        status="rumor",
                        source_name=f"Hacker News ({signal_tag})",
                        is_official_source=False,
                        default_company_tag="Other",
                        title=title,
                        url=hn_url,
                        image_url=None,
                        image_credit=None,
                        published_at_utc=published_utc.isoformat(),
                        published_at_ict=published_ict.isoformat(),
                        raw_content=" | ".join(body_parts),
                        engagement_hint=f"points={points}, comments={comments}, signal={signal_tag}",
                    )
                    rank_score = points + (comments * 2) + (300 if has_rumor_signal else 0)
                    matched.append((rank_score, item))

            except Exception as exc:
                logger.warning("Failed querying Hacker News Algolia API (%s): %s", job["query"], exc)

    logger.info("Hacker News API -> %d AI community rumor/signal items matched", len(matched))
    return matched


def _fetch_lobsters_ai_community(
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
) -> List[Tuple[int, RawScrapedItem]]:
    """
    Fetches community AI discussions from Lobste.rs (https://lobste.rs/t/ai.rss) —
    an invite-only engineering community with open, zero-key RSS feeds.
    """
    url = "https://lobste.rs/t/ai.rss"
    matched: List[Tuple[int, RawScrapedItem]] = []
    headers = {"User-Agent": config.http_user_agent}

    try:
        with httpx.Client(follow_redirects=True, timeout=12.0, headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)

        for entry in feed.entries:
            ts_struct = entry.get("published_parsed") or entry.get("updated_parsed")
            if not ts_struct:
                continue
            published_utc = datetime.fromtimestamp(timegm(ts_struct), tz=UTC_TZ)
            if not (window_start_utc <= published_utc <= window_end_utc):
                continue

            title = _clean_text(str(entry.get("title") or ""), max_chars=300)
            link = str(entry.get("comments") or entry.get("link") or "").strip()
            ext_link = str(entry.get("link") or "").strip()
            if not title or not link.startswith(("http://", "https://")):
                continue
            if ext_link and _is_official_url(ext_link):
                continue

            summary = _clean_text(str(entry.get("summary") or ""), max_chars=1800)
            has_rumor_signal = bool(RUMOR_SIGNAL_REGEX.search(f"{title} {summary}"))

            item = RawScrapedItem(
                raw_id=_hash_id(f"rumor|lobsters|{link}"),
                status="rumor",
                source_name="Lobste.rs AI Community",
                is_official_source=False,
                default_company_tag="Other",
                title=title,
                url=link,
                image_url=None,
                image_credit=None,
                published_at_utc=published_utc.isoformat(),
                published_at_ict=published_utc.astimezone(ICT_TZ).isoformat(),
                raw_content=f"{summary} | Discussed link: {ext_link}" if ext_link else summary,
                engagement_hint="community=lobsters, tag=ai",
            )
            matched.append((180 if has_rumor_signal else 90, item))

        logger.info("Lobste.rs AI Feed -> %d community items within window", len(matched))
    except Exception as exc:
        logger.warning("Failed fetching Lobste.rs AI community feed: %s", exc)

    return matched


def fetch_rumor_community_items(
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
) -> List[RawScrapedItem]:
    """
    Aggregates Pipe 2 (status='rumor') signals from:
      - Hacker News Official Algolia API (100% free, zero key)
      - Lobste.rs AI Engineering Community (100% free, zero key)
      - Reddit Official OAuth2 (automatically included if REDDIT_CLIENT_ID/SECRET are configured)
    Ranks by engagement + rumor signal strength and caps strictly at max_rumor_items (25).
    """
    ranked: List[Tuple[int, RawScrapedItem]] = []
    ranked.extend(_fetch_hacker_news_rumors(config, window_start_utc, window_end_utc))
    ranked.extend(_fetch_lobsters_ai_community(config, window_start_utc, window_end_utc))

    if (
        config.reddit_client_id
        and config.reddit_client_secret
        and "your-reddit-" not in config.reddit_client_id
    ):
        reddit_items = fetch_rumor_reddit_items(config, window_start_utc, window_end_utc)
        for idx, r_item in enumerate(reddit_items):
            ranked.append((1000 - idx, r_item))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    selected = [item for _, item in ranked[: config.max_rumor_items]]

    logger.info(
        "Pipe 2 (Rumor Radar Community) selected %d / %d matched items (cap=%d).",
        len(selected),
        len(ranked),
        config.max_rumor_items,
    )

    if config.enable_og_image_fetch and selected:
        selected = enrich_missing_images_with_og(
            items=selected,
            user_agent=config.http_user_agent,
            timeout_seconds=config.og_image_timeout_seconds,
            max_fetches=10,
        )

    return selected
