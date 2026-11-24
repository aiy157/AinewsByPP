# AINEWS — Automated Daily Thai AI Intelligence Dashboard

**Ainews** is an automated, cost-optimized daily AI news aggregation, two-stage editorial synthesis, and international broadsheet web dashboard built for Thai readers. It tracks major AI labs, ArXiv research, tech press, and developer community signals every morning, strictly separating **Verified Facts (`status: verified`)** from **Community Rumors & Leaks (`status: rumor`)** — with automatic 3-way rumor-vs-verified deconfliction when rumors graduate into official announcements.

---

## System Architecture

```text
Daily Schedule (Every day 04:15 AM ICT / cron: 15 21 * * * UTC on GitHub Actions)
  │
  ├── Pipe 1: Verified Facts (Max 125 items, status='verified', 28h lookback)
  │     └── 15 RSS Feeds: OpenAI, Anthropic, Google DeepMind/AI, Meta AI, xAI,
  │         DeepSeek, Hugging Face, ArXiv (cs.AI/cs.CL/cs.LG), TechCrunch, The Verge, Blognone
  │         + 3-Tier Zero-Cost Image Extraction (RSS media -> <head> og:image -> null)
  │
  └── Pipe 2: Rumor Radar (Max 25 items, status='rumor', 28h lookback)
        └── Hacker News Official Algolia API + Lobste.rs AI Community
            (+ Optional Reddit OAuth2 oauth.reddit.com if configured)
  │
  ▼  Zero-Cost URL Canonicalization + DB URL Pre-Dedup (skips already-published URLs before AI)
  │
  ▼  Stage 1: Anthropic Message Batches API — claude-haiku-5-5 (Thinking: Disabled)
  │    • Prompt Caching + XML-Sandboxed Prompt Injection Defense
  │    • Strictly separated Verified & Rumor chunks (<= 30 items / 100k tokens per chunk)
  │    • Lossless 5–10 Fact Extraction + URL Merging + Image Whitelist Gate
  │
  ▼  Stage 2: Anthropic Message Batches API — claude-sonnet-5-5 (Adaptive Thinking: Medium)
  │    • Cross-day anti-duplication (injects past 7 days of published verified & rumor topics)
  │    • 3-Way Rumor-vs-Verified Deconfliction:
  │      (a) Drops same-day rumor if officially confirmed in the same run
  │      (b) Drops late rumor if already published as verified earlier in the week
  │      (c) Graduates confirmed rumors: emits `superseded_rumor_slugs` so pipeline
  │          automatically removes stale rumor cards from Supabase when official news lands
  │    • Ultra-detailed 4-Layer Thai Editorial Brief:
  │      1) Headline + Executive TL;DR + Real Source Image
  │      2) Key Facts Quick-Scan Strip (3–4 metrics)
  │      3) 5-Dimension Deep-Dive Thai Analysis (plain text, zero Markdown leakage)
  │      4) Verified Official & Reference Source Citations
  │    • Explicit Option 3B Timeout Fallback (cancels batch & harvests completed chunks before Standard API)
  │
  ▼  Supabase (PostgreSQL + B-Tree/GIN/Trigram Indexes + Public Read-Only RLS)
  │
  ▼  React + TypeScript + Vite + Tailwind CSS Broadsheet Dashboard (Vercel / Cloudflare Pages)
```

---

## Project Structure

