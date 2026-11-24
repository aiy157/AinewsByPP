"""
End-to-End Data Contracts & JSON Schemas for the Ainews Pipeline (v2).
Supports:
  - Optional external image_url & image_credit extracted from RSS / Reddit / og:image
  - Executive TL;DR (tldr_th)
  - Quick-scan Key Facts Strip (key_facts)
  - Ultra-Detailed 5-Dimension Deep-Dive Sections (summary_bullets)
Ensures strict schema alignment across:
  Ingestion (RSS/Reddit) -> Stage 1 (Haiku 5.5) -> Stage 2 (Opus 5.5) -> Supabase -> React Frontend
"""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator

# ==============================================================================
# 1. Shared Domain Literals & Constants
# ==============================================================================

BatchType = Literal["midweek", "weekend"]
NewsStatus = Literal["verified", "rumor"]
VerifiedCategory = Literal[
    "models_updates",
    "benchmarks_testing",
    "partnerships_deals",
    "policy_rules",
]
CompanyTag = Literal[
    "OpenAI",
    "Anthropic",
    "Google",
    "Meta",
    "xAI",
    "DeepSeek",
    "Open-Source",
    "Other",
]

VALID_COMPANY_TAGS: List[str] = [
    "OpenAI",
    "Anthropic",
    "Google",
    "Meta",
    "xAI",
    "DeepSeek",
    "Open-Source",
    "Other",
]

VALID_VERIFIED_CATEGORIES: List[str] = [
    "models_updates",
    "benchmarks_testing",
    "partnerships_deals",
    "policy_rules",
]


# ==============================================================================
# 2. Shared Sub-Models (Sources & Key Facts Strip)
# ==============================================================================

class SourceUrlItem(BaseModel):
    title: str = Field(..., min_length=1, description="Source name, e.g. 'OpenAI Blog', 'TechCrunch', 'r/LocalLLaMA'")
    url: str = Field(..., min_length=8, description="Direct HTTP/HTTPS URL to the original source")
    is_official: bool = Field(
        default=False,
        description="True if official company blog or ArXiv paper; False if press/media or Reddit thread",
    )


class KeyFactItem(BaseModel):
    label: str = Field(..., min_length=1, max_length=60, description="Short Thai metric label e.g. 'ลดต้นทุน Input'")
    value: str = Field(..., min_length=1, max_length=90, description="Concise metric/spec value e.g. 'สูงสุด 75%'")


# ==============================================================================
# 3. Ingestion Layer Schema (Python RSS & Reddit Scraper Output)
# ==============================================================================

class RawScrapedItem(BaseModel):
    raw_id: str = Field(..., description="SHA-256 hash of canonical URL or GUID")
    status: NewsStatus = Field(..., description="Locked at source: 'verified' (RSS) or 'rumor' (Reddit)")
    source_name: str = Field(..., description="Feed or subreddit name")
    is_official_source: bool = Field(..., description="Whether the source is an official blog/research repo")
    default_company_tag: CompanyTag = Field(default="Other")
    title: str = Field(..., description="Original article or Reddit thread title")
    url: str = Field(..., description="Canonical link")
    image_url: Optional[str] = Field(
        default=None,
        description="Direct external image URL extracted from RSS media/enclosure, Reddit preview, or og:image",
    )
    image_credit: Optional[str] = Field(
        default=None,
        description="Attribution label for the extracted image (usually the source name)",
    )
    published_at_utc: str = Field(..., description="ISO-8601 UTC timestamp")
    published_at_ict: str = Field(..., description="ISO-8601 Asia/Bangkok (+07:00) timestamp")
    raw_content: str = Field(..., description="Cleaned text snippet/summary from RSS or Reddit selftext")
    engagement_hint: Optional[str] = Field(
        default=None,
        description="Optional Reddit score/comments or flair metadata (e.g. 'score=340, comments=85, flair=Rumor')",
    )


# ==============================================================================
# 4. Stage 1 Schema: Haiku 5.5 (Lossless Deep Fact Extraction & Clustering)
# ==============================================================================

class Stage1ClusterItem(BaseModel):
    cluster_slug: str = Field(
        ...,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="Unique kebab-case identifier for the story topic",
    )
    status: NewsStatus = Field(
        ...,
        description="Strictly preserved from input items ('verified' or 'rumor'). Never mix verified and rumor.",
    )
    company_tags: List[CompanyTag] = Field(
        ...,
        min_length=1,
        description="List of involved AI companies from the allowed enum list",
    )
    canonical_title_en: str = Field(
        ...,
        description="Concise English headline representing the merged story cluster",
    )
    image_url: Optional[str] = Field(
        default=None,
        description="Best verified external image URL chosen from merged source items (preferring official source image)",
    )
    image_credit: Optional[str] = Field(
        default=None,
        description="Source name credit for image_url",
    )
    extracted_facts: List[str] = Field(
        ...,
        min_length=5,
        max_length=10,
        description=(
            "5 to 10 lossless, in-depth factual points covering: (1) background/context, "
            "(2) technical specs/architecture, (3) exact benchmarks/pricing/numbers, "
            "(4) availability/licensing/rollout schedule, and (5) industry impact/caveats."
        ),
    )
    source_urls: List[SourceUrlItem] = Field(
        ...,
        min_length=1,
        description="All deduplicated URLs supporting this story, with official links first",
    )
    latest_published_at_utc: str = Field(
        ...,
        description="Most recent ISO-8601 UTC timestamp among the merged articles in this cluster",
    )


