import { sql } from "@vercel/postgres";

/** master_contract_template 테이블에 document_path, body_margins 컬럼이 없으면 추가 */
export async function ensureMasterContractTemplateDocumentPath() {
  await sql`ALTER TABLE master_contract_template ADD COLUMN IF NOT EXISTS document_path TEXT`;
  await sql`ALTER TABLE master_contract_template ADD COLUMN IF NOT EXISTS body_margins TEXT`;
}
