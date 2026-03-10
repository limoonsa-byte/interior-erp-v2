import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

/** 로그인 회사: 우리 회사 계약서 양식 조회 (계약서 작성 페이지에서 회사양식 불러오기용) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const result = await sql`
      SELECT title, body, document_path FROM company_contract_template WHERE company_id = ${company.id} LIMIT 1
    `;
    const row = result.rows[0] as { title: string; body: string; document_path?: string } | undefined;
    return NextResponse.json({
      title: row?.title ?? "",
      body: row?.body ?? "",
      documentPath: row?.document_path != null ? String(row.document_path) : undefined,
    });
  } catch (error) {
    console.error("company-contract-template GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 로그인 회사: 우리 회사 계약서 양식 저장 (관리 페이지에서 사용) */
export async function PATCH(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const body = await request.json();
    const title = body.title != null ? String(body.title) : "";
    const bodyText = body.body != null ? String(body.body) : "";
    const documentPath = body.documentPath != null ? String(body.documentPath) : null;
    await sql`
      INSERT INTO company_contract_template (company_id, title, body, document_path, updated_at)
      VALUES (${company.id}, ${title}, ${bodyText}, ${documentPath}, NOW())
      ON CONFLICT (company_id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        document_path = EXCLUDED.document_path,
        updated_at = NOW()
    `;
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("company-contract-template PATCH error:", error);
    return NextResponse.json({ error: "저장 실패했습니다." }, { status: 500 });
  }
}
