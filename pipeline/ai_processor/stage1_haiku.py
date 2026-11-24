"""
Stage 1 Processor: claude-haiku-5-5 (Thinking: Disabled)
Wired directly to `pipeline.prompts`:
  - Cache-friendly static system prompt (`cache_control: {"type": "ephemeral"}`)
  - XML-sandboxed `<untrusted_raw_articles>` with prompt-injection escaping
  - Deterministic Gate 1 audit (`parse_and_audit_stage1`) + code-gated provenance checks
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Set, Tuple
from urllib.parse import urlparse

from pipeline.ai_processor.batch_client import (
    AnthropicBatchRunner,
    BatchExecutionResult,
)
from pipeline.config import PipelineConfig, estimate_tokens
from pipeline.prompts import (
    build_stage1_message_params,
    parse_and_audit_stage1,
)
from pipeline.schemas import (
    NewsStatus,
    RawScrapedItem,
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
    in one Anthropic Message Batch using `pipeline.prompts.build_stage1_message_params`,
    then validates & audits every returned cluster via `parse_and_audit_stage1`.
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

    total_chunks = len(all_chunks)
    batch_requests: List[Dict[str, Any]] = []
    chunk_meta_map: Dict[str, Tuple[NewsStatus, List[RawScrapedItem]]] = {}

    for idx, (chunk_id, chunk_status, chunk_items) in enumerate(all_chunks, start=1):
        chunk_meta_map[chunk_id] = (chunk_status, chunk_items)
        params = build_stage1_message_params(
            raw_items=chunk_items,
            chunk_index=idx,
            total_chunks=total_chunks,
            model=config.stage1_model,
            max_tokens=16384,
            enable_cache=True,
        )
        batch_requests.append(
            {
                "custom_id": chunk_id,
                "params": params,
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
        expected_status, chunk_items = chunk_meta_map[chunk_id]
        allowed_chunk_urls: Set[str] = {it.url for it in chunk_items}
        allowed_chunk_images: Set[str] = {it.image_url for it in chunk_items if it.image_url}

        try:
            parsed, audit = parse_and_audit_stage1(raw_output, chunk_items)

            if audit.warnings:
                for w in audit.warnings:
                    logger.warning("[Stage1-Audit:%s] WARN: %s", chunk_id, w)
            if not audit.is_valid:
                for e in audit.errors:
                    logger.warning("[Stage1-Audit:%s] ERROR (auto-sanitizing): %s", chunk_id, e)

            for cluster in parsed.clusters:
                # Code-gate 1: Strictly enforce locked source status for this chunk
                enforced_status = expected_status

                # Code-gate 2: Whitelist image_url verbatim against scraped chunk images
                safe_image_url = (
                    cluster.image_url
                    if cluster.image_url in allowed_chunk_images
                    else None
                )
                safe_image_credit = cluster.image_credit if safe_image_url else None

                # Code-gate 3: Whitelist source URLs verbatim & deterministically enforce is_official
                clean_sources = []
                for src in cluster.source_urls:
                    if src.url in allowed_chunk_urls:
                        is_off = (
                            False
                            if enforced_status == "rumor"
                            else _is_official_domain(src.url)
                        )
                        clean_sources.append(src.model_copy(update={"is_official": is_off}))

                if not clean_sources:
                    continue

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
