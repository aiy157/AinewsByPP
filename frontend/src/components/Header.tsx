import React from 'react';
import { Moon, Sun, Bookmark } from 'lucide-react';
import { FontScale } from './NewsCard';

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  dataSource: 'supabase' | 'mock';
  totalVerified: number;
  totalRumors: number;
  editionBadgeLabel: string;
  fontScale: FontScale;
  onChangeFontScale: (scale: FontScale) => void;
  bookmarkedCount: number;
  showOnlyBookmarked: boolean;
  onToggleShowOnlyBookmarked: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isDark,
  onToggleTheme,
  dataSource,
  totalVerified,
  totalRumors,
  editionBadgeLabel,
  fontScale,
  onChangeFontScale,
  bookmarkedCount,
  showOnlyBookmarked,
  onToggleShowOnlyBookmarked,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-rule">
      {/* Subtle Edition Strip (Broadsheet top metadata line) */}
      <div className="border-b border-rule/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-between text-[11px] text-ink-muted tracking-wide">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <span className="font-semibold text-ink-secondary uppercase tracking-widest">
              {editionBadgeLabel}
            </span>
            <span aria-hidden="true" className="text-rule-strong">
              |
            </span>
            <span className="hidden sm:inline">
              ฉบับอัปเดตรายวัน · อัปเดตทุกวัน เวลา 05:00 น. (ICT)
            </span>
            <span className="sm:hidden">อัปเดตทุกวัน · 05:00 ICT</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline tabular-nums">
              ข่าวจริง <strong className="text-ink-primary font-semibold">{totalVerified}</strong>
              <span className="mx-1.5 text-rule-strong">·</span>
              ข่าวลือ <strong className="text-rumor font-semibold">{totalRumors}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === 'supabase' ? 'bg-verified' : 'bg-ink-muted'
                }`}
              />
              <span>{dataSource === 'supabase' ? 'Live DB' : 'Preview Data'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Publication Masthead */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Wordmark */}
        <div className="flex items-baseline gap-3 min-w-0">
          <h1 className="font-masthead text-2xl sm:text-[28px] font-bold tracking-tight text-ink-primary leading-none select-none">
            AINEWS
          </h1>
          <span className="hidden md:inline text-xs text-ink-muted border-l border-rule-strong pl-3 truncate">
            วารสารวิเคราะห์ข่าววงการ AI ภาษาไทย
          </span>
        </div>

        {/* Quiet Fixed-Format Utility Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Saved Bookmarks Toggle */}
          <button
            type="button"
            onClick={onToggleShowOnlyBookmarked}
            title="แสดงเฉพาะข่าวที่บันทึกไว้"
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors ${
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
                  onClick={() => onChangeFontScale(scale)}
                  className={`h-6 px-2 rounded text-[11px] font-semibold transition-colors ${
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
