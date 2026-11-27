import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Inbox,
  RefreshCw,
  Search,
  ShieldCheck,
  Newspaper,
} from 'lucide-react';
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
import {
  fetchInitialNewsItems,
  fetchRemainingArchiveItems,
} from './lib/supabase';
import {
  buildUrlFromState,
  formatThaiDateCE,
  formatWeekLabelCE,
  getItemPublishedDay,
  getNewsTrustInfo,
  matchesSearchTokens,
  normalizeSearchTokens,
  parseTimestamp,
  parseUrlState,
} from './lib/editorialUtils';
import { Header } from './components/Header';
import { FilterBar, WeekOption } from './components/FilterBar';
import { TabNavigation } from './components/TabNavigation';
import { FontScale, NewsCard } from './components/NewsCard';
import { ReaderModal } from './components/ReaderModal';
import { BroadsheetSkeleton } from './components/BroadsheetSkeleton';

function safeGetStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / strict privacy mode errors gracefully
  }
}

type SearchScope = 'all' | 'period';

export const App: React.FC = () => {
  // Parse initial URL state once (allows direct links, refresh persistence & Back button)
  const initialUrlState = useMemo(() => {
    const savedMode = safeGetStorage('ainews_view_mode');
    const fallbackMode: ViewMode =
      savedMode === 'weekly' || savedMode === 'daily' ? savedMode : 'daily';
    return parseUrlState(window.location.search, fallbackMode);
  }, []);

  // 1. Theme State: Archival Paper Light default, safe storage access
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = safeGetStorage('ainews_theme_v2');
    return saved ? saved === 'dark' : false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      safeSetStorage('ainews_theme_v2', 'dark');
    } else {
      root.classList.remove('dark');
      safeSetStorage('ainews_theme_v2', 'light');
    }
  }, [isDark]);

  // 2. Reading Preferences & Bookmarks (validated & safely persisted)
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const saved = safeGetStorage('ainews_font_scale');
    return saved === 'normal' || saved === 'large' || saved === 'xlarge'
      ? saved
      : 'normal';
  });

  useEffect(() => {
    safeSetStorage('ainews_font_scale', fontScale);
  }, [fontScale]);

  const [readerItem, setReaderItem] = useState<NewsItem | null>(null);
  const [pendingNewsSlug, setPendingNewsSlug] = useState<string | null>(
    initialUrlState.newsSlug
  );
  const [showOnlyBookmarked, setShowOnlyBookmarked] = useState<boolean>(
    initialUrlState.saved
  );

  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const raw = safeGetStorage('ainews_bookmarks');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeSetStorage('ainews_bookmarks', JSON.stringify(bookmarkedIds));
  }, [bookmarkedIds]);

  const handleToggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  // 3. Data State (2-Phase Progressive Fetch: fast initial edition + silent archive hydration)
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [dataSource, setDataSource] = useState<'supabase' | 'mock'>('mock');
  const [statusNotice, setStatusNotice] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [archiveHydrating, setArchiveHydrating] = useState<boolean>(false);

  // 4. Filter, Search & Tab States (URL-synchronized)
  const [viewMode, setViewMode] = useState<ViewMode>(initialUrlState.viewMode);
  const [selectedDay, setSelectedDay] = useState<string>(initialUrlState.day);
  const [selectedWeek, setSelectedWeek] = useState<string>(initialUrlState.week);
  const [selectedCycle, setSelectedCycle] = useState<CycleFilter>(
    initialUrlState.cycle
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [selectedCompany, setSelectedCompany] = useState<CompanyTag | 'ALL'>(
    initialUrlState.company
  );
  const [searchQuery, setSearchQuery] = useState<string>(initialUrlState.q);
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [activeTab, setActiveTab] = useState<PageTabId>(initialUrlState.tab);

  // Tracks how the next URL sync should mutate browser history
  const navSourceRef = useRef<'init' | 'push' | 'replace' | 'pop'>('init');
  const loadGenRef = useRef<number>(0);

  useEffect(() => {
    safeSetStorage('ainews_view_mode', viewMode);
  }, [viewMode]);

  const loadData = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setArchiveHydrating(false);

    const initial = await fetchInitialNewsItems();
    if (loadGenRef.current !== gen) return;

    setAllNews(initial.items);
    setDataSource(initial.source);
    setStatusNotice(initial.errorMessage);

    const initialDays = Array.from(
      new Set(initial.items.map((i) => getItemPublishedDay(i)).filter(Boolean))
    )
      .sort()
      .reverse();
    if (initialDays.length > 0) {
      setSelectedDay((prev) => {
        if (prev && initialDays.includes(prev)) return prev;
        // Keep an explicit URL-requested archive date until Stage B finishes hydrating
        if (prev && initial.hasMoreArchive) return prev;
        return initialDays[0];
      });
    }

    const initialWeeks = Array.from(
      new Set(initial.items.map((i) => i.week_id))
    )
      .sort()
      .reverse();
    if (initialWeeks.length > 0) {
      setSelectedWeek((prev) => {
        if (prev && initialWeeks.includes(prev)) return prev;
        if (prev && initial.hasMoreArchive) return prev;
        return initialWeeks[0];
      });
    }

    setLoading(false);

    // Phase 2: Silently hydrate remaining archive rows in the background
    if (initial.hasMoreArchive && initial.source === 'supabase') {
      setArchiveHydrating(true);
      const older = await fetchRemainingArchiveItems(initial.items.length);
      if (loadGenRef.current !== gen) return;

      if (older.length > 0) {
        setAllNews((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          const merged = [...prev];
          for (const item of older) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      }
      setArchiveHydrating(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Derived Day & Week lists (100% grounded in published_at / Common Era)
  const availableDays = useMemo<DayOption[]>(() => {
    const countMap = new Map<string, number>();
    for (const item of allNews) {
      const key = getItemPublishedDay(item);
      if (!key) continue;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, count]) => ({
        key,
        label: formatThaiDateCE(key),
        count,
      }));
  }, [allNews]);

  const availableWeeks = useMemo<WeekOption[]>(() => {
    const countMap = new Map<string, number>();
    for (const item of allNews) {
      if (!item.week_id) continue;
      countMap.set(item.week_id, (countMap.get(item.week_id) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([id, count]) => ({
        id,
        label: formatWeekLabelCE(id),
        count,
      }));
  }, [allNews]);

  const latestDay = availableDays[0]?.key ?? '';
  const latestWeek = availableWeeks[0]?.id ?? '';

  // Once archive hydration finishes, validate URL-requested day/week fallback cleanly
  useEffect(() => {
    if (loading || archiveHydrating) return;
    if (availableDays.length > 0) {
      const validDayKeys = new Set(availableDays.map((d) => d.key));
      if (!selectedDay || !validDayKeys.has(selectedDay)) {
        setSelectedDay(availableDays[0].key);
      }
    }
    if (availableWeeks.length > 0) {
      const validWeekIds = new Set(availableWeeks.map((w) => w.id));
      if (!selectedWeek || !validWeekIds.has(selectedWeek)) {
        setSelectedWeek(availableWeeks[0].id);
      }
    }
  }, [loading, archiveHydrating, availableDays, availableWeeks, selectedDay, selectedWeek]);

  // Open deep-linked article (?news=<slug>) as soon as it arrives in initial or archive fetch
  useEffect(() => {
    if (!pendingNewsSlug || allNews.length === 0) return;
    const match = allNews.find(
      (item) =>
        item.cluster_slug === pendingNewsSlug || item.id === pendingNewsSlug
    );
    if (match) {
      setReaderItem(match);
      setPendingNewsSlug(null);
    } else if (!loading && !archiveHydrating) {
      // Slug no longer exists; clear pending state
      setPendingNewsSlug(null);
    }
  }, [pendingNewsSlug, allNews, loading, archiveHydrating]);

  // Browser Back / Forward navigation handler
  useEffect(() => {
    const handlePopState = () => {
      navSourceRef.current = 'pop';
      const parsed = parseUrlState(window.location.search, 'daily');
      setViewMode(parsed.viewMode);
      if (parsed.day) {
        setSelectedDay(parsed.day);
      } else if (latestDay) {
        setSelectedDay(latestDay);
      }
      if (parsed.week) {
        setSelectedWeek(parsed.week);
      } else if (latestWeek) {
        setSelectedWeek(latestWeek);
      }
      setSelectedCycle(parsed.cycle);
      setActiveTab(parsed.tab);
      setSelectedCompany(parsed.company);
      setSearchQuery(parsed.q);
      setShowOnlyBookmarked(parsed.saved);

      if (parsed.newsSlug) {
        const match = allNews.find(
          (i) => i.cluster_slug === parsed.newsSlug || i.id === parsed.newsSlug
        );
        if (match) {
          setReaderItem(match);
          setPendingNewsSlug(null);
        } else {
          setPendingNewsSlug(parsed.newsSlug);
        }
      } else {
        setReaderItem(null);
        setPendingNewsSlug(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [allNews, latestDay, latestWeek]);

  // Synchronize view state to URL query string & Browser History stack
  useEffect(() => {
    if (loading) return;
    const nextUrl = buildUrlFromState(
      {
        viewMode,
        day: selectedDay,
        week: selectedWeek,
        cycle: selectedCycle,
        tab: activeTab,
        company: selectedCompany,
        q: searchQuery,
        saved: showOnlyBookmarked,
        newsSlug: readerItem?.cluster_slug ?? pendingNewsSlug,
      },
      latestDay,
      latestWeek
    );
    const currentUrl = window.location.pathname + window.location.search;
    const mode = navSourceRef.current;
    navSourceRef.current = 'replace';

    if (nextUrl === currentUrl || mode === 'pop') return;

    try {
      if (mode === 'push') {
        window.history.pushState(null, '', nextUrl);
      } else {
        window.history.replaceState(null, '', nextUrl);
      }
    } catch {
      // Ignore history API restrictions in embedded frames
    }
  }, [
    loading,
    viewMode,
    selectedDay,
    selectedWeek,
    selectedCycle,
    activeTab,
    selectedCompany,
    searchQuery,
    showOnlyBookmarked,
    readerItem,
    pendingNewsSlug,
    latestDay,
    latestWeek,
  ]);

  // Navigation action wrappers that push clean history entries
  const handleSelectViewMode = useCallback(
    (mode: ViewMode) => {
      navSourceRef.current = 'push';
      if (mode === 'weekly' && selectedDay) {
        const match = allNews.find(
          (item) => getItemPublishedDay(item) === selectedDay
        );
        if (match?.week_id) {
          setSelectedWeek(match.week_id);
        }
      }
      setViewMode(mode);
    },
    [allNews, selectedDay]
  );

  const handleSelectDay = useCallback((day: string) => {
    navSourceRef.current = 'push';
    setSelectedDay(day);
  }, []);

  const handleSelectWeek = useCallback((week: string) => {
    navSourceRef.current = 'push';
    setSelectedWeek(week);
  }, []);

  const handleSelectCycle = useCallback((cycle: CycleFilter) => {
    navSourceRef.current = 'push';
    setSelectedCycle(cycle);
  }, []);

  const handleSelectTab = useCallback((tab: PageTabId) => {
    navSourceRef.current = 'push';
    setActiveTab(tab);
  }, []);

  const handleSelectCompany = useCallback((company: CompanyTag | 'ALL') => {
    navSourceRef.current = 'push';
    setSelectedCompany(company);
  }, []);

  const handleSearchChange = useCallback((q: string) => {
    navSourceRef.current = 'replace';
    setSearchQuery(q);
  }, []);

  const handleToggleShowOnlyBookmarked = useCallback(() => {
    navSourceRef.current = 'push';
    setShowOnlyBookmarked((prev) => {
      const next = !prev;
      if (next) {
        // Always start Saved Bookmarks on overview + ALL companies so saved items are immediately visible
        setActiveTab('overview');
        setSelectedCompany('ALL');
      }
      return next;
    });
  }, []);

  const handleOpenReader = useCallback((item: NewsItem) => {
    navSourceRef.current = 'push';
    setPendingNewsSlug(null);
    setReaderItem(item);
  }, []);

  const handleCloseReader = useCallback(() => {
    navSourceRef.current = 'push';
    setPendingNewsSlug(null);
    setReaderItem(null);
  }, []);

  const handleSwitchReaderStory = useCallback((item: NewsItem) => {
    navSourceRef.current = 'replace';
    setPendingNewsSlug(null);
    setReaderItem(item);
  }, []);

  // Valid bookmarked IDs existing in loaded dataset
  const activeBookmarkedCount = useMemo(() => {
    if (allNews.length === 0) return 0;
    const validIdSet = new Set(allNews.map((item) => item.id));
    return bookmarkedIds.filter((id) => validIdSet.has(id)).length;
  }, [allNews, bookmarkedIds]);

  const searchTokens = useMemo(
    () => normalizeSearchTokens(searchQuery),
    [searchQuery]
  );
  const isSearchActive = searchTokens.length > 0;
  const isGlobalSearchActive =
    isSearchActive && searchScope === 'all' && !showOnlyBookmarked;

  // ============================================================================
  // SINGLE SOURCE OF TRUTH FILTERING & COUNTS
  // ============================================================================

  // Step 1: Scope by Saved / Global Search / Daily (published_at) / Weekly
  const itemsInCurrentScope = useMemo(() => {
    return allNews.filter((item) => {
      if (showOnlyBookmarked) {
        if (!bookmarkedIds.includes(item.id)) return false;
      } else if (!isGlobalSearchActive) {
        if (viewMode === 'daily') {
          if (selectedDay && getItemPublishedDay(item) !== selectedDay) {
            return false;
          }
        } else {
          if (selectedWeek && item.week_id !== selectedWeek) return false;
          if (selectedCycle !== 'all' && item.batch_type !== selectedCycle) {
            return false;
          }
        }
      }

      if (isSearchActive && !matchesSearchTokens(item, searchTokens)) {
        return false;
      }

      return true;
    });
  }, [
    allNews,
    showOnlyBookmarked,
    bookmarkedIds,
    isGlobalSearchActive,
    viewMode,
    selectedDay,
    selectedWeek,
    selectedCycle,
    isSearchActive,
    searchTokens,
  ]);

  // Step 2: Company chip counts scoped to the ACTIVE TAB so chip numbers ALWAYS match the rendered view
  const itemsInScopeForActiveTab = useMemo(() => {
    if (activeTab === 'overview') return itemsInCurrentScope;
    if (activeTab === 'rumor_radar') {
      return itemsInCurrentScope.filter((i) => i.status === 'rumor');
    }
    return itemsInCurrentScope.filter(
      (i) => i.status === 'verified' && i.category === activeTab
    );
  }, [itemsInCurrentScope, activeTab]);

  const companyCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: itemsInScopeForActiveTab.length,
    };
    for (const c of ALL_COMPANIES) {
      counts[c] = 0;
    }
    for (const item of itemsInScopeForActiveTab) {
      for (const tag of item.company_tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [itemsInScopeForActiveTab]);

  // Step 3: Apply company filter & deterministic sort
  const filteredAndSortedItems = useMemo(() => {
    const matched = itemsInCurrentScope.filter((item) => {
      if (selectedCompany === 'ALL') return true;
      return item.company_tags.includes(selectedCompany);
    });

    return [...matched].sort((a, b) => {
      const timeDiff =
        parseTimestamp(b.published_at) - parseTimestamp(a.published_at);
      if (sortOrder === 'latest') {
        if (timeDiff !== 0) return timeDiff;
        return b.importance_score - a.importance_score;
      }
      if (b.importance_score !== a.importance_score) {
        return b.importance_score - a.importance_score;
      }
      return timeDiff;
    });
  }, [itemsInCurrentScope, selectedCompany, sortOrder]);

  const verifiedItems = useMemo(
    () => filteredAndSortedItems.filter((i) => i.status === 'verified'),
    [filteredAndSortedItems]
  );

  const rumorItems = useMemo(
    () => filteredAndSortedItems.filter((i) => i.status === 'rumor'),
    [filteredAndSortedItems]
  );

  // Tab counts derived from the exact company-filtered pool
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

  // Exact counts of cards currently rendered on screen (used by Header summary)
  const visibleVerifiedCount = activeVerifiedCategoryMeta
    ? currentTabVerifiedItems.length
    : activeTab === 'rumor_radar'
    ? 0
    : verifiedItems.length;

  const visibleRumorCount = activeVerifiedCategoryMeta
    ? 0
    : rumorItems.length;

  const isFilteredSummary =
    activeTab !== 'overview' ||
    selectedCompany !== 'ALL' ||
    isSearchActive ||
    showOnlyBookmarked;

  // Anchor "ใหม่" badge globally to the newest published day when browsing multi-day views
  const hasMultipleGlobalDays = availableDays.length > 1;
  const isItemInLatestDay = (item: NewsItem): boolean =>
    (viewMode === 'weekly' || showOnlyBookmarked || isGlobalSearchActive) &&
    hasMultipleGlobalDays &&
    getItemPublishedDay(item) === latestDay;

  const leadVerifiedStory = verifiedItems[0] ?? null;
  const leadTrustInfo = useMemo(
    () => (leadVerifiedStory ? getNewsTrustInfo(leadVerifiedStory) : null),
    [leadVerifiedStory]
  );

  // Active viewable list matching exact visual render order for Prev/Next in ReaderModal
  const activeViewableList = useMemo(() => {
    if (activeVerifiedCategoryMeta) return currentTabVerifiedItems;
    if (activeTab === 'rumor_radar') return rumorItems;
    const ordered: NewsItem[] = [];
    if (leadVerifiedStory) ordered.push(leadVerifiedStory);
    for (const cat of VERIFIED_CATEGORIES) {
      ordered.push(
        ...verifiedItems.filter(
          (i) => i.category === cat.id && i.id !== leadVerifiedStory?.id
        )
      );
    }
    ordered.push(...rumorItems);
    return ordered;
  }, [
    activeVerifiedCategoryMeta,
    currentTabVerifiedItems,
    activeTab,
    rumorItems,
    leadVerifiedStory,
    verifiedItems,
  ]);

  const readerIndex = useMemo(() => {
    if (!readerItem) return -1;
    return activeViewableList.findIndex((i) => i.id === readerItem.id);
  }, [readerItem, activeViewableList]);

  const hasActiveFilters =
    selectedCompany !== 'ALL' ||
    isSearchActive ||
    (viewMode === 'weekly' && selectedCycle !== 'all') ||
    showOnlyBookmarked;

  const resetAllFilters = useCallback(() => {
    navSourceRef.current = 'push';
    setSelectedCompany('ALL');
    setSearchQuery('');
    setSelectedCycle('all');
    setShowOnlyBookmarked(false);
    setSearchScope('all');
  }, []);

  const handleGoHome = useCallback(() => {
    navSourceRef.current = 'push';
    setActiveTab('overview');
    setShowOnlyBookmarked(false);
    setSelectedCompany('ALL');
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const currentPeriodLabel =
    viewMode === 'daily'
      ? selectedDay
        ? `ฉบับ ${formatThaiDateCE(selectedDay)}`
        : 'ฉบับรายวัน'
      : selectedWeek
      ? formatWeekLabelCE(selectedWeek)
      : 'มุมมองรายสัปดาห์';

  const editionBadgeLabel = showOnlyBookmarked
    ? `ที่บันทึกไว้ · ${activeBookmarkedCount} ข่าว`
    : isGlobalSearchActive
    ? `ค้นหาทั้งคลัง · พบ ${filteredAndSortedItems.length} ข่าว`
    : viewMode === 'daily'
    ? `ฉบับรายวัน · ${selectedDay ? formatThaiDateCE(selectedDay) : '—'}`
    : selectedWeek
    ? formatWeekLabelCE(selectedWeek)
    : 'รายสัปดาห์';

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-primary">
      {/* Masthead */}
      <Header
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        dataSource={dataSource}
        loading={loading}
        visibleVerifiedCount={visibleVerifiedCount}
        visibleRumorCount={visibleRumorCount}
        isFilteredSummary={isFilteredSummary}
        viewMode={viewMode}
        editionBadgeLabel={editionBadgeLabel}
        fontScale={fontScale}
        onChangeFontScale={setFontScale}
        bookmarkedCount={activeBookmarkedCount}
        showOnlyBookmarked={showOnlyBookmarked}
        onToggleShowOnlyBookmarked={handleToggleShowOnlyBookmarked}
        onGoHome={handleGoHome}
      />

      {/* Single-Line Broadsheet Section Tabs */}
      <TabNavigation
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        counts={tabCounts}
        loading={loading}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6">
        {/* Saved Bookmarks Cross-Edition Banner */}
        {showOnlyBookmarked && (
          <div className="px-4 py-2.5 rounded-md bg-editorial-soft border border-editorial/30 text-xs text-ink-secondary flex flex-wrap items-center justify-between gap-3">
            <span>
              กำลังแสดง
              <strong className="text-ink-primary font-semibold">
                ข่าวที่บันทึกไว้ทั้งหมดทุกวัน/สัปดาห์
              </strong>{' '}
              ({activeBookmarkedCount} รายการ)
            </span>
            <button
              type="button"
              onClick={handleToggleShowOnlyBookmarked}
              className="font-semibold text-editorial hover:underline shrink-0"
            >
              กลับไปดูข่าวตามปกติ
            </button>
          </div>
        )}

        {/* Active Search Scope Indicator Banner */}
        {isSearchActive && !showOnlyBookmarked && (
          <div className="px-4 py-2.5 rounded-md bg-surface border border-rule-strong text-xs text-ink-secondary flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-editorial shrink-0" />
              <span className="break-words">
                ค้นหา <strong className="text-ink-primary">“{searchQuery.trim()}”</strong>{' '}
                {searchScope === 'all' ? (
                  <>
                    ใน<strong className="text-ink-primary">คลังข่าวทั้งหมด</strong>
                  </>
                ) : (
                  <>
                    เฉพาะ<strong className="text-ink-primary">{currentPeriodLabel}</strong>
                  </>
                )}{' '}
                — พบ <strong className="text-editorial tabular-nums">{visibleVerifiedCount + visibleRumorCount}</strong> รายการ
                {archiveHydrating && (
                  <span className="text-ink-muted ml-1.5">(กำลังโหลดข่าวย้อนหลังเพิ่ม...)</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setSearchScope((prev) => (prev === 'all' ? 'period' : 'all'))
                }
                className="h-8 px-2.5 rounded border border-rule bg-canvas text-ink-primary font-medium hover:border-rule-strong transition-colors"
              >
                {searchScope === 'all'
                  ? `จำกัดเฉพาะ${currentPeriodLabel}`
                  : 'ค้นหาทั้งคลังข่าว'}
              </button>
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="font-semibold text-editorial hover:underline"
              >
                ล้างคำค้นหา
              </button>
            </div>
          </div>
        )}

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
          loading={loading}
          archiveHydrating={archiveHydrating}
          showOnlyBookmarked={showOnlyBookmarked}
          isGlobalSearchActive={isGlobalSearchActive}
          viewMode={viewMode}
          onSelectViewMode={handleSelectViewMode}
          availableDays={availableDays}
          selectedDay={selectedDay}
          onSelectDay={handleSelectDay}
          availableWeeks={availableWeeks}
          selectedWeek={selectedWeek}
          onSelectWeek={handleSelectWeek}
          selectedCycle={selectedCycle}
          onSelectCycle={handleSelectCycle}
          sortOrder={sortOrder}
          onSelectSortOrder={setSortOrder}
          selectedCompany={selectedCompany}
          onSelectCompany={handleSelectCompany}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          companyCounts={companyCounts}
        />

        {loading ? (
          <BroadsheetSkeleton />
        ) : (
          <>
            {/* ==============================================================
                TAB VIEW 1: OVERVIEW (Front-Page Editorial Broadsheet 85/15)
               ============================================================== */}
            {activeTab === 'overview' && (
              <>
                {filteredAndSortedItems.length === 0 ? (
                  <EmptyState
                    viewMode={viewMode}
                    hasActiveFilters={hasActiveFilters}
                    showOnlyBookmarked={showOnlyBookmarked}
                    activeBookmarkedCount={activeBookmarkedCount}
                    isSearchActive={isSearchActive}
                    searchQuery={searchQuery.trim()}
                    searchScope={searchScope}
                    currentPeriodLabel={currentPeriodLabel}
                    isDedicatedTab={false}
                    onResetFilters={resetAllFilters}
                    onGoHome={handleGoHome}
                    onSwitchToWeekly={() => handleSelectViewMode('weekly')}
                    onExpandSearchToAll={() => setSearchScope('all')}
                    onShowAllBookmarks={() => {
                      navSourceRef.current = 'push';
                      setActiveTab('overview');
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Primary Column (~75-80% Desktop Width): Verified News */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-10">
                      {/* Notice when only Rumor Radar matches the current search/filter */}
                      {verifiedItems.length === 0 && rumorItems.length > 0 && (
                        <div className="p-6 rounded-lg border border-dashed border-rule-strong bg-surface/60 text-center space-y-1.5">
                          <p className="text-sm font-semibold text-ink-primary">
                            ไม่พบข่าวหลักที่ตรงกับเงื่อนไขที่เลือก
                          </p>
                          <p className="text-xs text-ink-secondary">
                            แต่พบ <strong className="text-rumor">{rumorItems.length} ประเด็น</strong> ในคอลัมน์ Rumor Radar ด้านขวา
                          </p>
                        </div>
                      )}

                      {/* Lead Feature Story */}
                      {leadVerifiedStory && leadTrustInfo && (
                        <section
                          aria-label={
                            viewMode === 'daily'
                              ? 'ข่าวเด่นประจำวัน'
                              : 'ข่าวเด่นประจำสัปดาห์'
                          }
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-4 border-b border-rule-strong">
                            <span className="text-[11px] font-bold uppercase tracking-widest text-editorial">
                              {showOnlyBookmarked
                                ? 'ข่าวเด่นในรายการที่บันทึกไว้'
                                : isGlobalSearchActive
                                ? 'ข่าวเด่นจากผลการค้นหา'
                                : viewMode === 'daily'
                                ? 'ข่าวเด่นประจำวัน'
                                : 'ข่าวเด่นประจำสัปดาห์'}
                            </span>
                            <span
                              title={leadTrustInfo.tooltip}
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                leadTrustInfo.tier === 'official'
                                  ? 'text-verified'
                                  : leadTrustInfo.tier === 'press_unconfirmed'
                                  ? 'text-rumor'
                                  : 'text-ink-muted'
                              }`}
                            >
                              {leadTrustInfo.tier === 'official' ? (
                                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                              ) : leadTrustInfo.tier === 'press_unconfirmed' ? (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <Newspaper className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{leadTrustInfo.fullLabel}</span>
                            </span>
                          </div>
                          <NewsCard
                            item={leadVerifiedStory}
                            featured
                            isLatestBatch={isItemInLatestDay(leadVerifiedStory)}
                            isBookmarked={bookmarkedIds.includes(
                              leadVerifiedStory.id
                            )}
                            onToggleBookmark={handleToggleBookmark}
                            onOpenReader={handleOpenReader}
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
                                onClick={() => handleSelectTab(cat.id)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-editorial hover:underline shrink-0 py-1"
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
                                  isLatestBatch={isItemInLatestDay(item)}
                                  isBookmarked={bookmarkedIds.includes(item.id)}
                                  onToggleBookmark={handleToggleBookmark}
                                  onOpenReader={handleOpenReader}
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
                          onClick={() => handleSelectTab('rumor_radar')}
                          className="text-[11px] font-semibold text-rumor hover:underline py-1"
                        >
                          เปิดหน้าเฉพาะ &rarr;
                        </button>
                      </div>

                      <p className="text-xs text-ink-muted leading-relaxed">
                        สัญญาณข่าวลือและเบาะแสจาก{' '}
                        <span className="text-ink-secondary font-medium">
                          Hacker News
                        </span>{' '}
                        ·{' '}
                        <span className="text-ink-secondary font-medium">
                          Lobste.rs
                        </span>{' '}
                        และคอมมูนิตี้นักพัฒนา AI แยกออกจากข่าวหลักอย่างชัดเจน ยังไม่ยืนยันทางการ
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
                              isLatestBatch={isItemInLatestDay(item)}
                              isBookmarked={bookmarkedIds.includes(item.id)}
                              onToggleBookmark={handleToggleBookmark}
                              onOpenReader={handleOpenReader}
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
                    {currentTabVerifiedItems.length} ข่าวในหมวดนี้
                  </span>
                </div>

                {currentTabVerifiedItems.length === 0 ? (
                  <EmptyState
                    viewMode={viewMode}
                    hasActiveFilters={hasActiveFilters}
                    showOnlyBookmarked={showOnlyBookmarked}
                    activeBookmarkedCount={activeBookmarkedCount}
                    isSearchActive={isSearchActive}
                    searchQuery={searchQuery.trim()}
                    searchScope={searchScope}
                    currentPeriodLabel={currentPeriodLabel}
                    isDedicatedTab
                    onResetFilters={resetAllFilters}
                    onGoHome={handleGoHome}
                    onSwitchToWeekly={() => handleSelectViewMode('weekly')}
                    onExpandSearchToAll={() => setSearchScope('all')}
                    onShowAllBookmarks={() => {
                      navSourceRef.current = 'push';
                      setActiveTab('overview');
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {currentTabVerifiedItems.map((item) => (
                      <NewsCard
                        key={item.id}
                        item={item}
                        isLatestBatch={isItemInLatestDay(item)}
                        isBookmarked={bookmarkedIds.includes(item.id)}
                        onToggleBookmark={handleToggleBookmark}
                        onOpenReader={handleOpenReader}
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
                    viewMode={viewMode}
                    hasActiveFilters={hasActiveFilters}
                    showOnlyBookmarked={showOnlyBookmarked}
                    activeBookmarkedCount={activeBookmarkedCount}
                    isSearchActive={isSearchActive}
                    searchQuery={searchQuery.trim()}
                    searchScope={searchScope}
                    currentPeriodLabel={currentPeriodLabel}
                    isDedicatedTab
                    onResetFilters={resetAllFilters}
                    onGoHome={handleGoHome}
                    onSwitchToWeekly={() => handleSelectViewMode('weekly')}
                    onExpandSearchToAll={() => setSearchScope('all')}
                    onShowAllBookmarks={() => {
                      navSourceRef.current = 'push';
                      setActiveTab('overview');
                      setSelectedCompany('ALL');
                      setSearchQuery('');
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                    {rumorItems.map((item) => (
                      <NewsCard
                        key={item.id}
                        item={item}
                        isLatestBatch={isItemInLatestDay(item)}
                        isBookmarked={bookmarkedIds.includes(item.id)}
                        onToggleBookmark={handleToggleBookmark}
                        onOpenReader={handleOpenReader}
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
        onClose={handleCloseReader}
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
            handleSwitchReaderStory(activeViewableList[readerIndex - 1]);
          }
        }}
        onNext={() => {
          if (readerIndex >= 0 && readerIndex < activeViewableList.length - 1) {
            handleSwitchReaderStory(activeViewableList[readerIndex + 1]);
          }
        }}
      />

      {/* Quiet Editorial Colophon Footer */}
      <footer className="border-t border-rule mt-14 py-6 text-xs text-ink-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-masthead font-bold text-ink-primary tracking-tight text-sm">
              AINEWS
            </span>
            <span aria-hidden="true">·</span>
            <span>อัปเดตอัตโนมัติทุกเช้า</span>
          </div>
          <div>
            สรุปและตรวจสอบแหล่งที่มาอัตโนมัติจากประกาศทางการและสื่อเทคโนโลยีด้าน AI
          </div>
        </div>
      </footer>
    </div>
  );
};

interface EmptyStateProps {
  viewMode: ViewMode;
  hasActiveFilters: boolean;
  showOnlyBookmarked: boolean;
  activeBookmarkedCount: number;
  isSearchActive: boolean;
  searchQuery: string;
  searchScope: SearchScope;
  currentPeriodLabel: string;
  isDedicatedTab: boolean;
  onResetFilters: () => void;
  onGoHome: () => void;
  onSwitchToWeekly: () => void;
  onExpandSearchToAll: () => void;
  onShowAllBookmarks: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  viewMode,
  hasActiveFilters,
  showOnlyBookmarked,
  activeBookmarkedCount,
  isSearchActive,
  searchQuery,
  searchScope,
  currentPeriodLabel,
  isDedicatedTab,
  onResetFilters,
  onGoHome,
  onSwitchToWeekly,
  onExpandSearchToAll,
  onShowAllBookmarks,
}) => {
  const hasSavedElsewhere = showOnlyBookmarked && activeBookmarkedCount > 0;

  let heading: string;
  let description: string;

  if (showOnlyBookmarked) {
    if (hasSavedElsewhere) {
      heading = 'ไม่พบข่าวที่บันทึกไว้ในหมวดหรือตัวกรองนี้';
      description = `คุณมีข่าวที่บันทึกไว้ทั้งหมด ${activeBookmarkedCount} รายการในหมวดอื่น`;
    } else {
      heading = 'ยังไม่มีข่าวที่บันทึกไว้';
      description = 'กดไอคอนบุ๊กมาร์กบนการ์ดข่าวใดก็ได้เพื่อเก็บไว้อ่านภายหลัง';
    }
  } else if (isSearchActive) {
    heading =
      searchScope === 'all'
        ? `ไม่พบข่าวที่ตรงกับ “${searchQuery}” ในคลังข่าวทั้งหมด`
        : `ไม่พบข่าวที่ตรงกับ “${searchQuery}” ใน${currentPeriodLabel}`;
    description =
      searchScope === 'all'
        ? 'ลองใช้คำค้นหาที่สั้นลง หรือตรวจสอบการสะกดชื่อโมเดล/บริษัท'
        : 'ลองขยายขอบเขตไปค้นหาในคลังข่าวทั้งหมด หรือล้างตัวกรองค่ายที่เลือกอยู่';
  } else if (hasActiveFilters) {
    heading = `ไม่พบข่าวที่ตรงกับเงื่อนไขที่เลือกใน${currentPeriodLabel}`;
    description = 'ลองล้างตัวกรองค่าย AI หรือสลับดูแบบรายสัปดาห์';
  } else {
    heading = `ยังไม่มีข่าวในหมวดนี้สำหรับ${currentPeriodLabel}`;
    description =
      viewMode === 'daily'
        ? 'ลองสลับเป็นมุมมองรายสัปดาห์ เปลี่ยนวันที่ หรือกลับไปดูหน้าแรกทั้งหมด'
        : 'ลองสลับสัปดาห์ด้านบน หรือกลับไปดูหน้าแรกทั้งหมด';
  }

  return (
    <div className="py-16 px-4 rounded-lg border border-dashed border-rule-strong text-center space-y-2.5 bg-surface/50">
      <Inbox className="w-7 h-7 text-ink-muted mx-auto" />
      <p className="text-sm font-semibold text-ink-primary">{heading}</p>
      <p className="text-xs text-ink-muted">{description}</p>
      <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
        {hasSavedElsewhere && (
          <button
            type="button"
            onClick={onShowAllBookmarks}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 sm:h-8 px-3.5 rounded-md text-xs font-semibold bg-ink-primary text-canvas hover:opacity-90 transition-opacity"
          >
            ดูข่าวที่บันทึกไว้ทั้งหมด ({activeBookmarkedCount})
          </button>
        )}
        {isSearchActive && searchScope === 'period' && !showOnlyBookmarked && (
          <button
            type="button"
            onClick={onExpandSearchToAll}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 sm:h-8 px-3.5 rounded-md text-xs font-semibold bg-editorial text-white dark:text-slate-950 hover:opacity-90 transition-opacity"
          >
            ค้นหาในคลังข่าวทั้งหมด
          </button>
        )}
        {hasActiveFilters && !hasSavedElsewhere && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 sm:h-8 px-3.5 rounded-md text-xs font-semibold bg-ink-primary text-canvas hover:opacity-90 transition-opacity"
          >
            ล้างตัวกรองทั้งหมด
          </button>
        )}
        {viewMode === 'daily' && !showOnlyBookmarked && !isSearchActive && (
          <button
            type="button"
            onClick={onSwitchToWeekly}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 sm:h-8 px-3.5 rounded-md text-xs font-semibold border border-rule-strong bg-surface text-ink-primary hover:bg-subtle transition-colors"
          >
            สลับดูแบบรายสัปดาห์
          </button>
        )}
        {isDedicatedTab && (
          <button
            type="button"
            onClick={onGoHome}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 sm:h-8 px-3.5 rounded-md text-xs font-semibold border border-rule-strong bg-surface text-ink-primary hover:bg-subtle transition-colors"
          >
            กลับหน้าแรกทั้งหมด
          </button>
        )}
      </div>
    </div>
  );
};
