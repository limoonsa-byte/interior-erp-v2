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
      SELECT title, body, document_path, body_margins FROM master_contract_template WHERE id = 1 LIMIT 1
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
    const bodyMargins = body.bodyMargins;
    const bodyMarginsStr =
      bodyMargins != null && typeof bodyMargins === "object"
        ? JSON.stringify({
            top: Number(bodyMargins.top) || 15,
            right: Number(bodyMargins.right) || 15,
            bottom: Number(bodyMargins.bottom) || 15,
            left: Number(bodyMargins.left) || 15,
          })
        : '{"top":15,"right":15,"bottom":15,"left":15}';
    await sql`
      INSERT INTO master_contract_template (id, title, body, body_margins, updated_at)
      VALUES (1, ${title}, ${bodyText}, ${bodyMarginsStr}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        body_margins = EXCLUDED.body_margins,
        updated_at = NOW()
    `;
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("master contract-template PATCH error:", error);
    const message = error instanceof Error ? error.message : "저장 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
