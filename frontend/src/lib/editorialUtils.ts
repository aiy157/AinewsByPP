import {
  ALL_COMPANIES,
  CompanyTag,
  CycleFilter,
  NewsItem,
  PageTabId,
  SourceUrlItem,
  ViewMode,
} from '../types/news';

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
] as const;

export function parseTimestamp(isoString?: string): number {
  if (!isoString) return 0;
  const ms = Date.parse(isoString);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Extracts canonical YYYY-MM-DD in Asia/Bangkok (UTC+7) using Gregorian year.
 */
export function getThaiDayKey(isoString?: string): string {
  const ms = parseTimestamp(isoString);
  if (!ms) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      calendar: 'gregory',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback below
  }
  return (isoString ?? '').slice(0, 10);
}

/**
 * Daily edition grouping key: strictly anchored to the item's actual publication date
 * (published_at in Asia/Bangkok) so selecting Day X displays 100% Day X articles.
 */
export function getItemPublishedDay(item: NewsItem): string {
  return getThaiDayKey(item.published_at);
}

/**
 * Formats a YYYY-MM-DD key or ISO timestamp into deterministic Thai Common Era (ค.ศ.)
 * e.g. "27 พ.ย. 2026" — guarantees zero Buddhist/Common Era mixing across browsers.
 */
export function formatThaiDateCE(isoOrDayKey?: string): string {
  if (!isoOrDayKey) return '—';
  const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDayKey)
    ? isoOrDayKey
    : getThaiDayKey(isoOrDayKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return isoOrDayKey;

  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthLabel = THAI_SHORT_MONTHS[monthIdx];
  if (!monthLabel || !Number.isFinite(year) || !Number.isFinite(day)) {
    return isoOrDayKey;
  }
  return `${day} ${monthLabel} ${year}`;
}

/**
 * Converts ISO week ID ("2026-W48") into reader-friendly Thai range in Common Era:
 * e.g. "สัปดาห์ที่ 48 (23–29 พ.ย. 2026)"
 */
export function formatWeekLabelCE(weekId?: string): string {
  if (!weekId) return '—';
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId.trim());
  if (!match) return weekId;

  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (!Number.isFinite(isoYear) || !Number.isFinite(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    return weekId;
  }

  // ISO week 1 always contains Jan 4; compute Monday of isoWeek in UTC
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Mon = new Date(jan4.getTime() - (jan4Dow - 1) * 86_400_000);
  const start = new Date(week1Mon.getTime() + (isoWeek - 1) * 7 * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);

  const sDay = start.getUTCDate();
  const sMonth = THAI_SHORT_MONTHS[start.getUTCMonth()];
  const sYear = start.getUTCFullYear();

  const eDay = end.getUTCDate();
  const eMonth = THAI_SHORT_MONTHS[end.getUTCMonth()];
  const eYear = end.getUTCFullYear();

  let rangeText: string;
  if (sYear === eYear && sMonth === eMonth) {
    rangeText = `${sDay}–${eDay} ${eMonth} ${eYear}`;
  } else if (sYear === eYear) {
    rangeText = `${sDay} ${sMonth}–${eDay} ${eMonth} ${eYear}`;
  } else {
    rangeText = `${sDay} ${sMonth} ${sYear}–${eDay} ${eMonth} ${eYear}`;
  }

  return `สัปดาห์ที่ ${isoWeek} (${rangeText})`;
}

// ============================================================================
// Trust Level / Source Verification Classifier
// ============================================================================

export type TrustTier =
  | 'official'
  | 'preprint'
  | 'multi_press'
  | 'press'
  | 'press_unconfirmed'
  | 'rumor';

export interface TrustBadgeInfo {
  tier: TrustTier;
  shortLabel: string;
  fullLabel: string;
  tooltip: string;
}

