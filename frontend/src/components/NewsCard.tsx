import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Bookmark,
  ArrowRight,
} from 'lucide-react';
import {
  NewsItem,
  VERIFIED_CATEGORIES,
  VerifiedCategory,
} from '../types/news';
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
  large: 'text-[15px] leading-[1.82]',
  xlarge: 'text-[16px] leading-[1.85]',
};

export function formatThaiDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
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
  const hasVisibleImage = Boolean(item.image_url && !imageFailed);

  const categoryLabel =
    item.category && CATEGORY_LABELS[item.category]
      ? CATEGORY_LABELS[item.category]
      : VERIFIED_CATEGORIES[0].titleTh;

  const teaserText = item.tldr_th || item.summary_bullets[0] || '';
  const primarySource =
    item.source_urls.find((s) => s.is_official) ?? item.source_urls[0];
  const extraSourcesCount = Math.max(0, item.source_urls.length - 1);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenReader(item);
    }
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
        className="group relative rounded-lg text-left cursor-pointer bg-surface border border-rule border-t-2 border-t-editorial hover:border-rule-strong hover:shadow-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-editorial/50 p-6 sm:p-7"
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
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-editorial/12 text-editorial">
                      ใหม่
                    </span>
                  )}
                  <span className="font-bold text-editorial">
                    {categoryLabel}
                  </span>
                  <span aria-hidden="true" className="text-rule-strong">
                    ·
                  </span>
                  <span className="font-semibold text-ink-secondary">
                    {item.company_tags.join(' / ')}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    title="แหล่งข่าวทางการยืนยันแล้ว"
                    className="inline-flex items-center text-verified"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleBookmark(item.id);
                    }}
                    aria-label={isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'}
                    className={`p-1 rounded transition-colors ${
                      isBookmarked
                        ? 'text-editorial'
                        : 'text-ink-muted/60 hover:text-ink-primary'
                    }`}
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`}
                    />
                  </button>
                </div>
              </div>

              <h3
                className={`thai-headline font-bold text-ink-primary group-hover:text-editorial transition-colors mb-3 ${FEATURED_HEADLINE_SCALE[fontScale]}`}
              >
                <RichThaiText text={item.title_th} variant="headline" />
              </h3>

              <p
                className={`thai-prose text-ink-secondary line-clamp-3 mb-4 ${TEASER_SCALE[fontScale]}`}
              >
                {teaserText}
              </p>

              {/* Inline Key Facts Preview (Top 2 metrics quietly displayed) */}
              {item.key_facts && item.key_facts.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-2 py-3 mb-4 border-y border-rule/80">
                  {item.key_facts.slice(0, 3).map((fact, idx) => (
                    <div key={idx} className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        {fact.label}
                      </div>
                      <div className="text-xs font-bold text-ink-primary">
                        {fact.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                {primarySource && (
                  <span className="font-medium text-ink-secondary truncate">
                    {primarySource.title}
                    {extraSourcesCount > 0 ? ` +${extraSourcesCount}` : ''}
                  </span>
                )}
                <span aria-hidden="true" className="text-rule-strong">
                  ·
                </span>
                <span className="shrink-0">
                  {formatThaiDate(item.published_at)}
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
                  src={item.image_url!}
                  alt={item.title_th}
                  loading="lazy"
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
              src={item.image_url!}
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
                      ? 'bg-rumor/15 text-rumor'
                      : 'bg-editorial/12 text-editorial'
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
                <span className="font-bold text-editorial">{categoryLabel}</span>
              )}

              <span aria-hidden="true" className="text-rule-strong">
                ·
              </span>

              <span className="font-semibold text-ink-secondary truncate">
                {item.company_tags.join(' / ')}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isRumor && (
                <span
                  title="แหล่งข่าวทางการยืนยันแล้ว"
                  className="inline-flex items-center text-verified"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark(item.id);
                }}
                aria-label={isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'}
                title={isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกไว้อ่านภายหลัง'}
                className={`p-1 rounded transition-colors ${
                  isBookmarked
                    ? 'text-editorial'
                    : 'text-ink-muted/60 hover:text-ink-primary'
                }`}
              >
                <Bookmark
                  className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`}
                />
              </button>
            </div>
          </div>

          {/* Authoritative Headline */}
          <h3
            className={`thai-headline font-bold text-ink-primary group-hover:text-editorial transition-colors mb-2 ${COMPACT_HEADLINE_SCALE[fontScale]}`}
          >
            <RichThaiText text={item.title_th} variant="headline" />
          </h3>

          {/* Executive TL;DR Preview */}
          <p
            className={`thai-prose text-ink-secondary line-clamp-2 ${TEASER_SCALE[fontScale]}`}
          >
            {teaserText}
          </p>
        </div>
      </div>

      {/* Quiet Authoritative Footer */}
      <div className="px-5 py-3 border-t border-rule/80 flex items-center justify-between gap-3 text-[11px] text-ink-muted">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {primarySource && (
            <span className="font-medium text-ink-secondary truncate">
              {primarySource.title}
              {extraSourcesCount > 0 ? ` +${extraSourcesCount}` : ''}
            </span>
          )}
          <span aria-hidden="true" className="text-rule-strong">
            ·
          </span>
          <span className="shrink-0">{formatThaiDate(item.published_at)}</span>
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
