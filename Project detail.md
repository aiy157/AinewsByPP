# Project Blueprint: "Ainews" (Automated Daily Thai AI News Dashboard)

โปรเจกต์เว็บไซต์ **"Ainews"** สำหรับสรุปและวิเคราะห์ข่าววงการ AI ภาษาไทยแบบอัปเดตรายวันระดับมาตรฐานวารสารสากล เน้นค่ายหลักและงานวิจัยสำคัญ มีแหล่งอ้างอิงทุกชิ้น ดึงภาพปกจริงจากแหล่งข่าว แยก **"ข้อเท็จจริง (`verified`)"** กับ **"ข่าวลือ (`rumor`)"** ออกจากกันอย่างเด็ดขาดตั้งแต่ต้นทางจนถึงหน้าเว็บ พร้อมระบบ **เทียบข่าวลือกับข่าวจริง 3 ทาง** เพื่อลบข่าวลือเก่าอัตโนมัติทันทีที่มีประกาศทางการยืนยัน

---

## 1. ตารางการรันระบบและการดึงข้อมูล (Data Pipeline & Schedule)

- **ความถี่ (Cron Job บน GitHub Actions — `.github/workflows/daily_news_pipeline.yml`):**
  - รันอัตโนมัติ **ทุกวัน เวลา 04:23 น. (ICT)** (`cron: '23 21 * * *'` UTC — นาทีนอกพีคเพื่อลดโอกาส GitHub Actions ข้ามรอบ) ให้เสร็จทัน **05:00 น.** ทุกเช้า (และป้องกัน Supabase Free Tier เข้าสถานะ Pause อัตโนมัติ)
  - ดึงข่าวย้อนหลัง **28 ชั่วโมง** (24 ชม. + บัฟเฟอร์ 4 ชม. กันข่าว RSS ดีเลย์) คู่กับระบบ **Zero-Cost URL Pre-Dedup** ที่คัดลิงก์ข่าวซึ่งเคยบันทึกใน Supabase แล้วออกก่อนส่งเข้า AI (หากวันไหนไม่มีข่าวใหม่จะจบงานทันทีโดยเสีย `$0`)
  - จัดกลุ่มเก็บลงฐานข้อมูลตาม ISO Week (`YYYY-WNN`) และ `batch_type` (`midweek` จ.–พฤ. / `weekend` ศ.–อา.) เพื่อให้ใช้งานร่วมกับ Schema เดิมโดยไม่ต้อง Migrate ฐานข้อมูล
- **โควตาข่าวต้นทางสูงสุด 150 ชิ้นต่อรอบ (แบ่งสัดส่วน 125 : 25 และล็อก `status` ตั้งแต่ต้นทาง ฟรี 100%):**
  1. **ท่อข้อเท็จจริง (`status: verified`, สูงสุด 125 ชิ้น — `pipeline/ingestion/rss_fetcher.py`):**
     ดึงตรงจาก RSS Feeds ทั้งหมด 15 แหล่งโดยไม่ตัดด้วย Keyword ใน Python (ปล่อยให้ด่าน 1 คัดแยกอย่างแม่นยำ):
     - **บล็อกทางการค่ายหลัก:** OpenAI Official News, Anthropic Official News & Engineering Blog, Google DeepMind Blog, Google AI Blog, Meta AI Research & Engineering, xAI Official Releases, DeepSeek Official Releases (GitHub), Hugging Face Official Blog
     - **งานวิจัยและผลทดสอบ:** ArXiv (`cs.AI`, `cs.CL`, `cs.LG`) พร้อมจำกัดสัดส่วนไม่ให้ล้นทับบล็อกค่ายหลัก
     - **สื่อไอทีหลัก:** TechCrunch AI, The Verge AI, Blognone
  2. **ท่อข่าวลือ (`status: rumor`, สูงสุด 25 ชิ้น — `pipeline/ingestion/community_rumor_fetcher.py`):**
     - ดึงจาก **Hacker News Official Algolia API** และ **Lobste.rs AI Community** (เปิดฟรีเป็นทางการ 100% ไม่ต้องขอ API Key และไม่โดนบล็อกบน GitHub Actions) คัดกรองเฉพาะประเด็น AI ที่มีสัญญาณ Rumor/Leak/Speculation หรือกระแสถกเถียงสูง
     - รองรับ **Reddit Official OAuth2 (`oauth.reddit.com`)** อัตโนมัติผ่าน `pipeline/ingestion/reddit_fetcher.py` หากมีการใส่ `REDDIT_CLIENT_ID` และ `REDDIT_CLIENT_SECRET` ในอนาคต
