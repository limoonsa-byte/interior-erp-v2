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

/** OAuth 환경 변수 설정 여부만 확인 (값 노출 없음) - 연결 실패 시 점검용 */
export async function GET() {
  const company = await requireMaster();
  if (!company) return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });

  const hasClientId = !!process.env.GOOGLE_CLIENT_ID?.trim();
  const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const hasAppUrl = !!appUrl;

  return NextResponse.json({
    hasClientId,
    hasClientSecret,
    hasAppUrl,
    redirectUri: hasAppUrl ? `${appUrl}/api/admin/master/smtp-oauth/gmail/callback` : null,
  });
}
