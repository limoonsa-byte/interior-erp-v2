import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
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

/** 마스터 Gmail OAuth 콜백 - refresh_token을 master_smtp_config에 저장 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const redirectUri = `${baseUrl}/api/admin/master/smtp-oauth/gmail/callback`;

  if (error) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_denied", baseUrl));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_invalid", baseUrl));
  }

  let company: { id: number } | null = await requireMaster();
  if (!company && state !== "master") {
    try {
      const row = await sql`
        SELECT company_id FROM oauth_pending_state
        WHERE state_token = ${state} AND expires_at > NOW()
        LIMIT 1
      `;
      if (row.rows.length > 0) {
        const companyId = (row.rows[0] as { company_id: number }).company_id;
        const masterCheck = await sql`
          SELECT id FROM companies WHERE id = ${companyId} AND is_master = true LIMIT 1
        `;
        if (masterCheck.rows.length > 0) {
          company = { id: companyId };
        }
        await sql`DELETE FROM oauth_pending_state WHERE state_token = ${state}`;
      }
    } catch {
      // 테이블 없거나 오류 시 쿠키 검증만 사용
    }
  }
  if (!company) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_unauthorized", baseUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_not_configured", baseUrl));
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
  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  const refreshToken = tokenData.refresh_token;
  const accessToken = tokenData.access_token;

  if (tokenData.error) {
    const desc = tokenData.error_description || tokenData.error;
    console.error("Google token error:", tokenData.error, desc);
    return NextResponse.redirect(
      new URL(`/admin/master?error=smtp_oauth_token_error&hint=${encodeURIComponent(desc)}`, baseUrl)
    );
  }
  if (!refreshToken) {
    return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_no_refresh", baseUrl));
  }

  let email = "";
  if (accessToken) {
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json().catch(() => ({}));
    email = userData.email || "";
  }

  try {
    await sql`
      UPDATE master_smtp_config
      SET smtp_oauth_provider = ${"google"}, smtp_oauth_refresh_token = ${refreshToken}, smtp_user = ${email || null}, smtp_host = ${"smtp.gmail.com"}, smtp_port = ${"587"}, smtp_pass = NULL, updated_at = NOW()
      WHERE id = 1
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("master_smtp_config") && (msg.includes("does not exist") || msg.includes("relation"))) {
      await sql`
        CREATE TABLE IF NOT EXISTS master_smtp_config (
          id INT PRIMARY KEY DEFAULT 1,
          smtp_oauth_provider TEXT,
          smtp_oauth_refresh_token TEXT,
          smtp_user TEXT,
          smtp_host TEXT,
          smtp_port TEXT,
          smtp_pass TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT master_smtp_config_single CHECK (id = 1)
        )
      `;
      await sql`INSERT INTO master_smtp_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
      await sql`
        UPDATE master_smtp_config
        SET smtp_oauth_provider = ${"google"}, smtp_oauth_refresh_token = ${refreshToken}, smtp_user = ${email || null}, smtp_host = ${"smtp.gmail.com"}, smtp_port = ${"587"}, smtp_pass = NULL, updated_at = NOW()
        WHERE id = 1
      `;
    } else {
      console.error("master smtp callback error:", err);
      return NextResponse.redirect(new URL("/admin/master?error=smtp_oauth_db_error", baseUrl));
    }
  }

  return NextResponse.redirect(new URL("/admin/master?smtp_oauth=ok", baseUrl));
}
