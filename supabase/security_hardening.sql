-- ==============================================================================
-- Ainews — Live Supabase Security Hardening Migration (Idempotent)
-- Paste & run once in Supabase Dashboard -> SQL Editor to fix HIGH-03 & MED-06
-- ==============================================================================

-- 1. [HIGH-03] Close public read access to operational telemetry & error logs on pipeline_runs
DROP POLICY IF EXISTS "Allow public read access on pipeline_runs" ON public.pipeline_runs;
REVOKE ALL ON public.pipeline_runs FROM anon, authenticated;

-- 2. [MED-06] Explicit defense-in-depth write revocation on news_items
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.news_items FROM anon, authenticated;

-- 3. [MED-06] Pin search_path on trigger function (clears Supabase Security Advisor warning)
ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- 4. [MED-06] Protect Free Tier against expensive abusive PostgREST queries
ALTER ROLE anon SET statement_timeout = '3s';
