-- ==============================================================================
-- Ainews - Seed Mock Data (v2: Image + TL;DR + Key Facts + 5-Dimension Brief)
-- Run this script in Supabase SQL Editor after running supabase/schema.sql
-- ==============================================================================

INSERT INTO public.news_items (
    week_id,
    batch_type,
    status,
    category,
    company_tags,
    image_url,
    image_credit,
    title_th,
    tldr_th,
    key_facts,
    summary_bullets,
    source_urls,
    importance_score,
    cluster_slug,
    published_at
) VALUES
(
    '2026-W47',
    'midweek',
    'verified',
    'models_updates',
    ARRAY['Anthropic'],
    '/mock-media/anthropic-caching.svg',
    'Anthropic Official News',
    'Anthropic เปิดตัวระบบ Prompt Caching แบบ Multi-Turn อัตโนมัติ ลดต้นทุนการประมวลผล Batch API สูงสุด 75%',
    'Anthropic เปิดโหมด Auto-Prefix Prompt Caching ที่ตรวจจับบริบทซ้ำในแชตยาวและงาน Batch ให้อัตโนมัติ ลดต้นทุน Input Tokens สูงสุด 75% และลดเวลาตอบสนองเริ่มต้นลงกว่า 55% โดยไม่ต้องแก้โค้ดกำหนดจุดตัดแคชเองอีกต่อไป',
    '[{"label": "ลดต้นทุน Input", "value": "สูงสุด 75% (~85% ร่วมกับ Batch)"}, {"label": "ลดเวลาตอบแรก (TTFT)", "value": "เร็วขึ้นกว่า 55%"}, {"label": "ขนาดบริบทเป้าหมาย", "value": ">100,000 Tokens"}, {"label": "รุ่นที่รองรับ", "value": "Claude Opus · Sonnet · Haiku"}]'::jsonb,
    '["ที่มาและบริบท: Anthropic อัปเกรดโครงสร้างพื้นฐานของระบบ API ครั้งใหญ่ด้วยการเปิดตัวโหมด Auto-Prefix Prompt Caching สำหรับทั้ง Messages API และ Message Batches API เพื่อแก้ปัญหาคอขวดที่นักพัฒนาและทีมสร้าง Agent ต้องคอยแทรกแท็ก cache_control กำหนดจุดตัดแคชด้วยตัวเองในโค้ดทุกครั้งเมื่อประวัติการสนทนาหรือคลังเอกสารขยายตัวขึ้น", "เจาะลึกสเปกและกลไกเทคนิค: เอนจินฝั่งเซิร์ฟเวอร์จะทำการสแกนและคำนวณ Hash ของโครงสร้าง System Prompt, ชุดนิยามเครื่องมือ (Tool Definitions) และประวัติการสนทนาแบบ Multi-Turn โดยอัตโนมัติในระดับบล็อกข้อมูล หากตรวจพบส่วนนำหน้า (Prefix) ที่ตรงกับสถานะในหน่วยความจำความเร็วสูง ระบบจะดึง KV Cache เดิมมาใช้งานต่อทันทีโดยไม่ต้องคำนวณ Prefill ซ้ำตั้งแต่ต้น", "ตัวเลขและผลเปรียบเทียบ: สำหรับเวิร์กโฟลว์ที่ส่งบริบทขนาดเกิน 100,000 Tokens ระบบแคชอัตโนมัติช่วยลดค่าใช้จ่ายส่วนของ Input Tokens ลงสูงสุดถึง 75% และเมื่อใช้งานควบคู่กับส่วนลดพื้นฐาน 50% ของ Message Batches API จะทำให้ต้นทุนรวมต่อรอบลดลงเกือบ 85% จากราคาปกติ พร้อมลดเวลา Time-to-First-Token (TTFT) ลงมากกว่า 55%", "การเข้าถึงและเงื่อนไขการใช้งาน: เปิดให้ใช้งานทันทีบนโมเดลตระกูล Claude Opus, Claude Sonnet และ Claude Haiku ผ่าน Anthropic API โดยตรง รวมถึงพาร์ตเนอร์คลาวด์หลักในทุกภูมิภาค ไม่มีค่าธรรมเนียมเปิดใช้งานฟีเจอร์เพิ่มเติม และรองรับการเปิดโหมด Extended Thinking ควบคู่กันได้ในคำขอเดียวกัน", "ผลกระทบและข้อสังเกตที่ควรรู้: การเปลี่ยนแปลงนี้ทำให้สถาปัตยกรรม AI Pipeline ที่ต้องส่งข้อมูลซ้ำๆ มีต้นทุนต่ำลงอย่างมีนัยสำคัญ โดยข้อควรระวังเดียวคือนักพัฒนายังควรจัดวางข้อมูลคงที่ไว้ส่วนบนสุดของ Prompt เพื่อให้ระบบจับคู่ Prefix ได้เต็มประสิทธิภาพสูงสุด"]'::jsonb,
    '[{"title": "Anthropic Official News", "url": "https://www.anthropic.com/news", "is_official": true}, {"title": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/", "is_official": false}]'::jsonb,
    10,
    'anthropic-multi-turn-prompt-caching-batch',
    '2026-11-17T16:30:00Z'
),
(
    '2026-W47',
    'midweek',
    'verified',
    'benchmarks_testing',
    ARRAY['DeepSeek', 'Open-Source'],
    '/mock-media/deepseek-sparse.svg',
    'DeepSeek Research / ArXiv cs.CL',
    'งานวิจัย ArXiv เผยสถาปัตยกรรม Sparse Attention รูปแบบใหม่จากทีม DeepSeek ลดภาระหน่วยความจำ KV Cache ลง 68%',
    'ทีมวิจัย DeepSeek เผยแพร่เปเปอร์ Dynamic Block-Sparse Attention บน ArXiv ลดการใช้หน่วยความจำ VRAM ของ KV Cache ลง 68% ที่ความยาว 256K Tokens โดยยังคงความแม่นยำไว้ถึง 99.4% พร้อมปล่อยโค้ด Triton Kernels ฟรี',
    '[{"label": "ลดการใช้ KV Cache", "value": "68% (ประหยัด VRAM)"}, {"label": "ความแม่นยำ 256K Tokens", "value": "99.4% (LongBench/RULER)"}, {"label": "ความเร็วถอดรหัส", "value": "เร็วขึ้น 2.4 เท่า"}, {"label": "สัญญาอนุญาตโค้ด", "value": "Open-Source (Triton Kernels)"}]'::jsonb,
    '["ที่มาและบริบท: ทีมนักวิจัยจาก DeepSeek ตีพิมพ์เปเปอร์ฉบับใหม่บนคลัง ArXiv (หมวด cs.CL) เพื่อแก้ปัญหาคอขวดระดับโครงสร้างของโมเดลภาษาขนาดใหญ่ด้านการใช้หน่วยความจำการ์ดจอ (VRAM) ที่พุ่งสูงขึ้นตามความยาวของบริบท", "เจาะลึกสเปกและกลไกเทคนิค: นำเสนอโครงสร้าง Dynamic Block-Sparse Attention ที่ผสานฮาร์ดแวร์เคอร์เนลเข้ากับการคัดกรองระดับบล็อก โมเดลจะคงสถานะความจำแบบเต็มความละเอียดไว้เฉพาะกลุ่มจุดยึดทางความหมาย (Semantic Anchors) และบีบอัดบล็อกข้อมูลพื้นหลังโดยไม่ต้องฝึกสอนน้ำหนักโมเดลใหม่ทั้งหมด", "ตัวเลขและผลเปรียบเทียบ: จากผลการทดสอบมาตรฐาน LongBench และ RULER ที่ความยาวบริบท 256K Tokens พบว่าโมเดลรักษาความแม่นยำในการดึงข้อมูลเชิงลึกไว้ได้สูงถึง 99.4% เมื่อเทียบกับ Full Attention แต่ลดปริมาณการใช้หน่วยความจำ KV Cache ลงถึง 68% และเร่งความเร็วในการถอดรหัสข้อความขึ้น 2.4 เท่า", "การเข้าถึงและเงื่อนไขการใช้งาน: ทีมวิจัยเปิดเผยเปเปอร์ฉบับเต็มพร้อมซอร์สโค้ดต้นแบบและชุดคำสั่ง Triton Kernels บน GitHub ภายใต้สัญญาอนุญาตแบบเปิด สามารถนำไปประยุกต์เข้ากับเอนจินรันโมเดลยอดนิยมอย่าง vLLM และ SGLang ได้ทันที", "ผลกระทบและข้อสังเกตที่ควรรู้: ก้าวกระโดดนี้ทำให้องค์กรขนาดกลางหรือนักพัฒนาที่มีการ์ดจอจำกัดสามารถรันโมเดล Long-Context ระดับ 256K ได้ในต้นทุนฮาร์ดแวร์ที่ลดลงกว่าครึ่ง อย่างไรก็ตาม การเร่งความเร็วเต็มประสิทธิภาพยังต้องใช้การ์ดจอรุ่นใหม่ที่รองรับชุดคำสั่ง FP8/Triton ล่าสุด"]'::jsonb,
    '[{"title": "ArXiv cs.CL Paper", "url": "https://arxiv.org/list/cs.CL/recent", "is_official": true}, {"title": "DeepSeek GitHub", "url": "https://github.com/deepseek-ai", "is_official": true}]'::jsonb,
    9,
    'deepseek-sparse-attention-kv-cache-arxiv',
    '2026-11-17T08:00:00Z'
),
(
    '2026-W47',
    'midweek',
    'rumor',
    NULL,
    ARRAY['DeepSeek', 'Open-Source'],
    '/mock-media/rumor-deepseek-vllm.svg',
    'r/LocalLLaMA Community Thread',
    '[ข่าวลือ] พบโค้ดอ้างอิงสถาปัตยกรรม DeepSeek-R3-Zero ในกิ่งทดสอบ vLLM คาดใช้ระบบ MoE ความละเอียดสูงแบบ Native FP4',
    'นักพัฒนาบน r/LocalLLaMA พบ Commit ชั่วคราวในคลัง vLLM ที่อ้างถึงโมเดลรหัส dsk_r3_zero พร้อมโครงสร้าง Fine-Grained MoE และ Native FP4 Quantization ก่อนกิ่งโค้ดจะถูกตั้งเป็นส่วนตัว (ยังไม่ยืนยันทางการ)',
    '[{"label": "แหล่งเบาะแส", "value": "r/LocalLLaMA (vLLM Commit)"}, {"label": "ชื่อรหัสที่พบ", "value": "dsk_r3_zero"}, {"label": "สเปกที่คาดการณ์", "value": "Fine-Grained MoE · Native FP4"}, {"label": "สถานะการยืนยัน", "value": "ข่าวลือ — ยังไม่ยืนยันทางการ"}]'::jsonb,
    '["จุดเริ่มต้นของเบาะแส: สมาชิกนักพัฒนาบนคอมมูนิตี้ r/LocalLLaMA ตรวจพบ Commit ชั่วคราวในกิ่งพัฒนาของโปรเจกต์เอนจินรันโมเดล vLLM ซึ่งมีการลงทะเบียนคลาสโมเดลใหม่ชื่อ DeepseekR3ZeroForCausalLM ก่อนที่กิ่งโค้ดดังกล่าวจะถูกปรับสถานะเป็นส่วนตัวในเวลาไม่นาน", "รายละเอียดสเปกที่หลุดออกมา: ไฟล์โครงสร้างใน Commit ระบุถึงสถาปัตยกรรม Fine-Grained Mixture-of-Experts (MoE) ที่เรียกใช้งานผู้เชี่ยวชาญย่อย 8 กลุ่มต่อ Token และมีการกำหนดค่า NativeFP4Config (group_size=128) ซึ่งบ่งชี้ว่าโมเดลอาจถูกฝึกแบบ Native FP4 Quantization ตั้งแต่ออกจากโรงงาน", "หลักฐานและบริบทแวดล้อม: ในอดีตการหลุดชื่อรหัสโมเดลในคลังโอเพนซอร์สอย่าง vLLM หรือ SGLang มักเกิดขึ้นล่วงหน้า 2–4 สัปดาห์ก่อนการปล่อยน้ำหนักโมเดลจริง เพื่อให้เอนจินรันโมเดลรองรับตั้งแต่วันแรกที่เปิดตัว", "ผลกระทบที่คาดการณ์: หากข่าวลือนี้เป็นจริง การรองรับ Native FP4 ตั้งแต่ออกแบบจะช่วยลดความต้องการหน่วยความจำการ์ดจอลงเกือบครึ่งหนึ่งเทียบกับ FP8 ทำให้ผู้ใช้งานการ์ดจอระดับ Consumer หรือเวิร์กสเตชันขนาดเล็กสามารถรันโมเดลระดับเรือธงได้ง่ายขึ้นมาก", "ระดับความน่าเชื่อถือและข้อควรระวัง: แม้จะมีหลักฐานภาพบันทึกโค้ด Diff จากหลายบัญชีบน Reddit แต่จนถึงขณะนี้ยังไม่มีแถลงการณ์หรือการยืนยันกำหนดการใดๆ จากทีมงาน DeepSeek และอาจเป็นเพียงการทดสอบทดลองภายในที่ไม่ได้ปล่อยสู่สาธารณะก็ได้"]'::jsonb,
    '[{"title": "r/LocalLLaMA (Flair: Rumor/Leak)", "url": "https://www.reddit.com/r/LocalLLaMA/", "is_official": false}]'::jsonb,
    9,
    'rumor-deepseek-r3-zero-vllm-commit',
    '2026-11-17T20:10:00Z'
)
ON CONFLICT (week_id, batch_type, cluster_slug) DO UPDATE SET
    image_url = EXCLUDED.image_url,
    image_credit = EXCLUDED.image_credit,
    title_th = EXCLUDED.title_th,
    tldr_th = EXCLUDED.tldr_th,
    key_facts = EXCLUDED.key_facts,
    summary_bullets = EXCLUDED.summary_bullets,
    source_urls = EXCLUDED.source_urls,
    importance_score = EXCLUDED.importance_score,
    updated_at = NOW();
