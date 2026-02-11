-- 시공예산 (원 단위 숫자 저장)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS budget TEXT;
