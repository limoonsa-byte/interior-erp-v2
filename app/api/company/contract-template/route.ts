import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureMasterContractTemplateDocumentPath } from "@/lib/master-contract-template-migrate";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number };
  } catch {
    return null;
  }
}

/** 로그인 회사: 마스터 계약서 양식 조회 (계약서 작성 페이지에서 불러오기용) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    await ensureMasterContractTemplateDocumentPath();
    const result = await sql`
      SELECT title, body, document_path FROM master_contract_template WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { title: string; body: string | null; document_path?: string } | undefined;
    return NextResponse.json({
      title: row?.title ?? "",
      body: row?.body != null ? String(row.body) : "",
      documentPath: row?.document_path != null ? String(row.document_path) : undefined,
    });
  } catch (error) {
    console.error("contract-template GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
