"""
Main Orchestrator for Ainews Automated Daily AI News Pipeline (Haiku 5.5 + Sonnet 5.5).
Usage:
  - Test live RSS + Community + Image extraction with zero AI/DB cost:
      python -m pipeline.main --dry-run
  - Full production run (daily 28h window, URL pre-dedup + 3-way rumor-vs-verified check):
      python -m pipeline.main
  - Override lookback hours or cycle tag:
      python -m pipeline.main --lookback-hours 48 --batch-type midweek
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from pipeline.ai_processor.batch_client import AnthropicBatchRunner
from pipeline.ai_processor.stage1_haiku import (
    build_token_budgeted_chunks,
    run_stage1_haiku,
)
from pipeline.ai_processor.stage2_opus import run_stage2_editor
from pipeline.config import (
    ICT_TZ,
    PROJECT_ROOT,
    UTC_TZ,
    estimate_tokens,
    load_config,
    resolve_batch_type_and_window,
)
from pipeline.db.supabase_client import AinewsSupabaseClient
from pipeline.ingestion.community_rumor_fetcher import fetch_rumor_community_items
from pipeline.ingestion.deduplicator import (
    filter_out_published_urls,
    prepare_ingestion_streams,
)
from pipeline.ingestion.rss_fetcher import fetch_verified_rss_items
from pipeline.schemas import BatchType

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ainews.pipeline")


def calculate_estimated_cost_usd(
    s1_in: int,
    s1_out: int,
    s1_fallback: bool,
    s2_in: int,
    s2_out: int,
    s2_fallback: bool,
    stage2_model: str = "claude-sonnet-5-5",
) -> float:
    """
    Estimates Anthropic API spend in USD based on Batch API (50% off) vs Standard API rates:
      - Stage 1 (Haiku tier):  Batch $0.50/M in, $2.50/M out  | Standard $1.00/M in, $5.00/M out
      - Stage 2 (Sonnet tier): Batch $1.50/M in, $7.50/M out  | Standard $3.00/M in, $15.00/M out
      - Stage 2 (Opus tier):   Batch $2.50/M in, $12.50/M out | Standard $5.00/M in, $25.00/M out
    """
    s1_mult = 2.0 if s1_fallback else 1.0
    s2_mult = 2.0 if s2_fallback else 1.0

    model_lower = (stage2_model or "").lower()
    if "opus" in model_lower:
        s2_in_rate, s2_out_rate = 2.50, 12.50
    elif "haiku" in model_lower:
        s2_in_rate, s2_out_rate = 0.50, 2.50
    else:
        s2_in_rate, s2_out_rate = 1.50, 7.50

    s1_cost = ((s1_in / 1_000_000) * 0.50 + (s1_out / 1_000_000) * 2.50) * s1_mult
    s2_cost = ((s2_in / 1_000_000) * s2_in_rate + (s2_out / 1_000_000) * s2_out_rate) * s2_mult
    return s1_cost + s2_cost


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ainews Daily AI News Data Pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run live RSS + Community + Image ingestion & token estimation without calling Anthropic API or writing to Supabase.",
    )
    parser.add_argument(
        "--batch-type",
        choices=["auto", "midweek", "weekend"],
        default="auto",
        help="Override DB batch_type tag (default: auto-detected from Asia/Bangkok ICT weekday).",
    )
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=None,
        help="Optional override for lookback hours (default: 28h daily cycle = 24h + 4h overlap buffer).",
    )
    parser.add_argument(
        "--skip-og-images",
        action="store_true",
        help="Skip Tier-2 HTTP og:image fallback fetching (only use Tier-1 RSS/Reddit images).",
    )
    return parser.parse_args()


def run_pipeline(
    dry_run: bool = False,
    batch_type_arg: str = "auto",
    lookback_hours: Optional[int] = None,
    skip_og_images: bool = False,
) -> int:
    started_at_utc = datetime.now(UTC_TZ)
    config = load_config()
    if skip_og_images:
        config = config.__class__(**{**config.__dict__, "enable_og_image_fetch": False})

    override_batch: Optional[BatchType] = (
        None if batch_type_arg == "auto" else batch_type_arg  # type: ignore[assignment]
    )
    week_id, batch_type, window_start_utc, window_end_utc = resolve_batch_type_and_window(
        now_utc=started_at_utc,
        override_batch_type=override_batch,
        custom_lookback_hours=lookback_hours,
        default_lookback_hours=config.default_lookback_hours,
    )

    logger.info("======================================================================")
    logger.info(
        "AINEWS DAILY PIPELINE START | mode=%s | week_id=%s | batch_type=%s | s1=%s | s2=%s",
        "DRY-RUN" if dry_run else "PRODUCTION",
        week_id,
        batch_type,
        config.stage1_model,
        config.stage2_model,
    )
    logger.info(
        "Window (ICT UTC+7): %s -> %s",
        window_start_utc.astimezone(ICT_TZ).strftime("%Y-%m-%d %H:%M ICT"),
        window_end_utc.astimezone(ICT_TZ).strftime("%Y-%m-%d %H:%M ICT"),
    )
    logger.info("======================================================================")

    # ------------------------------------------------------------------
    # STEP 1: Two-Pipe Data Ingestion (RSS 125 + Community Rumors 25 = 150)
    # ------------------------------------------------------------------
    raw_verified = fetch_verified_rss_items(config, window_start_utc, window_end_utc)
    raw_rumor = fetch_rumor_community_items(config, window_start_utc, window_end_utc)

    verified_items, rumor_items = prepare_ingestion_streams(
        verified_items=raw_verified,
        rumor_items=raw_rumor,
        max_verified=config.max_verified_items,
        max_rumor=config.max_rumor_items,
    )

    # Zero-cost DB URL pre-dedup: read recent published URLs & topics before Stage 1
    db: Optional[AinewsSupabaseClient] = None
    recent_published_topics: List[Dict[str, Any]] = []
    published_urls: Set[str] = set()
    dropped_verified_urls = 0
    dropped_rumor_urls = 0

    if not dry_run:
        db = AinewsSupabaseClient(config.supabase_url, config.supabase_service_role_key)
        recent_published_topics, published_urls = db.fetch_recent_published_context(
            days=config.dedup_lookback_days
        )
    elif config.supabase_url and config.supabase_service_role_key and "your-project-id" not in config.supabase_url:
        try:
            db = AinewsSupabaseClient(config.supabase_url, config.supabase_service_role_key)
            recent_published_topics, published_urls = db.fetch_recent_published_context(
                days=config.dedup_lookback_days
            )
        except Exception as exc:
            logger.info("[DRY-RUN] Skipping optional DB pre-dedup preview: %s", exc)

    if published_urls:
        verified_items, dropped_verified_urls = filter_out_published_urls(
            verified_items, published_urls
        )
        rumor_items, dropped_rumor_urls = filter_out_published_urls(
            rumor_items, published_urls
        )
        logger.info(
            "Zero-cost URL pre-dedup dropped %d already-published items (verified=%d, rumor=%d) -> remaining=%d",
            dropped_verified_urls + dropped_rumor_urls,
            dropped_verified_urls,
            dropped_rumor_urls,
            len(verified_items) + len(rumor_items),
        )

    total_raw = len(verified_items) + len(rumor_items)

    # Preview Stage 1 token chunking
    v_chunks = build_token_budgeted_chunks(
        verified_items, "verified", config.stage1_max_input_tokens_per_chunk
    )
    r_chunks = build_token_budgeted_chunks(
        rumor_items, "rumor", config.stage1_max_input_tokens_per_chunk
    )
    est_s1_input_tokens = sum(
        estimate_tokens(json.dumps([i.model_dump() for i in ch[2]], ensure_ascii=False))
        for ch in (v_chunks + r_chunks)
    )
    images_found = sum(1 for i in (verified_items + rumor_items) if i.image_url)

    # ------------------------------------------------------------------
    # DRY-RUN MODE EXIT (Zero API Cost Verification)
    # ------------------------------------------------------------------
    if dry_run:
        preview_dir = PROJECT_ROOT / "pipeline" / "data"
        preview_dir.mkdir(parents=True, exist_ok=True)
        preview_path = preview_dir / "dry_run_preview.json"

        preview_payload = {
            "mode": "dry_run",
            "week_id": week_id,
            "batch_type": batch_type,
            "stage1_model": config.stage1_model,
            "stage2_model": config.stage2_model,
            "window_start_ict": window_start_utc.astimezone(ICT_TZ).isoformat(),
            "window_end_ict": window_end_utc.astimezone(ICT_TZ).isoformat(),
            "summary": {
                "verified_items": len(verified_items),
                "rumor_items": len(rumor_items),
                "total_items": total_raw,
                "dropped_already_published_urls": dropped_verified_urls + dropped_rumor_urls,
                "recent_published_topics_loaded": len(recent_published_topics),
                "items_with_images": images_found,
                "stage1_chunks": len(v_chunks) + len(r_chunks),
                "estimated_stage1_input_tokens": est_s1_input_tokens,
            },
            "verified_sample": [i.model_dump() for i in verified_items],
            "rumor_sample": [i.model_dump() for i in rumor_items],
        }
        preview_path.write_text(
            json.dumps(preview_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        logger.info("------------------- DRY-RUN SUMMARY -------------------")
        logger.info("Models configured          : Stage1=%s | Stage2=%s", config.stage1_model, config.stage2_model)
        logger.info("Dropped already-in-DB URLs : %d (verified=%d, rumor=%d)", dropped_verified_urls + dropped_rumor_urls, dropped_verified_urls, dropped_rumor_urls)
        logger.info("New Verified RSS items     : %d / %d", len(verified_items), config.max_verified_items)
        logger.info("New Rumor Community items  : %d / %d", len(rumor_items), config.max_rumor_items)
        logger.info("Items with real images     : %d / %d", images_found, total_raw)
        logger.info("Stage 1 planned chunks     : %d (est. %d input tokens)", len(v_chunks) + len(r_chunks), est_s1_input_tokens)
        logger.info("Preview JSON saved to      : %s", preview_path)
        logger.info("Anthropic API & Supabase   : SKIPPED ($0.00 spent)")
        logger.info("-------------------------------------------------------")
        return 0

    if total_raw == 0:
        logger.info(
            "Zero brand-new items remain after lookback & URL pre-dedup. Skipping AI calls ($0.00 spent)."
        )
        return 0

    # ------------------------------------------------------------------
    # STEP 2: Initialize Anthropic Client
    # ------------------------------------------------------------------
    assert db is not None
    runner = AnthropicBatchRunner(config.anthropic_api_key)

    s1_in = s1_out = s2_in = s2_out = 0
    s1_fallback = s2_fallback = False
    stage1_clusters_count = 0
    final_news_count = 0

    try:
        # ------------------------------------------------------------------
        # STEP 3: Stage 1 — claude-haiku-5-5 (Lossless Clustering & Facts)
        # ------------------------------------------------------------------
        stage1_clusters, s1_res = run_stage1_haiku(
            runner=runner,
            config=config,
            verified_items=verified_items,
            rumor_items=rumor_items,
        )
        s1_in, s1_out, s1_fallback = (
            s1_res.input_tokens,
            s1_res.output_tokens,
            s1_res.used_fallback,
        )
        stage1_clusters_count = len(stage1_clusters)

        # ------------------------------------------------------------------
        # STEP 4: Stage 2 — claude-sonnet-5-5 (5D Brief + Rumor/Verified Dedup)
        # ------------------------------------------------------------------
        final_items, superseded_rumor_slugs, s2_res = run_stage2_editor(
            runner=runner,
            config=config,
            week_id=week_id,
            batch_type=batch_type,
            stage1_clusters=stage1_clusters,
            midweek_published_headlines=recent_published_topics,
            window_start_ict=window_start_utc.astimezone(ICT_TZ).isoformat(),
            window_end_ict=window_end_utc.astimezone(ICT_TZ).isoformat(),
        )
        s2_in, s2_out, s2_fallback = (
            s2_res.input_tokens,
            s2_res.output_tokens,
            s2_res.used_fallback,
        )

        # ------------------------------------------------------------------
        # STEP 5: Upsert Curated News, Clear Confirmed Rumors & Log Run
        # ------------------------------------------------------------------
        final_news_count = db.upsert_news_items(week_id, batch_type, final_items)
        uuid_like = [
            ref for ref in superseded_rumor_slugs if len(ref) == 36 and ref.count("-") == 4
        ]
        slug_like = [ref for ref in superseded_rumor_slugs if ref not in uuid_like]
        removed_rumors_count = (
            db.delete_superseded_rumors(slug_like, rumor_ids=uuid_like)
            if superseded_rumor_slugs
            else 0
        )
        est_cost = calculate_estimated_cost_usd(
            s1_in,
            s1_out,
            s1_fallback,
            s2_in,
            s2_out,
            s2_fallback,
            stage2_model=config.stage2_model,
        )

        db.record_pipeline_run(
            week_id=week_id,
            batch_type=batch_type,
            window_start_utc=window_start_utc,
            window_end_utc=window_end_utc,
            raw_items_fetched=total_raw,
            stage1_clusters_count=stage1_clusters_count,
            final_news_count=final_news_count,
            stage1_used_fallback=s1_fallback,
            stage2_used_fallback=s2_fallback,
            stage1_input_tokens=s1_in,
            stage1_output_tokens=s1_out,
            stage2_input_tokens=s2_in,
            stage2_output_tokens=s2_out,
            estimated_cost_usd=est_cost,
            run_status="completed",
            started_at=started_at_utc,
            completed_at=datetime.now(UTC_TZ),
        )

        logger.info(
            "PIPELINE COMPLETED SUCCESSFULLY | saved=%d briefs | graduated_rumors_removed=%d | est_cost=$%.4f",
            final_news_count,
            removed_rumors_count,
            est_cost,
        )
        return 0

    except Exception as exc:
        logger.exception("Pipeline failed with error: %s", exc)
        est_cost = calculate_estimated_cost_usd(
            s1_in,
            s1_out,
            s1_fallback,
            s2_in,
            s2_out,
            s2_fallback,
            stage2_model=config.stage2_model,
        )
        db.record_pipeline_run(
            week_id=week_id,
            batch_type=batch_type,
            window_start_utc=window_start_utc,
            window_end_utc=window_end_utc,
            raw_items_fetched=total_raw,
            stage1_clusters_count=stage1_clusters_count,
            final_news_count=final_news_count,
            stage1_used_fallback=s1_fallback,
            stage2_used_fallback=s2_fallback,
            stage1_input_tokens=s1_in,
            stage1_output_tokens=s1_out,
            stage2_input_tokens=s2_in,
            stage2_output_tokens=s2_out,
            estimated_cost_usd=est_cost,
            run_status="failed",
            started_at=started_at_utc,
            completed_at=datetime.now(UTC_TZ),
            error_message=f"{type(exc).__name__}: pipeline run failed (inspect private CI logs)",
        )
        return 1


if __name__ == "__main__":
    args = parse_args()
    exit_code = run_pipeline(
        dry_run=args.dry_run,
        batch_type_arg=args.batch_type,
        lookback_hours=args.lookback_hours,
        skip_og_images=args.skip_og_images,
    )
    sys.exit(exit_code)
