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

/** 회사별 커스텀 메뉴 목록 조회 (헤더 등에서 사용) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT id, label, href, sort_order
      FROM company_custom_menu
      WHERE company_id = ${company.id}
      ORDER BY sort_order ASC, id ASC
    `;

    const list = result.rows.map((row) => ({
      id: Number((row as { id: number }).id),
      label: String((row as { label: string }).label),
      href: String((row as { href: string }).href),
      sortOrder: Number((row as { sort_order: number }).sort_order) || 0,
    }));

    return NextResponse.json(list);
  } catch (error) {
    console.error("company custom-menu GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 커스텀 메뉴 추가 (관리 페이지에서 사용) */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const href = typeof body.href === "string" ? body.href.trim() : "";
    if (!label) {
      return NextResponse.json({ error: "메뉴 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!href) {
      return NextResponse.json({ error: "링크(URL)를 입력해 주세요." }, { status: 400 });
    }

    const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 0;

    await sql`
      INSERT INTO company_custom_menu (company_id, label, href, sort_order)
      VALUES (${company.id}, ${label}, ${href}, ${sortOrder})
    `;

    return NextResponse.json({ message: "추가되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company custom-menu POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
