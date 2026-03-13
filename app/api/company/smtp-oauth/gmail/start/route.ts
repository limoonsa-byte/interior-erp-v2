import { NextResponse } from "next/server";
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

/** Gmail OAuth 시작 - Google 로그인 페이지로 리다이렉트 */
export async function GET() {
  const company = await getCompany();
  if (!company) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/company/smtp-oauth/gmail/callback`;
  if (!clientId) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_not_configured", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  const scope = encodeURIComponent("https://mail.google.com/");
  const state = encodeURIComponent(company.id.toString());
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  return NextResponse.redirect(url);
}
