import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureMasterContractTemplateDocumentPath } from "@/lib/master-contract-template-migrate";

async function requireMaster() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    const fromCookie = JSON.parse(cookie.value) as { id: number };
    const result = await sql`
      SELECT id FROM companies WHERE id = ${fromCookie.id} AND is_master = true LIMIT 1
    `;
    return result.rows.length > 0 ? fromCookie : null;
  } catch {
    return null;
  }
}

/** 마스터 전용: 계약서 양식 조회 */
export async function GET() {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    await ensureMasterContractTemplateDocumentPath();
    const result = await sql`
      SELECT title, body, document_path FROM master_contract_template WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { title: string; body: string; document_path?: string } | undefined;
    return NextResponse.json({
      title: row?.title ?? "",
      body: row?.body ?? "",
      documentPath: row?.document_path != null ? String(row.document_path) : undefined,
    });
  } catch (error) {
    console.error("master contract-template GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 마스터 전용: 계약서 양식 저장 */
export async function PATCH(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const title = body.title != null ? String(body.title) : "";
    const bodyText = body.body != null ? String(body.body) : "";
    await sql`
      UPDATE master_contract_template
      SET title = ${title}, body = ${bodyText}, updated_at = NOW()
      WHERE id = 1
    `;
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("master contract-template PATCH error:", error);
    const message = error instanceof Error ? error.message : "저장 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
