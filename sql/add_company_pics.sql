-- 회사별 담당자 목록 (관리 > 담당자 설정에서 사용)
CREATE TABLE IF NOT EXISTS company_pics (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  UNIQUE(company_id, name)
);
