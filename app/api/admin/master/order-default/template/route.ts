import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

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

const TEMPLATE_FILENAME = "발주_기본품목_템플릿.xlsx";

/** 마스터 전용: 정적 템플릿 파일로 리다이렉트 (주소 직접 치면 되는 그 파일) */
export async function GET(request: Request) {
  try {
    const company = await requireMaster();
    if (!company) {
      return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
    }
    const url = new URL(request.url);
    const staticUrl = `${url.origin}/${encodeURIComponent(TEMPLATE_FILENAME)}`;
    return NextResponse.redirect(staticUrl, 302);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("order-default template GET error:", msg);
    return NextResponse.json(
      { error: "템플릿 다운로드에 실패했습니다.", detail: msg },
      { status: 500 }
    );
  }
}