const PRESS_RUMOR_TITLE_RE = /^\s*\[(?:ลือ|ข่าวลือ|rumor|leak)\]/i;
const ANONYMOUS_RUMOR_BODY_RE =
  /(?:แหล่งข่าว(?:นิรนาม|ไม่เปิดเผยชื่อ|วงใน)|ยังไม่(?:มี|ได้รับ)คำยืนยัน(?:อย่างเป็นทางการ|ทางการ)|ข่าวลือ)/u;

export function isPreprintSource(src: SourceUrlItem): boolean {
  const titleLower = (src.title ?? '').toLowerCase();
  if (titleLower.includes('arxiv') || titleLower.includes('preprint')) {
    return true;
  }
  try {
    const host = new URL(src.url).hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'arxiv.org' ||
      host.endsWith('.arxiv.org') ||
      host === 'biorxiv.org' ||
      host === 'medrxiv.org' ||
      host === 'openreview.net'
    );
  } catch {
    return false;
  }
}

export function getNewsTrustInfo(item: NewsItem): TrustBadgeInfo {
  if (item.status === 'rumor') {
    return {
      tier: 'rumor',
      shortLabel: 'Rumor Radar',
      fullLabel: 'ข่าวลือจากคอมมูนิตี้ · ยังไม่ยืนยันทางการ',
      tooltip: 'ประเด็นจากคอมมูนิตี้นักพัฒนา ยังไม่มีประกาศยืนยันอย่างเป็นทางการ',
    };
  }

  const hasCompanyOfficial = item.source_urls.some(
    (s) => s.is_official && !isPreprintSource(s)
  );
  if (hasCompanyOfficial) {
    return {
      tier: 'official',
      shortLabel: 'ยืนยันทางการ',
      fullLabel: 'ยืนยันจากแหล่งข่าวทางการ',
      tooltip: 'อ้างอิงโดยตรงจากประกาศทางการของบริษัทหรือหน่วยงานที่เกี่ยวข้อง',
    };
  }

  const hasPreprint = item.source_urls.some((s) => isPreprintSource(s));
  if (hasPreprint) {
    return {
      tier: 'preprint',
      shortLabel: 'พรีปรินต์ ArXiv',
      fullLabel: 'เอกสารวิจัยต้นฉบับ (ArXiv พรีปรินต์)',
      tooltip:
        'งานวิจัยต้นฉบับบน ArXiv (พรีปรินต์ — เผยแพร่โดยผู้วิจัยโดยตรง อาจยังไม่ผ่านการตรวจสอบโดยผู้เชี่ยวชาญ)',
    };
  }

  const bodyScan = [item.tldr_th ?? '', ...(item.summary_bullets ?? []).slice(0, 2)].join(' ');
  const isPressUnconfirmed =
    PRESS_RUMOR_TITLE_RE.test(item.title_th) ||
    ANONYMOUS_RUMOR_BODY_RE.test(bodyScan);

  if (isPressUnconfirmed) {
    return {
      tier: 'press_unconfirmed',
      shortLabel: 'สื่อรายงาน · รอยืนยัน',
      fullLabel: 'รายงานจากสื่อ · ยังไม่ยืนยันทางการ',
      tooltip: 'รายงานจากสื่อเทคโนโลยีโดยอ้างแหล่งข่าว ยังไม่มีคำยืนยันอย่างเป็นทางการจากบริษัท',
    };
  }

  if (item.source_urls.length >= 2) {
    return {
      tier: 'multi_press',
      shortLabel: 'สื่อหลายสำนัก',
      fullLabel: 'รายงานจากสื่อหลายสำนัก',
      tooltip: `รายงานตรงกันจากสื่อเทคโนโลยี ${item.source_urls.length} สำนัก`,
    };
  }

  return {
    tier: 'press',
    shortLabel: 'สื่อเทคโนโลยี',
    fullLabel: 'รายงานจากสื่อเทคโนโลยี',
    tooltip: 'รายงานจากสื่อเทคโนโลยีชั้นนำ',
  };
}

