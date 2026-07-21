import { sql } from "@vercel/postgres";

/**
 * 상담이 이미 지워진 뒤 남은 견적(고아)과 그 하위 데이터 삭제.
 * - consultation_id 가 가리키는 상담이 없음
 * - 과거 ON DELETE SET NULL 로 consultation_id 가 NULL 이 된 견적
 * 추가로 상담/견적이 없는 계약·작업일지도 정리.
 */
export async function cleanupOrphanEstimates(companyId: number): Promise<number> {
  const orphanRows = await sql`
    SELECT e.id
    FROM estimates e
    WHERE e.company_id = ${companyId}
      AND (
        e.consultation_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM consultations c
          WHERE c.id = e.consultation_id AND c.company_id = ${companyId}
        )
      )
  `;
  const ids = (orphanRows.rows as { id: number }[])
    .map((r) => Number(r.id))
    .filter((n) => !Number.isNaN(n) && n > 0);

  for (const estimateId of ids) {
    await sql`DELETE FROM contracts WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    await sql`DELETE FROM company_work_logs WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    try {
      await sql`DELETE FROM material_order_drafts WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    } catch {
      /* ignore */
    }
    try {
      await sql`DELETE FROM site_material_list_items WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
      await sql`DELETE FROM site_material_list_sections WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    } catch {
      /* ignore */
    }
    try {
      await sql`DELETE FROM estimate_settlements WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
      await sql`DELETE FROM estimate_payment_approvals WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    } catch {
      /* ignore */
    }
    try {
      await sql`DELETE FROM company_chat_messages WHERE company_id = ${companyId} AND estimate_id = ${estimateId}`;
    } catch {
      /* ignore */
    }
    await sql`DELETE FROM estimates WHERE id = ${estimateId} AND company_id = ${companyId}`;
  }

  // 상담이 없는데 남은 계약 (견적 없이 상담만 연결됐던 경우 등)
  try {
    await sql`
      DELETE FROM contracts
      WHERE company_id = ${companyId}
        AND consultation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM consultations c
          WHERE c.id = contracts.consultation_id AND c.company_id = ${companyId}
        )
    `;
  } catch {
    /* ignore */
  }
  try {
    await sql`
      DELETE FROM contracts
      WHERE company_id = ${companyId}
        AND estimate_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM estimates e
          WHERE e.id = contracts.estimate_id AND e.company_id = ${companyId}
        )
    `;
  } catch {
    /* ignore */
  }

  // 견적이 없는데 남은 작업일지
  try {
    await sql`
      DELETE FROM company_work_logs
      WHERE company_id = ${companyId}
        AND estimate_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM estimates e
          WHERE e.id = company_work_logs.estimate_id AND e.company_id = ${companyId}
        )
    `;
  } catch {
    /* ignore */
  }

  return ids.length;
}