class Stage1BatchOutput(BaseModel):
    clusters: List[Stage1ClusterItem] = Field(
        ...,
        description="Deduplicated and lossless fact-extracted news clusters ready for Stage 2",
    )


# ==============================================================================
# 5. Stage 2 Schema: Opus 5.5 (Ultra-Detailed 5-Dimension Thai Editorial Brief)
# ==============================================================================

class Stage2NewsItem(BaseModel):
    cluster_slug: str = Field(
        ...,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="Unique kebab-case slug identifier carried over or unified from Stage 1",
    )
    status: NewsStatus = Field(
        ...,
        description="'verified' for main news beats, 'rumor' for isolated Rumor Radar",
    )
    category: Optional[VerifiedCategory] = Field(
        default=None,
        description=(
            "Required for status='verified' ('models_updates', 'benchmarks_testing', "
            "'partnerships_deals', 'policy_rules'). MUST be null for status='rumor'."
        ),
    )
    company_tags: List[CompanyTag] = Field(
        ...,
        min_length=1,
        description="One or more AI company tags",
    )
    image_url: Optional[str] = Field(
        default=None,
        description="Passed through directly from Stage 1 cluster if present; NULL if no real source image exists",
    )
    image_credit: Optional[str] = Field(
        default=None,
        description="Passed through from Stage 1 when image_url is set",
    )
    title_th: str = Field(
        ...,
        min_length=15,
        max_length=220,
        description="Authoritative, clear Thai headline summarizing the core development",
    )
    tldr_th: str = Field(
        ...,
        min_length=40,
        max_length=420,
        description="1 to 2 crisp Thai sentences giving an immediate executive summary for preview cards & reader lead",
    )
    key_facts: List[KeyFactItem] = Field(
        ...,
        min_length=3,
        max_length=4,
        description="3 to 4 structured key facts/metrics for the quick-scan strip at the top of the reader view",
    )
    summary_bullets: List[str] = Field(
        ...,
        min_length=5,
        max_length=5,
        description=(
            "Exactly 5 ultra-detailed Thai sections (each 2-4 comprehensive sentences) prefixed with clear labels: "
            "Verified -> 'ที่มาและบริบท:', 'เจาะลึกสเปกและกลไกเทคนิค:', 'ตัวเลขและผลเปรียบเทียบ:', "
            "'การเข้าถึงและเงื่อนไขการใช้งาน:', 'ผลกระทบและข้อสังเกตที่ควรรู้:' | "
            "Rumor -> 'จุดเริ่มต้นของเบาะแส:', 'รายละเอียดสเปกที่หลุดออกมา:', 'หลักฐานและบริบทแวดล้อม:', "
            "'ผลกระทบที่คาดการณ์:', 'ระดับความน่าเชื่อถือและข้อควรระวัง:'"
        ),
    )
    source_urls: List[SourceUrlItem] = Field(
        ...,
        min_length=1,
        description="Deduplicated official and reference links",
    )
    importance_score: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Editorial importance score (1-10) for sorting inside each category/zone",
    )
    published_at: str = Field(
        ...,
        description="ISO-8601 timestamp of the news item",
    )

    @model_validator(mode="after")
    def validate_status_and_category(self) -> "Stage2NewsItem":
        if self.status == "verified" and self.category is None:
            raise ValueError("Verified news items MUST specify a valid category.")
        if self.status == "rumor" and self.category is not None:
            self.category = None
        return self


class Stage2EditorialOutput(BaseModel):
    week_id: str = Field(..., pattern=r"^\d{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$")
    batch_type: BatchType
    items: List[Stage2NewsItem] = Field(
        ...,
        description="Final curated 5-dimension Thai news briefs (verified across 4 categories + 2-3 top rumors)",
    )


# ==============================================================================
# 6. Supabase Database Row Payload Helper
# ==============================================================================

def to_supabase_row(week_id: str, batch_type: BatchType, item: Stage2NewsItem) -> Dict[str, Any]:
    """Converts a validated Stage2NewsItem into a dict matching public.news_items columns."""
    return {
        "week_id": week_id,
        "batch_type": batch_type,
        "status": item.status,
        "category": item.category if item.status == "verified" else None,
        "company_tags": item.company_tags,
        "image_url": item.image_url,
        "image_credit": item.image_credit if item.image_url else None,
        "title_th": item.title_th.strip(),
        "tldr_th": item.tldr_th.strip(),
        "key_facts": [kf.model_dump() for kf in item.key_facts],
        "summary_bullets": [b.strip() for b in item.summary_bullets],
        "source_urls": [s.model_dump() for s in item.source_urls],
        "importance_score": item.importance_score,
        "cluster_slug": item.cluster_slug,
        "published_at": item.published_at,
    }
