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

/** 회사별 담당자 목록 조회 (직원 코드·직급 포함, 비밀번호 제외) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    try {
      const result = await sql`
        SELECT id, name, phone, employee_code, position
        FROM company_pics
        WHERE company_id = ${company.id}
        ORDER BY id ASC
      `;
      const list = result.rows.map((row) => {
        const r = row as { id: number; name: string; phone?: string | null; employee_code?: string | null; position?: string | null };
        return {
          id: Number(r.id),
          name: String(r.name),
          phone: r.phone ?? "",
          employeeCode: r.employee_code?.trim() ?? "",
          position: r.position?.trim() ?? "",
        };
      });
      return NextResponse.json(list);
    } catch (colErr: unknown) {
      const errMsg = String(colErr instanceof Error ? colErr.message : colErr);
      if (errMsg.includes("employee_code") || errMsg.includes("position")) {
        const result = await sql`
          SELECT id, name, phone FROM company_pics
          WHERE company_id = ${company.id}
          ORDER BY id ASC
        `;
        const list = result.rows.map((row) => ({
          id: Number((row as { id: number }).id),
          name: String((row as { name: string }).name),
          phone: (row as { phone?: string | null }).phone ?? "",
          employeeCode: "",
          position: "",
        }));
        return NextResponse.json(list);
      }
      throw colErr;
    }
  } catch (error) {
    console.error("company pics GET error:", error);
    const msg =
      error instanceof Error && /relation "company_pics"/i.test(error.message)
        ? "DB에 company_pics 테이블이 없습니다. npm run build 또는 node scripts/migrate.js 를 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 담당자 추가. 직원 코드(로그인용), 직급(대표/관리자/사원/추가입력), 비밀번호(선택) */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const employeeCode = typeof body.employeeCode === "string" ? body.employeeCode.trim() : "";
    const position = typeof body.position === "string" ? body.position.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "담당자명을 입력해 주세요." }, { status: 400 });
    }

    if (employeeCode) {
      const dup = await sql`
        SELECT id FROM company_pics
        WHERE company_id = ${company.id} AND TRIM(employee_code) = ${employeeCode}
        LIMIT 1
      `;
      if (dup.rows.length > 0) {
        return NextResponse.json({ error: "이미 사용 중인 직원 코드입니다. 회사 내에서 중복될 수 없습니다." }, { status: 400 });
      }
    }

    const passwordHash = password || null;
    await sql`
      INSERT INTO company_pics (company_id, name, phone, employee_code, position, password_hash)
      VALUES (${company.id}, ${name}, ${phone || null}, ${employeeCode || null}, ${position || null}, ${passwordHash})
      ON CONFLICT (company_id, name) DO UPDATE SET
        phone = EXCLUDED.phone,
        employee_code = COALESCE(EXCLUDED.employee_code, company_pics.employee_code),
        position = COALESCE(EXCLUDED.position, company_pics.position),
        password_hash = COALESCE(EXCLUDED.password_hash, company_pics.password_hash)
    `;

    return NextResponse.json({ message: "추가되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company pics POST error:", error);
    const msg =
      error instanceof Error && /relation "company_pics"/i.test(error.message)
        ? "DB에 company_pics 테이블이 없습니다. npm run build 또는 node scripts/migrate.js 를 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
