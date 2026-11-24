"""
Supabase PostgreSQL Client for Ainews Pipeline.
Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS for server-side writes while Frontend remains public read-only).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from supabase import Client, create_client

from pipeline.schemas import BatchType, Stage2NewsItem, to_supabase_row

logger = logging.getLogger(__name__)


class AinewsSupabaseClient:
    def __init__(self, url: str, service_role_key: str) -> None:
        if not url or not service_role_key or "your-project-id" in url:
            raise ValueError(
                "Supabase credentials are missing or still placeholders. "
                "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or GitHub Secrets."
            )
        self.client: Client = create_client(url, service_role_key)

    def fetch_midweek_headlines(self, week_id: str) -> List[Dict[str, Any]]:
        """
        Fetches already-published Wednesday ('midweek') headlines and URLs for the same week_id
        so Sunday's 'weekend' run avoids summarizing duplicate news.
        """
        try:
            resp = (
                self.client.table("news_items")
                .select("cluster_slug, status, company_tags, title_th, tldr_th")
                .eq("week_id", week_id)
                .eq("batch_type", "midweek")
                .execute()
            )
            rows = resp.data or []
            logger.info(
                "Loaded %d midweek headlines from Supabase for cross-cycle dedup (week_id=%s).",
                len(rows),
                week_id,
            )
            return rows
        except Exception as exc:
            logger.warning("Could not fetch midweek headlines for %s: %s", week_id, exc)
            return []

    def upsert_news_items(
        self,
        week_id: str,
        batch_type: BatchType,
        items: List[Stage2NewsItem],
    ) -> int:
        """Idempotently upserts curated news items into public.news_items."""
        if not items:
            logger.warning("No news items to upsert into Supabase.")
            return 0

        payload = [to_supabase_row(week_id, batch_type, item) for item in items]
        resp = (
            self.client.table("news_items")
            .upsert(payload, on_conflict="week_id,batch_type,cluster_slug")
            .execute()
        )
        saved_count = len(resp.data or [])
        logger.info(
            "Upserted %d news items into Supabase (week_id=%s, batch_type=%s).",
            saved_count,
            week_id,
            batch_type,
        )
        return saved_count

    def record_pipeline_run(
        self,
        week_id: str,
        batch_type: BatchType,
        window_start_utc: datetime,
        window_end_utc: datetime,
        raw_items_fetched: int,
        stage1_clusters_count: int,
        final_news_count: int,
        stage1_used_fallback: bool,
        stage2_used_fallback: bool,
        stage1_input_tokens: int,
        stage1_output_tokens: int,
        stage2_input_tokens: int,
        stage2_output_tokens: int,
        estimated_cost_usd: float,
        run_status: str,
        started_at: datetime,
        completed_at: Optional[datetime] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Upserts execution metadata into public.pipeline_runs (also keeps Free Tier DB active)."""
        row = {
            "week_id": week_id,
            "batch_type": batch_type,
            "window_start_utc": window_start_utc.isoformat(),
            "window_end_utc": window_end_utc.isoformat(),
            "raw_items_fetched": raw_items_fetched,
            "stage1_clusters_count": stage1_clusters_count,
            "final_news_count": final_news_count,
            "stage1_used_fallback": stage1_used_fallback,
            "stage2_used_fallback": stage2_used_fallback,
            "stage1_input_tokens": stage1_input_tokens,
            "stage1_output_tokens": stage1_output_tokens,
            "stage2_input_tokens": stage2_input_tokens,
            "stage2_output_tokens": stage2_output_tokens,
            "estimated_cost_usd": round(estimated_cost_usd, 4),
            "run_status": run_status,
            "error_message": error_message,
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat() if completed_at else None,
        }
        try:
            self.client.table("pipeline_runs").upsert(
                row, on_conflict="week_id,batch_type"
            ).execute()
            logger.info(
                "Recorded pipeline_runs audit entry (status=%s, est_cost=$%.4f).",
                run_status,
                estimated_cost_usd,
            )
        except Exception as exc:
            logger.error("Failed recording pipeline_runs metadata: %s", exc)
