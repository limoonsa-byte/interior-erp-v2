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
      SELECT title, body, document_path, body_margins FROM master_contract_template WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { title: string; body: string | null; document_path?: string; body_margins?: string } | undefined;
    let bodyMargins = { top: 15, right: 15, bottom: 15, left: 15 };
    if (row?.body_margins && typeof row.body_margins === "string") {
      try {
        const parsed = JSON.parse(row.body_margins) as { top?: number; right?: number; bottom?: number; left?: number };
        if (typeof parsed.top === "number") bodyMargins.top = parsed.top;
        if (typeof parsed.right === "number") bodyMargins.right = parsed.right;
        if (typeof parsed.bottom === "number") bodyMargins.bottom = parsed.bottom;
        if (typeof parsed.left === "number") bodyMargins.left = parsed.left;
      } catch { /* use defaults */ }
    }
    return NextResponse.json({
      title: row?.title ?? "",
      body: row?.body != null ? String(row.body) : "",
      documentPath: row?.document_path != null ? String(row.document_path) : undefined,
      bodyMargins,
    });
  } catch (error) {
    console.error("contract-template GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
