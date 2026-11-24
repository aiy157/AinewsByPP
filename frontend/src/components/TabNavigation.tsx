import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageTabId } from '../types/news';

interface TabNavigationProps {
  activeTab: PageTabId;
  onSelectTab: (tab: PageTabId) => void;
  counts: Record<PageTabId, number>;
}

const VERIFIED_TABS: Array<{ id: PageTabId; label: string }> = [
  { id: 'overview', label: 'หน้าแรกทั้งหมด' },
  { id: 'models_updates', label: 'โมเดล & ระบบ' },
  { id: 'benchmarks_testing', label: 'ผลทดสอบ & วิจัย' },
  { id: 'partnerships_deals', label: 'ดีล & การลงทุน' },
  { id: 'policy_rules', label: 'กฎหมาย & นโยบาย' },
];

export const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onSelectTab,
  counts,
}) => {
  const isRumorActive = activeTab === 'rumor_radar';

  return (
    <div className="bg-surface border-b border-rule">
      <nav
        aria-label="หมวดหมู่ข่าว"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 overflow-x-auto no-scrollbar"
      >
        {/* Left: Verified Editorial Beats */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {VERIFIED_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`relative h-12 px-2.5 sm:px-3.5 inline-flex items-center gap-2 text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'font-bold text-ink-primary'
                    : 'font-medium text-ink-secondary hover:text-ink-primary'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-subtle text-ink-primary font-semibold'
                      : 'text-ink-muted'
                  }`}
                >
                  {counts[tab.id] ?? 0}
                </span>
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
            onClick={() => onSelectTab('rumor_radar')}
            className={`relative h-12 px-3 inline-flex items-center gap-2 text-sm whitespace-nowrap transition-colors ${
              isRumorActive
                ? 'font-bold text-rumor'
                : 'font-semibold text-rumor/85 hover:text-rumor'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Rumor Radar</span>
            <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded-full bg-rumor-soft text-rumor font-bold">
              {counts.rumor_radar ?? 0}
            </span>
            {isRumorActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-rumor rounded-full" />
            )}
          </button>
        </div>
      </nav>
    </div>
  );
};
