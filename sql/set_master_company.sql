-- 1) is_master 컬럼이 없으면 추가 (한 번만 필요)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_master BOOLEAN NOT NULL DEFAULT false;

-- 2) 마스터로 쓸 회사 지정 (아래 id = 1 을 원하는 회사 id로 바꾼 뒤 실행)
-- 회사 목록 확인: SELECT id, code, name FROM companies;
UPDATE companies SET is_master = false;
UPDATE companies SET is_master = true WHERE code = 'orointerior';
