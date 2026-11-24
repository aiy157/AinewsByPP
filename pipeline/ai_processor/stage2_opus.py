"""
Stage 2 Processor: claude-opus-5-5 (Extended Thinking: Medium / 4,000 tokens)
Wired directly to `pipeline.prompts`:
  - Cache-friendly static system prompt (`cache_control: {"type": "ephemeral"}`)
  - XML-sandboxed `<prior_midweek_topics>` & `<stage1_clusters>`
  - Deterministic Gate 2 audit (`parse_and_audit_stage2`) checking provenance,
    status isolation, 5-dimension Thai prefix contract, and zero Markdown leakage
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Set, Tuple

from pipeline.ai_processor.batch_client import (
    AnthropicBatchRunner,
    BatchExecutionResult,
)
from pipeline.config import PROJECT_ROOT, PipelineConfig
from pipeline.prompts import (
    PriorMidweekTopic,
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
) -> Tuple[List[Stage2NewsItem], BatchExecutionResult]:
    """
    Executes Stage 2 (claude-opus-5-5 with Extended Thinking budget=4000) via
    Anthropic Message Batches API using `pipeline.prompts.build_stage2_message_params`,
    then audits and code-gates all curated Thai briefs via `parse_and_audit_stage2`.
    """
    if not stage1_clusters:
        logger.warning("[Stage 2] No Stage 1 clusters available. Skipping Opus 5.5.")
        return [], BatchExecutionResult()

    # Convert midweek DB rows into typed PriorMidweekTopic context for weekend dedup
    prior_topics: List[PriorMidweekTopic] = []
    if batch_type == "weekend" and midweek_published_headlines:
        for row in midweek_published_headlines:
            try:
                prior_topics.append(
                    PriorMidweekTopic(
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
        prior_midweek_topics=prior_topics,
        model=config.stage2_model,
        max_tokens=28000,
        thinking_budget_tokens=config.stage2_thinking_budget,
        enable_cache=True,
    )

    custom_id = f"stage2-opus-{week_id}-{batch_type}"
    exec_result = runner.execute_batch_with_fallback(
        requests=[{"custom_id": custom_id, "params": params}],
        timeout_seconds=config.batch_stage2_timeout_seconds,
        poll_interval_seconds=config.batch_poll_interval_seconds,
        stage_label="Stage2-Opus",
    )

    raw_output = exec_result.outputs.get(custom_id, "")
    if not raw_output:
        raise RuntimeError("[Stage2-Opus] Received empty output from Anthropic API.")

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

    # Whitelists from Stage 1 for strict provenance code-gating
    valid_image_urls: Set[str] = {c.image_url for c in stage1_clusters if c.image_url}
    url_to_status: Dict[str, str] = {}
    for c in stage1_clusters:
        for src in c.source_urls:
            url_to_status[src.url] = c.status

    final_items: List[Stage2NewsItem] = []
    seen_slugs: Set[str] = set()

    for item in validated.items:
        if item.cluster_slug in seen_slugs:
            continue
        seen_slugs.add(item.cluster_slug)

        # Keep only verbatim source URLs belonging to the same status
        clean_sources = [
            src
            for src in item.source_urls
            if src.url in url_to_status and url_to_status[src.url] == item.status
        ]
        if not clean_sources:
            logger.warning("[Stage2-CodeGate] Dropping '%s' due to zero valid matching source_urls.", item.cluster_slug)
            continue

        safe_image_url = item.image_url if item.image_url in valid_image_urls else None
        safe_image_credit = item.image_credit if safe_image_url else None
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

        final_items.append(
            item.model_copy(
                update={
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

    logger.info(
        "[Stage2-Opus] Curated %d final Thai briefs (verified=%d, rumor=%d, in=%d, out=%d, fallback=%s, audit_ok=%s).",
        len(final_items),
        sum(1 for i in final_items if i.status == "verified"),
        sum(1 for i in final_items if i.status == "rumor"),
        exec_result.input_tokens,
        exec_result.output_tokens,
        exec_result.used_fallback,
        audit.is_valid,
    )
    return final_items, exec_result
