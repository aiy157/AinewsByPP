-- ==============================================================================
-- Ainews - Supabase PostgreSQL Database Schema (v2: Image + Ultra-Detailed 5D Brief)
-- Target: Supabase (PostgreSQL 15+)
-- Timezone Reference: Asia/Bangkok (ICT, UTC+7)
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Pipeline Execution Log Table (Tracks each midweek/weekend run & API costs)
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id TEXT NOT NULL CHECK (week_id ~ '^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
    batch_type TEXT NOT NULL CHECK (batch_type IN ('midweek', 'weekend')),
    window_start_utc TIMESTAMPTZ NOT NULL,
    window_end_utc TIMESTAMPTZ NOT NULL,
    raw_items_fetched INTEGER NOT NULL DEFAULT 0,
    stage1_clusters_count INTEGER NOT NULL DEFAULT 0,
    final_news_count INTEGER NOT NULL DEFAULT 0,
    stage1_used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    stage2_used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    stage1_input_tokens INTEGER NOT NULL DEFAULT 0,
    stage1_output_tokens INTEGER NOT NULL DEFAULT 0,
    stage2_input_tokens INTEGER NOT NULL DEFAULT 0,
    stage2_output_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    run_status TEXT NOT NULL DEFAULT 'running' CHECK (run_status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_pipeline_run_week_batch UNIQUE (week_id, batch_type)
);

-- 3. Main News Items Table
CREATE TABLE IF NOT EXISTS public.news_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Period & Cycle Identification
    week_id TEXT NOT NULL CHECK (week_id ~ '^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
    batch_type TEXT NOT NULL CHECK (batch_type IN ('midweek', 'weekend')),

    -- Fact vs Rumor Separation (Locked from Ingestion Pipe)
    status TEXT NOT NULL CHECK (status IN ('verified', 'rumor')),

    -- Category: Strictly 4 categories for 'verified', NULL for 'rumor' (Rumor Radar is unified)
    category TEXT CHECK (
        (status = 'verified' AND category IN (
            'models_updates',
            'benchmarks_testing',
            'partnerships_deals',
            'policy_rules'
        ))
        OR
        (status = 'rumor' AND category IS NULL)
    ),

    -- AI Company Tags (e.g., ARRAY['OpenAI', 'Google', 'Open-Source'])
    company_tags TEXT[] NOT NULL DEFAULT ARRAY['Other']::TEXT[] CHECK (
        cardinality(company_tags) >= 1
        AND company_tags <@ ARRAY[
            'OpenAI',
            'Anthropic',
            'Google',
            'Meta',
            'xAI',
            'DeepSeek',
            'Open-Source',
            'Other'
        ]::TEXT[]
    ),

    -- Optional Real Source Image (External HTTPS URL from RSS/Community/og:image; NULL if text-only)
    image_url TEXT CHECK (image_url IS NULL OR image_url ~ '^https?://' OR image_url ~ '^/mock-media/'),
    image_credit TEXT,

    -- Layer 1: Thai Editorial Headline & Executive TL;DR (1-2 sentences)
    title_th TEXT NOT NULL CHECK (char_length(trim(title_th)) > 0),
    tldr_th TEXT NOT NULL CHECK (char_length(trim(tldr_th)) > 0),

    -- Layer 2: Key Facts Strip (3-4 quick-scan metrics/specs)
    -- Format: [{"label": "ลดต้นทุน Input", "value": "สูงสุด 75%"}, ...]
    key_facts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(key_facts) = 'array'
        AND jsonb_array_length(key_facts) <= 6
    ),

    -- Layer 3: Ultra-Detailed 5-Dimension Deep-Dive Sections
    -- Format: ["ที่มาและบริบท: ...", "เจาะลึกสเปกและกลไกเทคนิค: ...", ...]
    summary_bullets JSONB NOT NULL CHECK (
        jsonb_typeof(summary_bullets) = 'array'
        AND jsonb_array_length(summary_bullets) BETWEEN 3 AND 6
    ),

    -- Layer 4: Source Citations: [{"title": "OpenAI Blog", "url": "https://...", "is_official": true}]
    source_urls JSONB NOT NULL CHECK (
        jsonb_typeof(source_urls) = 'array'
        AND jsonb_array_length(source_urls) >= 1
    ),

    -- Ranking & Deduplication Metadata
    importance_score SMALLINT NOT NULL DEFAULT 5 CHECK (importance_score BETWEEN 1 AND 10),
    cluster_slug TEXT NOT NULL CHECK (cluster_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Idempotency constraint: prevents duplicate news insertion on pipeline retry
    CONSTRAINT uq_news_week_batch_slug UNIQUE (week_id, batch_type, cluster_slug)
);

-- ==============================================================================
-- 4. Indexes for High-Performance Dashboard Filtering & Search
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_news_items_week_batch_status
    ON public.news_items (week_id DESC, batch_type, status, category, importance_score DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_published_at
    ON public.news_items (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_items_company_tags_gin
    ON public.news_items USING GIN (company_tags);

CREATE INDEX IF NOT EXISTS idx_news_items_source_urls_gin
    ON public.news_items USING GIN (source_urls);

CREATE INDEX IF NOT EXISTS idx_news_items_title_trgm
    ON public.news_items USING GIN (title_th gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_news_items_tldr_trgm
    ON public.news_items USING GIN (tldr_th gin_trgm_ops);

-- ==============================================================================
-- 5. Automatic updated_at Trigger (Pinned search_path for Supabase Security Advisor)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_items_updated_at ON public.news_items;
CREATE TRIGGER trg_news_items_updated_at
    BEFORE UPDATE ON public.news_items
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 6. Row Level Security (RLS) & Explicit Least-Privilege Grants
-- ==============================================================================
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke write privileges from public/authenticated roles (defense-in-depth with RLS)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.news_items FROM anon, authenticated;

-- Public read-only access strictly on news_items
DROP POLICY IF EXISTS "Allow public read access on news_items" ON public.news_items;
CREATE POLICY "Allow public read access on news_items"
    ON public.news_items
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- pipeline_runs contains operational telemetry & error diagnostics: backend service_role ONLY
DROP POLICY IF EXISTS "Allow public read access on pipeline_runs" ON public.pipeline_runs;
REVOKE ALL ON public.pipeline_runs FROM anon, authenticated;
