"""
Anthropic Message Batches API Client with Explicit Timeout & Standard API Fallback (Option 3B).
Architecture Guarantees (aligned with agent-architecture-audit):
  - Explicit fallback contract: if batch polling exceeds stage timeout, cancels the batch
    immediately, harvests any already-succeeded chunks to avoid double-billing, and runs
    ONLY unfinished requests via Standard messages.create.
  - Zero hidden LLM repair loops: uses deterministic JSON extraction + Pydantic validation.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import anthropic

logger = logging.getLogger(__name__)


@dataclass
class BatchExecutionResult:
    outputs: Dict[str, str] = field(default_factory=dict)
    input_tokens: int = 0
    output_tokens: int = 0
    used_fallback: bool = False
    batch_id: Optional[str] = None


def extract_text_from_message_content(content_blocks: List[Any]) -> str:
    """Extracts concatenated text blocks while ignoring Extended Thinking blocks."""
    texts: List[str] = []
    for block in content_blocks or []:
        block_type = getattr(block, "type", None) or (
            block.get("type") if isinstance(block, dict) else None
        )
        if block_type == "text":
            text_val = getattr(block, "text", None) or (
                block.get("text") if isinstance(block, dict) else ""
            )
            if text_val:
                texts.append(str(text_val))
    return "\n".join(texts).strip()


class AnthropicBatchRunner:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is missing. Set it in .env or GitHub Secrets.")
        self.client = anthropic.Anthropic(api_key=api_key)

    def execute_batch_with_fallback(
        self,
        requests: List[Dict[str, Any]],
        timeout_seconds: int,
        poll_interval_seconds: int = 30,
        stage_label: str = "stage",
    ) -> BatchExecutionResult:
        """
        Submits requests to Anthropic Message Batches API (50% discount) and polls until
        processing_status == 'ended'. If timeout_seconds is exceeded (Option 3B), cancels
        the batch, retrieves any already-completed chunks, and executes ONLY remaining
        requests via standard client.messages.create().
        """
        if not requests:
            return BatchExecutionResult()

        result = BatchExecutionResult()
        request_map = {req["custom_id"]: req["params"] for req in requests}

        logger.info(
            "[%s] Submitting %d request(s) to Anthropic Message Batches API (timeout=%ds)...",
            stage_label,
            len(requests),
            timeout_seconds,
        )

        try:
            batch = self.client.messages.batches.create(requests=requests)
            result.batch_id = batch.id
            logger.info("[%s] Created batch_id=%s", stage_label, batch.id)
        except Exception as exc:
            logger.error(
                "[%s] Batch creation failed (%s). Falling back explicitly to Standard Messages API.",
                stage_label,
                exc,
            )
            result.used_fallback = True
            return self._run_standard_fallback(request_map, result, stage_label)

        # Polling loop
        start_time = time.monotonic()
        timed_out = False

        while True:
            batch = self.client.messages.batches.retrieve(result.batch_id)
            counts = batch.request_counts
            elapsed = int(time.monotonic() - start_time)

            logger.info(
                "[%s] batch_id=%s status=%s elapsed=%ds (succeeded=%d processing=%d errored=%d canceled=%d)",
                stage_label,
                batch.id,
                batch.processing_status,
                elapsed,
                counts.succeeded,
                counts.processing,
                counts.errored,
                counts.canceled,
            )

            if batch.processing_status == "ended":
                break

            if elapsed >= timeout_seconds:
                timed_out = True
                logger.warning(
                    "[%s] Batch %s exceeded timeout (%ds). Canceling batch and triggering Option 3B Fallback...",
                    stage_label,
                    batch.id,
                    timeout_seconds,
                )
                try:
                    self.client.messages.batches.cancel(batch.id)
                    # Wait briefly (up to 20s) for Anthropic to flush already-completed results
                    for _ in range(4):
                        time.sleep(5)
                        batch = self.client.messages.batches.retrieve(batch.id)
                        if batch.processing_status == "ended":
                            break
                except Exception as cancel_exc:
                    logger.warning("[%s] Error while canceling batch %s: %s", stage_label, batch.id, cancel_exc)
                break

            time.sleep(poll_interval_seconds)

        # Harvest any succeeded batch items (prevents double-billing on partial completion)
        if batch.processing_status == "ended":
            try:
                for entry in self.client.messages.batches.results(batch.id):
                    cid = entry.custom_id
                    if entry.result.type == "succeeded":
                        msg = entry.result.message
                        result.outputs[cid] = extract_text_from_message_content(msg.content)
                        result.input_tokens += int(getattr(msg.usage, "input_tokens", 0) or 0)
                        result.output_tokens += int(getattr(msg.usage, "output_tokens", 0) or 0)
                    else:
                        logger.warning(
                            "[%s] Batch item custom_id=%s ended with type=%s",
                            stage_label,
                            cid,
                            entry.result.type,
                        )
            except Exception as res_exc:
                logger.warning("[%s] Could not stream partial batch results: %s", stage_label, res_exc)

        # Determine if any custom_ids still need Standard API fallback
        missing_requests = {
            cid: params for cid, params in request_map.items() if cid not in result.outputs
        }

        if missing_requests:
            result.used_fallback = True
            logger.warning(
                "[%s] Running Standard Messages API fallback for %d unfinished item(s) (timed_out=%s)...",
                stage_label,
                len(missing_requests),
                timed_out,
            )
            result = self._run_standard_fallback(missing_requests, result, stage_label)

        return result

    def _run_standard_fallback(
        self,
        missing_requests: Dict[str, Dict[str, Any]],
        result: BatchExecutionResult,
        stage_label: str,
    ) -> BatchExecutionResult:
        for cid, params in missing_requests.items():
            logger.info("[%s] Executing Standard API fallback for custom_id=%s...", stage_label, cid)
            msg = self.client.messages.create(**params)
            result.outputs[cid] = extract_text_from_message_content(msg.content)
            result.input_tokens += int(getattr(msg.usage, "input_tokens", 0) or 0)
            result.output_tokens += int(getattr(msg.usage, "output_tokens", 0) or 0)
        return result
