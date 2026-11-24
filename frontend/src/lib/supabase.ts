import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NewsItem } from '../types/news';
import { MOCK_NEWS_ITEMS } from '../data/mockNews';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-id') &&
    !supabaseAnonKey.includes('your-supabase-anon-key')
);

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
    };
  }

  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('*')
      .order('week_id', { ascending: false })
      .order('importance_score', { ascending: false })
      .order('published_at', { ascending: false });

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
