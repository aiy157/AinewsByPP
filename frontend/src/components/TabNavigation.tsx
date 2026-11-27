import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { PageTabId } from '../types/news';

interface TabNavigationProps {
  activeTab: PageTabId;
  onSelectTab: (tab: PageTabId) => void;
  counts: Record<PageTabId, number>;
  loading?: boolean;
}

const VERIFIED_TABS: Array<{ id: PageTabId; label: string; title?: string }> = [
  { id: 'overview', label: 'รวมทุกหมวด', title: 'รวมข่าวทุกหมวดหมู่ทั้งหมดในช่วงที่เลือก' },
  { id: 'models_updates', label: 'โมเดล & ระบบ' },
  { id: 'benchmarks_testing', label: 'ผลทดสอบ & วิจัย' },
  { id: 'partnerships_deals', label: 'ดีล & การลงทุน' },
  { id: 'policy_rules', label: 'กฎหมาย & นโยบาย' },
];

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onSelectTab,
  counts,
  loading = false,
}) => {
  const isRumorActive = activeTab === 'rumor_radar';
  const navRef = useRef<HTMLElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollCue = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollCue();
    window.addEventListener('resize', updateScrollCue);
    return () => window.removeEventListener('resize', updateScrollCue);
  }, [updateScrollCue, loading, counts]);

  const handleScrollRight = () => {
    const el = navRef.current;
    if (!el) return;
    el.scrollBy({ left: 180, behavior: 'smooth' });
  };

  return (
    <div className="relative bg-surface border-b border-rule">
      <nav
        ref={navRef}
        onScroll={updateScrollCue}
        aria-label="หมวดหมู่ข่าว"
        className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar pr-12 sm:pr-6 lg:pr-8"
      >
        {/* Left: Verified Editorial Beats */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {VERIFIED_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.title}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(tab.id)}
                className={`relative h-12 px-2.5 sm:px-3.5 inline-flex items-center gap-2 text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'font-bold text-ink-primary'
                    : 'font-medium text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <span>{tab.label}</span>
                {loading ? (
                  <span
                    aria-hidden="true"
                    className="w-4 h-3.5 rounded-full bg-subtle animate-pulse"
                  />
                ) : (
                  <span
                    className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-subtle text-ink-primary font-semibold'
                        : 'text-ink-muted'
                    }`}
                  >
                    {counts[tab.id] ?? 0}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-editorial rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Strictly Separated Rumor Radar Tab */}
        <div className="flex items-center pl-3 border-l border-rule shrink-0">
          <button
            type="button"
            aria-current={isRumorActive ? 'page' : undefined}
            onClick={() => onSelectTab('rumor_radar')}
            className={`relative h-12 px-3 inline-flex items-center gap-2 text-sm whitespace-nowrap transition-colors ${
              isRumorActive
                ? 'font-bold text-rumor'
                : 'font-semibold text-rumor/85 hover:text-rumor'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Rumor Radar</span>
            {loading ? (
              <span
                aria-hidden="true"
                className="w-4 h-3.5 rounded-full bg-rumor-soft animate-pulse"
              />
            ) : (
              <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-full bg-rumor-soft text-rumor font-bold">
                {counts.rumor_radar ?? 0}
              </span>
            )}
            {isRumorActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-rumor rounded-full" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile horizontal scroll affordance: soft fade + clickable arrow when more tabs exist */}
      {canScrollRight && (
        <div className="sm:hidden absolute inset-y-0 right-0 flex items-center pl-6 pr-1 bg-gradient-to-l from-surface via-surface/95 to-transparent">
          <button
            type="button"
            onClick={handleScrollRight}
            aria-label="เลื่อนดูหมวดหมู่ถัดไป"
            className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-rule bg-surface/95 text-ink-secondary shadow-sm active:scale-95 transition-transform"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
