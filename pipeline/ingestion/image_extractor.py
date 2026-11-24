"""
3-Tier Zero-Cost Image Extraction Utility:
  - Tier 1: Direct extraction from RSS XML (media:content, media:thumbnail, enclosures, <img>)
            or Reddit Public JSON (preview.images, direct image link).
  - Tier 2: Lightweight <head> HTTP fetch for <meta property="og:image"> / twitter:image.
  - Tier 3: Returns None (Frontend gracefully renders a clean text-only editorial card).
"""

from __future__ import annotations

import html
import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from pipeline.schemas import RawScrapedItem

logger = logging.getLogger(__name__)

# Patterns indicating decorative icons/tracking pixels that should NOT be used as hero images
BLOCKED_IMAGE_SUBSTRINGS = (
    "favicon",
    "pixel",
    "tracker",
    "doubleclick",
    "gravatar",
    "emoji",
    "avatar",
    "1x1",
    "spacer",
    "badge",
    "logo-small",
    "feedburner",
)

# Domains known to lack meaningful article hero images (skip Tier-2 og:image fetch to save time)
SKIP_OG_DOMAINS = (
    "arxiv.org",
    "reddit.com",
    "www.reddit.com",
    "old.reddit.com",
    "news.ycombinator.com",
    "lobste.rs",
)


def is_valid_image_url(url: Optional[str]) -> bool:
    if not url or not isinstance(url, str):
        return False
    cleaned = html.unescape(url.strip())
    if not cleaned.startswith(("http://", "https://")):
        return False
    lower = cleaned.lower()
    if any(bad in lower for bad in BLOCKED_IMAGE_SUBSTRINGS):
        return False
    if lower.endswith(".svg") and "github" in lower:
        return False
    return True


def extract_image_from_rss_entry(entry: Dict[str, Any], base_url: str = "") -> Optional[str]:
    """Tier 1 (RSS): Inspect media_content, media_thumbnail, enclosures, and HTML <img> tags."""
    # 1. media:content
    for media in entry.get("media_content", []) or []:
        url = media.get("url")
        medium = (media.get("medium") or "").lower()
        mime = (media.get("type") or "").lower()
        if url and (medium == "image" or mime.startswith("image/") or not mime):
            resolved = urljoin(base_url, url)
            if is_valid_image_url(resolved):
                return resolved

    # 2. media:thumbnail
    for thumb in entry.get("media_thumbnail", []) or []:
        url = thumb.get("url")
        if url:
            resolved = urljoin(base_url, url)
            if is_valid_image_url(resolved):
                return resolved

    # 3. enclosures / links with image MIME type
    for enc in entry.get("enclosures", []) or []:
        url = enc.get("href") or enc.get("url")
        mime = (enc.get("type") or "").lower()
        if url and mime.startswith("image/"):
            resolved = urljoin(base_url, url)
            if is_valid_image_url(resolved):
                return resolved

    for link in entry.get("links", []) or []:
        if link.get("rel") == "enclosure" and (link.get("type") or "").startswith("image/"):
            url = link.get("href")
            if url:
                resolved = urljoin(base_url, url)
                if is_valid_image_url(resolved):
                    return resolved

    # 4. First valid <img> inside RSS HTML content / summary
    html_blobs: List[str] = []
    for content_item in entry.get("content", []) or []:
        if isinstance(content_item, dict) and content_item.get("value"):
            html_blobs.append(content_item["value"])
    if entry.get("summary"):
        html_blobs.append(str(entry["summary"]))

    for blob in html_blobs:
        img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', blob, re.IGNORECASE)
        if img_match:
            resolved = urljoin(base_url, html.unescape(img_match.group(1)))
            if is_valid_image_url(resolved):
                return resolved

    return None


