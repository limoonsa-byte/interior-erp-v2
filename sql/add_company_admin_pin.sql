-- 회사별 관리 비밀번호 (숫자 4자리)
CREATE TABLE IF NOT EXISTS company_admin_pin (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  pin TEXT NOT NULL
);
