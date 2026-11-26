import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw, ArrowRight } from 'lucide-react';
import {
  ALL_COMPANIES,
  CompanyTag,
  CycleFilter,
  DayOption,
  NewsItem,
  PageTabId,
  SortOrder,
  VERIFIED_CATEGORIES,
  ViewMode,
} from './types/news';
import { fetchAllNewsItems } from './lib/supabase';
import { Header } from './components/Header';
import { FilterBar } from './components/FilterBar';
import { TabNavigation } from './components/TabNavigation';
import { FontScale, NewsCard } from './components/NewsCard';
import { ReaderModal } from './components/ReaderModal';

function getThaiDayKey(isoString?: string): string {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString.slice(0, 10);
  }
}

function getItemEditionDay(item: NewsItem): string {
  return getThaiDayKey(item.created_at ?? item.published_at);
}

function formatThaiDayKey(dayKey: string): string {
  if (!dayKey) return '—';
  try {
    const d = new Date(`${dayKey}T12:00:00+07:00`);
    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dayKey;
  }
}

export const App: React.FC = () => {
  // 1. Theme State: Archival Paper Light default, persists user preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('ainews_theme_v2');
    return saved ? saved === 'dark' : false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('ainews_theme_v2', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ainews_theme_v2', 'light');
    }
  }, [isDark]);

  // 2. Reading Preferences & Bookmarks
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const saved = localStorage.getItem('ainews_font_scale') as FontScale | null;
    return saved || 'normal';
  });

  useEffect(() => {
    localStorage.setItem('ainews_font_scale', fontScale);
  }, [fontScale]);

  const [readerItem, setReaderItem] = useState<NewsItem | null>(null);
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState<boolean>(false);

  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('ainews_bookmarks');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const handleToggleBookmark = (id: string) => {
    setBookmarkedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      localStorage.setItem('ainews_bookmarks', JSON.stringify(next));
      return next;
    });
  };

  // 3. Data State
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [dataSource, setDataSource] = useState<'supabase' | 'mock'>('mock');
  const [statusNotice, setStatusNotice] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);

  // 4. Filter & Tab States (2 Systems: Daily default / Weekly)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('ainews_view_mode') as ViewMode | null;
    return saved === 'weekly' || saved === 'daily' ? saved : 'daily';
  });

  useEffect(() => {
    localStorage.setItem('ainews_view_mode', viewMode);
  }, [viewMode]);

  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [selectedCycle, setSelectedCycle] = useState<CycleFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [selectedCompany, setSelectedCompany] = useState<CompanyTag | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<PageTabId>('overview');

  const loadData = async () => {
    setLoading(true);
    const result = await fetchAllNewsItems();
    setAllNews(result.items);
    setDataSource(result.source);
    setStatusNotice(result.errorMessage);

    const days = Array.from(
      new Set(result.items.map((i) => getItemEditionDay(i)).filter(Boolean))
    )
      .sort()
      .reverse();
    if (days.length > 0) {
      setSelectedDay((prev) => (prev && days.includes(prev) ? prev : days[0]));
    }

    const weeks = Array.from(new Set(result.items.map((i) => i.week_id)))
      .sort()
      .reverse();
    if (weeks.length > 0) {
      setSelectedWeek((prev) => (prev && weeks.includes(prev) ? prev : weeks[0]));
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const availableDays = useMemo<DayOption[]>(() => {
    const countMap = new Map<string, number>();
    for (const item of allNews) {
      const key = getItemEditionDay(item);
      if (!key) continue;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, count]) => ({
        key,
        label: formatThaiDayKey(key),
        count,
      }));
  }, [allNews]);

  const availableWeeks = useMemo(() => {
    return Array.from(new Set(allNews.map((item) => item.week_id)))
      .sort()
      .reverse();
  }, [allNews]);

  // Filter by viewMode (Daily or Weekly), cycle, bookmark, and keyword search
  const itemsInPeriodAndSearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allNews.filter((item) => {
      if (viewMode === 'daily') {
        if (selectedDay && getItemEditionDay(item) !== selectedDay) return false;
      } else {
        if (selectedWeek && item.week_id !== selectedWeek) return false;
        if (selectedCycle !== 'all' && item.batch_type !== selectedCycle) return false;
      }
      if (showOnlyBookmarked && !bookmarkedIds.includes(item.id)) return false;

      if (q.length > 0) {
        const inTitle = item.title_th.toLowerCase().includes(q);
        const inTldr = (item.tldr_th ?? '').toLowerCase().includes(q);
        const inFacts = (item.key_facts ?? []).some(
          (kf) =>
            kf.label.toLowerCase().includes(q) ||
            kf.value.toLowerCase().includes(q)
        );
        const inBullets = item.summary_bullets.some((b) =>
          b.toLowerCase().includes(q)
        );
        const inCompany = item.company_tags.some((c) =>
          c.toLowerCase().includes(q)
        );
        const inSource = item.source_urls.some((s) =>
          s.title.toLowerCase().includes(q)
        );
        if (!inTitle && !inTldr && !inFacts && !inBullets && !inCompany && !inSource)
          return false;
      }

      return true;
    });
  }, [
    allNews,
    viewMode,
    selectedDay,
    selectedWeek,
    selectedCycle,
    searchQuery,
    showOnlyBookmarked,
    bookmarkedIds,
  ]);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: itemsInPeriodAndSearch.length };
    for (const c of ALL_COMPANIES) {
      counts[c] = 0;
    }
    for (const item of itemsInPeriodAndSearch) {
      for (const tag of item.company_tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [itemsInPeriodAndSearch]);

  // Identify the latest daily fetch edition within the active week (for "ใหม่" badge)
  const { latestEditionDay, hasMultipleEditionDays } = useMemo(() => {
    const days = Array.from(
      new Set(itemsInPeriodAndSearch.map((item) => getItemEditionDay(item)).filter(Boolean))
    )
      .sort()
      .reverse();
    return {
      latestEditionDay: days[0] ?? '',
      hasMultipleEditionDays: days.length > 1,
    };
  }, [itemsInPeriodAndSearch]);

  const isItemInLatestBatch = (item: NewsItem): boolean =>
    viewMode === 'weekly' &&
    hasMultipleEditionDays &&
    getItemEditionDay(item) === latestEditionDay;

  // Apply company filter + sort
  const filteredAndSortedItems = useMemo(() => {
    const matched = itemsInPeriodAndSearch.filter((item) => {
      if (selectedCompany === 'ALL') return true;
      return item.company_tags.includes(selectedCompany);
    });

    return [...matched].sort((a, b) => {
      if (sortOrder === 'latest') {
        if (viewMode === 'weekly') {
          const dayA = getItemEditionDay(a);
          const dayB = getItemEditionDay(b);
          if (dayB !== dayA) {
            return dayB.localeCompare(dayA);
          }
          if (b.importance_score !== a.importance_score) {
            return b.importance_score - a.importance_score;
          }
          return (
            new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
          );
        }
        // Daily mode + 'latest': newest published timestamp first, importance as tie-breaker
        const timeDiff =
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.importance_score - a.importance_score;
      }

      if (b.importance_score !== a.importance_score) {
        return b.importance_score - a.importance_score;
      }
      return (
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      );
    });
  }, [itemsInPeriodAndSearch, selectedCompany, sortOrder, viewMode]);

  const verifiedItems = useMemo(
    () => filteredAndSortedItems.filter((i) => i.status === 'verified'),
    [filteredAndSortedItems]
  );

  const rumorItems = useMemo(
    () => filteredAndSortedItems.filter((i) => i.status === 'rumor'),
    [filteredAndSortedItems]
  );

  const tabCounts = useMemo<Record<PageTabId, number>>(() => {
    return {
      overview: filteredAndSortedItems.length,
      models_updates: verifiedItems.filter(
        (i) => i.category === 'models_updates'
      ).length,
      benchmarks_testing: verifiedItems.filter(
        (i) => i.category === 'benchmarks_testing'
      ).length,
      partnerships_deals: verifiedItems.filter(
        (i) => i.category === 'partnerships_deals'
      ).length,
      policy_rules: verifiedItems.filter((i) => i.category === 'policy_rules')
        .length,
      rumor_radar: rumorItems.length,
    };
  }, [verifiedItems, rumorItems, filteredAndSortedItems]);

  const activeVerifiedCategoryMeta = useMemo(
    () => VERIFIED_CATEGORIES.find((c) => c.id === activeTab),
    [activeTab]
  );

  const currentTabVerifiedItems = useMemo(() => {
    if (!activeVerifiedCategoryMeta) return [];
    return verifiedItems.filter(
      (i) => i.category === activeVerifiedCategoryMeta.id
    );
  }, [verifiedItems, activeVerifiedCategoryMeta]);

  // Active viewable list for Prev/Next story switching inside ReaderModal
  const activeViewableList = useMemo(() => {
    if (activeVerifiedCategoryMeta) return currentTabVerifiedItems;
    if (activeTab === 'rumor_radar') return rumorItems;
    return filteredAndSortedItems;
  }, [
    activeVerifiedCategoryMeta,
    currentTabVerifiedItems,
    activeTab,
    rumorItems,
    filteredAndSortedItems,
  ]);

  const readerIndex = useMemo(() => {
    if (!readerItem) return -1;
    return activeViewableList.findIndex((i) => i.id === readerItem.id);
  }, [readerItem, activeViewableList]);

  const leadVerifiedStory = verifiedItems[0] ?? null;

  const editionBadgeLabel =
    viewMode === 'daily'
      ? `DAILY · ${selectedDay ? formatThaiDayKey(selectedDay) : '—'}`
      : `ISSUE ${selectedWeek || '—'}`;

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-primary">
      {/* Masthead */}
      <Header
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        dataSource={dataSource}
        totalVerified={verifiedItems.length}
        totalRumors={rumorItems.length}
        editionBadgeLabel={editionBadgeLabel}
        fontScale={fontScale}
        onChangeFontScale={setFontScale}
        bookmarkedCount={bookmarkedIds.length}
        showOnlyBookmarked={showOnlyBookmarked}
        onToggleShowOnlyBookmarked={() =>
          setShowOnlyBookmarked((prev) => !prev)
        }
      />

      {/* Single-Line Broadsheet Section Tabs */}
      <TabNavigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        counts={tabCounts}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Optional Connection Fallback Notice */}
        {statusNotice && (
          <div className="px-4 py-2 rounded-md bg-rumor-surface border border-rumor-border/60 text-xs text-ink-secondary flex items-center justify-between gap-3">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1 font-semibold text-ink-primary hover:underline shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>ลองใหม่</span>
            </button>
          </div>
        )}

        {/* Streamlined Utility Filter Bar (Daily / Weekly 2-System Switcher) */}
        <FilterBar
          viewMode={viewMode}
          onSelectViewMode={setViewMode}
          availableDays={availableDays}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          availableWeeks={availableWeeks}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          selectedCycle={selectedCycle}
          onSelectCycle={setSelectedCycle}
          sortOrder={sortOrder}
          onSelectSortOrder={setSortOrder}
          selectedCompany={selectedCompany}
          onSelectCompany={setSelectedCompany}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          companyCounts={companyCounts}
        />

        {loading ? (
          <div className="py-24 text-center text-sm text-ink-muted">
            กำลังจัดเตรียมฉบับข่าว...
          </div>
        ) : (
          <>
            {/* ==============================================================
                TAB VIEW 1: OVERVIEW (Front-Page Editorial Broadsheet 85/15)
               ============================================================== */}
            {activeTab === 'overview' && (
              <>
                {filteredAndSortedItems.length === 0 ? (
                  <EmptyState
                    onReset={() => {
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                      setSelectedCycle('all');
                      setShowOnlyBookmarked(false);
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Primary Column (~75-80% Desktop Width): Verified Facts */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-10">
                      {/* Lead Feature Story */}
                      {leadVerifiedStory && (
                        <section
                          aria-label={
                            viewMode === 'daily'
                              ? 'ข่าวเด่นประจำวัน'
                              : 'ข่าวเด่นประจำสัปดาห์'
                          }
                        >
                          <div className="flex items-center justify-between pb-2 mb-4 border-b border-rule-strong">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-editorial">
                              {viewMode === 'daily'
                                ? 'Lead Briefing · ข่าวเด่นประจำวัน'
                                : 'Lead Briefing · ข่าวเด่นประจำสัปดาห์'}
                            </span>
                            <span className="text-[11px] text-ink-muted">
                              ยืนยันจากแหล่งข่าวทางการ
                            </span>
                          </div>
                          <NewsCard
                            item={leadVerifiedStory}
                            featured
                            isLatestBatch={isItemInLatestBatch(leadVerifiedStory)}
                            isBookmarked={bookmarkedIds.includes(
                              leadVerifiedStory.id
                            )}
                            onToggleBookmark={handleToggleBookmark}
                            onOpenReader={setReaderItem}
                            fontScale={fontScale}
                          />
                        </section>
                      )}

                      {/* 4 Verified Categories */}
                      {VERIFIED_CATEGORIES.map((cat) => {
                        const catItems = verifiedItems.filter(
                          (i) =>
                            i.category === cat.id &&
                            i.id !== leadVerifiedStory?.id
                        );
                        if (catItems.length === 0) return null;

                        return (
                          <section key={cat.id} className="space-y-4">
                            <div className="flex items-baseline justify-between gap-2 pb-2 border-b border-rule-strong">
                              <div className="flex items-baseline gap-2.5">
                                <h2 className="font-heading text-base sm:text-lg font-bold text-ink-primary">
                                  {cat.titleTh}
                                </h2>
                                <span className="text-[11px] text-ink-muted uppercase tracking-wider hidden sm:inline">
                                  {cat.titleEn}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveTab(cat.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-editorial hover:underline shrink-0"
                              >
                                <span>ดูทั้งหมวด</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {catItems.map((item) => (
                                <NewsCard
                                  key={item.id}
                                  item={item}
                                  isLatestBatch={isItemInLatestBatch(item)}
                                  isBookmarked={bookmarkedIds.includes(item.id)}
                                  onToggleBookmark={handleToggleBookmark}
                                  onOpenReader={setReaderItem}
                                  fontScale={fontScale}
                                />
                              ))}
                            </div>
                          </section>
                        );
                      })}
                    </div>

                    {/* Right Isolated Column: Rumor Radar (15% Special Zone) */}
                    <aside
                      aria-label="Rumor Radar"
                      className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-28 space-y-4"
                    >
                      <div className="pb-2 border-b-2 border-dashed border-rumor-border flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-rumor">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <h2 className="font-heading text-sm font-bold uppercase tracking-wider">
                            Rumor Radar
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('rumor_radar')}
                          className="text-[11px] font-semibold text-rumor hover:underline"
                        >
                          เปิดหน้าเฉพาะ &rarr;
                        </button>
                      </div>

                      <p className="text-xs text-ink-muted leading-relaxed">
                        สัญญาณข่าวลือและเบาะแสจาก <span className="text-ink-secondary font-medium">Hacker News</span> ·{' '}
                        <span className="text-ink-secondary font-medium">Lobste.rs</span> และคอมมูนิตี้นักพัฒนา AI แยกออกจากข่าวข้อเท็จจริงอย่างเด็ดขาด ยังไม่ยืนยันทางการ
                      </p>

                      {rumorItems.length === 0 ? (
                        <div className="p-5 rounded-lg border border-dashed border-rumor-border/60 bg-rumor-surface/50 text-xs text-ink-muted text-center">
                          ไม่พบข่าวลือที่ตรงกับตัวกรอง
                        </div>
                      ) : (
                        <div className="space-y-3.5">
                          {rumorItems.map((item) => (
                            <NewsCard
                              key={item.id}
                              item={item}
                              isLatestBatch={isItemInLatestBatch(item)}
                              isBookmarked={bookmarkedIds.includes(item.id)}
                              onToggleBookmark={handleToggleBookmark}
                              onOpenReader={setReaderItem}
                              fontScale={fontScale}
                            />
                          ))}
                        </div>
                      )}
                    </aside>
                  </div>
                )}
              </>
            )}

            {/* ==============================================================
                TAB VIEW 2: DEDICATED SINGLE VERIFIED CATEGORY PAGE
               ============================================================== */}
            {activeVerifiedCategoryMeta && (
              <section className="space-y-5">
                <div className="pb-3 border-b border-rule-strong flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <div>
                    <h2 className="font-heading text-xl sm:text-2xl font-bold text-ink-primary">
                      {activeVerifiedCategoryMeta.titleTh}
                    </h2>
                    <p className="text-xs sm:text-sm text-ink-secondary mt-0.5">
                      {activeVerifiedCategoryMeta.descriptionTh}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-ink-muted tabular-nums shrink-0">
                    {currentTabVerifiedItems.length} บทความยืนยันแล้ว
                  </span>
                </div>

                {currentTabVerifiedItems.length === 0 ? (
                  <EmptyState
                    onReset={() => {
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                      setSelectedCycle('all');
                      setShowOnlyBookmarked(false);
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {currentTabVerifiedItems.map((item) => (
                      <NewsCard
                        key={item.id}
                        item={item}
                        isLatestBatch={isItemInLatestBatch(item)}
                        isBookmarked={bookmarkedIds.includes(item.id)}
                        onToggleBookmark={handleToggleBookmark}
                        onOpenReader={setReaderItem}
                        fontScale={fontScale}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ==============================================================
                TAB VIEW 3: DEDICATED RUMOR RADAR PAGE (Unified, No Sub-Categories)
               ============================================================== */}
            {activeTab === 'rumor_radar' && (
              <section className="space-y-5">
                <div className="pb-3 border-b-2 border-dashed border-rumor-border flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-rumor">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      <h2 className="font-heading text-xl sm:text-2xl font-bold">
                        Rumor Radar — ข่าวลือและข้อมูลหลุดจากคอมมูนิตี้
                      </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-ink-secondary">
                      รวบรวมข่าวลือ เบาะแส และข้อมูลหลุดจาก Hacker News, Lobste.rs และคอมมูนิตี้นักพัฒนา AI โดยยังไม่ผ่านการยืนยันอย่างเป็นทางการ
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-rumor tabular-nums shrink-0">
                    {rumorItems.length} ประเด็น
                  </span>
                </div>

                {rumorItems.length === 0 ? (
                  <EmptyState
                    onReset={() => {
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                      setSelectedCycle('all');
                      setShowOnlyBookmarked(false);
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {rumorItems.map((item) => (
                      <NewsCard
                        key={item.id}
                        item={item}
                        isLatestBatch={isItemInLatestBatch(item)}
                        isBookmarked={bookmarkedIds.includes(item.id)}
                        onToggleBookmark={handleToggleBookmark}
                        onOpenReader={setReaderItem}
                        fontScale={fontScale}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Broadsheet Reader Modal */}
      <ReaderModal
        item={readerItem}
        onClose={() => setReaderItem(null)}
        isBookmarked={readerItem ? bookmarkedIds.includes(readerItem.id) : false}
        onToggleBookmark={handleToggleBookmark}
        fontScale={fontScale}
        onChangeFontScale={setFontScale}
        hasPrev={readerIndex > 0}
        hasNext={
          readerIndex >= 0 && readerIndex < activeViewableList.length - 1
        }
        onPrev={() => {
          if (readerIndex > 0) {
            setReaderItem(activeViewableList[readerIndex - 1]);
          }
        }}
        onNext={() => {
          if (readerIndex >= 0 && readerIndex < activeViewableList.length - 1) {
            setReaderItem(activeViewableList[readerIndex + 1]);
          }
        }}
      />

      {/* Quiet Editorial Colophon Footer */}
      <footer className="border-t border-rule mt-14 py-6 text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-masthead font-bold text-ink-primary tracking-tight text-sm">
              AINEWS
            </span>
            <span aria-hidden="true">·</span>
            <span>อัปเดตทุกวัน เวลา 05:00 น. (ICT)</span>
          </div>
          <div>
            สรุปและตรวจสอบแหล่งที่มาอัตโนมัติด้วยระบบ Two-Stage Editorial Pipeline
          </div>
        </div>
      </footer>
    </div>
  );
};

interface EmptyStateProps {
  onReset: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onReset }) => (
  <div className="py-16 px-4 rounded-lg border border-dashed border-rule-strong text-center space-y-2.5 bg-surface/50">
    <Inbox className="w-7 h-7 text-ink-muted mx-auto" />
    <p className="text-sm font-semibold text-ink-primary">
      ไม่พบข่าวที่ตรงกับเงื่อนไขที่เลือก
    </p>
    <p className="text-xs text-ink-muted">
      ลองปรับตัวกรองค่าย AI คำค้นหา หรือสลับสัปดาห์ด้านบน
    </p>
    <button
      type="button"
      onClick={onReset}
      className="mt-2 inline-flex items-center h-8 px-3.5 rounded-md text-xs font-semibold bg-ink-primary text-canvas hover:opacity-90 transition-opacity"
    >
      ล้างตัวกรองทั้งหมด
    </button>
  </div>
);
