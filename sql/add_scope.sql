-- 시공범위 체크 항목 저장 (JSON 배열 문자열)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT;
