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

/** Gmail OAuth 콜백 - 코드를 refresh_token으로 교환 후 회사에 저장 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/company/smtp-oauth/gmail/callback`;

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

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_not_configured", baseUrl));
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const refreshToken = tokenData.refresh_token;
  const accessToken = tokenData.access_token;
  if (!refreshToken) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_no_refresh", baseUrl));
  }

  let email = "";
  if (accessToken) {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json().catch(() => ({}));
    email = userData.email || "";
  }

  await sql`
    UPDATE companies
    SET smtp_oauth_provider = ${"google"}, smtp_oauth_refresh_token = ${refreshToken}, smtp_user = ${email || null}, smtp_host = ${"smtp.gmail.com"}, smtp_port = ${"587"}, smtp_pass = NULL, updated_at = NOW()
    WHERE id = ${companyId}
  `;

  return NextResponse.redirect(new URL("/admin?smtp_oauth=ok", baseUrl));
}
