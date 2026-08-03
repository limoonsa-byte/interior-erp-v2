-- 회사별 현장 인부 DB (현장 인부 DB 페이지에서 사용)
CREATE TABLE IF NOT EXISTS company_workers (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  memo TEXT,
  rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
  bank_account TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_workers_company_id ON company_workers(company_id);
