"""
Quick zero-cost diagnostic script to verify:
  1. Supabase connectivity & table existence (news_items, pipeline_runs)
  2. Anthropic API authentication via zero-token models.list(limit=1)
Never prints or exposes any secret keys.
"""

from __future__ import annotations

import sys

import anthropic

from pipeline.config import load_config
from pipeline.db.supabase_client import AinewsSupabaseClient


def main() -> int:
    cfg = load_config()
    exit_code = 0

    print("=== 1. Supabase Connection Check ===")
    try:
        db = AinewsSupabaseClient(cfg.supabase_url, cfg.supabase_service_role_key)
        for table in ("news_items", "pipeline_runs"):
            resp = db.client.table(table).select("id", count="exact").limit(1).execute()
            print(f"[OK] Table 'public.{table}' is reachable (rows={resp.count}).")
    except Exception as exc:
        print(f"[ERROR] Supabase check failed: {type(exc).__name__}: {exc}")
        exit_code = 1

    print("=== 2. Anthropic API Auth Check (Zero-Token) ===")
    if not cfg.anthropic_api_key:
        print("[WARN] ANTHROPIC_API_KEY is empty.")
        exit_code = 1
    else:
        try:
            client = anthropic.Anthropic(api_key=cfg.anthropic_api_key)
            models = client.models.list(limit=5)
            model_ids = [m.id for m in (models.data or [])]
            print(f"[OK] Anthropic API key authenticated! Sample available models: {model_ids}")
        except Exception as exc:
            print(f"[ERROR] Anthropic API auth check failed: {type(exc).__name__}: {exc}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