```text
Ainews/
├── .github/workflows/
│   └── daily_news_pipeline.yml      # Daily 04:15 ICT Cron + manual workflow_dispatch
├── .agents/skills/                  # Installed workspace Agent Skills
├── supabase/
│   ├── schema.sql                   # Tables (news_items, pipeline_runs), constraints, indexes, RLS
│   └── seed_mock_data.sql           # Sample 5-dimension Thai editorial briefs for testing
├── pipeline/                        # Python 3.11+ Data & AI Processing Pipeline
│   ├── config.py                    # .env loader, Asia/Bangkok (UTC+7) windowing & ISO week_id
│   ├── schemas.py                   # Pydantic end-to-end data contracts
│   ├── sources.py                   # Curated 15 RSS feeds & official domain registry
│   ├── prompts.py                   # Cacheable Stage 1/2 prompts, XML sandboxing & Audit Gates
│   ├── main.py                      # Pipeline orchestrator (--dry-run, --batch-type, etc.)
│   ├── requirements.txt
│   ├── ingestion/
│   │   ├── rss_fetcher.py           # Pipe 1: Verified RSS ingestion (cap 125)
│   │   ├── community_rumor_fetcher.py # Pipe 2: Hacker News Algolia + Lobste.rs (cap 25)
│   │   ├── reddit_fetcher.py        # Optional official Reddit OAuth2 integration
│   │   ├── image_extractor.py       # 3-Tier zero-cost external image extractor
│   │   └── deduplicator.py          # Canonical URL & title deduplication
│   ├── ai_processor/
│   │   ├── batch_client.py          # Anthropic Message Batches API + Option 3B Fallback
│   │   ├── stage1_haiku.py          # Stage 1 chunking, execution & Gate 1 enforcement
│   │   └── stage2_opus.py           # Stage 2 editorial synthesis & Gate 2 enforcement
│   └── db/
│       ├── supabase_client.py       # Midweek dedup query, idempotent upsert & run audit logging
│       └── check_connection.py      # Quick Supabase connectivity & table diagnostic
├── frontend/                        # React + TypeScript + Vite + Tailwind CSS Dashboard
│   ├── public/mock-media/           # Sample editorial SVG diagrams
│   └── src/
│       ├── App.tsx                  # Front-page 85/15 Broadsheet + Dedicated Beat Tabs
│       ├── components/              # Header, TabNavigation, FilterBar, NewsCard, ReaderModal, RichThaiText
│       ├── lib/supabase.ts          # Live Supabase reader with automatic Mock fallback
│       ├── data/mockNews.ts         # Full 5-dimension Thai preview dataset
│       └── types/news.ts            # TypeScript contracts aligned with Supabase schema
├── .env.example                     # Safe environment variable template
├── Project detail.md                # Full Thai project specification & blueprint
└── README.md
```

---

## Quick Start (Local Development)

### 1. Environment Variables
Copy `.env.example` to `.env` in the project root and populate your credentials:
- `ANTHROPIC_API_KEY` — Anthropic Console API key
- `SUPABASE_URL` — Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Secret / Service Role key (Backend writes only)
- `SUPABASE_ANON_KEY` & `VITE_SUPABASE_ANON_KEY` — Supabase Publishable / Anon key (Frontend read-only)
- `VITE_SUPABASE_URL` — Same as `SUPABASE_URL`

### 2. Database Setup (Supabase)
1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Execute `supabase/schema.sql` to create `public.news_items`, `public.pipeline_runs`, B-Tree/GIN/Trigram indexes, and RLS policies.
3. *(Optional)* Execute `supabase/seed_mock_data.sql` to test live database reads immediately.

### 3. Backend Pipeline Setup & Testing
```bash
python -m venv .venv
# Windows
.venv\Scripts\pip install -r pipeline/requirements.txt

# 1) Verify Supabase connectivity & tables
.venv\Scripts\python -m pipeline.db.check_connection

# 2) Run live Dry-Run (pulls real RSS, Hacker News, Lobste.rs & images — $0 AI cost)
.venv\Scripts\python -m pipeline.main --dry-run

# 3) Run full production Two-Stage AI pipeline
.venv\Scripts\python -m pipeline.main
```

### 4. Frontend Dashboard
```bash
cd frontend
npm install
npm run dev       # Local preview at http://localhost:5173
npm run build     # Production build into frontend/dist
```

---

## Deployment

### GitHub Actions (Automated Daily Schedule)
Runs automatically **every day at 04:15 AM ICT (`15 21 * * *` UTC)** with a 28-hour lookback window + zero-cost URL pre-dedup so summaries are ready by 05:00 AM ICT (and keeps Supabase Free Tier permanently active).

Configure these **Repository Secrets** in `Settings → Secrets and variables → Actions`:
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- *(Optional)* `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`

### Vercel / Cloudflare Pages (Frontend)
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (also auto-detects `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)

---

## Estimated Monthly Cost

| Component | Tier / Pricing | Est. Monthly Cost |
| :--- | :--- | :--- |
| **Anthropic Batch API** (Haiku 5.5 + Sonnet 5.5 + Prompt Caching, 30 daily runs/mo) | 50% Batch discount + URL pre-dedup | **~$4.00 – $6.00 / mo** |
| **Data Ingestion** (15 RSS Feeds, Hacker News Algolia, Lobste.rs, `og:image`) | Public / Free | **$0** |
| **Supabase (PostgreSQL)** | Free Tier (500 MB) | **$0** |
| **GitHub Actions** | Free Tier (2,000 mins/mo) | **$0** |
| **Vercel / Cloudflare Pages** | Hobby / Free Tier | **$0** |
