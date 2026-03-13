import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { randomBytes } from "crypto";

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

/** 마스터 Gmail OAuth 시작 - state에 일회용 토큰 저장(콜백 시 쿠키 없어도 검증 가능) */
export async function GET() {
  const company = await requireMaster();
  if (!company) {
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
    return NextResponse.redirect(new URL("/admin", baseUrl));
  }
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const redirectUri = `${baseUrl}/api/admin/master/smtp-oauth/gmail/callback`;
  if (!clientId) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_not_configured", baseUrl));
  }
  let stateParam: string;
  const stateToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  try {
    await sql`
      INSERT INTO oauth_pending_state (state_token, company_id, expires_at)
      VALUES (${stateToken}, ${company.id}, ${expiresAt})
    `;
    stateParam = stateToken;
  } catch {
    stateParam = "master";
  }
  const scope = encodeURIComponent("https://mail.google.com/");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(stateParam)}`;
  return NextResponse.redirect(url);
}
