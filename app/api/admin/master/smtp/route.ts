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
      SELECT smtp_oauth_provider, smtp_oauth_refresh_token, smtp_user, smtp_pass, smtp_host FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ configured: false });
    }
    const r = result.rows[0] as { smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_host: string | null };
    const provider = r.smtp_oauth_provider?.trim();
    const user = r.smtp_user?.trim();
    const hasOAuth = provider === "google" && r.smtp_oauth_refresh_token?.trim() && user;
    const host = r.smtp_host?.trim() || "";
    const hasAppPassword = !!user && !!r.smtp_pass?.trim() && (host.includes("gmail") || host.includes("google"));
    const configured = hasOAuth || hasAppPassword;
    return NextResponse.json({
      configured,
      provider: hasOAuth ? "google" : hasAppPassword ? "app_password" : null,
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

/** 마스터 메일 연결 해제 또는 앱 비밀번호 설정 */
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
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const appPassword = typeof body.appPassword === "string" ? body.appPassword.trim() : "";
    if (email && appPassword && email.includes("@")) {
      try {
        await sql`
          INSERT INTO master_smtp_config (id, smtp_user, smtp_host, smtp_port, smtp_pass, smtp_oauth_provider, smtp_oauth_refresh_token, updated_at)
          VALUES (1, ${email}, ${"smtp.gmail.com"}, ${"587"}, ${appPassword}, NULL, NULL, NOW())
          ON CONFLICT (id) DO UPDATE SET
            smtp_oauth_provider = NULL, smtp_oauth_refresh_token = NULL, smtp_user = EXCLUDED.smtp_user, smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_pass = EXCLUDED.smtp_pass, updated_at = NOW()
        `;
      } catch (insertErr) {
        const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
        if (msg.includes("master_smtp_config") && (msg.includes("does not exist") || msg.includes("relation"))) {
          await sql`
            CREATE TABLE IF NOT EXISTS master_smtp_config (
              id INT PRIMARY KEY DEFAULT 1,
              smtp_oauth_provider TEXT, smtp_oauth_refresh_token TEXT, smtp_user TEXT,
              smtp_host TEXT, smtp_port TEXT, smtp_pass TEXT,
              updated_at TIMESTAMPTZ DEFAULT NOW(),
              CONSTRAINT master_smtp_config_single CHECK (id = 1)
            )
          `;
          await sql`
            INSERT INTO master_smtp_config (id, smtp_user, smtp_host, smtp_port, smtp_pass, updated_at)
            VALUES (1, ${email}, ${"smtp.gmail.com"}, ${"587"}, ${appPassword}, NOW())
            ON CONFLICT (id) DO UPDATE SET
              smtp_oauth_provider = NULL, smtp_oauth_refresh_token = NULL, smtp_user = EXCLUDED.smtp_user, smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_pass = EXCLUDED.smtp_pass, updated_at = NOW()
          `;
        } else {
          throw insertErr;
        }
      }
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  } catch (error) {
    console.error("master smtp PATCH error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
