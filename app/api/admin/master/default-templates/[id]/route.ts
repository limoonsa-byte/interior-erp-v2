import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

/** 마스터 전용: 기본 템플릿 수정 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }
  try {
    const body = await _request.json();
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    const items = Array.isArray(body.items) ? JSON.stringify(body.items) : undefined;
    const processOrderJson = Array.isArray(body.processOrder) ? JSON.stringify(body.processOrder) : undefined;

    if (title !== undefined) {
      await sql`UPDATE master_default_estimate_templates SET title = ${title} WHERE id = ${id}`;
    }
    if (items !== undefined) {
      await sql`UPDATE master_default_estimate_templates SET items = ${items} WHERE id = ${id}`;
    }
    if (processOrderJson !== undefined) {
      await sql`UPDATE master_default_estimate_templates SET process_order = ${processOrderJson} WHERE id = ${id}`;
    }
    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("master default-templates PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 마스터 전용: 기본 템플릿 삭제 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }
  try {
    await sql`DELETE FROM master_default_estimate_templates WHERE id = ${id}`;
    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("master default-templates DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
