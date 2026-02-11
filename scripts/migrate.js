/**
 * 배포(빌드) 시 자동 실행되는 DB 마이그레이션.
 * Vercel 빌드 시 환경변수 POSTGRES_URL 등이 있으면 실행됩니다.
 */
const { sql } = require("@vercel/postgres");

async function migrate() {
  // POSTGRES_URL이 없으면 마이그레이션 건너뛰기
  if (!process.env.POSTGRES_URL) {
    console.log("[migrate] POSTGRES_URL이 없어서 마이그레이션을 건너뜁니다.");
    console.log("[migrate] Vercel에서 데이터베이스를 연결한 후 다시 배포하세요.");
    process.exit(0);
  }

  try {
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT`;
    console.log("[migrate] consulted_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT`;
    console.log("[migrate] scope OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_pics (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        UNIQUE(company_id, name)
      )
    `;
    console.log("[migrate] company_pics OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_admin_pin (
        company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        pin TEXT NOT NULL
      )
    `;
    console.log("[migrate] company_admin_pin OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS budget TEXT`;
    console.log("[migrate] budget OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS completion_year TEXT`;
    console.log("[migrate] completion_year OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_at TEXT`;
    console.log("[migrate] site_measurement_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_at TEXT`;
    console.log("[migrate] estimate_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_at TEXT`;
    console.log("[migrate] material_meeting_at OK");
    await sql`ALTER TABLE consultations DROP COLUMN IF EXISTS region`;
    console.log("[migrate] region 컬럼 제거 OK");
    await sql`
      CREATE TABLE IF NOT EXISTS estimates (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        consultation_id INT REFERENCES consultations(id) ON DELETE SET NULL,
        customer_name TEXT,
        contact TEXT,
        address TEXT,
        title TEXT,
        estimate_date DATE,
        note TEXT,
        items TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] estimates OK");
    console.log("[migrate] 완료");
  } catch (err) {
    console.error("[migrate] 실패:", err.message);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
