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
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_list_color TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS schedule_memo TEXT`,
    sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS title TEXT`,
  ];
  await Promise.all(alters);
}

/**
 * 상담 프로젝트 제목이 비어 있으면 메인 견적 제목으로 채우고,
 * 이후 연결된 메인 견적 title을 상담 제목과 맞춘다.
 * (추가견적 제목은 유지 — 목록 표시는 displayTitle/상담 제목 우선)
 */
export async function syncEstimateTitlesFromConsultations(companyId: number) {
  try {
    // 1) 상담 제목 비어 있으면 메인 견적 제목으로 채움
    await sql`
      UPDATE consultations c
      SET title = sub.title
      FROM (
        SELECT DISTINCT ON (e.consultation_id)
          e.consultation_id,
          e.title
        FROM estimates e
        WHERE e.company_id = ${companyId}
          AND e.consultation_id IS NOT NULL
          AND e.title IS NOT NULL
          AND TRIM(e.title) <> ''
          AND e.title NOT ILIKE ${"%추가견적%"}
          AND e.title NOT ILIKE ${"%추가 견적%"}
        ORDER BY e.consultation_id, e.id ASC
      ) sub
      WHERE c.id = sub.consultation_id
        AND c.company_id = ${companyId}
        AND (c.title IS NULL OR TRIM(c.title) = '')
    `;

    // 2) 상담 제목 → 메인 견적 title 동기화
    await sql`
      UPDATE estimates e
      SET title = c.title
      FROM consultations c
      WHERE e.consultation_id = c.id
        AND e.company_id = ${companyId}
        AND c.company_id = ${companyId}
        AND c.title IS NOT NULL
        AND TRIM(c.title) <> ''
        AND (e.title IS DISTINCT FROM c.title)
        AND (
          e.title IS NULL
          OR TRIM(e.title) = ''
          OR (
            e.title NOT ILIKE ${"%추가견적%"}
            AND e.title NOT ILIKE ${"%추가 견적%"}
          )
        )
    `;
  } catch (err) {
    console.error("syncEstimateTitlesFromConsultations error:", err);
  }
}

/**
 * 견적 폼의 프로젝트 제목을 상담(consultations.title)과
 * 같은 상담의 메인 견적들에 한꺼번에 맞춘다. (추가견적 제외)
 */
export async function syncProjectTitleFromEstimate(opts: {
  companyId: number;
  estimateId?: number | null;
  consultationId?: number | null;
  title: string | null | undefined;
}) {
  const titleStr = opts.title != null ? String(opts.title).trim() : "";
  if (!titleStr) return;
  if (titleStr.includes("추가견적") || titleStr.includes("추가 견적")) return;

  try {
    let consultationId =
      opts.consultationId != null && !Number.isNaN(Number(opts.consultationId))
        ? Number(opts.consultationId)
        : null;

    if (consultationId == null && opts.estimateId != null) {
      const est = await sql`
        SELECT consultation_id FROM estimates
        WHERE id = ${opts.estimateId} AND company_id = ${opts.companyId}
        LIMIT 1
      `;
      const cid = est.rows[0]?.consultation_id;
      if (cid != null) consultationId = Number(cid);
    }
    if (consultationId == null) return;

    await sql`
      UPDATE consultations
      SET title = ${titleStr}
      WHERE id = ${consultationId} AND company_id = ${opts.companyId}
    `;

    await sql`
      UPDATE estimates
      SET title = ${titleStr}
      WHERE consultation_id = ${consultationId}
        AND company_id = ${opts.companyId}
        AND (
          title IS NULL
          OR TRIM(title) = ''
          OR (
            title NOT ILIKE ${"%추가견적%"}
            AND title NOT ILIKE ${"%추가 견적%"}
          )
        )
    `;
  } catch (err) {
    console.error("syncProjectTitleFromEstimate error:", err);
  }
}
