import React from 'react';
import { Calendar, Search, X } from 'lucide-react';
import { ALL_COMPANIES, CompanyTag, CycleFilter } from '../types/news';

interface FilterBarProps {
  availableWeeks: string[];
  selectedWeek: string;
  onSelectWeek: (week: string) => void;
  selectedCycle: CycleFilter;
  onSelectCycle: (cycle: CycleFilter) => void;
  selectedCompany: CompanyTag | 'ALL';
  onSelectCompany: (company: CompanyTag | 'ALL') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  companyCounts: Record<string, number>;
}

const CYCLES: Array<{ id: CycleFilter; label: string }> = [
  { id: 'all', label: 'รวมทั้งสัปดาห์' },
  { id: 'midweek', label: 'รอบวันพุธ' },
  { id: 'weekend', label: 'รอบวันอาทิตย์' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  availableWeeks,
  selectedWeek,
  onSelectWeek,
  selectedCycle,
  onSelectCycle,
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
      {/* Row 1: Period, Cycle & Search */}
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        {/* Week Selector */}
        <div className="relative md:w-52 shrink-0">
          <Calendar className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
        </div>

        {/* Cycle Segmented Control */}
        <div
          className="inline-flex h-9 p-0.5 rounded-md bg-subtle border border-rule shrink-0"
          role="group"
          aria-label="เลือกรอบเผยแพร่"
        >
          {CYCLES.map((cycle) => {
            const active = selectedCycle === cycle.id;
            return (
              <button
                key={cycle.id}
                type="button"
                onClick={() => onSelectCycle(cycle.id)}
                className={`px-3 text-xs font-medium rounded transition-colors whitespace-nowrap ${
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

        {/* Search Input */}
        <div className="relative flex-1 min-w-0">
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
