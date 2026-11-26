"""
Stage 2 Processor: claude-sonnet-5-5 (default; supports Opus/Sonnet 5.5 Adaptive Thinking)
Wired directly to `pipeline.prompts`:
  - Cache-friendly static system prompt (`cache_control: {"type": "ephemeral"}`)
  - XML-sandboxed `<prior_published_topics>` (7-day cross-day dedup) & `<stage1_clusters>`
  - Deterministic Gate 2 audit (`parse_and_audit_stage2`) checking provenance,
    status isolation, 5-dimension Thai prefix contract, and zero Markdown leakage
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Set, Tuple

from pipeline.ai_processor.batch_client import (
    AnthropicBatchRunner,
    BatchExecutionResult,
)
from pipeline.config import PROJECT_ROOT, PipelineConfig
from pipeline.ingestion.http_safety import is_official_domain
from pipeline.prompts import (
    PriorPublishedTopic,
    build_stage2_message_params,
    parse_and_audit_stage2,
)
from pipeline.schemas import (
    BatchType,
    Stage1ClusterItem,
    Stage2NewsItem,
)

logger = logging.getLogger(__name__)


def _strip_accidental_markdown(text: str) -> str:
    """Deterministic plain-text cleanup if the model accidentally emitted bold/code markdown."""
    cleaned = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", text)
    cleaned = re.sub(r"__([^_\n]+)__", r"\1", cleaned)
    cleaned = re.sub(r"`([^`\n]+)`", r"\1", cleaned)
    return cleaned.strip()


def run_stage2_opus(
    runner: AnthropicBatchRunner,
    config: PipelineConfig,
    week_id: str,
    batch_type: BatchType,
    stage1_clusters: List[Stage1ClusterItem],
    midweek_published_headlines: List[Dict[str, Any]],
    window_start_ict: str = "",
    window_end_ict: str = "",
) -> Tuple[List[Stage2NewsItem], List[str], BatchExecutionResult]:
    """
    Executes Stage 2 (default claude-sonnet-5-5 with Adaptive Thinking) via
    Anthropic Message Batches API using `pipeline.prompts.build_stage2_message_params`,
    then audits and code-gates all curated Thai briefs and superseded rumor slugs.
    """
    stage_label = f"Stage2-{config.stage2_model}"
    if not stage1_clusters:
        logger.warning("[%s] No Stage 1 clusters available. Skipping Stage 2.", stage_label)
        return [], [], BatchExecutionResult()

    # Pass all recently published DB rows (last N days) for cross-day anti-duplication
    prior_topics: List[PriorPublishedTopic] = []
    if midweek_published_headlines:
        for row in midweek_published_headlines:
            try:
                prior_topics.append(
                    PriorPublishedTopic(
                        cluster_slug=str(row.get("cluster_slug") or ""),
                        status=row.get("status") if row.get("status") in ("verified", "rumor") else "verified",
                        company_tags=list(row.get("company_tags") or []),
                        title_th=str(row.get("title_th") or ""),
                        tldr_th=str(row.get("tldr_th") or ""),
                    )
                )
            except Exception:
                continue

    params = build_stage2_message_params(
        week_id=week_id,
        batch_type=batch_type,
        stage1_clusters=stage1_clusters,
        window_start_ict=window_start_ict,
        window_end_ict=window_end_ict,
        prior_published_topics=prior_topics,
        model=config.stage2_model,
        max_tokens=48000,
        thinking_budget_tokens=config.stage2_thinking_budget,
        enable_cache=True,
    )

    custom_id = f"stage2-{week_id}-{batch_type}"
    exec_result = runner.execute_batch_with_fallback(
        requests=[{"custom_id": custom_id, "params": params}],
        timeout_seconds=config.batch_stage2_timeout_seconds,
        poll_interval_seconds=config.batch_poll_interval_seconds,
        stage_label=stage_label,
    )

    raw_output = exec_result.outputs.get(custom_id, "")
    if not raw_output:
        raise RuntimeError(f"[{stage_label}] Received empty output from Anthropic API.")

    # Save raw paid Stage 2 output immediately to gitignored pipeline/data/
    try:
        dump_dir = PROJECT_ROOT / "pipeline" / "data"
        dump_dir.mkdir(parents=True, exist_ok=True)
        (dump_dir / "last_stage2_raw.json").write_text(raw_output, encoding="utf-8")
    except Exception:
        pass

    validated, audit = parse_and_audit_stage2(
        raw_output,
        stage1_clusters,
        expected_week_id=week_id,
        expected_batch_type=batch_type,
    )

    if audit.warnings:
        for w in audit.warnings:
            logger.warning("[Stage2-Audit] WARN: %s", w)
    if not audit.is_valid:
        for e in audit.errors:
            logger.warning("[Stage2-Audit] ERROR (applying deterministic code-gates): %s", e)

    # Whitelists from Stage 1 for strict provenance & status-isolated code-gating
    valid_images_by_status: Dict[str, Dict[str, Optional[str]]] = {
        "verified": {},
        "rumor": {},
    }
    url_to_statuses: Dict[str, Set[str]] = {}
    for c in stage1_clusters:
        if c.image_url:
            valid_images_by_status[c.status][c.image_url] = c.image_credit
        for src in c.source_urls:
            url_to_statuses.setdefault(src.url, set()).add(c.status)

    # Protect already-published rows in the same (week_id, batch_type) from silent upsert overwrite
    existing_same_bucket_slugs: Set[str] = {
        str(row.get("cluster_slug") or "")
        for row in (midweek_published_headlines or [])
        if row.get("week_id") == week_id
        and row.get("batch_type") == batch_type
        and row.get("cluster_slug")
    }

    final_items: List[Stage2NewsItem] = []
    seen_slugs: Set[str] = set()
    kept_rumors = 0
    max_rumors_per_run = 3

    for item in validated.items:
        candidate_slug = item.cluster_slug
        if candidate_slug in seen_slugs:
            continue

        # Never allow a new run (or prompt injection) to overwrite an already-published DB row
        if candidate_slug in existing_same_bucket_slugs:
            if item.status == "rumor":
                logger.warning(
                    "[Stage2-CodeGate] Dropping rumor reusing existing published slug '%s'.",
                    candidate_slug,
                )
                continue
            # Disambiguate follow-up verified updates safely so prior verified row stays intact
            suffix_idx = 2
            new_slug = f"{candidate_slug}-update"
            while new_slug in existing_same_bucket_slugs or new_slug in seen_slugs:
                new_slug = f"{candidate_slug}-update-{suffix_idx}"
                suffix_idx += 1
            logger.info(
                "[Stage2-CodeGate] Disambiguated follow-up slug '%s' -> '%s' to protect existing row.",
                candidate_slug,
                new_slug,
            )
            candidate_slug = new_slug

        # Enforce hard rumor cap in code (<= 3 per cycle)
        if item.status == "rumor" and kept_rumors >= max_rumors_per_run:
            logger.info(
                "[Stage2-CodeGate] Skipping extra rumor '%s' (cap=%d reached).",
                candidate_slug,
                max_rumors_per_run,
            )
            continue

        # Keep only verbatim source URLs belonging to the same status & re-enforce is_official deterministically
        clean_sources = []
        for src in item.source_urls:
            if item.status not in url_to_statuses.get(src.url, set()):
                continue
            enforced_official = (
                False if item.status == "rumor" else is_official_domain(src.url)
            )
            clean_sources.append(src.model_copy(update={"is_official": enforced_official}))

        if not clean_sources:
            logger.warning("[Stage2-CodeGate] Dropping '%s' due to zero valid matching source_urls.", candidate_slug)
            continue

        # Sort official citations first
        clean_sources.sort(key=lambda s: not s.is_official)

        # Status-isolated image URL + Stage-1 whitelisted credit
        status_image_map = valid_images_by_status.get(item.status, {})
        safe_image_url = item.image_url if item.image_url in status_image_map else None
        safe_image_credit = (
            status_image_map.get(safe_image_url) or item.image_credit
            if safe_image_url
            else None
        )
        enforced_category = None if item.status == "rumor" else item.category

        # Clean any accidental markdown tokens so UI plain-text rendering stays pristine
        clean_title = _strip_accidental_markdown(item.title_th)
        clean_tldr = _strip_accidental_markdown(item.tldr_th)
        clean_bullets = [_strip_accidental_markdown(b) for b in item.summary_bullets]
        clean_facts = [
            kf.model_copy(
                update={
                    "label": _strip_accidental_markdown(kf.label),
                    "value": _strip_accidental_markdown(kf.value),
                }
            )
            for kf in item.key_facts
        ]

        seen_slugs.add(candidate_slug)
        if item.status == "rumor":
            kept_rumors += 1

        final_items.append(
            item.model_copy(
                update={
                    "cluster_slug": candidate_slug,
                    "category": enforced_category,
                    "image_url": safe_image_url,
                    "image_credit": safe_image_credit,
                    "source_urls": clean_sources,
                    "title_th": clean_title,
                    "tldr_th": clean_tldr,
                    "summary_bullets": clean_bullets,
                    "key_facts": clean_facts,
                }
            )
        )

    # Quadruple-locked deterministic gate for superseded rumor graduation:
    # 1) Only when today's batch emits verified items
    # 2) Only slugs belonging to known prior status='rumor' rows (mapped to exact row UUIDs)
    # 3) Company tag overlap required when both sides have specific non-'Other' tags
    # 4) Hard cap per run <= min(3, verified_count)
    prior_rumors_by_slug: Dict[str, List[Dict[str, Any]]] = {}
    for row in (midweek_published_headlines or []):
        slug = str(row.get("cluster_slug") or "")
        if row.get("status") == "rumor" and slug:
            prior_rumors_by_slug.setdefault(slug, []).append(row)

    verified_items_out = [i for i in final_items if i.status == "verified"]
    verified_specific_tags: Set[str] = {
        tag
        for item in verified_items_out
        for tag in item.company_tags
        if tag != "Other"
    }
    max_deletions = min(3, len(verified_items_out))
    validated_superseded_rumors: List[str] = []

    if max_deletions > 0:
        for slug in validated.superseded_rumor_slugs:
            if len(validated_superseded_rumors) >= max_deletions:
                break
            matched_rows = prior_rumors_by_slug.get(slug)
            if not matched_rows:
                logger.warning(
                    "[Stage2-CodeGate] Ignoring unknown/non-rumor superseded_rumor_slug '%s'.",
                    slug,
                )
                continue
            for row in matched_rows:
                rumor_tags = {t for t in (row.get("company_tags") or []) if t != "Other"}
                if rumor_tags and verified_specific_tags and not (rumor_tags & verified_specific_tags):
                    logger.warning(
                        "[Stage2-CodeGate] Blocking rumor graduation '%s' due to company_tag mismatch (%s vs %s).",
                        slug,
                        rumor_tags,
                        verified_specific_tags,
                    )
                    continue
                target_ref = str(row.get("id") or slug)
                if target_ref not in validated_superseded_rumors:
                    validated_superseded_rumors.append(target_ref)
                if len(validated_superseded_rumors) >= max_deletions:
                    break

    logger.info(
        "[%s] Curated %d final Thai briefs (verified=%d, rumor=%d, superseded_rumors=%d, in=%d, out=%d, fallback=%s, audit_ok=%s).",
        stage_label,
        len(final_items),
        sum(1 for i in final_items if i.status == "verified"),
        sum(1 for i in final_items if i.status == "rumor"),
        len(validated_superseded_rumors),
        exec_result.input_tokens,
        exec_result.output_tokens,
        exec_result.used_fallback,
        audit.is_valid,
    )
    return final_items, validated_superseded_rumors, exec_result


# Readable alias for daily Sonnet/Opus Stage 2 editor
run_stage2_editor = run_stage2_opus
