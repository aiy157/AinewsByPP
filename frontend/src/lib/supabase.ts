import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NewsItem } from '../types/news';
import { MOCK_NEWS_ITEMS } from '../data/mockNews';

const PLACEHOLDER_MARKERS = [
  'your-project-id',
  'your-supabase-anon-key',
  'your-supabase-publishable-key',
  'your-supabase-secret',
];

function isValidPublicValue(val: string | undefined, isKey = false): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((m) => lower.includes(m))) return false;
  if (isKey && (lower.startsWith('sb_secret_') || lower.includes('service_role'))) {
    return false;
  }
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
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export interface FetchNewsResult {
  items: NewsItem[];
  source: 'supabase' | 'mock';
  errorMessage?: string;
}

export async function fetchAllNewsItems(forceMock = false): Promise<FetchNewsResult> {
  if (forceMock || !supabase) {
    return {
      items: MOCK_NEWS_ITEMS,
      source: 'mock',
      errorMessage: forceMock
        ? undefined
        : 'ยังไม่พบค่า Public Key ของ Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — แสดงข้อมูลตัวอย่าง Mock Data ชั่วคราว',
    };
  }

  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .order('week_id', { ascending: false })
      .order('created_at', { ascending: false })
      .order('published_at', { ascending: false })
      .order('importance_score', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return {
        items: MOCK_NEWS_ITEMS,
        source: 'mock',
        errorMessage: 'ยังไม่มีข้อมูลในตาราง Supabase (แสดงข้อมูลตัวอย่าง Mock Data แทนชั่วคราว)',
      };
    }

    return {
      items: data as NewsItem[],
      source: 'supabase',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error connecting to Supabase';
    return {
      items: MOCK_NEWS_ITEMS,
      source: 'mock',
      errorMessage: `เชื่อมต่อ Supabase ไม่สำเร็จ (${msg}) — สลับมาใช้ Mock Data อัตโนมัติ`,
    };
  }
}
