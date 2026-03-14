import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { getSmtpConfigFromEmail } from "@/lib/smtp";

// GET /api/company - 현재 로그인한 회사 정보 (drawing_list_api_url 포함)
export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const company = JSON.parse(cookie.value) as { id: number; code: string; name: string };
    
    const { rows } = await sql`
      SELECT id, code, name, drawing_list_api_url, logo_path, stamp_path, contractor_address, contractor_reg_no, company_email, smtp_host, smtp_port, smtp_user, smtp_oauth_provider
      FROM companies
      WHERE id = ${company.id}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "회사를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      id: rows[0].id,
      code: rows[0].code,
      name: rows[0].name,
      drawingListApiUrl: rows[0].drawing_list_api_url || "",
      logoPath: rows[0].logo_path ?? null,
      stampPath: rows[0].stamp_path ?? null,
      contractorAddress: rows[0].contractor_address ?? null,
      contractorRegNo: rows[0].contractor_reg_no ?? null,
      companyEmail: rows[0].company_email ?? null,
      smtpHost: rows[0].smtp_host ?? null,
      smtpPort: rows[0].smtp_port ?? null,
      smtpUser: rows[0].smtp_user ?? null,
      smtpOauthProvider: rows[0].smtp_oauth_provider ?? null,
    });
  } catch (error) {
    console.error("회사 정보 조회 실패:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// PATCH /api/company - 회사 정보 수정 (관리자 전용)
export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const company = JSON.parse(cookie.value) as { id: number; code: string; name: string };
    const body = await req.json();
    const cur = await sql`
      SELECT name, drawing_list_api_url, contractor_address, contractor_reg_no, company_email, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_oauth_provider, smtp_oauth_refresh_token FROM companies WHERE id = ${company.id}
    `;
    if (cur.rows.length === 0) return NextResponse.json({ error: "회사를 찾을 수 없습니다." }, { status: 404 });
    const row = cur.rows[0] as { name: string | null; drawing_list_api_url: string | null; contractor_address: string | null; contractor_reg_no: string | null; company_email: string | null; smtp_host: string | null; smtp_port: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null };
    const name = body.name !== undefined ? String(body.name).trim() || row.name : row.name;
    const drawingListApiUrl = body.drawingListApiUrl !== undefined ? body.drawingListApiUrl : row.drawing_list_api_url;
    const contractorAddress = body.contractorAddress !== undefined ? body.contractorAddress : row.contractor_address;
    const contractorRegNo = body.contractorRegNo !== undefined ? body.contractorRegNo : row.contractor_reg_no;
    const companyEmail = body.companyEmail !== undefined ? body.companyEmail : row.company_email;
    const disconnectOauth = body.smtpOauthDisconnect === true;
    let smtpHost = body.smtpHost !== undefined ? body.smtpHost : row.smtp_host;
    let smtpPort = body.smtpPort !== undefined ? body.smtpPort : row.smtp_port;
    let smtpUser = body.smtpUser !== undefined ? body.smtpUser : row.smtp_user;
    let smtpPass = body.smtpPass !== undefined && String(body.smtpPass).trim() !== "" ? body.smtpPass : row.smtp_pass;
    let smtpOauthProvider = row.smtp_oauth_provider;
    let smtpOauthRefreshToken = row.smtp_oauth_refresh_token;
    if (disconnectOauth) {
      smtpOauthProvider = null;
      smtpOauthRefreshToken = null;
    }
    if (smtpUser?.trim()) {
      const auto = getSmtpConfigFromEmail(smtpUser.trim());
      if (auto) {
        smtpHost = auto.host;
        smtpPort = String(auto.port);
      }
      if (auto && !smtpUser.trim().toLowerCase().includes("gmail.com") && !smtpUser.trim().toLowerCase().includes("googlemail.com")) {
        smtpOauthProvider = null;
        smtpOauthRefreshToken = null;
      }
    }

    await sql`
      UPDATE companies
      SET name = ${name}, drawing_list_api_url = ${drawingListApiUrl}, contractor_address = ${contractorAddress}, contractor_reg_no = ${contractorRegNo}, company_email = ${companyEmail}, smtp_host = ${smtpHost}, smtp_port = ${smtpPort}, smtp_user = ${smtpUser}, smtp_pass = ${smtpPass}, smtp_oauth_provider = ${smtpOauthProvider}, smtp_oauth_refresh_token = ${smtpOauthRefreshToken}
      WHERE id = ${company.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("회사 정보 수정 실패:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
