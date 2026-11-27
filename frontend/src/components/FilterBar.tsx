import React from 'react';
import { Calendar, ChevronDown, Search, X } from 'lucide-react';
import {
  ALL_COMPANIES,
  CompanyTag,
  CycleFilter,
  DayOption,
  SortOrder,
  ViewMode,
} from '../types/news';

export interface WeekOption {
  id: string;
  label: string;
  count: number;
}

interface FilterBarProps {
  loading?: boolean;
  archiveHydrating?: boolean;
  showOnlyBookmarked: boolean;
  isGlobalSearchActive: boolean;
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  availableDays: DayOption[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  availableWeeks: WeekOption[];
  selectedWeek: string;
  onSelectWeek: (week: string) => void;
  selectedCycle: CycleFilter;
  onSelectCycle: (cycle: CycleFilter) => void;
  sortOrder: SortOrder;
  onSelectSortOrder: (order: SortOrder) => void;
  selectedCompany: CompanyTag | 'ALL';
  onSelectCompany: (company: CompanyTag | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  companyCounts: Record<string, number>;
}

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'daily', label: 'รายวัน' },
  { id: 'weekly', label: 'รายสัปดาห์' },
];

const CYCLES: Array<{ id: CycleFilter; label: string }> = [
  { id: 'all', label: 'รวมทั้งสัปดาห์' },
  { id: 'midweek', label: 'ต้นสัปดาห์ (จ.–พฤ.)' },
  { id: 'weekend', label: 'ปลายสัปดาห์ (ศ.–อา.)' },
];

