import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NewsItem, VerifiedCategory } from '../types/news';
import { MOCK_NEWS_ITEMS } from '../data/mockNews';

const PLACEHOLDER_MARKERS = [
  'your-project-id',
  'your-supabase-anon-key',
  'your-supabase-publishable-key',
  'your-supabase-secret',
];

const VALID_CATEGORIES = new Set<VerifiedCategory>([
  'models_updates',
  'benchmarks_testing',
  'partnerships_deals',
  'policy_rules',
]);

function isSafeBrowserPublicKey(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower.startsWith('sb_secret_') || lower.includes('service_role')) {
    return false;
  }
  const parts = raw.split('.');
  if (parts.length === 3) {
    try {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded)) as { role?: string };
      return payload.role === 'anon';
    } catch {
      return false;
    }
  }
  return lower.startsWith('sb_publishable_');
}

function isValidPublicValue(val: string | undefined, isKey = false): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((m) => lower.includes(m))) return false;
  if (isKey && !isSafeBrowserPublicKey(trimmed)) return false;
  return true;
}

const rawViteUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawViteKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

const supabaseUrl = isValidPublicValue(rawViteUrl)
  ? rawViteUrl.trim()
  : isValidPublicValue(__AINEWS_SUPABASE_URL__)
  ? __AINEWS_SUPABASE_URL__.trim()
  : undefined;

const supabaseAnonKey = isValidPublicValue(rawViteKey, true)
  ? rawViteKey.trim()
  : isValidPublicValue(__AINEWS_SUPABASE_ANON_KEY__, true)
  ? __AINEWS_SUPABASE_ANON_KEY__.trim()
  : undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

export interface FetchNewsResult {
  items: NewsItem[];
  source: 'supabase' | 'mock';
  errorMessage?: string;
}

function normalizeNewsRow(raw: Record<string, unknown>): NewsItem | null {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : null;
  const weekId = typeof raw.week_id === 'string' && raw.week_id.trim() ? raw.week_id : null;
  const titleTh = typeof raw.title_th === 'string' && raw.title_th.trim() ? raw.title_th : null;
  if (!id || !weekId || !titleTh) return null;

  const status = raw.status === 'rumor' ? 'rumor' : 'verified';
  const rawCat = typeof raw.category === 'string' ? raw.category : null;
  const category: VerifiedCategory | null =
    status === 'rumor'
      ? null
      : rawCat && VALID_CATEGORIES.has(rawCat as VerifiedCategory)
      ? (rawCat as VerifiedCategory)
      : 'models_updates';

  return {
    id,
    week_id: weekId,
    batch_type: raw.batch_type === 'weekend' ? 'weekend' : 'midweek',
    status,
    category,
    company_tags: Array.isArray(raw.company_tags) && raw.company_tags.length > 0
      ? (raw.company_tags as NewsItem['company_tags'])
      : ['Other'],
    image_url: typeof raw.image_url === 'string' && raw.image_url.trim() ? raw.image_url.trim() : null,
    image_credit: typeof raw.image_credit === 'string' && raw.image_credit.trim() ? raw.image_credit.trim() : null,
    title_th: titleTh,
    tldr_th: typeof raw.tldr_th === 'string' ? raw.tldr_th : '',
    key_facts: Array.isArray(raw.key_facts) ? (raw.key_facts as NewsItem['key_facts']) : [],
    summary_bullets: Array.isArray(raw.summary_bullets) ? (raw.summary_bullets as string[]) : [],
    source_urls: Array.isArray(raw.source_urls) ? (raw.source_urls as NewsItem['source_urls']) : [],
    importance_score:
      typeof raw.importance_score === 'number' && Number.isFinite(raw.importance_score)
        ? raw.importance_score
        : 5,
    cluster_slug: typeof raw.cluster_slug === 'string' ? raw.cluster_slug : id,
    published_at:
      typeof raw.published_at === 'string' && raw.published_at.trim()
        ? raw.published_at
        : new Date().toISOString(),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  };
}

export async function fetchAllNewsItems(forceMock = false): Promise<FetchNewsResult> {
  if (forceMock || !supabase) {
    return {
      items: MOCK_NEWS_ITEMS,
      source: 'mock',
      errorMessage: forceMock
        ? undefined
        : 'ยังไม่พบค่า Public Key ของ Supabase — แสดงข้อมูลตัวอย่าง Mock Data ชั่วคราว',
    };
  }

  try {
    // Paginate cleanly past PostgREST's 1,000-row cap while bounding max egress
    const PAGE_SIZE = 500;
    const MAX_ROWS = 2000;
    const collected: NewsItem[] = [];

    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('news_items')
        .select('*')
        .order('week_id', { ascending: false })
        .order('created_at', { ascending: false })
        .order('published_at', { ascending: false })
        .order('importance_score', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        throw new Error('supabase_query_failed');
      }

      const batch = (data ?? [])
        .map((row) => normalizeNewsRow(row as Record<string, unknown>))
        .filter((item): item is NewsItem => item !== null);

      collected.push(...batch);
      if ((data ?? []).length < PAGE_SIZE) {
        break;
      }
    }

    if (collected.length === 0) {
      return {
        items: MOCK_NEWS_ITEMS,
        source: 'mock',
        errorMessage: 'ยังไม่มีข้อมูลในตาราง Supabase (แสดงข้อมูลตัวอย่าง Mock Data แทนชั่วคราว)',
      };
    }

    return {
      items: collected,
      source: 'supabase',
    };
  } catch {
    return {
      items: MOCK_NEWS_ITEMS,
      source: 'mock',
      errorMessage: 'เชื่อมต่อฐานข้อมูลไม่สำเร็จในขณะนี้ — สลับมาแสดงข้อมูลตัวอย่างชั่วคราว',
    };
  }
}
