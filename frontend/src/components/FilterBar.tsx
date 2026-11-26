import React from 'react';
import { Calendar, Search, X } from 'lucide-react';
import {
  ALL_COMPANIES,
  CompanyTag,
  CycleFilter,
  DayOption,
  SortOrder,
  ViewMode,
} from '../types/news';

interface FilterBarProps {
  viewMode: ViewMode;
  onSelectViewMode: (mode: ViewMode) => void;
  availableDays: DayOption[];
  selectedDay: string;
  onSelectDay: (day: string) => void;
  availableWeeks: string[];
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
        {/* Primary 2-System Mode Switcher: Daily vs Weekly */}
        <div
          className="inline-flex h-9 p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start"
          role="group"
          aria-label="เลือกระบบการแสดงข่าว รายวันหรือรายสัปดาห์"
        >
          {VIEW_MODES.map((mode) => {
            const active = viewMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onSelectViewMode(mode.id)}
                className={`px-3 text-xs rounded transition-colors whitespace-nowrap ${
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
        <div className="relative sm:w-60 shrink-0">
          <Calendar className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          {viewMode === 'daily' ? (
            <select
              value={selectedDay}
              onChange={(e) => onSelectDay(e.target.value)}
              aria-label="เลือกวันที่"
              className="w-full h-9 pl-8 pr-3 text-xs font-semibold rounded-md border border-rule bg-surface text-ink-primary focus:outline-none focus:border-editorial transition-colors cursor-pointer"
            >
              {availableDays.length === 0 ? (
                <option value="">กำลังโหลดวันที่...</option>
              ) : (
                availableDays.map((day, idx) => (
                  <option key={day.key} value={day.key}>
                    {day.label} {idx === 0 ? `(ล่าสุด · ${day.count} ข่าว)` : `(${day.count} ข่าว)`}
                  </option>
                ))
              )}
            </select>
          ) : (
            <select
              value={selectedWeek}
              onChange={(e) => onSelectWeek(e.target.value)}
              aria-label="เลือกสัปดาห์"
              className="w-full h-9 pl-8 pr-3 text-xs font-semibold rounded-md border border-rule bg-surface text-ink-primary focus:outline-none focus:border-editorial transition-colors cursor-pointer"
            >
              {availableWeeks.length === 0 ? (
                <option value="">กำลังโหลดสัปดาห์...</option>
              ) : (
                availableWeeks.map((week, idx) => (
                  <option key={week} value={week}>
                    สัปดาห์ {week} {idx === 0 ? '(ล่าสุด)' : ''}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        {/* Cycle Segmented Control (Weekly mode only) */}
        {viewMode === 'weekly' && (
          <div
            className="inline-flex h-9 p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start overflow-x-auto max-w-full"
            role="group"
            aria-label="เลือกช่วงของสัปดาห์"
          >
            {CYCLES.map((cycle) => {
              const active = selectedCycle === cycle.id;
              return (
                <button
                  key={cycle.id}
                  type="button"
                  onClick={() => onSelectCycle(cycle.id)}
                  className={`px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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

        {/* Sort Order Segmented Control */}
        <div
          className="inline-flex h-9 p-0.5 rounded-md bg-subtle border border-rule shrink-0 self-start"
          role="group"
          aria-label="เรียงลำดับข่าว"
        >
          {SORT_OPTIONS.map((opt) => {
            const active = sortOrder === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectSortOrder(opt.id)}
                className={`px-2.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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

        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาพาดหัว ชื่อโมเดล หรือหัวข้อวิจัย..."
            className="w-full h-9 pl-8 pr-8 text-xs rounded-md border border-rule bg-surface text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-editorial transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="ล้างคำค้นหา"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink-primary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Company Filter Strip */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSelectCompany('ALL')}
          className={`h-7 px-2.5 rounded-full text-xs transition-colors border ${
            selectedCompany === 'ALL'
              ? 'bg-ink-primary text-canvas border-ink-primary font-semibold'
              : 'bg-transparent text-ink-secondary border-rule hover:border-rule-strong hover:text-ink-primary'
          }`}
        >
          ทุกค่าย <span className="tabular-nums opacity-75 ml-0.5">{companyCounts['ALL'] ?? 0}</span>
        </button>

        {ALL_COMPANIES.map((company) => {
          const count = companyCounts[company] ?? 0;
          const isSelected = selectedCompany === company;
          return (
            <button
              key={company}
              type="button"
              onClick={() => onSelectCompany(company)}
              className={`h-7 px-2.5 rounded-full text-xs transition-colors border ${
                isSelected
                  ? 'bg-ink-primary text-canvas border-ink-primary font-semibold'
                  : count > 0
                  ? 'bg-surface text-ink-secondary border-rule hover:border-rule-strong hover:text-ink-primary'
                  : 'bg-transparent text-ink-muted/60 border-rule/60 hover:border-rule'
              }`}
            >
              {company}{' '}
              <span className="tabular-nums opacity-70 ml-0.5">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