def extract_image_from_reddit_post(post_data: Dict[str, Any]) -> Optional[str]:
    """Tier 1 (Reddit JSON): Extract preview image or direct linked image from post metadata."""
    # 1. Direct linked image (e.g. i.redd.it / imgur)
    dest_url = post_data.get("url_overridden_by_dest") or post_data.get("url") or ""
    if re.search(r"\.(?:png|jpe?g|webp)(?:\?.*)?$", dest_url, re.IGNORECASE):
        if is_valid_image_url(dest_url):
            return html.unescape(dest_url)

    # 2. High-res Reddit preview source
    preview = post_data.get("preview")
    if isinstance(preview, dict):
        images = preview.get("images") or []
        if images and isinstance(images[0], dict):
            source = images[0].get("source") or {}
            src_url = source.get("url")
            if src_url:
                unescaped = html.unescape(src_url)
                if is_valid_image_url(unescaped):
                    return unescaped

    # 3. Reddit gallery first image
    media_meta = post_data.get("media_metadata")
    if isinstance(media_meta, dict):
        for media_obj in media_meta.values():
            if isinstance(media_obj, dict) and media_obj.get("status") == "valid":
                s_obj = media_obj.get("s") or {}
                u = s_obj.get("u") or s_obj.get("gif")
                if u:
                    unescaped = html.unescape(u)
                    if is_valid_image_url(unescaped):
                        return unescaped

    return None


def fetch_og_image_url(
    article_url: str,
    user_agent: str,
    timeout_seconds: float = 5.0,
) -> Optional[str]:
    """
    Tier 2 Fallback: Stream only the first ~64 KB of the target HTML page
    to extract <meta property="og:image"> or <meta name="twitter:image">.
    """
    parsed = urlparse(article_url)
    host = (parsed.hostname or "").lower()
    if not host or any(host == d or host.endswith("." + d) for d in SKIP_OG_DOMAINS):
        return None

    try:
        headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        }
        chunks: List[bytes] = []
        max_bytes = 65_536  # Only need HTML <head>
        total_read = 0

        with httpx.Client(follow_redirects=True, timeout=timeout_seconds, headers=headers) as client:
            with client.stream("GET", article_url) as resp:
                if resp.status_code >= 400:
                    return None
                ctype = (resp.headers.get("content-type") or "").lower()
                if "text/html" not in ctype and "application/xhtml" not in ctype:
                    return None
                for chunk in resp.iter_bytes(chunk_size=8192):
                    chunks.append(chunk)
                    total_read += len(chunk)
                    if total_read >= max_bytes or b"</head>" in chunk.lower():
                        break

        raw_html = b"".join(chunks).decode("utf-8", errors="ignore")
        soup = BeautifulSoup(raw_html, "html.parser")

        meta_selectors = [
            ("meta", {"property": "og:image"}),
            ("meta", {"property": "og:image:secure_url"}),
            ("meta", {"name": "twitter:image"}),
            ("meta", {"name": "twitter:image:src"}),
        ]
        for tag, attrs in meta_selectors:
            found = soup.find(tag, attrs=attrs)
            if found and found.get("content"):
                candidate = urljoin(article_url, str(found["content"]).strip())
                if is_valid_image_url(candidate):
                    return candidate

    except Exception as exc:
        logger.debug("Tier-2 og:image fetch skipped for %s: %s", article_url, exc)

    return None


def enrich_missing_images_with_og(
    items: List[RawScrapedItem],
    user_agent: str,
    timeout_seconds: float = 5.0,
    max_fetches: int = 45,
) -> List[RawScrapedItem]:
    """
    Runs Tier-2 og:image extraction in parallel for items that lacked a Tier-1 RSS image
    (prioritizing official AI lab blogs and major media over ArXiv).
    """
    targets = [
        item
        for item in items
        if item.image_url is None
        and not any(
            (urlparse(item.url).hostname or "").lower().endswith(skip)
            for skip in SKIP_OG_DOMAINS
        )
    ]

    # Prioritize official sources first when capping parallel og:image requests
    targets.sort(key=lambda x: (not x.is_official_source, x.published_at_utc), reverse=False)
    targets = targets[:max_fetches]

    if not targets:
        return items

    logger.info("Running Tier-2 og:image extraction for %d items without RSS images...", len(targets))
    url_to_image: Dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        future_map = {
            pool.submit(fetch_og_image_url, item.url, user_agent, timeout_seconds): item
            for item in targets
        }
        for future in as_completed(future_map):
            item = future_map[future]
            try:
                img = future.result()
                if img:
                    url_to_image[item.raw_id] = img
            except Exception:
                continue

    enriched_count = 0
    updated_items: List[RawScrapedItem] = []
    for item in items:
        if item.raw_id in url_to_image:
            updated_items.append(
                item.model_copy(
                    update={
                        "image_url": url_to_image[item.raw_id],
                        "image_credit": item.source_name,
                    }
                )
            )
            enriched_count += 1
        else:
            updated_items.append(item)

    logger.info("Tier-2 og:image extraction enriched %d / %d targeted items.", enriched_count, len(targets))
    return updated_items
