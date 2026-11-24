"""
Stage 1 Processor: claude-haiku-5-5 (Thinking: Disabled)
  - Strictly separates 'verified' and 'rumor' chunks so statuses can NEVER contaminate each other.
  - Enforces <= 100,000 input tokens per chunk inside a single Anthropic Message Batch.
  - Code-gates status integrity, official domain flags, and image URL whitelisting.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Set, Tuple
from urllib.parse import urlparse

from pipeline.ai_processor.batch_client import (
    AnthropicBatchRunner,
    BatchExecutionResult,
    extract_json_payload,
)
from pipeline.ai_processor.prompts import STAGE1_SYSTEM_PROMPT
from pipeline.config import PipelineConfig, estimate_tokens
from pipeline.schemas import (
    NewsStatus,
    RawScrapedItem,
    Stage1BatchOutput,
    Stage1ClusterItem,
)
from pipeline.sources import OFFICIAL_DOMAIN_SUFFIXES

logger = logging.getLogger(__name__)


def _is_official_domain(url: str) -> bool:
    lower = url.lower()
    parsed = urlparse(lower)
    host_path = f"{parsed.hostname or ''}{parsed.path}"
    for suffix in OFFICIAL_DOMAIN_SUFFIXES:
        if "/" in suffix:
            if suffix in host_path:
                return True
        else:
            host = parsed.hostname or ""
            if host == suffix or host.endswith("." + suffix):
                return True
    return False


def build_token_budgeted_chunks(
    items: List[RawScrapedItem],
    status: NewsStatus,
    max_input_tokens: int = 100_000,
) -> List[Tuple[str, NewsStatus, List[RawScrapedItem]]]:
    """
    Splits a single status stream into chunks staying safely below max_input_tokens
    (reserving 15,000 tokens of headroom for system prompt & JSON formatting).
    """
    if not items:
        return []

    effective_budget = max(20_000, max_input_tokens - 15_000)
    chunks: List[Tuple[str, NewsStatus, List[RawScrapedItem]]] = []
    current_batch: List[RawScrapedItem] = []
    current_tokens = 0

    for item in items:
        serialized = json.dumps(item.model_dump(), ensure_ascii=False)
        item_tokens = estimate_tokens(serialized)

        if current_batch and (current_tokens + item_tokens > effective_budget):
            chunk_id = f"stage1-{status}-chunk-{len(chunks) + 1}"
            chunks.append((chunk_id, status, current_batch))
            current_batch = [item]
            current_tokens = item_tokens
        else:
            current_batch.append(item)
            current_tokens += item_tokens

    if current_batch:
        chunk_id = f"stage1-{status}-chunk-{len(chunks) + 1}"
        chunks.append((chunk_id, status, current_batch))

    return chunks


def run_stage1_haiku(
    runner: AnthropicBatchRunner,
    config: PipelineConfig,
    verified_items: List[RawScrapedItem],
    rumor_items: List[RawScrapedItem],
) -> Tuple[List[Stage1ClusterItem], BatchExecutionResult]:
    """
    Executes Stage 1 (claude-haiku-5-5, thinking disabled) across all token-budgeted chunks
    in one Message Batch, then strictly validates and code-gates all returned clusters.
    """
    verified_chunks = build_token_budgeted_chunks(
        verified_items, status="verified", max_input_tokens=config.stage1_max_input_tokens_per_chunk
    )
    rumor_chunks = build_token_budgeted_chunks(
        rumor_items, status="rumor", max_input_tokens=config.stage1_max_input_tokens_per_chunk
    )
    all_chunks = verified_chunks + rumor_chunks

    if not all_chunks:
        logger.warning("[Stage 1] No raw items to process.")
        return [], BatchExecutionResult()

    # Whitelist of real scraped image URLs to prevent LLM hallucination of fake images
    valid_scraped_images: Set[str] = {
        item.image_url
        for item in (verified_items + rumor_items)
        if item.image_url
    }

    batch_requests: List[Dict[str, Any]] = []
    chunk_status_map: Dict[str, NewsStatus] = {}

    for chunk_id, chunk_status, chunk_items in all_chunks:
        chunk_status_map[chunk_id] = chunk_status
        payload_json = json.dumps(
            {
                "locked_status": chunk_status,
                "item_count": len(chunk_items),
                "items": [it.model_dump() for it in chunk_items],
            },
            ensure_ascii=False,
        )

        batch_requests.append(
            {
                "custom_id": chunk_id,
                "params": {
                    "model": config.stage1_model,
                    "max_tokens": 16000,
                    "temperature": 0.1,
                    "system": STAGE1_SYSTEM_PROMPT,
                    "messages": [
                        {
                            "role": "user",
                            "content": (
                                f"Process the following {len(chunk_items)} raw items with locked status='{chunk_status}'. "
                                f"Cluster duplicates, merge source URLs, pick the best real image_url from the input if available, "
                                f"and extract lossless detailed technical facts without losing numbers:\n\n{payload_json}"
                            ),
                        }
                    ],
                },
            }
        )

    exec_result = runner.execute_batch_with_fallback(
        requests=batch_requests,
        timeout_seconds=config.batch_stage1_timeout_seconds,
        poll_interval_seconds=config.batch_poll_interval_seconds,
        stage_label="Stage1-Haiku",
    )

    validated_clusters: List[Stage1ClusterItem] = []

    for chunk_id, raw_output in exec_result.outputs.items():
        expected_status = chunk_status_map[chunk_id]
        try:
            parsed_dict = extract_json_payload(raw_output)
            parsed = Stage1BatchOutput.model_validate(parsed_dict)

            for cluster in parsed.clusters:
                # Code-gate 1: Strictly enforce locked source status
                enforced_status = expected_status

                # Code-gate 2: Whitelist image_url against actual scraped URLs
                safe_image_url = (
                    cluster.image_url
                    if cluster.image_url in valid_scraped_images
                    else None
                )
                safe_image_credit = cluster.image_credit if safe_image_url else None

                # Code-gate 3: Deterministically verify is_official on source URLs
                clean_sources = []
                for src in cluster.source_urls:
                    if src.url.startswith(("http://", "https://")):
                        is_off = False if enforced_status == "rumor" else _is_official_domain(src.url)
                        clean_sources.append(src.model_copy(update={"is_official": is_off}))

                if not clean_sources:
                    continue

                # Place official links first
                clean_sources.sort(key=lambda s: not s.is_official)

                validated_clusters.append(
                    cluster.model_copy(
                        update={
                            "status": enforced_status,
                            "image_url": safe_image_url,
                            "image_credit": safe_image_credit,
                            "source_urls": clean_sources,
                        }
                    )
                )
        except Exception as exc:
            logger.error("[Stage1-Haiku] Failed parsing output for %s: %s", chunk_id, exc)

    logger.info(
        "[Stage1-Haiku] Produced %d validated lossless clusters (in=%d, out=%d, fallback=%s).",
        len(validated_clusters),
        exec_result.input_tokens,
        exec_result.output_tokens,
        exec_result.used_fallback,
    )
    return validated_clusters, exec_result
