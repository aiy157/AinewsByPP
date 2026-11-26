import React from 'react';
import { Moon, Sun, Bookmark } from 'lucide-react';
import { ViewMode } from '../types/news';
import { FontScale } from './NewsCard';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  dataSource: 'supabase' | 'mock';
  loading?: boolean;
  totalVerified: number;
  totalRumors: number;
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
  totalVerified,
  totalRumors,
  viewMode,
  editionBadgeLabel,
  fontScale,
  onChangeFontScale,
  bookmarkedCount,
  showOnlyBookmarked,
  onToggleShowOnlyBookmarked,
  onGoHome,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-rule">
      {/* Subtle Edition Strip (Broadsheet top metadata line) */}
      <div className="border-b border-rule/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between gap-2 text-[11px] text-ink-muted tracking-wide">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 overflow-hidden">
            <span className="font-semibold text-ink-secondary uppercase tracking-wider sm:tracking-widest truncate">
              {editionBadgeLabel}
            </span>
            <span aria-hidden="true" className="text-rule-strong shrink-0 hidden sm:inline">
              |
            </span>
            <span className="hidden sm:inline truncate">
              {viewMode === 'daily'
                ? 'ฉบับอัปเดตรายวัน · อัปเดตทุกวัน เวลา 05:00 น. (ICT)'
                : 'มุมมองรวบยอดรายสัปดาห์ · อัปเดตทุกวัน เวลา 05:00 น. (ICT)'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <span className="hidden md:inline tabular-nums">
              ข่าวจริง <strong className="text-ink-primary font-semibold">{totalVerified}</strong>
              <span className="mx-1.5 text-rule-strong">·</span>
              ข่าวลือ <strong className="text-rumor font-semibold">{totalRumors}</strong>
            </span>
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
                  ? 'กำลังเชื่อมต่อ...'
                  : dataSource === 'supabase'
                  ? 'Live DB'
                  : 'Preview Data'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Publication Masthead */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Clickable Brand Mark & Wordmark */}
        <button
          type="button"
          onClick={onGoHome}
          aria-label="กลับหน้าแรก AINEWS"
          className="flex items-center gap-2.5 sm:gap-3 min-w-0 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial rounded-md"
        >
          <img
            src="/ainews-logo.jpg"
            alt="AINEWS Logo"
            width={34}
            height={34}
            className="w-8 h-8 sm:w-[34px] sm:h-[34px] rounded-md object-cover border border-rule shadow-sm shrink-0 select-none"
          />
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="font-masthead text-xl sm:text-[28px] font-bold tracking-tight text-ink-primary group-hover:text-editorial transition-colors leading-none select-none">
              AINEWS
            </h1>
            <span className="hidden md:inline text-xs text-ink-muted border-l border-rule-strong pl-3 truncate">
              วารสารวิเคราะห์ข่าววงการ AI ภาษาไทย
            </span>
          </div>
        </button>

        {/* Quiet Fixed-Format Utility Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Saved Bookmarks Toggle */}
          <button
            type="button"
            onClick={onToggleShowOnlyBookmarked}
            aria-pressed={showOnlyBookmarked}
            aria-label={`แสดงข่าวที่บันทึกไว้ (${bookmarkedCount} ข่าว)`}
            title="แสดงข่าวที่บันทึกไว้ทั้งหมด (ข้ามวัน/สัปดาห์)"
            className={`inline-flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-md text-xs font-medium border transition-colors ${
              showOnlyBookmarked
                ? 'bg-editorial text-white border-editorial dark:text-slate-950'
                : 'bg-surface border-rule text-ink-secondary hover:border-rule-strong hover:text-ink-primary'
            }`}
          >
            <Bookmark
              className={`w-3.5 h-3.5 ${showOnlyBookmarked ? 'fill-current' : ''}`}
            />
            <span className="hidden sm:inline">ที่บันทึกไว้</span>
            <span className="tabular-nums opacity-80">({bookmarkedCount})</span>
          </button>

          {/* Reading Font Scale Switcher */}
          <div
            className="inline-flex items-center h-8 rounded-md border border-rule bg-surface p-0.5"
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
                  className={`h-6 px-1.5 sm:px-2 rounded text-[11px] font-semibold transition-colors ${
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
            title={isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Archival Paper)' : 'เปลี่ยนเป็นโหมดมืด (Graphite)'}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-rule bg-surface text-ink-secondary hover:border-rule-strong hover:text-ink-primary transition-colors"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
