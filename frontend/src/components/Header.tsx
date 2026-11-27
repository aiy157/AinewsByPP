import React from 'react';
import { Moon, Sun, Bookmark } from 'lucide-react';
import { ViewMode } from '../types/news';
import { FontScale } from './NewsCard';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  dataSource: 'supabase' | 'mock';
  loading?: boolean;
  visibleVerifiedCount: number;
  visibleRumorCount: number;
  isFilteredSummary: boolean;
  viewMode: ViewMode;
  editionBadgeLabel: string;
  fontScale: FontScale;
  onChangeFontScale: (scale: FontScale) => void;
  bookmarkedCount: number;
  showOnlyBookmarked: boolean;
  onToggleShowOnlyBookmarked: () => void;
  onGoHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isDark,
  onToggleTheme,
  dataSource,
  loading = false,
  visibleVerifiedCount,
  visibleRumorCount,
  isFilteredSummary,
  viewMode,
  editionBadgeLabel,
  fontScale,
  onChangeFontScale,
  bookmarkedCount,
  showOnlyBookmarked,
  onToggleShowOnlyBookmarked,
  onGoHome,
}) => {
  const totalVisible = visibleVerifiedCount + visibleRumorCount;

  return (
    <header className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-rule">
      {/* Subtle Edition Strip (Broadsheet top metadata line) */}
      <div className="border-b border-rule/70">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-8 flex items-center justify-between gap-2 text-[11px] text-ink-muted tracking-wide">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
            {loading ? (
              <span
                aria-hidden="true"
                className="h-3.5 w-36 rounded bg-subtle animate-pulse"
              />
            ) : (
              <span className="font-semibold text-ink-secondary tracking-wide truncate">
                {editionBadgeLabel}
              </span>
            )}
            <span
              aria-hidden="true"
              className="text-rule-strong shrink-0 hidden sm:inline"
            >
              |
            </span>
            <span className="hidden sm:inline truncate">
              {viewMode === 'daily'
                ? 'ข่าวแยกตามวันที่เผยแพร่จริง · อัปเดตอัตโนมัติทุกเช้า'
                : 'มุมมองรวบยอดรายสัปดาห์ · อัปเดตอัตโนมัติทุกเช้า'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {loading ? (
              <span
                aria-hidden="true"
                className="hidden md:inline-block h-3.5 w-28 rounded bg-subtle animate-pulse"
              />
            ) : (
              <span className="hidden md:inline tabular-nums">
                {isFilteredSummary ? (
                  <>
                    กำลังแสดง{' '}
                    <strong className="text-ink-primary font-semibold">
                      {totalVisible}
                    </strong>{' '}
                    ข่าว
                    {visibleVerifiedCount > 0 && visibleRumorCount > 0 && (
                      <span className="text-ink-muted ml-1">
                        (ข่าวหลัก {visibleVerifiedCount} · ข่าวลือ{' '}
                        {visibleRumorCount})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    ข่าวหลัก{' '}
                    <strong className="text-ink-primary font-semibold">
                      {visibleVerifiedCount}
                    </strong>
                    <span className="mx-1.5 text-rule-strong">·</span>
                    ข่าวลือ{' '}
                    <strong className="text-rumor font-semibold">
                      {visibleRumorCount}
                    </strong>
                  </>
                )}
              </span>
            )}

            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  loading
                    ? 'bg-editorial animate-pulse'
                    : dataSource === 'supabase'
                    ? 'bg-verified'
                    : 'bg-ink-muted'
                }`}
              />
              <span>
                {loading
                  ? 'กำลังโหลด...'
                  : dataSource === 'supabase'
                  ? 'อัปเดตสด'
                  : 'ข้อมูลตัวอย่าง'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Publication Masthead */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Clickable Brand Mark & Wordmark */}
        <button
          type="button"
          onClick={onGoHome}
          aria-label="กลับหน้าแรก AINEWS"
          className="flex items-center gap-2 sm:gap-3 min-w-0 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial rounded-md min-h-[44px]"
        >
          <img
            src="/ainews-logo.jpg"
            alt="AINEWS Logo"
            width={34}
            height={34}
            className="w-7 h-7 sm:w-[34px] sm:h-[34px] rounded-md object-cover border border-rule shadow-sm shrink-0 select-none"
          />
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="font-masthead text-lg sm:text-[28px] font-bold tracking-tight text-ink-primary group-hover:text-editorial transition-colors leading-none select-none">
              AINEWS
            </h1>
            <span className="hidden md:inline text-xs text-ink-muted border-l border-rule-strong pl-3 truncate">
              วารสารวิเคราะห์ข่าววงการ AI ภาษาไทย
            </span>
          </div>
        </button>

        {/* Quiet Fixed-Format Utility Controls (44px touch targets on mobile) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Saved Bookmarks Toggle */}
          <button
            type="button"
            onClick={onToggleShowOnlyBookmarked}
            aria-pressed={showOnlyBookmarked}
            aria-label={`แสดงข่าวที่บันทึกไว้ (${bookmarkedCount} ข่าว)`}
            title="แสดงข่าวที่บันทึกไว้ทั้งหมด (ข้ามวัน/สัปดาห์)"
            className={`inline-flex items-center gap-1 sm:gap-1.5 h-11 sm:h-8 px-2 sm:px-2.5 rounded-md text-xs font-medium border transition-colors ${
              showOnlyBookmarked
                ? 'bg-editorial text-white border-editorial dark:text-slate-950'
                : 'bg-surface border-rule text-ink-secondary hover:border-rule-strong hover:text-ink-primary'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 shrink-0 ${
                showOnlyBookmarked ? 'fill-current' : ''
              }`}
            />
            <span className="sm:hidden text-[11px]">บันทึก</span>
            <span className="hidden sm:inline">ที่บันทึกไว้</span>
            <span className="tabular-nums opacity-80">({bookmarkedCount})</span>
          </button>

          {/* Reading Font Scale Switcher */}
          <div
            className="inline-flex items-center min-h-[44px] sm:min-h-0 sm:h-8 rounded-md border border-rule bg-surface p-0 sm:p-0.5 overflow-hidden"
            role="group"
            aria-label="ปรับขนาดตัวอักษร"
          >
            {(['normal', 'large', 'xlarge'] as FontScale[]).map((scale, idx) => {
              const label = idx === 0 ? 'ก' : idx === 1 ? 'ก+' : 'ก++';
              const active = fontScale === scale;
              return (
                <button
                  key={scale}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeFontScale(scale)}
                  className={`h-11 sm:h-6 min-w-[30px] sm:min-w-0 px-1.5 sm:px-2 sm:rounded text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-ink-primary text-canvas'
                      : 'text-ink-muted hover:text-ink-primary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
            title={
              isDark
                ? 'เปลี่ยนเป็นโหมดสว่าง (Archival Paper)'
                : 'เปลี่ยนเป็นโหมดมืด (Graphite)'
            }
            className="inline-flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md border border-rule bg-surface text-ink-secondary hover:border-rule-strong hover:text-ink-primary transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
