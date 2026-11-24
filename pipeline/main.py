"""
Main Orchestrator for Ainews Automated Bi-Weekly Pipeline.
Usage:
  - Test live RSS + Reddit + Image extraction with zero AI/DB cost:
      python -m pipeline.main --dry-run
  - Full production run (auto-detects midweek/weekend from Asia/Bangkok ICT time):
      python -m pipeline.main
  - Force specific batch cycle:
      python -m pipeline.main --batch-type midweek
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from pipeline.ai_processor.batch_client import AnthropicBatchRunner
from pipeline.ai_processor.stage1_haiku import (
    build_token_budgeted_chunks,
    run_stage1_haiku,
)
from pipeline.ai_processor.stage2_opus import run_stage2_opus
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
from pipeline.ingestion.deduplicator import prepare_ingestion_streams
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
) -> float:
    """
    Estimates Anthropic API spend in USD based on Batch API (50% off) vs Standard API rates:
      - Stage 1 (Haiku tier): Batch $0.50/M in, $2.50/M out | Standard $1.00/M in, $5.00/M out
      - Stage 2 (Opus tier):  Batch $2.50/M in, $12.50/M out | Standard $5.00/M in, $25.00/M out
    """
    s1_mult = 2.0 if s1_fallback else 1.0
    s2_mult = 2.0 if s2_fallback else 1.0

    s1_cost = ((s1_in / 1_000_000) * 0.50 + (s1_out / 1_000_000) * 2.50) * s1_mult
    s2_cost = ((s2_in / 1_000_000) * 2.50 + (s2_out / 1_000_000) * 12.50) * s2_mult
    return s1_cost + s2_cost


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ainews Bi-Weekly AI News Data Pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run live RSS + Reddit + Image ingestion & token estimation without calling Anthropic API or writing to Supabase.",
    )
    parser.add_argument(
        "--batch-type",
        choices=["auto", "midweek", "weekend"],
        default="auto",
        help="Override batch cycle type (default: auto-detected from Asia/Bangkok ICT day).",
    )
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=None,
        help="Optional override for lookback hours (default: 84h for midweek, 96h for weekend).",
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
    )

    logger.info("======================================================================")
    logger.info("AINEWS PIPELINE START | mode=%s | week_id=%s | batch_type=%s", "DRY-RUN" if dry_run else "PRODUCTION", week_id, batch_type)
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
            "window_start_ict": window_start_utc.astimezone(ICT_TZ).isoformat(),
            "window_end_ict": window_end_utc.astimezone(ICT_TZ).isoformat(),
            "summary": {
                "verified_items": len(verified_items),
                "rumor_items": len(rumor_items),
                "total_items": total_raw,
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
        logger.info("Verified RSS items fetched : %d / %d", len(verified_items), config.max_verified_items)
        logger.info("Rumor Community fetched    : %d / %d", len(rumor_items), config.max_rumor_items)
        logger.info("Items with real images     : %d / %d", images_found, total_raw)
        logger.info("Stage 1 planned chunks     : %d (est. %d input tokens)", len(v_chunks) + len(r_chunks), est_s1_input_tokens)
        logger.info("Preview JSON saved to      : %s", preview_path)
        logger.info("Anthropic API & Supabase   : SKIPPED ($0.00 spent)")
        logger.info("-------------------------------------------------------")
        return 0

    if total_raw == 0:
        logger.warning("No items fetched within time window. Exiting gracefully.")
        return 0

    # ------------------------------------------------------------------
    # STEP 2: Initialize Clients & Fetch Midweek Headlines (if Weekend)
    # ------------------------------------------------------------------
    db = AinewsSupabaseClient(config.supabase_url, config.supabase_service_role_key)
    runner = AnthropicBatchRunner(config.anthropic_api_key)

    midweek_headlines = (
        db.fetch_midweek_headlines(week_id) if batch_type == "weekend" else []
    )

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
        # STEP 4: Stage 2 — claude-opus-5-5 (5-Dimension Thai Editorial Brief)
        # ------------------------------------------------------------------
        final_items, s2_res = run_stage2_opus(
            runner=runner,
            config=config,
            week_id=week_id,
            batch_type=batch_type,
            stage1_clusters=stage1_clusters,
            midweek_published_headlines=midweek_headlines,
        )
        s2_in, s2_out, s2_fallback = (
            s2_res.input_tokens,
            s2_res.output_tokens,
            s2_res.used_fallback,
        )

        # ------------------------------------------------------------------
        # STEP 5: Upsert Curated News Items & Log Pipeline Run to Supabase
        # ------------------------------------------------------------------
        final_news_count = db.upsert_news_items(week_id, batch_type, final_items)
        est_cost = calculate_estimated_cost_usd(
            s1_in, s1_out, s1_fallback, s2_in, s2_out, s2_fallback
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
            "PIPELINE COMPLETED SUCCESSFULLY | saved=%d briefs | est_cost=$%.4f",
            final_news_count,
            est_cost,
        )
        return 0

    except Exception as exc:
        logger.exception("Pipeline failed with error: %s", exc)
        est_cost = calculate_estimated_cost_usd(
            s1_in, s1_out, s1_fallback, s2_in, s2_out, s2_fallback
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
            error_message=str(exc)[:1000],
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
