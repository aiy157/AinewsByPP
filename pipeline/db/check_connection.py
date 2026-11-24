"""Quick diagnostic script to verify Supabase connectivity & table existence."""

from __future__ import annotations

import sys

from pipeline.config import load_config
from pipeline.db.supabase_client import AinewsSupabaseClient


def main() -> int:
    cfg = load_config()
    print(f"Checking Supabase URL: {cfg.supabase_url}")
    try:
        db = AinewsSupabaseClient(cfg.supabase_url, cfg.supabase_service_role_key)
    except Exception as exc:
        print(f"[ERROR] Client init failed: {exc}")
        return 1

    for table in ("news_items", "pipeline_runs"):
        try:
            resp = db.client.table(table).select("id", count="exact").limit(1).execute()
            print(f"[OK] Table 'public.{table}' is reachable (rows={resp.count}).")
        except Exception as exc:
            print(f"[MISSING/ERROR] Table 'public.{table}': {exc}")
            return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
