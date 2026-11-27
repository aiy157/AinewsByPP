import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Bookmark,
  ArrowRight,
  Newspaper,
  BookOpen,
} from 'lucide-react';
import {
  NewsItem,
  VERIFIED_CATEGORIES,
  VerifiedCategory,
} from '../types/news';
import { getSafeImageUrl } from '../lib/urlSafety';
import {
  formatSourceSummary,
  formatThaiDateCE,
  getNewsTrustInfo,
  truncateThaiAtWordBoundary,
} from '../lib/editorialUtils';
import { RichThaiText } from './RichThaiText';

export type FontScale = 'normal' | 'large' | 'xlarge';

interface NewsCardProps {
  item: NewsItem;
  featured?: boolean;
  isLatestBatch?: boolean;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  onOpenReader: (item: NewsItem) => void;
  fontScale: FontScale;
}

const CATEGORY_LABELS: Record<VerifiedCategory, string> = {
  models_updates: 'โมเดล & ระบบ',
  benchmarks_testing: 'ผลทดสอบ & วิจัย',
  partnerships_deals: 'ดีล & การลงทุน',
  policy_rules: 'กฎหมาย & นโยบาย',
};

const COMPACT_HEADLINE_SCALE: Record<FontScale, string> = {
  normal: 'text-[16.5px] sm:text-[17.5px] leading-[1.48]',
  large: 'text-[18px] sm:text-[19px] leading-[1.5]',
  xlarge: 'text-[19.5px] sm:text-[20.5px] leading-[1.52]',
};

const FEATURED_HEADLINE_SCALE: Record<FontScale, string> = {
  normal: 'text-xl sm:text-[23px] leading-[1.42]',
  large: 'text-[22px] sm:text-[25px] leading-[1.45]',
  xlarge: 'text-2xl sm:text-[27px] leading-[1.48]',
};

const TEASER_SCALE: Record<FontScale, string> = {
  normal: 'text-[14px] leading-[1.78]',
  large: 'text-[15.5px] leading-[1.82]',
  xlarge: 'text-[17px] leading-[1.85]',
};

// Relax / remove line-clamp when user enlarges font scale so text never clips mid-word
const FEATURED_CLAMP: Record<FontScale, string> = {
  normal: 'line-clamp-3',
  large: 'line-clamp-4',
  xlarge: 'line-clamp-none',
};

const COMPACT_CLAMP: Record<FontScale, string> = {
  normal: 'line-clamp-2',
  large: 'line-clamp-3',
  xlarge: 'line-clamp-none',
};

export function formatThaiDate(isoString: string): string {
  return formatThaiDateCE(isoString);
}

