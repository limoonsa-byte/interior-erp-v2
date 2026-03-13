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

/** 마스터 메일 설정 상태 조회 (비밀/토큰 노출 없음) */
export async function GET() {
  const company = await requireMaster();
  if (!company) return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  try {
    const result = await sql`
      SELECT smtp_oauth_provider, smtp_user FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ configured: false });
    }
    const r = result.rows[0] as { smtp_oauth_provider: string | null; smtp_user: string | null };
    const provider = r.smtp_oauth_provider?.trim();
    const user = r.smtp_user?.trim();
    const configured = provider === "google" && !!user;
    return NextResponse.json({
      configured,
      provider: configured ? "google" : null,
      user: configured ? user : null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("master_smtp_config") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json({ configured: false });
    }
    console.error("master smtp GET error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

/** 마스터 메일 연결 해제 */
export async function PATCH(request: Request) {
  const company = await requireMaster();
  if (!company) return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    if (body.disconnect === true) {
      await sql`
        UPDATE master_smtp_config
        SET smtp_oauth_provider = NULL, smtp_oauth_refresh_token = NULL, smtp_user = NULL, smtp_host = NULL, smtp_port = NULL, smtp_pass = NULL, updated_at = NOW()
        WHERE id = 1
      `;
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  } catch (error) {
    console.error("master smtp PATCH error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
