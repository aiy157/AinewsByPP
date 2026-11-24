export type BatchType = 'midweek' | 'weekend';
export type CycleFilter = 'all' | 'midweek' | 'weekend';
export type NewsStatus = 'verified' | 'rumor';

export type VerifiedCategory =
  | 'models_updates'
  | 'benchmarks_testing'
  | 'partnerships_deals'
  | 'policy_rules';

export type PageTabId =
  | 'models_updates'
  | 'benchmarks_testing'
  | 'partnerships_deals'
  | 'policy_rules'
  | 'rumor_radar'
  | 'overview';

export type CompanyTag =
  | 'OpenAI'
  | 'Anthropic'
  | 'Google'
  | 'Meta'
  | 'xAI'
  | 'DeepSeek'
  | 'Open-Source'
  | 'Other';

export interface SourceUrlItem {
  title: string;
  url: string;
  is_official: boolean;
}

export interface KeyFactItem {
  label: string;
  value: string;
}

export interface NewsItem {
  id: string;
  week_id: string;
  batch_type: BatchType;
  status: NewsStatus;
  category: VerifiedCategory | null;
  company_tags: CompanyTag[];
  image_url?: string | null;
  image_credit?: string | null;
  title_th: string;
  tldr_th: string;
  key_facts: KeyFactItem[];
  summary_bullets: string[];
  source_urls: SourceUrlItem[];
  importance_score: number;
  cluster_slug: string;
  published_at: string;
  created_at?: string;
}

export const ALL_COMPANIES: CompanyTag[] = [
  'OpenAI',
  'Anthropic',
  'Google',
  'Meta',
  'xAI',
  'DeepSeek',
  'Open-Source',
  'Other',
];

export interface CategoryMeta {
  id: VerifiedCategory;
  titleTh: string;
  titleEn: string;
  descriptionTh: string;
  accentColor: string;
}

export const VERIFIED_CATEGORIES: CategoryMeta[] = [
  {
    id: 'models_updates',
    titleTh: 'เปิดตัวโมเดล & อัปเดตระบบ',
    titleEn: 'Models & Product Updates',
    descriptionTh: 'เปิดตัวโมเดลใหม่ ฟีเจอร์ใหม่ และการอัปเกรดความสามารถของระบบ AI ค่ายหลัก',
    accentColor: 'emerald',
  },
  {
    id: 'benchmarks_testing',
    titleTh: 'ผลทดสอบ & งานวิจัยเด่น',
    titleEn: 'Benchmarks & Research',
    descriptionTh: 'ผลทดสอบเปรียบเทียบประสิทธิภาพ (Benchmarks) และงานวิจัยเด่นจาก ArXiv',
    accentColor: 'sky',
  },
  {
    id: 'partnerships_deals',
    titleTh: 'ดีลธุรกิจ & การลงทุน',
    titleEn: 'Partnerships & Deals',
    descriptionTh: 'ความร่วมมือทางธุรกิจ การระดมทุน การซื้อกิจการ และโครงสร้างพื้นฐาน Data Center',
    accentColor: 'indigo',
  },
  {
    id: 'policy_rules',
    titleTh: 'กฎหมาย & นโยบาย AI',
    titleEn: 'Policy, Rules & Copyright',
    descriptionTh: 'กฎหมายกำกับดูแล AI การปรับเปลี่ยนกฎการใช้งาน (ToS) ความปลอดภัย และประเด็นลิขสิทธิ์',
    accentColor: 'teal',
  },
];
