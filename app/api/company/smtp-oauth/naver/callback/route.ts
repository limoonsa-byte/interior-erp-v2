import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { cookies } from "next/headers";

async function getCompany() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

/** 네이버 OAuth 콜백 - 이메일 조회 후 저장, 앱 비밀번호는 팝업에서 입력 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/company/smtp-oauth/naver/callback`;

  if (error) {
    return NextResponse.redirect(new URL(`/admin?error=smtp_oauth_denied`, baseUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_invalid", baseUrl));
  }

  const companyId = parseInt(state, 10);
  if (!Number.isFinite(companyId)) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_invalid", baseUrl));
  }

  const company = await getCompany();
  if (!company || company.id !== companyId) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_unauthorized", baseUrl));
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_not_configured", baseUrl));
  }

  const tokenRes = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_no_token", baseUrl));
  }

  const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profileData = await profileRes.json().catch(() => ({}));
  const email = profileData.response?.email || "";

  await sql`
    UPDATE companies
    SET smtp_oauth_provider = ${"naver"}, smtp_oauth_refresh_token = NULL, smtp_user = ${email || null}, smtp_host = ${"smtp.naver.com"}, smtp_port = ${"587"}, smtp_pass = NULL, updated_at = NOW()
    WHERE id = ${companyId}
  `;

  return NextResponse.redirect(new URL("/admin?smtp_oauth=naver_ok", baseUrl));
}
