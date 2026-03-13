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

/** 네이버 OAuth 시작 - 네이버 로그인 페이지로 리다이렉트 */
export async function GET() {
  const company = await getCompany();
  if (!company) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));

  const clientId = process.env.NAVER_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/company/smtp-oauth/naver/callback`;
  if (!clientId) {
    return NextResponse.redirect(new URL("/admin?error=smtp_oauth_not_configured", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  }

  const state = encodeURIComponent(company.id.toString());
  const url = `https://nid.naver.com/oauth2.0/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;
  return NextResponse.redirect(url);
}
