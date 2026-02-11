import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/**
 * 비밀번호 재설정: 회사코드 + 등록된 이메일로 본인 확인 후 새 비밀번호로 변경
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      code,
      email,
      newPassword,
    }: {
      code?: string;
      email?: string;
      newPassword?: string;
    } = body;

    if (!code || !email || !newPassword) {
      return NextResponse.json(
        { error: "회사코드, 이메일, 새 비밀번호를 모두 입력해 주세요." },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "새 비밀번호는 6자 이상이어야 합니다." },
        { status: 400 }
      );
    }

    const companyResult = await sql`
      SELECT id FROM companies WHERE code = ${code} LIMIT 1
    `;
    if (companyResult.rows.length === 0) {
      return NextResponse.json(
        { error: "회사코드가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const companyId = (companyResult.rows[0] as { id: number }).id;
    const normalizedEmail = email.trim().toLowerCase();

    const memberResult = await sql`
      SELECT id FROM members
      WHERE company_id = ${companyId} AND LOWER(email) = ${normalizedEmail}
      LIMIT 1
    `;
    if (memberResult.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 회사에 등록된 이메일이 아닙니다." },
        { status: 401 }
      );
    }

    // 현재는 평문 저장 (작업 일지와 동일)
    await sql`
      UPDATE companies
      SET password_hash = ${newPassword}
      WHERE id = ${companyId}
    `;

    return NextResponse.json({
      success: true,
      message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
    });
  } catch (error) {
    console.error("reset-password error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
