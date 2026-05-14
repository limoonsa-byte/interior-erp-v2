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
      SELECT title, body, document_path, body_margins FROM company_contract_template WHERE company_id = ${company.id} LIMIT 1
    `;
    const row = result.rows[0] as { title: string; body: string; document_path?: string; body_margins?: string } | undefined;
    let bodyMargins = { top: 15, right: 15, bottom: 15, left: 15 };
    if (row?.body_margins && typeof row.body_margins === "string") {
      try {
        const parsed = JSON.parse(row.body_margins) as { top?: number; right?: number; bottom?: number; left?: number };
        if (parsed && typeof parsed.top === "number") bodyMargins.top = parsed.top;
        if (typeof parsed.right === "number") bodyMargins.right = parsed.right;
        if (typeof parsed.bottom === "number") bodyMargins.bottom = parsed.bottom;
        if (typeof parsed.left === "number") bodyMargins.left = parsed.left;
      } catch { /* ignore */ }
    }
    return NextResponse.json({
      title: row?.title ?? "",
      body: row?.body ?? "",
      documentPath: row?.document_path != null ? String(row.document_path) : undefined,
      bodyMargins,
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
    const bm = body.bodyMargins;
    const bodyMarginsStr = bm != null && typeof bm === "object"
      ? JSON.stringify({ top: Number(bm.top) || 15, right: Number(bm.right) || 15, bottom: Number(bm.bottom) || 15, left: Number(bm.left) || 15 })
      : '{"top":15,"right":15,"bottom":15,"left":15}';
    await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS body_margins TEXT`;
    await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS document_data TEXT`;

    const existing = await sql`
      SELECT document_path, document_data FROM company_contract_template WHERE company_id = ${company.id} LIMIT 1
    `;
    const ex = existing.rows[0] as { document_path?: string; document_data?: string } | undefined;
    let documentPath = ex?.document_path != null ? String(ex.document_path) : null;
    let documentData = ex?.document_data != null ? String(ex.document_data) : null;

    if (Object.prototype.hasOwnProperty.call(body, "documentPath")) {
      const raw = body.documentPath;
      if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
        documentPath = null;
        documentData = null;
      } else {
        documentPath = String(raw);
      }
    }

    await sql`
      INSERT INTO company_contract_template (company_id, title, body, document_path, document_data, body_margins, updated_at)
      VALUES (${company.id}, ${title}, ${bodyText}, ${documentPath}, ${documentData}, ${bodyMarginsStr}, NOW())
      ON CONFLICT (company_id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        document_path = EXCLUDED.document_path,
        document_data = EXCLUDED.document_data,
        body_margins = EXCLUDED.body_margins,
        updated_at = NOW()
    `;
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("company-contract-template PATCH error:", error);
    return NextResponse.json({ error: "저장 실패했습니다." }, { status: 500 });
  }
}
