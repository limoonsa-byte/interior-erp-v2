-- ============================================================
-- Vercel / Neon SQL Editor에 전부 복사해서 붙여넣은 뒤 [Run] 한 번에 실행
-- ============================================================

-- 1) 상담일시
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT;

-- 2) 시공범위 체크 항목
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT;

-- 3) 담당자 설정용 테이블
CREATE TABLE IF NOT EXISTS company_pics (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(company_id, name)
);
ALTER TABLE company_pics ADD COLUMN IF NOT EXISTS phone TEXT;

-- 4) 관리 비밀번호 (숫자 4자리)
CREATE TABLE IF NOT EXISTS company_admin_pin (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  pin TEXT NOT NULL
);

-- 5) 시공예산
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS budget TEXT;

-- 6) 준공년도
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS completion_year TEXT;

-- 7) 현장실측날짜
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_at TEXT;

-- 8) 견적미팅날짜
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_at TEXT;

-- 9) 자재/계약서/디자인 미팅날짜
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_at TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_at TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_at TEXT;

-- 10) 각 날짜별 완료 플래그 (체크 완료용)
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_done BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_done BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_done BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_done BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_done BOOLEAN DEFAULT false;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_done BOOLEAN DEFAULT false;

-- 11) region 컬럼 제거 (선택 사항, 앱에서 미사용)
ALTER TABLE consultations DROP COLUMN IF EXISTS region;

-- 12) 회사별 도면 보관함 API URL
ALTER TABLE companies ADD COLUMN IF NOT EXISTS drawing_list_api_url TEXT;
