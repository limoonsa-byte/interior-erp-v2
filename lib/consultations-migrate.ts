import { sql } from "@vercel/postgres";

/**
 * consultations 테이블에 필요한 컬럼이 없으면 자동 추가.
 * Vercel/Neon SQL 에디터에서 수동 실행할 필요 없음.
 */
export async function ensureConsultationsColumns() {
  const alters: Promise<unknown>[] = [
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS budget TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS completion_year TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS construction_start_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS move_in_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_phases TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS site_measurement_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS estimate_meeting_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_meeting_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS material_ordered_at TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS contract_meeting_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS design_meeting_done BOOLEAN DEFAULT false`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS email TEXT`,
  ];
  await Promise.all(alters);
}
