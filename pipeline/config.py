"""
Central Configuration & Strict Timezone/Windowing Management for Ainews Pipeline.
All scheduling and period boundaries strictly follow Asia/Bangkok (ICT, UTC+7).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from pipeline.schemas import BatchType

# Load root .env automatically when running locally
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

ICT_TZ = ZoneInfo(os.getenv("TIMEZONE", "Asia/Bangkok"))
UTC_TZ = timezone.utc


@dataclass(frozen=True)
class PipelineConfig:
    # Anthropic API & Models
    anthropic_api_key: str
    stage1_model: str
    stage2_model: str
    stage2_thinking_budget: int

    # Batch API Polling & Fallback Timeouts (Option 3B: total <= 45 mins)
    batch_stage1_timeout_seconds: int
    batch_stage2_timeout_seconds: int
    batch_poll_interval_seconds: int

    # Supabase Credentials
    supabase_url: str
    supabase_service_role_key: str

    # Ingestion Quotas (Decision 2A: 125 Verified + 25 Rumor = 150 total)
    max_verified_items: int
    max_rumor_items: int
    stage1_max_input_tokens_per_chunk: int

    # Reddit API Credentials (Optional OAuth2 for oauth.reddit.com) & Filter Thresholds
    reddit_client_id: str
    reddit_client_secret: str
    reddit_min_score: int
    reddit_min_comments: int
    http_user_agent: str

    # Image Extraction Caps (Decision A: External URL + og:image fallback)
    enable_og_image_fetch: bool
    og_image_timeout_seconds: float
    og_image_max_fetches: int


def load_config() -> PipelineConfig:
    return PipelineConfig(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
        stage1_model=os.getenv("STAGE1_MODEL", "claude-haiku-5-5").strip(),
        stage2_model=os.getenv("STAGE2_MODEL", "claude-opus-5-5").strip(),
        stage2_thinking_budget=int(os.getenv("STAGE2_THINKING_BUDGET", "4000")),
        batch_stage1_timeout_seconds=int(os.getenv("BATCH_STAGE1_TIMEOUT_SECONDS", "1200")),
        batch_stage2_timeout_seconds=int(os.getenv("BATCH_STAGE2_TIMEOUT_SECONDS", "1200")),
        batch_poll_interval_seconds=int(os.getenv("BATCH_POLL_INTERVAL_SECONDS", "30")),
        supabase_url=os.getenv("SUPABASE_URL", "").strip(),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        max_verified_items=int(os.getenv("MAX_VERIFIED_ITEMS", "125")),
        max_rumor_items=int(os.getenv("MAX_RUMOR_ITEMS", "25")),
        stage1_max_input_tokens_per_chunk=int(
            os.getenv("STAGE1_MAX_INPUT_TOKENS_PER_CHUNK", "100000")
        ),
        reddit_client_id=os.getenv("REDDIT_CLIENT_ID", "").strip(),
        reddit_client_secret=os.getenv("REDDIT_CLIENT_SECRET", "").strip(),
        reddit_min_score=int(os.getenv("REDDIT_MIN_SCORE", "20")),
        reddit_min_comments=int(os.getenv("REDDIT_MIN_COMMENTS", "5")),
        http_user_agent=os.getenv(
            "REDDIT_USER_AGENT",
            "Mozilla/5.0 (compatible; AinewsBot/1.0; +https://github.com/ainews)",
        ).strip(),
        enable_og_image_fetch=os.getenv("ENABLE_OG_IMAGE_FETCH", "true").lower() == "true",
        og_image_timeout_seconds=float(os.getenv("OG_IMAGE_TIMEOUT_SECONDS", "5.0")),
        og_image_max_fetches=int(os.getenv("OG_IMAGE_MAX_FETCHES", "45")),
    )


def resolve_batch_type_and_window(
    now_utc: Optional[datetime] = None,
    override_batch_type: Optional[BatchType] = None,
    custom_lookback_hours: Optional[int] = None,
) -> Tuple[str, BatchType, datetime, datetime]:
    """
    Computes the canonical ISO week_id, batch_type ('midweek' | 'weekend'),
    and exact UTC time window based on Asia/Bangkok (ICT, UTC+7) schedule:
      - midweek (Wed 05:00 ICT): Previous Sun 05:00 ICT -> Wed 05:00 ICT (84 hours)
      - weekend (Sun 05:00 ICT): Wed 05:00 ICT -> Sun 05:00 ICT (96 hours)
    """
    ref_utc = (now_utc or datetime.now(UTC_TZ)).astimezone(UTC_TZ)
    ref_ict = ref_utc.astimezone(ICT_TZ)

    # Determine batch_type automatically from ICT weekday if not overridden
    # Python weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    if override_batch_type:
        batch_type: BatchType = override_batch_type
    else:
        # Wednesday runs -> midweek; Sunday runs -> weekend; fallback Mon-Thu=midweek, Fri-Sun=weekend
        batch_type = "midweek" if ref_ict.weekday() in (0, 1, 2, 3) else "weekend"

    iso_year, iso_week, _ = ref_ict.isocalendar()
    week_id = f"{iso_year}-W{iso_week:02d}"

    # Determine exact lookback window in UTC
    if custom_lookback_hours is not None:
        window_end_utc = ref_utc
        window_start_utc = ref_utc - timedelta(hours=custom_lookback_hours)
    else:
        lookback_hours = 84 if batch_type == "midweek" else 96
        window_end_utc = ref_utc
        window_start_utc = ref_utc - timedelta(hours=lookback_hours)

    return week_id, batch_type, window_start_utc, window_end_utc


def estimate_tokens(text: str) -> int:
    """Conservative fast token estimator (~3.5 chars/token for mixed English/JSON)."""
    return max(1, int(len(text) / 3.5))
