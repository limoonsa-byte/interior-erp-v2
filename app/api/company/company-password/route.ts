import { sql } from "@vercel/postgres";
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

function companyPasswordMatches(stored: string | null | undefined, input: string): boolean {
  const companyPwd = stored != null ? String(stored).trim() : "";
  const pwd = String(input ?? "").trim();
  if (!companyPwd) {
    return pwd === "";
  }
  return companyPwd.toLowerCase() === pwd.toLowerCase();
}

/**
 * 로그인 시 사용하는 회사 공통 비밀번호(companies.password_hash) 변경
 * body: { currentPassword: string, newPassword: string }
 */
export async function PATCH(request: Request) {
  try {
    const company = await getCompany();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "새 비밀번호는 6자 이상이어야 합니다." },
        { status: 400 }
      );
    }
    if (newPassword.length > 200) {
      return NextResponse.json(
        { error: "새 비밀번호는 200자 이하여야 합니다." },
        { status: 400 }
      );
    }

    const row = await sql`
      SELECT password_hash FROM companies WHERE id = ${company.id} LIMIT 1
    `;
    if (row.rows.length === 0) {
      return NextResponse.json({ error: "회사를 찾을 수 없습니다." }, { status: 404 });
    }

    const stored = (row.rows[0] as { password_hash: string | null }).password_hash;
    const hasStored = stored != null && String(stored).trim() !== "";

    if (hasStored && !companyPasswordMatches(stored, currentPassword)) {
      return NextResponse.json(
        { error: "현재 비밀번호가 올바르지 않습니다." },
        { status: 400 }
      );
    }
    if (!hasStored && currentPassword.trim() !== "") {
      return NextResponse.json(
        { error: "회사 비밀번호가 아직 없습니다. 현재 비밀번호는 비워 두세요." },
        { status: 400 }
      );
    }

    await sql`
      UPDATE companies SET password_hash = ${newPassword} WHERE id = ${company.id}
    `;

    return NextResponse.json({ ok: true, message: "회사 로그인 비밀번호가 변경되었습니다." });
  } catch (error) {
    console.error("company-password PATCH error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
