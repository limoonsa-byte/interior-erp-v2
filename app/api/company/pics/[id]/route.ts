import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

/** 담당자 삭제 (관리 페이지에서 사용) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { id } = await params;
    const picId = parseInt(id, 10);
    if (Number.isNaN(picId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM company_pics
      WHERE id = ${picId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 담당자를 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company pics DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 담당자 수정 (직원 코드·직급·비밀번호) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { id } = await params;
    const picId = parseInt(id, 10);
    if (Number.isNaN(picId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const body = await request.json();
    const employeeCode = typeof body.employeeCode === "string" ? body.employeeCode.trim() : undefined;
    const position = typeof body.position === "string" ? body.position.trim() : undefined;
    const password = typeof body.password === "string" ? body.password.trim() : undefined;

    const existing = await sql`
      SELECT id, employee_code, position, password_hash FROM company_pics
      WHERE id = ${picId} AND company_id = ${company.id}
      LIMIT 1
    `;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "해당 담당자를 찾을 수 없습니다." }, { status: 404 });
    }
    const cur = existing.rows[0] as { employee_code?: string | null; position?: string | null; password_hash?: string | null };

    if (employeeCode !== undefined && employeeCode !== "") {
      const dup = await sql`
        SELECT id FROM company_pics
        WHERE company_id = ${company.id} AND id != ${picId} AND TRIM(COALESCE(employee_code,'')) = ${employeeCode}
        LIMIT 1
      `;
      if (dup.rows.length > 0) {
        return NextResponse.json({ error: "이미 사용 중인 직원 코드입니다." }, { status: 400 });
      }
    }

    const finalCode = employeeCode !== undefined ? (employeeCode || null) : cur.employee_code ?? null;
    const finalPosition = position !== undefined ? (position || null) : cur.position ?? null;
    const finalPassword = password !== undefined ? (password || null) : cur.password_hash ?? null;

    await sql`
      UPDATE company_pics
      SET employee_code = ${finalCode}, position = ${finalPosition}, password_hash = ${finalPassword}
      WHERE id = ${picId} AND company_id = ${company.id}
    `;

    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company pics PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