- **ระบบดึงภาพข่าว 3 ด่าน (`pipeline/ingestion/image_extractor.py`, ฟรี 100%):**
  1. **ด่านที่ 1:** ดึงภาพจาก RSS (`media:content`, `media:thumbnail`, `enclosures`, `<img>`)
  2. **ด่านที่ 2:** อ่านเฉพาะ HTML `<head>` แบบขนานเพื่อดึง `<meta property="og:image">` / `twitter:image` (เก็บเป็น External URL `image_url` + `image_credit`)
  3. **ด่านที่ 3:** ข่าวที่ไม่มีภาพจริง (เช่น ArXiv) ให้ `image_url = NULL` โดยไม่ใส่ภาพ Stock ปลอม และฝั่งหน้าเว็บมี `referrerPolicy="no-referrer"` + `onError` ซ่อนภาพอัตโนมัติ

---

## 2. ระบบประมวลผล AI 2 ด่าน + Guardrails (`pipeline/prompts.py` & `pipeline/ai_processor/`)

ใช้ **Anthropic Message Batches API** (ลดต้นทุน 50%) คู่กับ **Prompt Caching (`cache_control: ephemeral`)** และ **XML Sandboxing** ป้องกัน Prompt Injection พร้อมระบบ **Option 3B Explicit Timeout Fallback** (`batch_client.py`): หากด่านใดรอคิวเกิน 20 นาที ระบบจะสั่ง `batches.cancel()` ทันที เก็บผลลัพธ์ก้อนที่เสร็จแล้วมาใช้ (ไม่จ่ายซ้ำ 2 เด้ง) แล้วรันเฉพาะก้อนที่เหลือด้วย Standard `messages.create` เพื่อให้ข่าวออกทัน 05:00 น. เสมอ

- **ด่านที่ 1 (`pipeline/ai_processor/stage1_haiku.py` — ตัวคัดกรอง ยุบข่าวซ้ำ และสกัดข้อเท็จจริงแบบไม่ตัดทอน):**
  - **Model:** `claude-haiku-5-5` (ตั้งค่าผ่าน `.env` / GitHub Vars: `STAGE1_MODEL`)
  - **Thinking:** ปิด (`thinking: { type: "disabled" }`)
  - **การแบ่งก้อน:** แยกก้อน `verified` และ `rumor` ออกจากกันเด็ดขาด ก้อนละไม่เกิน `30` ข่าว / `100,000` Input Tokens (`max_tokens: 32768`)
  - **หน้าที่ & Audit Gate 1:** ตัดข่าวนอกเรื่องทิ้ง ยุบข่าวเรื่องเดียวกัน รวม URL อ้างอิงทั้งหมด คัดเลือก `image_url` จริง 1 ภาพ สกัดข้อเท็จจริงเชิงลึก 5–10 ข้อโดยไม่ตัดทอนตัวเลข/สเปก และตรวจสอบผ่าน `parse_and_audit_stage1()` + Whitelist URL/รูปภาพในโค้ด
