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

/** 우리회사 자재발주 서식(템플릿) 조회 */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const result = await sql`
      SELECT data_json, updated_at
      FROM company_order_template
      WHERE company_id = ${company.id}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ template: null });
    }
    const row = result.rows[0] as { data_json: string; updated_at: string };
    let data: { visibleOrderLabels?: string[]; addedRowsByLabel?: Record<string, unknown[]> } = {};
    try {
      data = typeof row.data_json === "string" ? JSON.parse(row.data_json) : row.data_json;
    } catch {
      data = {};
    }
    return NextResponse.json({ template: data, updatedAt: row.updated_at });
  } catch (error) {
    console.error("order-template GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 우리회사 자재발주 서식(템플릿) 저장 */
export async function PUT(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const body = await request.json();
    const data = {
      visibleOrderLabels: Array.isArray(body.visibleOrderLabels) ? body.visibleOrderLabels : [],
      addedRowsByLabel: body.addedRowsByLabel && typeof body.addedRowsByLabel === "object" ? body.addedRowsByLabel : {},
    };
    const dataJson = JSON.stringify(data);
    await sql`
      INSERT INTO company_order_template (company_id, data_json, updated_at)
      VALUES (${company.id}, ${dataJson}, NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET data_json = ${dataJson}, updated_at = NOW()
    `;
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("order-template PUT error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|company_order_template/i.test(msg)) {
      return NextResponse.json(
        { error: "자재발주 서식 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
