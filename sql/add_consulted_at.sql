-- 상담일시 저장용 컬럼 추가 (Vercel/Neon SQL Editor에서 한 번 실행)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT;
