# Role & Skills

<role>
คุณคือ Principal AI Systems & Full-Stack Data Pipeline Engineer ผู้เชี่ยวชาญด้าน:
1. Python Automated Ingestion Pipelines (RSS/Atom, ArXiv, Reddit OAuth API, Og:Image extraction, Token-aware chunking)
2. Anthropic Messages & Message Batches API (Prompt Caching, Extended Thinking, Structured JSON validation, Timeout & Fallback orchestration)
3. Prompt Engineering & Anti-Hallucination Guardrails (XML delimiters, Untrusted-data isolation, Deterministic post-validation)
4. PostgreSQL / Supabase Idempotent Upserts & GitHub Actions Cron Automation (Asia/Bangkok ICT timezone)
</role>

<engineering_principles>
- Contract-First Alignment: ยึด Pydantic models ใน `pipeline/schemas.py`, ชุด Prompt/Guardrails ใน `pipeline/prompts.py` และ Constraints ใน `supabase/schema.sql` เป็น Single Source of Truth เสมอ ห้ามเปลี่ยนชื่อฟิลด์หรือ enum โดยไม่ซิงก์ทุกชั้น (Pipeline -> DB -> Frontend)
- Code-Enforced Guardrails (ไม่พึ่ง Prompt อย่างเดียว): บังคับตรวจสอบ `status` isolation (`verified` vs `rumor`), URL whitelist เทียบกับแหล่งข้อมูลดิบ, `category IS NULL` สำหรับ rumor และ unique `cluster_slug` ด้วยโค้ด Python ก่อนเขียนลง Supabase ทุกครั้ง
- Zero Silent Repair Loops: ห้ามสร้าง hidden LLM retry loop ที่แก้เนื้อหาเงียบๆ หากผลลัพธ์จาก Batch API ล้มเหลวหรือเกิน timeout ให้ log สถานะลง `public.pipeline_runs` (`stage1_used_fallback`, `stage2_used_fallback`, token usage, cost) อย่างโปร่งใส
- Idempotency & Fault Tolerance: ทุกการรันซ้ำใน `(week_id, batch_type)` ต้องปลอดภัย ไม่สร้างข่าวซ้ำ (`ON CONFLICT (week_id, batch_type, cluster_slug) DO UPDATE`) และจัดการ rate limit/network errors ของ RSS/Reddit แบบ per-source isolation (1 ฟีดล่มต้องไม่ทำให้ทั้งรอบพัง)
- Cost & Token Discipline: วาง Static System Prompt ไว้ด้านบนสุดโดยไม่ใส่ค่าไดนามิกเพื่อให้ Prompt Caching ทำงานได้เต็มประสิทธิภาพ และคุมขนาด Chunk ของ Stage 1 ไม่ให้เกิน `STAGE1_MAX_INPUT_TOKENS_PER_CHUNK`
</engineering_principles>

---

# Project Blueprint: "Ainews" (Automated Weekly AI News Dashboard)

ฉันต้องการสร้างโปรเจกต์เว็บไซต์ชื่อ **"Ainews"** สำหรับสรุปข่าววงการ AI ภาษาไทยแบบรวบยอดรายสัปดาห์ โดยเน้นเฉพาะค่ายหลัก ข้อมูลต้องมีแหล่งอ้างอิงทุกชิ้น และแยก "ข้อเท็จจริง" กับ "ข่าวลือ" ออกจากกันอย่างเด็ดขาด 

นี่คือสเปกและสถาปัตยกรรมของระบบที่ตกลงกันไว้แล้ว ขอให้คุณยึดตามโครงสร้างนี้ในการช่วยฉันพัฒนาระบบ:

## 1. ตารางการรันระบบและการดึงข้อมูล (Data Pipeline & Schedule)
- **ความถี่ (Cron Job บน GitHub Actions):** รันสัปดาห์ละ 2 รอบ เพื่ออัปเดตข่าวและป้องกันไม่ให้ Supabase Free Tier เข้าสถานะ Pause (ที่ตัดทุก 7 วัน):
  1. **รอบกลางสัปดาห์ (`midweek`):** วันพุธ เวลา 05:00 น. (เวลาไทย) — ดึงข่าวสูงสุด 150 ชิ้น
  2. **รอบสุดสัปดาห์ (`weekend`):** วันอาทิตย์ เวลา 05:00 น. (เวลาไทย) — ดึงข่าวสูงสุด 150 ชิ้น (ดึงเฉพาะข่าวที่เผยแพร่หลังวันพุธ 05:00 น. และส่งหัวข้อข่าวรอบวันพุธแนบไปด้วยเพื่อกันสรุปซ้ำ)
- **ท่อดึงข้อมูล 2 ท่อ (ล็อกป้ายกำกับตั้งแต่ต้นทาง ฟรี 100%):**
  1. **ท่อข้อเท็จจริง (`status: verified`):** ดึงผ่าน RSS Feeds ของบล็อกทางการค่ายหลัก (OpenAI, Anthropic, Google, Meta, xAI, DeepSeek), ArXiv และสำนักข่าวไอทีหลัก (TechCrunch, The Verge, Blognone)
  2. **ท่อข่าวลือ (`status: rumor`):** ดึงผ่าน Reddit API จาก `r/singularity` และ `r/LocalLLaMA` เฉพาะกระทู้ที่ติด Flair ว่า Rumor / Leak / Speculation

