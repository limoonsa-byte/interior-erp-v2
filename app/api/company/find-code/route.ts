import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/**
 * 회사코드 찾기: 가입 시 등록한 이메일로 회사코드 조회
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email }: { email?: string } = body;

    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: "이메일을 입력해 주세요." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const memberResult = await sql`
      SELECT m.company_id
      FROM members m
      WHERE LOWER(m.email) = ${normalizedEmail}
      LIMIT 1
    `;

    if (memberResult.rows.length === 0) {
      return NextResponse.json(
        { error: "등록된 이메일이 없습니다. 가입 시 입력한 이메일인지 확인해 주세요." },
        { status: 404 }
      );
    }

    const companyId = (memberResult.rows[0] as { company_id: number }).company_id;

    const companyResult = await sql`
      SELECT name, code FROM companies WHERE id = ${companyId} LIMIT 1
    `;
    if (companyResult.rows.length === 0) {
      return NextResponse.json(
        { error: "회사 정보를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const row = companyResult.rows[0] as { name: string; code: string };
    return NextResponse.json({
      companyName: row.name,
      code: row.code,
    });
  } catch (error) {
    console.error("find-code error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