// ============================================================================
// Source Display Helpers (Clean Names & Human-Readable Counts)
// ============================================================================

export function cleanSourceDisplayName(rawTitle: string): string {
  const trimmed = rawTitle.trim();
  if (!trimmed) return '';
  // Strip verbose parenthetical pipeline tags like "(Community Buzz)" or "(Flair: Rumor/Leak)"
  const stripped = trimmed
    .replace(/\s*\((?:Community Buzz|Flair:[^)]*|AI\s*\/\s*ML|Unofficial Mirror)\)\s*/gi, '')
    .trim();
  return stripped || trimmed;
}

export function formatSourceSummary(sourceUrls: SourceUrlItem[]): {
  primaryName: string;
  primaryFullTitle: string;
  countLabel: string | null;
} | null {
  if (!sourceUrls || sourceUrls.length === 0) return null;
  const primary = sourceUrls.find((s) => s.is_official) ?? sourceUrls[0];
  const primaryName = cleanSourceDisplayName(primary.title);
  const countLabel =
    sourceUrls.length > 1 ? `${sourceUrls.length} แหล่งข่าว` : null;
  return {
    primaryName,
    primaryFullTitle: primary.title,
    countLabel,
  };
}

// ============================================================================
// Multi-Word AND Search Normalization & Matching
// ============================================================================

