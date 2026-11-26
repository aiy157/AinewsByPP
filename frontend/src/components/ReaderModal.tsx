import React, { useEffect, useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import {
  NewsItem,
  VERIFIED_CATEGORIES,
  VerifiedCategory,
} from '../types/news';
import { getSafeExternalUrl, getSafeImageUrl } from '../lib/urlSafety';
import { RichThaiText, stripRumorPrefix } from './RichThaiText';
import { FontScale, formatThaiDate } from './NewsCard';

interface ReaderModalProps {
  item: NewsItem | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  fontScale: FontScale;
  onChangeFontScale: (scale: FontScale) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

const CATEGORY_LABELS: Record<VerifiedCategory, string> = {
  models_updates: 'เปิดตัวโมเดล & อัปเดตระบบ',
  benchmarks_testing: 'ผลทดสอบ & งานวิจัยเด่น',
  partnerships_deals: 'ดีลธุรกิจ & การลงทุน',
  policy_rules: 'กฎหมาย & นโยบาย AI',
};

function splitSectionTitleAndBody(rawBullet: string): {
  sectionTitle: string | null;
  sectionBody: string;
} {
  const colonIdx = rawBullet.indexOf(':');
  if (colonIdx > 2 && colonIdx <= 46) {
    const before = rawBullet.slice(0, colonIdx);
    const after = rawBullet.slice(colonIdx + 1);
    const isUrlColon = after.startsWith('//') || /^https?$/i.test(before.trim());
    const isTimeColon = /\d$/.test(before) && /^\d/.test(after);
    if (!isUrlColon && !isTimeColon) {
      return {
        sectionTitle: before.trim(),
        sectionBody: after.trim(),
      };
    }
  }
  return {
    sectionTitle: null,
    sectionBody: rawBullet,
  };
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const ReaderModal: React.FC<ReaderModalProps> = ({
  item,
  onClose,
  isBookmarked,
  onToggleBookmark,
  fontScale,
  onChangeFontScale,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const copyTimerRef = React.useRef<number | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  // Reset image error, copy state & scroll position whenever switching stories
  useEffect(() => {
    setImageFailed(false);
    setCopied(false);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [item?.id]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Move focus into dialog on open & restore trigger focus on close
  const isOpen = Boolean(item);
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  // Lock background scroll, trap Tab focus, and bind safe keyboard shortcuts
  useEffect(() => {
    if (!item) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
        return;
      }

      if (isEditable) return;

      if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, onClose, hasPrev, hasNext, onPrev, onNext]);

  if (!item) return null;

  const isRumor = item.status === 'rumor';
  const safeImageUrl = getSafeImageUrl(item.image_url, true);
  const hasVisibleImage = Boolean(safeImageUrl && !imageFailed);
  const safeSourceLinks = item.source_urls
    .map((s) => ({ ...s, safeUrl: getSafeExternalUrl(s.url) }))
    .filter((s): s is typeof s & { safeUrl: string } => s.safeUrl !== null);
  const officialLinks = safeSourceLinks.filter((s) => s.is_official);
  const referenceLinks = safeSourceLinks.filter((s) => !s.is_official);

  const categoryLabel =
    item.category && CATEGORY_LABELS[item.category]
      ? CATEGORY_LABELS[item.category]
      : VERIFIED_CATEGORIES[0].titleTh;

  const handleCopy = async () => {
    const cleanTitle = stripRumorPrefix(item.title_th);
    const keyFactsText =
      item.key_facts && item.key_facts.length > 0
        ? [
            'สรุปข้อมูลสำคัญ:',
            ...item.key_facts.map((kf) => `- ${kf.label}: ${kf.value}`),
            '',
          ]
        : [];

    const lines = [
      isRumor ? `[Rumor Radar / ยังไม่ยืนยัน] ${cleanTitle}` : cleanTitle,
      '',
      item.tldr_th,
      '',
      ...keyFactsText,
      ...item.summary_bullets.map((b) => `• ${b}`),
      '',
      'แหล่งอ้างอิง:',
      ...safeSourceLinks.map((s) => `- ${s.title}: ${s.safeUrl}`),
    ];

    const payload = lines.join('\n');
    let ok = false;
    try {
      await navigator.clipboard.writeText(payload);
      ok = true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = payload;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }
  };

  const proseSizeClass =
    fontScale === 'xlarge'
      ? 'text-[19px] leading-[2.05]'
      : fontScale === 'large'
      ? 'text-[17.5px] leading-[1.98]'
      : 'text-[16px] leading-[1.92]';

  const standfirstSizeClass =
    fontScale === 'xlarge'
      ? 'text-[19.5px] leading-[1.85]'
      : fontScale === 'large'
      ? 'text-[18px] leading-[1.82]'
      : 'text-[16.5px] leading-[1.78]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title_th}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`animate-modal-reveal relative w-full max-w-[780px] max-h-[92dvh] flex flex-col rounded-xl shadow-2xl border overflow-hidden focus:outline-none ${
          isRumor
            ? 'bg-rumor-surface border-rumor-border'
            : 'bg-surface border-rule'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Minimal Reader Toolbar */}
        <div className="shrink-0 px-4 sm:px-8 py-3 border-b border-rule flex items-center justify-between gap-2 sm:gap-3 bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
            {isRumor ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-rumor min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Rumor Radar · ยังไม่ยืนยันทางการ</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-verified min-w-0">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="text-editorial truncate">{categoryLabel}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Font Scale (accessible on mobile & desktop) */}
            <div
              className="inline-flex items-center h-7 rounded border border-rule bg-canvas p-0.5"
              role="group"
              aria-label="ปรับขนาดตัวอักษร"
            >
              {(['normal', 'large', 'xlarge'] as FontScale[]).map((scale, idx) => {
                const label = idx === 0 ? 'ก' : idx === 1 ? 'ก+' : 'ก++';
                return (
                  <button
                    key={scale}
                    type="button"
                    aria-pressed={fontScale === scale}
                    onClick={() => onChangeFontScale(scale)}
                    className={`h-6 px-1.5 sm:px-2 rounded text-[11px] font-semibold transition-colors ${
                      fontScale === scale
                        ? 'bg-ink-primary text-canvas'
                        : 'text-ink-muted hover:text-ink-primary'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label={copied ? 'คัดลอกบทสรุปแล้ว' : 'คัดลอกบทสรุปข่าว'}
              title={copied ? 'คัดลอกบทสรุปแล้ว' : 'คัดลอกบทสรุปข่าว'}
              className="inline-flex items-center gap-1.5 h-7 px-2 sm:px-2.5 rounded text-xs font-medium border border-rule bg-canvas hover:border-rule-strong text-ink-secondary hover:text-ink-primary transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-verified" />
                  <span className="hidden sm:inline">คัดลอกแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">คัดลอก</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleBookmark(item.id)}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'}
              title={isBookmarked ? 'นำออกจากที่บันทึกไว้' : 'บันทึกข่าวนี้'}
              className={`inline-flex items-center gap-1.5 h-7 px-2 sm:px-2.5 rounded text-xs font-medium border transition-colors ${
                isBookmarked
                  ? 'bg-editorial text-white border-editorial dark:text-slate-950'
                  : 'border-rule bg-canvas hover:border-rule-strong text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Bookmark
                className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-current' : ''}`}
              />
              <span className="hidden sm:inline">
                {isBookmarked ? 'บันทึกแล้ว' : 'บันทึก'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              title="ปิดหน้าต่าง (Esc)"
              className="inline-flex items-center justify-center w-7 h-7 rounded text-ink-muted hover:text-ink-primary hover:bg-subtle transition-colors ml-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Editorial Article Body */}
        <div
          ref={scrollRef}
          className="editorial-scroll overscroll-contain flex-1 overflow-y-auto px-5 sm:px-10 py-7 sm:py-9"
        >
          {/* Article Metadata Line */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted mb-3.5">
            {item.company_tags.length > 0 && (
              <>
                <span className="font-bold text-ink-primary">
                  {item.company_tags.join(' · ')}
                </span>
                <span aria-hidden="true" className="text-rule-strong">
                  /
                </span>
              </>
            )}
            <span>
              สัปดาห์ {item.week_id} ({item.batch_type === 'midweek' ? 'ต้นสัปดาห์' : 'ปลายสัปดาห์'})
            </span>
            <span aria-hidden="true" className="text-rule-strong">
              /
            </span>
            <span>{formatThaiDate(item.published_at)}</span>
          </div>

          {/* Layer 1A: Authoritative Headline */}
          <h2 className="thai-headline break-words text-[22px] sm:text-[29px] font-bold text-ink-primary leading-[1.4] mb-4">
            <RichThaiText text={item.title_th} variant="headline" />
          </h2>

          {/* Layer 1B: Executive TL;DR Standfirst */}
          {item.tldr_th && (
            <p
              className={`thai-prose break-words font-medium text-ink-primary/90 mb-6 ${standfirstSizeClass}`}
            >
              {item.tldr_th}
            </p>
          )}

          {/* Editorial Caution Strip for Unconfirmed Rumors */}
          {isRumor && (
            <div className="mb-6 pl-4 py-2.5 pr-4 border-l-2 border-rumor bg-rumor-soft text-xs sm:text-[13px] text-ink-secondary leading-relaxed">
              <strong className="text-rumor font-semibold">หมายเหตุบรรณาธิการ:</strong>{' '}
              ประเด็นนี้รวบรวมจากคอมมูนิตี้นักพัฒนา AI (Hacker News / Lobste.rs / คอมมูนิตี้อิสระ) และยังไม่มีประกาศยืนยันอย่างเป็นทางการจากบริษัทผู้พัฒนา
            </div>
          )}

          {/* Layer 1C: Optional Real Source Image (16:9 Full Width with Credit Caption) */}
          {hasVisibleImage && (
            <figure className="mb-7 space-y-2">
              <div className="aspect-[16/9] w-full rounded-lg overflow-hidden border border-rule bg-subtle">
                <img
                  src={safeImageUrl!}
                  alt={item.title_th}
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="w-full h-full object-cover"
                />
              </div>
              {item.image_credit && (
                <figcaption className="text-[11px] text-ink-muted text-right">
                  แหล่งที่มาของภาพ: {item.image_credit}
                </figcaption>
              )}
            </figure>
          )}

          {/* Layer 2: Key Facts Quick-Scan Strip (Bloomberg / Economist Editorial Grid) */}
          {item.key_facts && item.key_facts.length > 0 && (
            <div
              aria-label="สรุปข้อเท็จจริงและตัวเลขสำคัญ"
              className={`grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-4 mb-8 rounded-lg border ${
                isRumor
                  ? 'bg-rumor-soft border-rumor-border/50'
                  : 'bg-canvas/80 border-rule'
              }`}
            >
              {item.key_facts.map((fact, idx) => (
                <div key={idx} className="space-y-0.5 min-w-0">
                  <div
                    title={fact.label}
                    className="text-[11px] font-medium text-ink-muted truncate"
                  >
                    {fact.label}
                  </div>
                  <div className="text-xs sm:text-[13px] font-bold text-ink-primary leading-snug break-words">
                    {fact.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Layer 3: Ultra-Detailed 5-Dimension Editorial Sections */}
          <div className="space-y-6 mb-9">
            {item.summary_bullets.map((bullet, idx) => {
              const { sectionTitle, sectionBody } = splitSectionTitleAndBody(bullet);
              return (
                <section
                  key={idx}
                  className="space-y-1.5 pb-5 border-b border-rule/70 last:border-b-0 last:pb-0"
                >
                  {sectionTitle && (
                    <h3
                      className={`font-heading text-xs sm:text-[13.5px] font-bold tracking-wide ${
                        isRumor ? 'text-rumor' : 'text-editorial'
                      }`}
                    >
                      {sectionTitle}
                    </h3>
                  )}
                  <p className={`thai-prose break-words text-ink-secondary ${proseSizeClass}`}>
                    <RichThaiText text={sectionBody} variant="prose" />
                  </p>
                </section>
              );
            })}
          </div>

          {/* Layer 4: Authoritative Citations & Primary Sources Table */}
          {safeSourceLinks.length > 0 && (
            <div className="pt-6 border-t border-rule space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink-primary">
                <FileText className="w-3.5 h-3.5 text-ink-muted" />
                <span>แหล่งข้อมูลและเอกสารอ้างอิง</span>
              </div>

              <div className="divide-y divide-rule border border-rule rounded-lg bg-canvas/60 overflow-hidden">
                {officialLinks.map((src, i) => (
                  <a
                    key={`off-${i}`}
                    href={src.safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-subtle/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-verified-soft text-verified">
                        Official
                      </span>
                      <span className="text-xs font-semibold text-ink-primary truncate">
                        {src.title}
                      </span>
                      <span className="hidden sm:inline text-[11px] text-ink-muted truncate">
                        {getHostname(src.safeUrl)}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  </a>
                ))}

                {referenceLinks.map((src, i) => (
                  <a
                    key={`ref-${i}`}
                    href={src.safeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-subtle/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          isRumor
                            ? 'bg-rumor-soft text-rumor'
                            : 'bg-subtle text-ink-secondary'
                        }`}
                      >
                        {isRumor ? 'Community' : 'Reference'}
                      </span>
                      <span className="text-xs font-medium text-ink-primary truncate">
                        {src.title}
                      </span>
                      <span className="hidden sm:inline text-[11px] text-ink-muted truncate">
                        {getHostname(src.safeUrl)}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Story Switcher */}
        <div className="shrink-0 px-5 sm:px-8 py-3 border-t border-rule bg-surface/95 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={onPrev}
            className={`inline-flex items-center gap-1 h-8 px-3 rounded text-xs font-semibold transition-colors ${
              hasPrev
                ? 'text-ink-primary hover:bg-subtle'
                : 'text-ink-muted/40 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>ข่าวก่อนหน้า</span>
          </button>

          <span className="hidden sm:inline text-[11px] text-ink-muted">
            &larr; / &rarr; สลับข่าว · Esc ปิด
          </span>

          <button
            type="button"
            disabled={!hasNext}
            onClick={onNext}
            className={`inline-flex items-center gap-1 h-8 px-3 rounded text-xs font-semibold transition-colors ${
              hasNext
                ? 'text-ink-primary hover:bg-subtle'
                : 'text-ink-muted/40 cursor-not-allowed'
            }`}
          >
            <span>ข่าวถัดไป</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
