-- 준공년도 (예: 2002)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS completion_year TEXT;
