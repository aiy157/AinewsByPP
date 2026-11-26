"""
Supabase PostgreSQL Client for Ainews Pipeline.
Uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS for server-side writes while Frontend remains public read-only).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from supabase import Client, create_client

from pipeline.ingestion.deduplicator import canonicalize_url
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

    def fetch_recent_published_context(
        self,
        days: int = 7,
        limit: int = 120,
    ) -> Tuple[List[Dict[str, Any]], Set[str]]:
        """
        Fetches recently published items (both 'verified' and 'rumor') from the past `days`
        so the daily pipeline can:
          1. Pre-drop already-published source URLs BEFORE calling Stage 1 (zero AI cost).
          2. Pass recent verified & rumor summaries to Stage 2 for cross-day dedup and
             3-way Rumor-vs-Verified deconfliction (graduating confirmed rumors to verified).
        """
        cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        try:
            resp = (
                self.client.table("news_items")
                .select("id, week_id, batch_type, cluster_slug, status, company_tags, title_th, tldr_th, source_urls, published_at")
                .gte("published_at", cutoff_iso)
                .order("published_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = resp.data or []
            published_urls: Set[str] = set()
            topics: List[Dict[str, Any]] = []

            for row in rows:
                topics.append(
                    {
                        "id": row.get("id", ""),
                        "week_id": row.get("week_id", ""),
                        "batch_type": row.get("batch_type", ""),
                        "cluster_slug": row.get("cluster_slug", ""),
                        "status": row.get("status", "verified"),
                        "company_tags": row.get("company_tags") or [],
                        "title_th": row.get("title_th", ""),
                        "tldr_th": row.get("tldr_th", ""),
                    }
                )
                for src in row.get("source_urls") or []:
                    raw_url = src.get("url") if isinstance(src, dict) else None
                    if raw_url:
                        published_urls.add(canonicalize_url(str(raw_url)))

            logger.info(
                "Loaded %d recent published topics (%d verified, %d rumor) and %d canonical URLs (last %dd) from Supabase.",
                len(topics),
                sum(1 for t in topics if t["status"] == "verified"),
                sum(1 for t in topics if t["status"] == "rumor"),
                len(published_urls),
                days,
            )
            return topics, published_urls
        except Exception as exc:
            logger.warning("Could not fetch recent published context: %s", exc)
            return [], set()

    def delete_superseded_rumors(
        self,
        rumor_slugs: List[str],
        rumor_ids: Optional[List[str]] = None,
    ) -> int:
        """
        Safely deletes stale status='rumor' rows whose story has now been officially
        confirmed by a new status='verified' brief. Double-locked to status='rumor' ONLY
        and scoped strictly to exact UUIDs when provided (never touching older weeks).
        """
        clean_ids = [rid.strip() for rid in (rumor_ids or []) if rid and rid.strip()]
        clean_slugs = [s.strip() for s in rumor_slugs if s and s.strip()]
        if not clean_ids and not clean_slugs:
            return 0

        try:
            query = self.client.table("news_items").delete().eq("status", "rumor")
            if clean_ids:
                query = query.in_("id", clean_ids)
            else:
                query = query.in_("cluster_slug", clean_slugs)
            resp = query.execute()
            deleted = len(resp.data or [])
            logger.info(
                "Removed %d superseded rumor item(s) now confirmed as verified: %s",
                deleted,
                clean_ids or clean_slugs,
            )
            return deleted
        except Exception as exc:
            logger.warning(
                "Failed removing superseded rumors %s: %s",
                clean_ids or clean_slugs,
                exc,
            )
            return 0

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