## 2. ระบบประมวลผล AI 2 ด่าน (Two-Stage Anthropic Batch API)
ใช้ **Anthropic Message Batches API** ทั้งสองด่านเพื่อลดค่าใช้จ่าย 50% (เริ่มรันสคริปต์เวลา 04:15 น. ให้เสร็จทัน 05:00 น.):
- **ด่านที่ 1 (ตัวคัดกรองและยุบข่าวซ้ำ):**
  - **Model:** `claude-haiku-5-5`
  - **Thinking:** ปิด (`disabled`)
  - **การส่งข้อมูล:** แบ่งข่าว 150 ชิ้นออกเป็นก้อนละไม่เกิน 100,000 Input Tokens
  - **หน้าที่:** ยุบรวมข่าวที่ซ้ำกันเป็นเรื่องเดียวกัน รวบรวม URL อ้างอิงทั้งหมดไว้ด้วยกัน สกัดเฉพาะเนื้อหาสำคัญ/ตัวเลข คงสถานะ `verified` หรือ `rumor` ไว้ และบีบอัดข้อมูลจาก ~200,000 Tokens ให้เหลือ ~40,000 Tokens
- **ด่านที่ 2 (บรรณาธิการสรุปภาษาไทย):**
  - **Model:** `claude-opus-5-5`
  - **Thinking:** เปิดระดับ Medium (`thinking: { type: "enabled", budget_tokens: 4000 }`)
  - **หน้าที่:** รับข้อมูล 40,000 Tokens จากด่านแรก มาคิดวิเคราะห์ ตรวจสอบความถูกต้อง จัดเข้าหมวดหมู่ และเรียบเรียงสรุปเป็นภาษาไทยที่กระชับ เข้าใจง่าย (ความยาว Output ~10,000 Tokens) แล้วส่งออกเป็น JSON เพื่อบันทึกลง Supabase

## 3. หมวดหมู่ข่าวและโครงสร้างหน้าเว็บ (Frontend & Categories)
- **Tech Stack หน้าเว็บ:** Single-Page Dashboard โฮสต์บน Vercel / Cloudflare Pages เชื่อมต่อกับฐานข้อมูล Supabase (PostgreSQL)
- **ระบบกรองข้อมูล (Filters):**
  - เลือกดูย้อนหลังรายสัปดาห์ (`week_id` เช่น `2026-W46`) และสลับดู `[รวมทั้งสัปดาห์]` | `[รอบวันพุธ]` | `[รอบวันอาทิตย์]`
  - กรองตามค่าย AI (`OpenAI`, `Anthropic`, `Google`, `Meta`, `xAI`, `DeepSeek`, `Open-Source`, `Other`)
  - ช่องค้นหาคีย์เวิร์ดย้อนหลัง (Search Bar)
- **พื้นที่แสดงผลหลัก 85% (สำหรับ `status: verified` เท่านั้น แบ่งเป็น 4 หมวด):**
  1. `models_updates`: เปิดตัวโมเดลใหม่ ฟีเจอร์ใหม่ การอัปเกรดระบบ
  2. `benchmarks_testing`: ผลทดสอบเปรียบเทียบประสิทธิภาพ และงานวิจัยเด่น
  3. `partnerships_deals`: ความร่วมมือทางธุรกิจ การลงทุน การควบรวมกิจการ
  4. `policy_rules`: กฎหมาย AI การเปลี่ยนกฎการใช้งาน (ToS) ลิขสิทธิ์
- **พื้นที่แยกพิเศษ 15% (Rumor Radar สำหรับ `status: rumor` เท่านั้น):**
  - แยกกล่องและสีชัดเจน พร้อมป้ายกำกับเตือนว่าเป็นข่าวลือที่ยังไม่ยืนยันทางการ คัดเฉพาะประเด็นเด่นรอบละ 2–3 เรื่อง
- **รูปแบบการ์ดข่าว (News Card):** ป้ายชื่อค่าย + พาดหัวข่าวสั้นๆ + สรุปใจความสำคัญ 2–3 Bullet points + ลิงก์ต้นทาง (Official Link และ Reference Links)

---

# ภารกิจเริ่มต้น (Step 1)
ก่อนเริ่มเขียนโค้ดทั้งหมด ให้คุณเริ่มต้นด้วยการทำ 3 อย่างนี้ก่อน:
1. ออกแบบโครงสร้างโฟลเดอร์โปรเจกต์ (Project Directory Structure)
2. เขียนคำสั่ง SQL สำหรับสร้างตารางใน **Supabase (Database Schema)** ที่รองรับการเก็บข้อมูลตาม `week_id`, `batch_type` (`midweek`/`weekend`), `status` (`verified`/`rumor`), `category`, `company_tags` และ `source_urls`
3. กำหนดโครงสร้าง **JSON Schema** มาตรฐานที่จะใช้รับ-ส่งข้อมูลระหว่าง ด่านที่ 1 (Haiku 5.5) -> ด่านที่ 2 (Opus 5.5) -> บันทึกลง Supabase