- **ด่านที่ 2 (`pipeline/ai_processor/stage2_opus.py` — บรรณาธิการเรียบเรียงบทวิเคราะห์ 5 มิติภาษาไทย + เทียบข่าวลือ/ข่าวจริง):**
  - **Model:** `claude-sonnet-5-5` (ค่าเริ่มต้นรายวันเพื่อคุมต้นทุนราว `$4–$6/เดือน`; สามารถเปลี่ยนเป็น `claude-opus-5-5` ผ่าน `STAGE2_MODEL`)
  - **Thinking:** Claude 5.5 Native Adaptive Thinking (`thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`, `max_tokens: 40000`)
  - **หน้าที่ & ระบบเทียบข่าวลือ-ข่าวจริง 3 ทาง:**
    1. แนบหัวข้อข่าวที่เผยแพร่แล้วในช่วง 7 วันล่าสุดทั้ง `verified` และ `rumor` (`<prior_published_topics>`) เข้าไปกันสรุปข่าวซ้ำข้ามวัน
    2. ตัดข่าวลือทิ้งทันทีหากเรื่องเดียวกันถูกยืนยันเป็นข่าวจริงแล้ว (ทั้งในรอบเดียวกันหรือเคยลงเป็นข่าวจริงไปก่อนหน้า)
    3. **Rumor Graduation:** หากข่าวจริงวันนี้ยืนยันข่าวลือเก่าที่เคยขึ้นบน Rumor Radar แล้ว ระบบจะส่ง `superseded_rumor_slugs` กลับมาให้โค้ด Python ตรวจสอบ Whitelist (`status='rumor'` เท่านั้น) แล้วลบข่าวลือเก่าออกจาก Supabase อัตโนมัติ ไม่ให้แสดงซ้ำซ้อน
    4. เรียบเรียงเป็น **บทความเจาะลึก 4 ชั้น 5 มิติ** และตรวจสอบผ่าน `parse_and_audit_stage2()` (เช็ค 5 หัวข้อย่อยภาษาไทย, กัน Markdown หลุด, ล็อก `status`/`category` และ Provenance ของ URL/รูปภาพ)

---

## 3. โครงสร้างข้อมูลข่าว 4 ชั้น 5 มิติ และฐานข้อมูล (`supabase/schema.sql`)

ข้อมูลข่าวทุกชิ้นในตาราง `public.news_items` (และ Log การรัน/ค่าใช้จ่ายใน `public.pipeline_runs`) ประกอบด้วย 4 ชั้นข้อมูล:
1. **ส่วนหัวและภาพประกอบ:** `title_th` (พาดหัว), `tldr_th` (บทสรุปสั้น 1–2 ประโยคสำหรับคำโปรยบนการ์ด), `image_url` และ `image_credit`
2. **แถบสรุปข้อเท็จจริงเร็ว (`key_facts` JSONB):** คู่ข้อมูล 3–4 ช่อง (`{label, value}`) สไตล์ Bloomberg / Economist
3. **บทวิเคราะห์เจาะลึก 5 มิติ (`summary_bullets` JSONB):**
   - **ข่าวจริง (`verified`):** `ที่มาและบริบท:`, `เจาะลึกสเปกและกลไกเทคนิค:`, `ตัวเลขและผลเปรียบเทียบ:`, `การเข้าถึงและเงื่อนไขการใช้งาน:`, `ผลกระทบและข้อสังเกตที่ควรรู้:`
   - **ข่าวลือ (`rumor`):** `จุดเริ่มต้นของเบาะแส:`, `รายละเอียดสเปกที่หลุดออกมา:`, `หลักฐานและบริบทแวดล้อม:`, `ผลกระทบที่คาดการณ์:`, `ระดับความน่าเชื่อถือและข้อควรระวัง:`
4. **ตารางแหล่งอ้างอิง (`source_urls` JSONB):** แยก `is_official: true` (Official) และ `is_official: false` (Reference / Community) ครบทุกแหล่ง

- **ฐานข้อมูล & ความปลอดภัย:** มี B-Tree Index สำหรับ `(week_id, batch_type, status, category, importance_score DESC)`, GIN Index สำหรับ `company_tags` (`TEXT[]`) และ `source_urls`, Trigram Index สำหรับ Search Bar ค้นหาภาษาไทย และเปิด **RLS Policy** ให้สิทธิ์ `SELECT` แบบ Public Read-only เท่านั้น

---

## 4. หน้าเว็บ Dashboard ระดับสากล (`frontend/` — React + TypeScript + Tailwind CSS)

