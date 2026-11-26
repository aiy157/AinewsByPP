"""
Curated Source Registry for the Two-Pipe Ingestion Architecture:
  - Pipe 1 (status='verified'): Official AI Company Blogs, ArXiv Research, Major Tech Media
  - Pipe 2 (status='rumor'): Reddit r/singularity & r/LocalLLaMA (Flair-gated Rumor/Leak/Speculation)
"""

from dataclasses import dataclass
from typing import List, Tuple

from pipeline.schemas import CompanyTag


@dataclass(frozen=True)
class RssSource:
    name: str
    url: str
    is_official: bool
    default_company_tag: CompanyTag
    priority_weight: int = 1  # Higher weight prioritized when capping to 125 items
    allowed_link_domains: Tuple[str, ...] = ()  # Enforced on third-party mirrors to prevent link injection


# Pipe 1: Verified Fact Sources (Direct RSS Feeds — no keyword filtering per Decision 3B)
VERIFIED_RSS_SOURCES: List[RssSource] = [
    # --- Official AI Lab Blogs (Highest Priority) ---
    RssSource(
        name="OpenAI Official News",
        url="https://openai.com/news/rss.xml",
        is_official=True,
        default_company_tag="OpenAI",
        priority_weight=3,
    ),
    RssSource(
        name="Anthropic Official News",
        url="https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml",
        is_official=True,
        default_company_tag="Anthropic",
        priority_weight=3,
        allowed_link_domains=("anthropic.com",),
    ),
    RssSource(
        name="Anthropic Engineering Blog",
        url="https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_engineering.xml",
        is_official=True,
        default_company_tag="Anthropic",
        priority_weight=3,
        allowed_link_domains=("anthropic.com",),
    ),
    RssSource(
        name="Google DeepMind Blog",
        url="https://deepmind.google/blog/rss.xml",
        is_official=True,
        default_company_tag="Google",
        priority_weight=3,
    ),
    RssSource(
        name="Google AI Blog",
        url="https://blog.google/innovation-and-ai/technology/ai/rss/",
        is_official=True,
        default_company_tag="Google",
        priority_weight=3,
    ),
    RssSource(
        name="Meta AI Research & Engineering",
        url="https://engineering.fb.com/category/ml-applications/feed/",
        is_official=True,
        default_company_tag="Meta",
        priority_weight=3,
    ),
    RssSource(
        name="xAI Official Releases",
        url="https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml",
        is_official=True,
        default_company_tag="xAI",
        priority_weight=3,
        allowed_link_domains=("x.ai",),
    ),
    RssSource(
        name="DeepSeek Official Releases (GitHub)",
        url="https://github.com/deepseek-ai/DeepSeek-V3/releases.atom",
        is_official=True,
        default_company_tag="DeepSeek",
        priority_weight=3,
    ),
    RssSource(
        name="Hugging Face Official Blog",
        url="https://huggingface.co/blog/feed.xml",
        is_official=True,
        default_company_tag="Open-Source",
        priority_weight=2,
    ),

    # --- Academic & Benchmark Research (ArXiv) ---
    RssSource(
        name="ArXiv cs.AI",
        url="https://rss.arxiv.org/rss/cs.AI",
        is_official=True,
        default_company_tag="Open-Source",
        priority_weight=1,
    ),
    RssSource(
        name="ArXiv cs.CL",
        url="https://rss.arxiv.org/rss/cs.CL",
        is_official=True,
        default_company_tag="Open-Source",
        priority_weight=1,
    ),
    RssSource(
        name="ArXiv cs.LG",
        url="https://rss.arxiv.org/rss/cs.LG",
        is_official=True,
        default_company_tag="Open-Source",
        priority_weight=1,
    ),

    # --- Major Tech Media ---
    RssSource(
        name="TechCrunch",
        url="https://techcrunch.com/category/artificial-intelligence/feed/",
        is_official=False,
        default_company_tag="Other",
        priority_weight=2,
    ),
    RssSource(
        name="The Verge",
        url="https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
        is_official=False,
        default_company_tag="Other",
        priority_weight=2,
    ),
    RssSource(
        name="Blognone",
        url="https://www.blognone.com/atom.xml",
        is_official=False,
        default_company_tag="Other",
        priority_weight=2,
    ),
]


# Pipe 2: Rumor Radar Sources (Reddit Public JSON Endpoints — Decision 4B)
RUMOR_SUBREDDITS: List[str] = [
    "singularity",
    "LocalLLaMA",
]

# Allowed Flair substrings (case-insensitive) for Pipe 2 strict Rumor Radar gating
RUMOR_FLAIR_KEYWORDS: Tuple[str, ...] = (
    "rumor",
    "rumour",
    "leak",
    "speculation",
    "unconfirmed",
    "insider",
)

# Official domains used to verify is_official flags deterministically in code
OFFICIAL_DOMAIN_SUFFIXES: Tuple[str, ...] = (
    "openai.com",
    "anthropic.com",
    "deepmind.google",
    "blog.google",
    "ai.google",
    "ai.meta.com",
    "engineering.fb.com",
    "x.ai",
    "deepseek.com",
    "arxiv.org",
    "huggingface.co",
    "github.com/deepseek-ai",
    "github.com/openai",
    "github.com/anthropics",
    "github.com/meta-llama",
)
