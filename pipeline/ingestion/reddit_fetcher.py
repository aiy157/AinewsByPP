"""
Pipe 2: Rumor Radar Ingestion from Reddit (status='rumor').
Supports:
  1. Official Reddit OAuth2 API (https://oauth.reddit.com) when REDDIT_CLIENT_ID &
     REDDIT_CLIENT_SECRET are configured in .env / GitHub Secrets.
  2. Public .json fallback attempt when credentials are omitted (reports clearly if
     Reddit enforces 403 Forbidden for unauthenticated requests).
Filters strictly by Flair (Rumor / Leak / Speculation / Unconfirmed) + minimum engagement.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import httpx

from pipeline.config import ICT_TZ, UTC_TZ, PipelineConfig
from pipeline.ingestion.image_extractor import extract_image_from_reddit_post
from pipeline.schemas import RawScrapedItem
from pipeline.sources import RUMOR_FLAIR_KEYWORDS, RUMOR_SUBREDDITS

logger = logging.getLogger(__name__)


def _matches_rumor_flair(flair_text: str) -> bool:
    if not flair_text:
        return False
    lower = flair_text.lower()
    return any(keyword in lower for keyword in RUMOR_FLAIR_KEYWORDS)


def _clean_text(text: str, max_chars: int = 2800) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "")).strip()
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars].rsplit(" ", 1)[0] + "..."
    return cleaned


def _hash_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def _get_reddit_user_agent(config: PipelineConfig) -> str:
    if config.http_user_agent and not config.http_user_agent.startswith("Mozilla/"):
        return config.http_user_agent
    return "python:ainews-pipeline:v1.0 (by /u/ainews_reader)"


def _fetch_oauth_token(config: PipelineConfig, user_agent: str) -> Optional[str]:
    """Obtains a read-only application OAuth2 bearer token via Reddit's official token endpoint."""
    cid = config.reddit_client_id
    csec = config.reddit_client_secret
    if not cid or not csec or "your-reddit-" in cid or "your-reddit-" in csec:
        return None

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                "https://www.reddit.com/api/v1/access_token",
                auth=(cid, csec),
                data={"grant_type": "client_credentials"},
                headers={"User-Agent": user_agent},
            )
            resp.raise_for_status()
            token = resp.json().get("access_token")
            if token:
                logger.info("Authenticated with official Reddit OAuth2 API.")
                return str(token)
    except Exception as exc:
        logger.warning("Reddit OAuth2 authentication failed: %s", exc)

    return None


def _fetch_subreddit_rumors(
    subreddit: str,
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
    user_agent: str,
    oauth_token: Optional[str] = None,
) -> List[Tuple[int, RawScrapedItem]]:
    if oauth_token:
        url = f"https://oauth.reddit.com/r/{subreddit}/new?limit=100&raw_json=1"
        headers = {
            "User-Agent": user_agent,
            "Authorization": f"Bearer {oauth_token}",
            "Accept": "application/json",
        }
    else:
        url = f"https://www.reddit.com/r/{subreddit}/new.json?limit=100&raw_json=1"
        headers = {
            "User-Agent": user_agent,
            "Accept": "application/json",
        }

    matched: List[Tuple[int, RawScrapedItem]] = []

    try:
        with httpx.Client(follow_redirects=True, timeout=15.0, headers=headers) as client:
            resp = client.get(url)
            if resp.status_code == 429:
                logger.warning("Reddit rate limit (429) on r/%s — backing off 3s.", subreddit)
                time.sleep(3.0)
                resp = client.get(url)
            if resp.status_code == 403 and not oauth_token:
                logger.warning(
                    "Reddit returned 403 Blocked for unauthenticated request on r/%s. "
                    "Configure REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET in .env to use official oauth.reddit.com.",
                    subreddit,
                )
                return []
            resp.raise_for_status()
            payload: Dict[str, Any] = resp.json()

        children = payload.get("data", {}).get("children", [])
        for child in children:
            post = child.get("data") or {}
            if post.get("stickied") or post.get("removed_by_category"):
                continue

            created_utc_ts = post.get("created_utc")
            if not created_utc_ts:
                continue
            published_utc = datetime.fromtimestamp(float(created_utc_ts), tz=UTC_TZ)

            if not (window_start_utc <= published_utc <= window_end_utc):
                continue

            flair = str(post.get("link_flair_text") or "").strip()
            if not _matches_rumor_flair(flair):
                continue

            score = int(post.get("score") or 0)
            num_comments = int(post.get("num_comments") or 0)
            if score < config.reddit_min_score or num_comments < config.reddit_min_comments:
                continue

            title = _clean_text(str(post.get("title") or ""), max_chars=300)
            permalink = str(post.get("permalink") or "").strip()
            if not title or not permalink or not permalink.startswith("/r/"):
                continue

            reddit_url = f"https://www.reddit.com{permalink}"
            selftext = _clean_text(str(post.get("selftext") or ""), max_chars=2600)
            external_dest = str(post.get("url_overridden_by_dest") or "").strip()

            body_parts = [selftext] if selftext else []
            if external_dest and external_dest != reddit_url:
                body_parts.append(f"Linked reference in thread: {external_dest}")
            raw_content = " | ".join(body_parts) if body_parts else title

            image_url = extract_image_from_reddit_post(post)
            source_label = f"r/{subreddit} (Flair: {flair})"
            published_ict = published_utc.astimezone(ICT_TZ)

            item = RawScrapedItem(
                raw_id=_hash_id(f"rumor|{reddit_url}"),
                status="rumor",
                source_name=source_label,
                is_official_source=False,
                default_company_tag="Other",
                title=title,
                url=reddit_url,
                image_url=image_url,
                image_credit=f"r/{subreddit} Community Thread" if image_url else None,
                published_at_utc=published_utc.isoformat(),
                published_at_ict=published_ict.isoformat(),
                raw_content=raw_content,
                engagement_hint=f"score={score}, comments={num_comments}, flair={flair}",
            )
            engagement_rank = score + (num_comments * 2)
            matched.append((engagement_rank, item))

        logger.info(
            "Reddit r/%-15s -> %d rumor posts matched flair & engagement thresholds",
            subreddit,
            len(matched),
        )
    except Exception as exc:
        logger.warning("Failed fetching Reddit for r/%s: %s", subreddit, exc)

    return matched


def fetch_rumor_reddit_items(
    config: PipelineConfig,
    window_start_utc: datetime,
    window_end_utc: datetime,
) -> List[RawScrapedItem]:
    """
    Fetches rumor-flaired threads across configured subreddits (via OAuth2 if configured,
    else attempts public JSON), ranks by engagement, and caps at max_rumor_items (25).
    """
    user_agent = _get_reddit_user_agent(config)
    oauth_token = _fetch_oauth_token(config, user_agent)

    all_ranked: List[Tuple[int, RawScrapedItem]] = []
    for idx, sub in enumerate(RUMOR_SUBREDDITS):
        if idx > 0:
            time.sleep(1.0)
        all_ranked.extend(
            _fetch_subreddit_rumors(
                subreddit=sub,
                config=config,
                window_start_utc=window_start_utc,
                window_end_utc=window_end_utc,
                user_agent=user_agent,
                oauth_token=oauth_token,
            )
        )

    all_ranked.sort(key=lambda pair: pair[0], reverse=True)
    selected = [item for _, item in all_ranked[: config.max_rumor_items]]

    logger.info(
        "Pipe 2 (Rumor Reddit) selected %d / %d matched items (cap=%d).",
        len(selected),
        len(all_ranked),
        config.max_rumor_items,
    )
    return selected
