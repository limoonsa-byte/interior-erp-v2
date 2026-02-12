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

/** 회사별 담당자 목록 조회 (상담·관리 페이지에서 사용) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT id, name, phone FROM company_pics
      WHERE company_id = ${company.id}
      ORDER BY id ASC
    `;

    const list = result.rows.map((row) => ({
      id: Number((row as { id: number }).id),
      name: String((row as { name: string }).name),
      phone: (row as { phone?: string | null }).phone ?? "",
    }));

    return NextResponse.json(list);
  } catch (error) {
    console.error("company pics GET error:", error);
    const msg =
      error instanceof Error && /relation "company_pics"/i.test(error.message)
        ? "DB에 company_pics 테이블이 없습니다. sql/add_company_pics.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 담당자 추가 (관리 페이지에서 사용) */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "담당자명을 입력해 주세요." }, { status: 400 });
    }

    await sql`
      INSERT INTO company_pics (company_id, name, phone)
      VALUES (${company.id}, ${name}, ${phone || null})
      ON CONFLICT (company_id, name) DO NOTHING
    `;

    return NextResponse.json({ message: "추가되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company pics POST error:", error);
    const msg =
      error instanceof Error && /relation "company_pics"/i.test(error.message)
        ? "DB에 company_pics 테이블이 없습니다. sql/add_company_pics.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