export function normalizeSearchTokens(rawQuery: string): string[] {
  const normalized = rawQuery.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

export function matchesSearchTokens(item: NewsItem, tokens: string[]): boolean {
  if (tokens.length === 0) return true;

  const haystack = [
    item.title_th,
    item.tldr_th ?? '',
    ...(item.key_facts ?? []).flatMap((kf) => [kf.label, kf.value]),
    ...(item.summary_bullets ?? []),
    ...(item.company_tags ?? []),
    ...(item.source_urls ?? []).map((s) => s.title),
    item.cluster_slug ?? '',
  ]
    .join(' ')
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

// ============================================================================
// Boilerplate Section Filter & Legacy Heading Normalizer (pre-v2.3 DB rows)
// ============================================================================

const EMPTY_TEMPLATE_FILLER_RE =
  /(?:เรื่องนี้|ข่าวนี้|กรณีนี้|ประเด็นนี้|รายงานนี้)?[^。\n]{0,60}(?:ไม่ใช่การเปิดตัว(?:สินค้า|ผลิตภัณฑ์|โมเดล)|ไม่มีการเปิดตัวสินค้า|ไม่เกี่ยวข้องกับการใช้งานผลิตภัณฑ์)[^。\n]{0,160}(?:ไม่มีช่องทางเข้าถึง|ไม่มีไลเซนส์|ไม่ระบุช่องทาง|ไม่มีเงื่อนไขการใช้งาน|ไม่มีรายละเอียดสเปก|ไม่มีสเปกทางเทคนิค)/u;

const LEADING_NA_CLAUSE_RE =
  /^(?:(?:เนื่องจาก|แม้ว่า)?(?:เรื่องนี้|ข่าวนี้|กรณีนี้|ประเด็นนี้|รายงานนี้)[^。\n]{0,140}?(?:ไม่ใช่การเปิดตัว(?:สินค้า|ผลิตภัณฑ์|โมเดล)|ไม่มีสเปกทางเทคนิคโดยตรง)[^。\n]{0,90}?(?:แต่|อย่างไรก็ตาม|จึง|ทว่า|โดย))(?:\s*)/u;

const INLINE_NOT_PRODUCT_DISCLAIMER_RE =
  /\s*(?:โดย)?ไม่ใช่การเปิดตัว(?:สินค้า|ผลิตภัณฑ์|โมเดล)(?:ใหม่)?(?:\s*(?:จึง|เลย)?ไม่(?:มี|ระบุ)(?:สเปก|ข้อมูลสเปก|รายละเอียดสเปก|ช่องทางเข้าถึง|ไลเซนส์|เงื่อนไขการใช้งาน)[^。\n]{0,60})?/gu;

export function isEmptyTemplateFillerBody(sectionBody: string): boolean {
  const trimmed = sectionBody.trim();
  if (trimmed.length > 340) return false;
  return EMPTY_TEMPLATE_FILLER_RE.test(trimmed);
}

export function cleanLegacySectionBody(sectionBody: string): string {
  const trimmed = sectionBody.trim();
  let cleaned = trimmed.replace(LEADING_NA_CLAUSE_RE, '').trim();
  cleaned = cleaned
    .replace(INLINE_NOT_PRODUCT_DISCLAIMER_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Only apply if substantial content remains after removing the robotic disclaimer
  return cleaned.length >= 60 ? cleaned : trimmed;
}

const LEGACY_HEADING_BY_CATEGORY: Record<string, Record<string, string>> = {
  policy_rules: {
    'ที่มาและบริบท': 'ที่มาและบริบทนโยบาย',
    'เจาะลึกสเปกและกลไกเทคนิค': 'สาระสำคัญและขอบเขตการบังคับใช้',
    'ตัวเลขและผลเปรียบเทียบ': 'ไทม์ไลน์ กลุ่มเป้าหมาย และตัวเลขสำคัญ',
    'การเข้าถึงและเงื่อนไขการใช้งาน': 'ท่าทีผู้เกี่ยวข้องและช่องทางปฏิบัติตาม',
    'ผลกระทบและข้อสังเกตที่ควรรู้': 'ผลกระทบต่ออุตสาหกรรมและข้อสังเกตที่ควรรู้',
  },
  partnerships_deals: {
    'ที่มาและบริบท': 'ที่มาและบริบทดีล',
    'เจาะลึกสเปกและกลไกเทคนิค': 'รายละเอียดข้อตกลงและขอบเขต',
    'ตัวเลขและผลเปรียบเทียบ': 'มูลค่า ตัวเลข และไทม์ไลน์',
    'การเข้าถึงและเงื่อนไขการใช้งาน': 'โครงสร้างการดำเนินงานและคู่สัญญา',
    'ผลกระทบและข้อสังเกตที่ควรรู้': 'ผลกระทบต่อตลาดและข้อสังเกตที่ควรรู้',
  },
  benchmarks_testing: {
    'ที่มาและบริบท': 'ที่มาและโจทย์วิจัย',
    'เจาะลึกสเปกและกลไกเทคนิค': 'ระเบียบวิธีและกลไกหลัก',
    'ตัวเลขและผลเปรียบเทียบ': 'ผลทดสอบและตัวเลขเปรียบเทียบ',
    'การเข้าถึงและเงื่อนไขการใช้งาน': 'การเปิดเผยโค้ดและข้อจำกัดการทดลอง',
  },
};

export function localizeSectionHeading(
  sectionTitle: string | null,
  category: NewsItem['category']
): string | null {
  if (!sectionTitle || !category) return sectionTitle;
  const mapping = LEGACY_HEADING_BY_CATEGORY[category];
  if (!mapping) return sectionTitle;
  return mapping[sectionTitle] ?? sectionTitle;
}

// ============================================================================
// Thai Word-Boundary Teaser Truncation (prevents mid-syllable clipping)
// ============================================================================

export function truncateThaiAtWordBoundary(
  text: string,
  maxChars: number
): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length <= maxChars) return trimmed;

  try {
    const IntlWithSegmenter = Intl as typeof Intl & {
      Segmenter?: new (
        locale: string,
        opts: { granularity: 'word' }
      ) => { segment: (s: string) => Iterable<{ segment: string; index: number }> };
    };
    if (IntlWithSegmenter.Segmenter) {
      const seg = new IntlWithSegmenter.Segmenter('th', { granularity: 'word' });
      let acc = '';
      for (const part of seg.segment(trimmed)) {
        if (acc.length + part.segment.length > maxChars) {
          break;
        }
        acc += part.segment;
      }
      const cleanAcc = acc.trimEnd().replace(/[.,;:—–-]+$/, '').trimEnd();
      if (cleanAcc.length >= Math.floor(maxChars * 0.5)) {
        return `${cleanAcc}…`;
      }
    }
  } catch {
    // Fallback below
  }

  return `${trimmed.slice(0, maxChars).trimEnd()}…`;
}

// ============================================================================
// URL Query Routing Helpers (History / Back / Refresh / Shareable Article)
// ============================================================================

const VALID_TABS = new Set<PageTabId>([
  'overview',
  'models_updates',
  'benchmarks_testing',
  'partnerships_deals',
  'policy_rules',
  'rumor_radar',
]);

const VALID_COMPANIES = new Set<CompanyTag | 'ALL'>(['ALL', ...ALL_COMPANIES]);

export interface UrlViewState {
  viewMode: ViewMode;
  day: string;
  week: string;
  cycle: CycleFilter;
  tab: PageTabId;
  company: CompanyTag | 'ALL';
  q: string;
  saved: boolean;
  newsSlug: string | null;
}

export function parseUrlState(search: string, defaultViewMode: ViewMode): UrlViewState {
  const params = new URLSearchParams(search);

  const rawMode = params.get('mode');
  const viewMode: ViewMode =
    rawMode === 'daily' || rawMode === 'weekly' ? rawMode : defaultViewMode;

  const rawDay = params.get('date') ?? '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : '';

  const rawWeek = params.get('week') ?? '';
  const week = /^\d{4}-W\d{2}$/.test(rawWeek) ? rawWeek : '';

  const rawCycle = params.get('cycle');
  const cycle: CycleFilter =
    rawCycle === 'midweek' || rawCycle === 'weekend' ? rawCycle : 'all';

  const rawTab = params.get('tab') as PageTabId | null;
  const tab: PageTabId = rawTab && VALID_TABS.has(rawTab) ? rawTab : 'overview';

  const rawCompany = params.get('company') as CompanyTag | 'ALL' | null;
  const company: CompanyTag | 'ALL' =
    rawCompany && VALID_COMPANIES.has(rawCompany) ? rawCompany : 'ALL';

  const q = params.get('q') ?? '';
  const saved = params.get('saved') === '1';

  const rawNews = (params.get('news') ?? '').trim();
  const newsSlug = /^[a-z0-9-]+$/i.test(rawNews) ? rawNews : null;

  return { viewMode, day, week, cycle, tab, company, q, saved, newsSlug };
}

export function buildUrlFromState(
  state: UrlViewState,
  latestDay: string,
  latestWeek: string
): string {
  const params = new URLSearchParams();

  if (state.saved) {
    params.set('saved', '1');
  } else {
    if (state.viewMode !== 'daily') {
      params.set('mode', state.viewMode);
    }
    if (state.viewMode === 'daily' && state.day && state.day !== latestDay) {
      params.set('date', state.day);
    }
    if (state.viewMode === 'weekly') {
      if (state.week && state.week !== latestWeek) {
        params.set('week', state.week);
      }
      if (state.cycle !== 'all') {
        params.set('cycle', state.cycle);
      }
    }
  }

  if (state.tab !== 'overview') {
    params.set('tab', state.tab);
  }
  if (state.company !== 'ALL') {
    params.set('company', state.company);
  }
  if (state.q.trim().length > 0) {
    params.set('q', state.q.trim());
  }
  if (state.newsSlug) {
    params.set('news', state.newsSlug);
  }

  const qs = params.toString();
  const basePath = window.location.pathname || '/';
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildShareableArticleUrl(slug: string): string {
  try {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('news', slug);
    return url.toString();
  } catch {
    return `?news=${encodeURIComponent(slug)}`;
  }
}