export const NewsCard: React.FC<NewsCardProps> = ({
  item,
  featured = false,
  isLatestBatch = false,
  isBookmarked,
  onToggleBookmark,
  onOpenReader,
  fontScale,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  // Reset image error state if item changes
  useEffect(() => {
    setImageFailed(false);
  }, [item.id, item.image_url]);

  const isRumor = item.status === 'rumor';
  const safeImageUrl = getSafeImageUrl(item.image_url, true);
  const hasVisibleImage = Boolean(safeImageUrl && !imageFailed);

  const categoryLabel =
    item.category && CATEGORY_LABELS[item.category]
      ? CATEGORY_LABELS[item.category]
      : VERIFIED_CATEGORIES[0].titleTh;

  const teaserText = item.tldr_th || item.summary_bullets[0] || '';
  const featuredTeaser =
    fontScale === 'xlarge'
      ? teaserText
      : truncateThaiAtWordBoundary(
          teaserText,
          fontScale === 'large' ? 255 : 190
        );
  const compactTeaser =
    fontScale === 'xlarge'
      ? teaserText
      : truncateThaiAtWordBoundary(
          teaserText,
          fontScale === 'large' ? 180 : 125
        );
  const sourceSummary = formatSourceSummary(item.source_urls);
  const trustInfo = getNewsTrustInfo(item);
  const companyLabel =
    item.company_tags.length > 0 ? item.company_tags.join(' / ') : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenReader(item);
    }
  };

  const renderTrustBadge = () => {
    if (isRumor) return null;
    if (trustInfo.tier === 'official') {
      return (
        <span
          data-trust-tier="official"
          title={trustInfo.tooltip}
          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-verified"
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{trustInfo.shortLabel}</span>
        </span>
      );
    }
    if (trustInfo.tier === 'preprint') {
      return (
        <span
          data-trust-tier="preprint"
          title={trustInfo.tooltip}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-editorial/25 bg-editorial-soft text-editorial text-[10.5px] font-semibold whitespace-nowrap"
        >
          <BookOpen className="w-3 h-3 shrink-0" />
          <span className="sm:hidden">พรีปรินต์ ArXiv</span>
          <span className="hidden sm:inline">{trustInfo.shortLabel}</span>
        </span>
      );
    }
    if (trustInfo.tier === 'press_unconfirmed') {
      return (
        <span
          data-trust-tier="press_unconfirmed"
          title={trustInfo.tooltip}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-rumor/25 bg-rumor-soft text-rumor text-[10.5px] font-semibold whitespace-nowrap"
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{trustInfo.shortLabel}</span>
        </span>
      );
    }
    return (
      <span
        data-trust-tier={trustInfo.tier}
        title={trustInfo.tooltip}
        className="inline-flex items-center gap-1 text-[10.5px] font-medium text-ink-muted"
      >
        <Newspaper className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">{trustInfo.shortLabel}</span>
      </span>
    );
  };

  // =========================================================================
  // FEATURED LEAD BRIEFING LAYOUT (2-Column Broadsheet Split when image exists)
  // =========================================================================
  if (featured && !isRumor) {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => onOpenReader(item)}
        onKeyDown={handleKeyDown}
        className="group relative rounded-lg text-left cursor-pointer bg-surface border border-rule border-t-2 border-t-editorial hover:border-rule-strong hover:shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-editorial/50 p-5 sm:p-7"
      >
        <div
          className={`grid grid-cols-1 gap-6 items-center ${
            hasVisibleImage ? 'md:grid-cols-12' : ''
          }`}
        >
          {/* Text Column */}
          <div
            className={`flex flex-col justify-between ${
              hasVisibleImage ? 'md:col-span-7' : ''
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-wide">
                  {isLatestBatch && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-editorial-soft text-editorial">
                      ใหม่
                    </span>
                  )}
                  <span className="font-bold text-editorial">
                    {categoryLabel}
                  </span>
                  {companyLabel && (
                    <>
                      <span aria-hidden="true" className="text-rule-strong">
                        ·
                      </span>
                      <span className="font-semibold text-ink-secondary">
                        {companyLabel}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {renderTrustBadge()}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookmark(item.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-pressed={isBookmarked}
                    aria-label={
                      isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'
                    }
                    title={
                      isBookmarked
                        ? 'นำออกจากที่บันทึกไว้'
                        : 'บันทึกไว้อ่านภายหลัง'
                    }
                    className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 -m-2 sm:-m-1 rounded transition-colors ${
                      isBookmarked
                        ? 'text-editorial'
                        : 'text-ink-muted hover:text-ink-primary'
                    }`}
                  >
                    <Bookmark
                      className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${
                        isBookmarked ? 'fill-current' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              <h3
                className={`thai-headline break-words font-bold text-ink-primary group-hover:text-editorial transition-colors mb-3 ${FEATURED_HEADLINE_SCALE[fontScale]}`}
              >
                <RichThaiText text={item.title_th} variant="headline" />
              </h3>

              <p
                className={`thai-prose break-words text-ink-secondary mb-4 ${FEATURED_CLAMP[fontScale]} ${TEASER_SCALE[fontScale]}`}
              >
                {featuredTeaser}
              </p>

              {/* Inline Key Facts Preview (Top 3 metrics — wraps cleanly at large font scales) */}
              {item.key_facts && item.key_facts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2.5 py-3 mb-4 border-y border-rule/80">
                  {item.key_facts.slice(0, 3).map((fact, idx) => (
                    <div key={idx} className="min-w-0">
                      <div
                        className={`font-semibold tracking-wide text-ink-muted break-words ${
                          fontScale === 'xlarge' ? 'text-xs' : 'text-[10.5px]'
                        }`}
                      >
                        {fact.label}
                      </div>
                      <div
                        className={`font-bold text-ink-primary break-words leading-snug ${
                          fontScale === 'xlarge'
                            ? 'text-sm'
                            : fontScale === 'large'
                            ? 'text-[13px]'
                            : 'text-xs'
                        }`}
                      >
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                {sourceSummary && (
                  <>
                    <span
                      title={sourceSummary.primaryFullTitle}
                      className="font-medium text-ink-secondary"
                    >
                      {sourceSummary.primaryName}
                    </span>
                    {sourceSummary.countLabel && (
                      <>
                        <span aria-hidden="true" className="text-rule-strong">
                          ·
                        </span>
                        <span className="text-ink-muted">
                          {sourceSummary.countLabel}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true" className="text-rule-strong">
                      ·
                    </span>
                  </>
                )}
                <span className="shrink-0">
                  {formatThaiDateCE(item.published_at)}
                </span>
              </div>

              <span className="inline-flex items-center gap-1 font-semibold text-editorial shrink-0 transition-transform group-hover:translate-x-0.5">
                <span>อ่านฉบับเจาะลึก</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Real Editorial Source Visual (16:9) */}
          {hasVisibleImage && (
            <figure className="md:col-span-5 space-y-1.5">
              <div className="aspect-[16/9] w-full rounded-md overflow-hidden border border-rule bg-subtle">
                <img
                  src={safeImageUrl!}
                  alt={item.title_th}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </div>
              {item.image_credit && (
                <figcaption className="text-[10px] text-ink-muted text-right truncate">
                  ภาพประกอบ: {item.image_credit}
                </figcaption>
              )}
            </figure>
          )}
        </div>
      </article>
    );
  }

  // =========================================================================
  // COMPACT GRID CARD LAYOUT (With Optional 16:9 Source Image or Text-Only)
  // =========================================================================
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenReader(item)}
      onKeyDown={handleKeyDown}
      className={`group relative flex flex-col justify-between rounded-lg overflow-hidden text-left cursor-pointer transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-editorial/50 ${
        isRumor
          ? 'bg-rumor-surface border border-dashed border-rumor-border hover:border-rumor'
          : 'bg-surface border border-rule hover:border-rule-strong hover:shadow-sm'
      }`}
    >
      <div>
        {/* Optional Top 16:9 Image Strip (Only rendered when real source image exists & loads) */}
        {hasVisibleImage && (
          <div className="aspect-[16/9] w-full overflow-hidden border-b border-rule/80 bg-subtle">
            <img
              src={safeImageUrl!}
              alt={item.title_th}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        )}

        {/* Card Content Body */}
        <div className="p-5 pb-4">
          {/* Top Meta Line */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] tracking-wide min-w-0">
              {isLatestBatch && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                    isRumor
                      ? 'bg-rumor-soft text-rumor'
                      : 'bg-editorial-soft text-editorial'
                  }`}
                >
                  ใหม่
                </span>
              )}
              {isRumor ? (
                <span className="inline-flex items-center gap-1 font-bold uppercase text-rumor">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Rumor Radar</span>
                </span>
              ) : (
                <span className="font-bold text-editorial">
                  {categoryLabel}
                </span>
              )}

              {companyLabel && (
                <>
                  <span aria-hidden="true" className="text-rule-strong">
                    ·
                  </span>
                  <span className="font-semibold text-ink-secondary break-words">
                    {companyLabel}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {renderTrustBadge()}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark(item.id);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                aria-pressed={isBookmarked}
                aria-label={
                  isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'
                }
                title={
                  isBookmarked
                    ? 'นำออกจากที่บันทึกไว้'
                    : 'บันทึกไว้อ่านภายหลัง'
                }
                className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 -m-2 sm:-m-1 rounded transition-colors ${
                  isBookmarked
                    ? 'text-editorial'
                    : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                <Bookmark
                  className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${
                    isBookmarked ? 'fill-current' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Authoritative Headline */}
          <h3
            className={`thai-headline break-words font-bold text-ink-primary group-hover:text-editorial transition-colors mb-2 ${COMPACT_HEADLINE_SCALE[fontScale]}`}
          >
            <RichThaiText text={item.title_th} variant="headline" />
          </h3>

          {/* Executive TL;DR Preview (clean Thai word boundary + unclamped on xlarge) */}
          <p
            className={`thai-prose break-words text-ink-secondary ${COMPACT_CLAMP[fontScale]} ${TEASER_SCALE[fontScale]}`}
          >
            {compactTeaser}
          </p>
        </div>
      </div>

      {/* Quiet Authoritative Footer (Clean source name, wraps naturally if needed) */}
      <div className="px-5 py-3 border-t border-rule/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
          {sourceSummary && (
            <>
              <span
                title={sourceSummary.primaryFullTitle}
                className="font-medium text-ink-secondary"
              >
                {sourceSummary.primaryName}
              </span>
              {sourceSummary.countLabel && (
                <>
                  <span aria-hidden="true" className="text-rule-strong">
                    ·
                  </span>
                  <span className="text-ink-muted">
                    {sourceSummary.countLabel}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-rule-strong">
                ·
              </span>
            </>
          )}
          <span className="shrink-0">{formatThaiDateCE(item.published_at)}</span>
        </div>

        <span
          className={`inline-flex items-center gap-1 font-semibold shrink-0 transition-transform group-hover:translate-x-0.5 ${
            isRumor ? 'text-rumor' : 'text-editorial'
          }`}
        >
          <span>อ่านต่อ</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </article>
  );
};
