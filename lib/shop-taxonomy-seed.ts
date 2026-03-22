import { sql } from "@vercel/postgres";

const DEFAULT_LINES = ["목재", "마루", "장판", "필름"] as const;
/** 신규 회사·최초 접근 시 기본 구분 + 목재 하부 예시 */
const DEFAULT_SUB_FOR_목재 = ["각재", "판재", "합판", "MDF"] as const;

export async function ensureShopTaxonomySeeded(companyId: number): Promise<void> {
  const r = await sql`
    SELECT COUNT(*)::int AS n FROM shop_taxonomy_lines WHERE company_id = ${companyId}
  `;
  if (Number((r.rows[0] as { n?: number })?.n) > 0) return;
  for (let i = 0; i < DEFAULT_LINES.length; i++) {
    const name = DEFAULT_LINES[i];
    await sql`
      INSERT INTO shop_taxonomy_lines (company_id, name, sort_order)
      VALUES (${companyId}, ${name}, ${i + 1})
      ON CONFLICT (company_id, name) DO NOTHING
    `;
  }
  const 목재 = "목재";
  for (let j = 0; j < DEFAULT_SUB_FOR_목재.length; j++) {
    const sub = DEFAULT_SUB_FOR_목재[j];
    await sql`
      INSERT INTO shop_taxonomy_subcategories (company_id, shop_line, name, sort_order)
      VALUES (${companyId}, ${목재}, ${sub}, ${j + 1})
      ON CONFLICT (company_id, shop_line, name) DO NOTHING
    `;
  }
}
