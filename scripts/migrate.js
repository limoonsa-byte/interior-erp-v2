/**
 * 배포(빌드) 시 자동 실행되는 DB 마이그레이션.
 * Vercel 빌드 시 환경변수 POSTGRES_URL 등이 있으면 실행됩니다.
 * 로컬에서는 .env.local 을 자동으로 읽습니다.
 */
const fs = require("fs");
const path = require("path");

// 로컬 실행 시 .env.local 또는 .env 로드 (POSTGRES_URL 등)
function loadEnvFile(filename) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return false;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    });
    return true;
  } catch (_) {
    return false;
  }
}
if (loadEnvFile(".env.local")) console.log("[migrate] .env.local 로드함");
else if (loadEnvFile(".env")) console.log("[migrate] .env 로드함");

// Vercel Postgres는 POSTGRES_URL 사용. DATABASE_URL만 있으면 그대로 사용
if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

const { sql } = require("@vercel/postgres");

async function migrate() {
  // POSTGRES_URL이 없으면 마이그레이션 건너뛰기
  if (!process.env.POSTGRES_URL) {
    console.log("[migrate] POSTGRES_URL이 없어서 마이그레이션을 건너뜁니다.");
    console.log("[migrate] .env.local 또는 .env에 POSTGRES_URL= 또는 DATABASE_URL= 을 넣은 뒤 다시 실행하세요.");
    console.log("[migrate] 로컬: node scripts/migrate.js");
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
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_at TEXT`;
    console.log("[migrate] contract_meeting_at OK");
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_at TEXT`;
    console.log("[migrate] design_meeting_at OK");
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
    await sql`ALTER TABLE estimates ADD COLUMN IF NOT EXISTS process_order TEXT`;
    console.log("[migrate] estimates process_order OK");
    await sql`
      CREATE TABLE IF NOT EXISTS env_backup (
        id INT PRIMARY KEY DEFAULT 1,
        content TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`INSERT INTO env_backup (id, content) VALUES (1, '') ON CONFLICT (id) DO NOTHING`;
    console.log("[migrate] env_backup OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_custom_menu (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        href TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
      )
    `;
    console.log("[migrate] company_custom_menu OK");
    await sql`
      CREATE TABLE IF NOT EXISTS company_estimate_templates (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        items TEXT NOT NULL DEFAULT '[]',
        process_order TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log("[migrate] company_estimate_templates OK");
    console.log("[migrate] 완료");
  } catch (err) {
    console.error("[migrate] 실패:", err.message);
    process.exit(1);
  }
  process.exit(0);
}

migrate();
