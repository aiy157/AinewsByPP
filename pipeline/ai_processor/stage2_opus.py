"""
Stage 2 Processor: claude-opus-5-5 (Extended Thinking: Medium / 4,000 tokens)
  - Primary Role: Authoritative 5-Dimension Thai Editorial Summarization.
  - Receives lossless Stage 1 clusters (~40k tokens) + Wednesday midweek headlines
    (when running weekend cycle) to prevent cross-cycle repetition.
  - Code-gates category rules (rumor => category=None) and image URL whitelisting.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Set, Tuple

from pipeline.ai_processor.batch_client import (
    AnthropicBatchRunner,
    BatchExecutionResult,
    extract_json_payload,
)
from pipeline.ai_processor.prompts import STAGE2_SYSTEM_PROMPT
from pipeline.config import PipelineConfig
from pipeline.schemas import (
    BatchType,
    Stage1ClusterItem,
    Stage2EditorialOutput,
    Stage2NewsItem,
)

logger = logging.getLogger(__name__)


def run_stage2_opus(
    runner: AnthropicBatchRunner,
    config: PipelineConfig,
    week_id: str,
    batch_type: BatchType,
    stage1_clusters: List[Stage1ClusterItem],
    midweek_published_headlines: List[Dict[str, Any]],
) -> Tuple[List[Stage2NewsItem], BatchExecutionResult]:
    """
    Executes Stage 2 (claude-opus-5-5 with Extended Thinking budget=4000) via
    Anthropic Message Batches API with Option 3B fallback.
    """
    if not stage1_clusters:
        logger.warning("[Stage 2] No Stage 1 clusters available. Skipping Opus 5.5.")
        return [], BatchExecutionResult()

    # Build strict whitelists from Stage 1 so Stage 2 cannot invent fake images or flip status
    valid_image_urls: Set[str] = {
        c.image_url for c in stage1_clusters if c.image_url
    }

    verified_clusters = [c.model_dump() for c in stage1_clusters if c.status == "verified"]
    rumor_clusters = [c.model_dump() for c in stage1_clusters if c.status == "rumor"]

    user_payload = {
        "week_id": week_id,
        "batch_type": batch_type,
        "midweek_published_headlines": (
            midweek_published_headlines if batch_type == "weekend" else []
        ),
        "verified_clusters_count": len(verified_clusters),
        "rumor_clusters_count": len(rumor_clusters),
        "verified_clusters": verified_clusters,
        "rumor_clusters": rumor_clusters,
    }

    custom_id = f"stage2-opus-{week_id}-{batch_type}"
    batch_request = [
        {
            "custom_id": custom_id,
            "params": {
                "model": config.stage2_model,
                "max_tokens": 32000,
                "thinking": {
                    "type": "enabled",
                    "budget_tokens": config.stage2_thinking_budget,
                },
                "system": STAGE2_SYSTEM_PROMPT,
                "messages": [
                    {
                        "role": "user",
                        "content": (
                            f"Curate and write the ultra-detailed 5-dimension Thai editorial briefs for "
                            f"week_id='{week_id}', batch_type='{batch_type}'. "
                            f"Follow all JSON schema and 5-section requirements strictly.\n\n"
                            f"{json.dumps(user_payload, ensure_ascii=False)}"
                        ),
                    }
                ],
            },
        }
    ]

    exec_result = runner.execute_batch_with_fallback(
        requests=batch_request,
        timeout_seconds=config.batch_stage2_timeout_seconds,
        poll_interval_seconds=config.batch_poll_interval_seconds,
        stage_label="Stage2-Opus",
    )

    raw_output = exec_result.outputs.get(custom_id, "")
    if not raw_output:
        raise RuntimeError("[Stage2-Opus] Received empty output from Anthropic API.")

    parsed_dict = extract_json_payload(raw_output)
    # Inject canonical week_id/batch_type if omitted
    parsed_dict.setdefault("week_id", week_id)
    parsed_dict.setdefault("batch_type", batch_type)

    validated = Stage2EditorialOutput.model_validate(parsed_dict)

    # Code-gate final output items
    final_items: List[Stage2NewsItem] = []
    seen_slugs: Set[str] = set()

    for item in validated.items:
        if item.cluster_slug in seen_slugs:
            continue
        seen_slugs.add(item.cluster_slug)

        safe_image_url = item.image_url if item.image_url in valid_image_urls else None
        safe_image_credit = item.image_credit if safe_image_url else None
        enforced_category = None if item.status == "rumor" else item.category

        final_items.append(
            item.model_copy(
                update={
                    "category": enforced_category,
                    "image_url": safe_image_url,
                    "image_credit": safe_image_credit,
                }
            )
        )

    logger.info(
        "[Stage2-Opus] Curated %d final Thai briefs (verified=%d, rumor=%d, in=%d, out=%d, fallback=%s).",
        len(final_items),
        sum(1 for i in final_items if i.status == "verified"),
        sum(1 for i in final_items if i.status == "rumor"),
        exec_result.input_tokens,
        exec_result.output_tokens,
        exec_result.used_fallback,
    )
    return final_items, exec_result