- **ดีไซน์มาตรฐานวารสารสากล (International Broadsheet × Swiss Digital Grid):**
  - รองรับปุ่มสลับ **โหมดสว่างถนอมสายตา (Archival Warm Paper `#F7F6F2`)** และ **โหมดมืด (Graphite Print `#0F1115`)**
  - คู่ฟอนต์ **`Newsreader`** (หัวหนังสือ) + **`Anuphan`** (พาดหัวไทย) + **`Sarabun` / `IBM Plex Sans Thai`** (เนื้อหาเจาะลึก) พร้อมปุ่มปรับขนาดตัวอักษร 3 ระดับ (`ก` / `ก+` / `ก++`)
- **ระบบนำทางแบบแท็บแยกแต่ละหน้า + ตัวกรองครบมิติ:**
  - แท็บ **`หน้าแรกทั้งหมด`** (แบ่งสัดส่วน Lead Briefing + 4 หมวดข่าวจริงด้านซ้าย และคอลัมน์ Rumor Radar เส้นประด้านขวา)
  - แท็บเฉพาะ 4 หมวดข่าวจริง: `models_updates` (โมเดล & ระบบ), `benchmarks_testing` (ผลทดสอบ & วิจัย), `partnerships_deals` (ดีล & การลงทุน), `policy_rules` (กฎหมาย & นโยบาย)
  - แท็บเฉพาะ **`Rumor Radar`** รวมข่าวลือไว้หน้าเดียวกันโดยไม่แยกหมวดหมู่ย่อย
  - ตัวกรอง `week_id` ย้อนหลัง (เลือกสัปดาห์ล่าสุดให้อัตโนมัติ), สลับช่วง `[รวมทั้งสัปดาห์]` | `[ต้นสัปดาห์ (จ.–พฤ.)]` | `[ปลายสัปดาห์ (ศ.–อา.)]`, กรองค่าย AI (`OpenAI`, `Anthropic`, `Google`, `Meta`, `xAI`, `DeepSeek`, `Open-Source`, `Other`), ช่องค้นหาคีย์เวิร์ด, และเรียงลำดับตาม `importance_score` จากมากไปน้อย
- **ประสบการณ์อ่านแบบการ์ดเล็ก → เด้งหน้าต่างอ่านฉบับเต็ม:**
  - หน้าหลักแสดงการ์ดขนาดกะทัดรัด (พาดหัว + `tldr_th` + ภาพปก 16:9 เฉพาะข่าวที่มีรูป + แหล่งอ้างอิง)
  - คลิกการ์ดใบใดก็ได้เพื่อเปิด **`ReaderModal`** อ่านเนื้อหาเจาะลึก 5 มิติครบถ้วน พร้อมแถบ `Key Facts`, ตารางแหล่งอ้างอิง, ปุ่มคัดลอกบทสรุป, ปุ่มบันทึกข่าว (`ที่บันทึกไว้`), และเลื่อนข่าวก่อนหน้า/ถัดไปด้วยปุ่มหรือคีย์บอร์ด (`← / → / Esc`)

---

## 5. สถานะการพัฒนาและโหมดทดสอบ

- **โครงสร้างทั้งหมดสร้างเสร็จและทดสอบครบแล้ว:**
  - โหมด **`--dry-run`** (`python -m pipeline.main --dry-run`): ทดสอบดึงข่าวสดจาก 15 RSS Feeds + Hacker News + Lobste.rs + ภาพปก 3 ด่านได้จริงโดยไม่เสียค่า AI (`$0`)
  - ตัวตรวจฐานข้อมูล (`python -m pipeline.db.check_connection`): ยืนยันการเชื่อมต่อ Supabase และความพร้อมของตาราง
  - ฝั่งหน้าเว็บ (`frontend/`): เชื่อมต่อ Supabase สดอัตโนมัติ (และมี Mock Data สำรองหากฐานข้อมูลยังว่าง) พร้อม Build ขึ้น Vercel / Cloudflare Pages ทันที
