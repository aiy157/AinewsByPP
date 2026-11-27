/**
 * AINEWS Frontend QA Regression Test Suite (Zero external dependencies, runs on Node 20+).
 * Prevents regressions across all Round 1–3 QA invariants:
 *   - ArXiv preprint classification (URL + text signals, never tagged "ยืนยันทางการ")
 *   - Legacy disclaimer cleanup & category-localized section headings
 *   - Multi-word AND search + whitespace normalization
 *   - Thai word-boundary teaser truncation + Common Era dates
 *   - Previous-edition CTA, empty Rumor Radar copy, eager/high-priority hero image, 44px mobile buttons, tab scope label
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');

function readSrc(relPath) {
  return fs.readFileSync(path.join(srcDir, relPath), 'utf8');
}

// Compile editorialUtils.ts in-memory to test the exact TypeScript implementation
const utilsSource = readSrc('lib/editorialUtils.ts');
const transpiled = ts
  .transpileModule(utilsSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import\s*\{[^}]*ALL_COMPANIES[^}]*\}\s*from\s*['"]\.\.\/types\/news['"];?/,
    "const ALL_COMPANIES = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'xAI', 'DeepSeek', 'Open-Source', 'Other'];"
  );

const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled, 'utf8').toString('base64')}`;
const utils = await import(dataUrl);

// 1. Common Era dates & ISO week labels (zero Buddhist Era)
assert.equal(utils.formatThaiDateCE('2026-11-27T04:00:00Z'), '27 พ.ย. 2026');
assert.equal(utils.formatThaiDateCE('2026-11-26'), '26 พ.ย. 2026');
assert.ok(!utils.formatThaiDateCE('2026-11-27').includes('2569'));
assert.equal(utils.formatWeekLabelCE('2026-W48'), 'สัปดาห์ที่ 48 (23–29 พ.ย. 2026)');

// 2. ArXiv preprint classification (URL, GitHub+ArXiv combo, AND text-only mention)
const arxivUrlItem = {
  id: '1',
  week_id: '2026-W48',
  batch_type: 'midweek',
  status: 'verified',
  category: 'benchmarks_testing',
  company_tags: ['Open-Source'],
  title_th: 'Partial Routing ให้โมเดลนำมอบงานย่อย',
  tldr_th: 'งานวิจัยนำเสนอวิธี Partial Routing ลดต้นทุน',
  key_facts: [],
  summary_bullets: [],
  source_urls: [
    { title: 'ArXiv cs.AI', url: 'https://arxiv.org/abs/2611.33470', is_official: true },
    { title: 'GitHub Repo', url: 'https://github.com/example/partial', is_official: true },
  ],
  importance_score: 7,
  cluster_slug: 'partial-routing',
  published_at: '2026-11-26T08:00:00Z',
};
const arxivTrust = utils.getNewsTrustInfo(arxivUrlItem);
assert.equal(arxivTrust.tier, 'preprint');
assert.ok(arxivTrust.shortLabel.includes('พรีปรินต์'));
assert.ok(arxivTrust.shortLabel.includes('Peer Review'));
assert.ok(!arxivTrust.shortLabel.includes('ยืนยันทางการ'));

const arxivTextOnlyItem = {
  ...arxivUrlItem,
  source_urls: [{ title: 'TechCrunch AI', url: 'https://techcrunch.com/paper', is_official: false }],
  tldr_th: 'งานวิจัยพรีปรินต์บน ArXiv ที่ยังไม่ผ่านการรีวิวพบว่าโมเดลสามารถปิดแจ้งเตือนได้',
};
assert.equal(utils.getNewsTrustInfo(arxivTextOnlyItem).tier, 'preprint');

const officialLabItem = {
  ...arxivUrlItem,
  category: 'models_updates',
  title_th: 'OpenAI เปิดตัวโมเดลรุ่นใหม่',
  tldr_th: 'OpenAI ประกาศเปิดตัวโมเดลอย่างเป็นทางการ',
  source_urls: [{ title: 'OpenAI Blog', url: 'https://openai.com/news/release', is_official: true }],
};
assert.equal(utils.getNewsTrustInfo(officialLabItem).tier, 'official');

const anonPressItem = {
  ...arxivUrlItem,
  category: 'policy_rules',
  title_th: 'รายงานระบุ Nvidia สั่งผู้ผลิตหยุดส่งเซิร์ฟเวอร์',
  tldr_th: 'TechCrunch และ Blognone อ้างรายงานของ Financial Times ที่อิงแหล่งข่าวนิรนาม 3 ราย',
  source_urls: [
    { title: 'TechCrunch', url: 'https://techcrunch.com/nv', is_official: false },
    { title: 'Blognone', url: 'https://blognone.com/nv', is_official: false },
  ],
};
assert.equal(utils.getNewsTrustInfo(anonPressItem).tier, 'press_unconfirmed');

// 3. Multi-word AND search + whitespace normalization
const tokens = utils.normalizeSearchTokens('  Nvidia   ไทย  ');
assert.deepEqual(tokens, ['nvidia', 'ไทย']);
assert.equal(
  utils.matchesSearchTokens(
    { ...anonPressItem, title_th: 'รายงานระบุ Nvidia สั่งหยุดส่งไปไทยและมาเลเซีย' },
    tokens
  ),
  true
);

// 4. Legacy template disclaimer cleanup & localized headings
assert.equal(
  utils.localizeSectionHeading('เจาะลึกสเปกและกลไกเทคนิค', 'policy_rules'),
  'สาระสำคัญและขอบเขตการบังคับใช้'
);
const cleanedBody = utils.cleanLegacySectionBody(
  'รายงานนี้เป็นเรื่องห่วงโซ่อุปทานและการปฏิบัติตามกฎส่งออก ไม่ใช่การเปิดตัวผลิตภัณฑ์ โดยครอบคลุมผู้ผลิตเซิร์ฟเวอร์หลักอย่าง Dell และ Supermicro ในเอเชียตะวันออกเฉียงใต้'
);
assert.ok(!cleanedBody.includes('ไม่ใช่การเปิดตัวผลิตภัณฑ์'));
assert.ok(cleanedBody.includes('Dell และ Supermicro'));

// 5. Thai word-boundary teaser truncation ends with ellipsis
const longThai =
  'รายงานระบุว่าผู้ผลิตเซิร์ฟเวอร์รายใหญ่หลายแห่งได้รับแจ้งให้ชะลอการจัดส่งเครื่องประมวลผลไปยังสี่ประเทศในภูมิภาคเอเชียตะวันออกเฉียงใต้เพื่อรอความชัดเจนด้านกฎระเบียบการส่งออกชิปขั้นสูงจากหน่วยงานที่เกี่ยวข้อง';
const truncated = utils.truncateThaiAtWordBoundary(longThai, 90);
assert.ok(truncated.endsWith('…'));
assert.ok(truncated.length <= 92);

// 6. Component regression checks (quiet-day CTA, empty Rumor Radar, eager hero, 44px mobile, tab scope)
const appSrc = readSrc('App.tsx');
const cardSrc = readSrc('components/NewsCard.tsx');
const tabSrc = readSrc('components/TabNavigation.tsx');
const modalSrc = readSrc('components/ReaderModal.tsx');

assert.ok(appSrc.includes('อ่านต่อฉบับก่อนหน้า'), 'Missing quiet-day previous-edition panel');
assert.ok(appSrc.includes('ดูฉบับ {previousDayOption.label}'), 'Missing previous-edition CTA button');
assert.ok(appSrc.includes('วันนี้ยังไม่มีข่าวลือ'), 'Missing honest empty Rumor Radar state');
assert.ok(appSrc.includes('min-h-[44px]'), 'Missing 44px mobile touch targets in App.tsx');

assert.ok(cardSrc.includes('loading="eager"'), 'Featured hero image must use loading="eager"');
assert.ok(cardSrc.includes('fetchPriority="high"'), 'Featured hero image must use fetchPriority="high"');
assert.ok(cardSrc.includes('data-trust-tier="preprint"'), 'Missing preprint trust badge marker on NewsCard');

assert.ok(tabSrc.includes('รวมทุกหมวด'), 'First tab must be labeled รวมทุกหมวด');
assert.ok(tabSrc.includes('ตัวเลขแท็บ ='), 'TabNavigation must clarify tab count scope');

assert.ok(modalSrc.includes('พรีปรินต์ ArXiv'), 'ReaderModal must badge ArXiv preprints clearly');
assert.ok(modalSrc.includes('cleanLegacySectionBody'), 'ReaderModal must clean legacy disclaimer text');

console.log('ALL FRONTEND QA REGRESSION TESTS PASSED (6/6 suites)!');