const SORT_OPTIONS: Array<{ id: SortOrder; label: string }> = [
  { id: 'latest', label: 'ล่าสุดก่อน' },
  { id: 'importance', label: 'สำคัญสุดก่อน' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  loading = false,
  archiveHydrating = false,
  showOnlyBookmarked,
  isGlobalSearchActive,
  viewMode,
  onSelectViewMode,
  availableDays,
  selectedDay,
  onSelectDay,
  availableWeeks,
  selectedWeek,
  onSelectWeek,
  selectedCycle,
  onSelectCycle,
  sortOrder,
  onSelectSortOrder,
  selectedCompany,
  onSelectCompany,
  searchQuery,
  onSearchChange,
  companyCounts,
}) => {
  return (
    <section
      aria-label="ตัวกรองข่าว"
      className="pb-4 border-b border-rule space-y-3"
    >
      {/* Row 1: Mode (Daily / Weekly), Period Selector, Optional Cycle, Sort & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 flex-wrap">
        {/* Hide Daily/Weekly period controls while browsing Saved Bookmarks (cross-archive) */}
        {!showOnlyBookmarked && (
          <>
            {/* Primary 2-System Mode Switcher: Daily vs Weekly */}
            <div
              className={`inline-flex min-h-[44px] sm:min-h-0 sm:h-9 p-0 sm:p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start overflow-hidden transition-opacity ${
                isGlobalSearchActive ? 'opacity-60' : ''
              }`}
              role="group"
              aria-label="เลือกระบบการแสดงข่าว รายวันหรือรายสัปดาห์"
            >
              {VIEW_MODES.map((mode) => {
                const active = viewMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectViewMode(mode.id)}
                    className={`h-11 sm:h-full px-3.5 sm:px-3 text-xs sm:rounded transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-ink-primary text-canvas font-semibold shadow-sm'
                        : 'text-ink-secondary hover:text-ink-primary font-medium'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            {/* Period Dropdown: Day Selector (Daily) or Week Selector (Weekly) */}
            <div
              className={`relative w-full sm:w-64 shrink-0 h-11 sm:h-9 transition-opacity ${
                isGlobalSearchActive ? 'opacity-60' : ''
              }`}
            >
              {loading ? (
                <div
                  aria-hidden="true"
                  className="w-full h-full rounded-md border border-rule bg-subtle animate-pulse"
                />
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {viewMode === 'daily' ? (
                    <select
                      value={selectedDay}
                      onChange={(e) => onSelectDay(e.target.value)}
                      aria-label="เลือกวันที่"
                      className="appearance-none bg-none w-full h-11 sm:h-9 py-0 pl-8 pr-8 text-xs leading-[42px] sm:leading-[34px] font-semibold rounded-md border border-rule bg-surface text-ink-primary focus:outline-none focus:border-editorial transition-colors cursor-pointer"
                    >
                      {availableDays.map((day, idx) => (
                        <option key={day.key} value={day.key}>
                          {day.label}{' '}
                          {idx === 0
                            ? `(ล่าสุด · ${day.count} ข่าว)`
                            : `(${day.count} ข่าว)`}
                        </option>
                      ))}
                      {archiveHydrating && (
                        <option value="" disabled>
                          กำลังโหลดวันย้อนหลังเพิ่มเติม...
                        </option>
                      )}
                    </select>
                  ) : (
                    <select
                      value={selectedWeek}
                      onChange={(e) => onSelectWeek(e.target.value)}
                      aria-label="เลือกสัปดาห์"
                      className="appearance-none bg-none w-full h-11 sm:h-9 py-0 pl-8 pr-8 text-xs leading-[42px] sm:leading-[34px] font-semibold rounded-md border border-rule bg-surface text-ink-primary focus:outline-none focus:border-editorial transition-colors cursor-pointer"
                    >
                      {availableWeeks.map((week, idx) => (
                        <option key={week.id} value={week.id}>
                          {week.label}{' '}
                          {idx === 0
                            ? `(ล่าสุด · ${week.count} ข่าว)`
                            : `(${week.count} ข่าว)`}
                        </option>
                      ))}
                    </select>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </>
              )}
            </div>

            {/* Cycle Segmented Control (Weekly mode only) */}
            {viewMode === 'weekly' && (
              <div
                className={`inline-flex min-h-[44px] sm:min-h-0 sm:h-9 p-0 sm:p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start overflow-x-auto max-w-full transition-opacity ${
                  isGlobalSearchActive ? 'opacity-60' : ''
                }`}
                role="group"
                aria-label="เลือกช่วงของสัปดาห์"
              >
                {CYCLES.map((cycle) => {
                  const active = selectedCycle === cycle.id;
                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectCycle(cycle.id)}
                      className={`h-11 sm:h-full px-3 sm:px-2.5 text-xs font-medium sm:rounded transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-surface text-ink-primary font-semibold shadow-sm'
                          : 'text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      {cycle.label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Sort Order Segmented Control */}
        <div
          className="inline-flex min-h-[44px] sm:min-h-0 sm:h-9 p-0 sm:p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start overflow-hidden"
          role="group"
          aria-label="เรียงลำดับข่าว"
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortOrder === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelectSortOrder(opt.id)}
                className={`h-11 sm:h-full px-3 sm:px-2.5 text-xs font-medium sm:rounded transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-surface text-ink-primary font-semibold shadow-sm'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search Input (Multi-word AND global archive search) */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาทั้งคลัง เช่น Nvidia ไทย, ชื่อโมเดล, งานวิจัย..."
            aria-label="ค้นหาข่าวในคลังทั้งหมด"
            className="w-full h-11 sm:h-9 pl-8 pr-10 text-xs rounded-md border border-rule bg-surface text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-editorial transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="ล้างคำค้นหา"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-8 h-8 sm:w-6 sm:h-6 text-ink-muted hover:text-ink-primary rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Company / Source Tag Filter Strip (44px touch targets on mobile, 0-count chips disabled) */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="กรองตามองค์กรหรือกลุ่มเทคโนโลยี"
      >
        <button
          type="button"
          aria-pressed={selectedCompany === 'ALL'}
          title="จำนวนข่าวไม่ซ้ำทั้งหมด (ข่าว 1 ชิ้นอาจมีมากกว่า 1 แท็กค่าย ผลรวมรายค่ายจึงอาจมากกว่ายอดรวม)"
          onClick={() => onSelectCompany('ALL')}
          className={`min-h-[44px] sm:min-h-0 sm:h-7 px-3.5 sm:px-2.5 rounded-full text-xs transition-colors border ${
            selectedCompany === 'ALL'
              ? 'bg-ink-primary text-canvas border-ink-primary font-semibold'
              : 'bg-transparent text-ink-secondary border-rule hover:border-rule-strong hover:text-ink-primary'
          }`}
        >
          ทั้งหมด
          {!loading && (
            <span className="tabular-nums opacity-75 ml-1">
              {companyCounts['ALL'] ?? 0}
            </span>
          )}
        </button>

        {ALL_COMPANIES.map((company) => {
          const count = companyCounts[company] ?? 0;
          const isSelected = selectedCompany === company;
          const isDisabled = !loading && count === 0 && !isSelected;

          return (
            <button
              key={company}
              type="button"
              disabled={isDisabled}
              aria-pressed={isSelected}
              title={
                isDisabled
                  ? `ยังไม่มีข่าว ${company} ในรายการที่เลือก`
                  : `กรองเฉพาะข่าว ${company} (ข่าว 1 ชิ้นอาจอยู่ได้หลายแท็ก)`
              }
              onClick={() => onSelectCompany(company)}
              className={`min-h-[44px] sm:min-h-0 sm:h-7 px-3.5 sm:px-2.5 rounded-full text-xs transition-colors border ${
                isSelected
                  ? 'bg-ink-primary text-canvas border-ink-primary font-semibold'
                  : isDisabled
                  ? 'bg-transparent text-ink-muted/50 border-rule/50 cursor-not-allowed opacity-55'
                  : 'bg-surface text-ink-secondary border-rule hover:border-rule-strong hover:text-ink-primary'
              }`}
            >
              {company}
              {!loading && (
                <span className="tabular-nums opacity-75 ml-1">{count}</span>
              )}
            </button>
          );
        })}

        {!loading &&
          ALL_COMPANIES.reduce((sum, c) => sum + (companyCounts[c] ?? 0), 0) >
            (companyCounts['ALL'] ?? 0) && (
            <span
              title="ข่าว 1 ชิ้นสามารถติดแท็กได้มากกว่า 1 ค่าย เช่น OpenAI และ Open-Source"
              className="text-[11px] text-ink-muted ml-1 hidden sm:inline"
            >
              (1 ข่าวอาจมีหลายแท็ก)
            </span>
          )}
      </div>
    </section>
  );
};
