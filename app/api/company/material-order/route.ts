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

/** 자재 발주 초안 조회 (견적별) */
export async function GET(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const estimateIdParam = searchParams.get("estimateId")?.trim();
    const estimateId = estimateIdParam ? parseInt(estimateIdParam, 10) : NaN;
    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    const check = await sql`
      SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
    `;
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await sql`
      SELECT data_json, updated_at
      FROM material_order_drafts
      WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ draft: null });
    }
    const row = result.rows[0] as { data_json: string; updated_at: string };
    let draft: Record<string, unknown> = {};
    try {
      draft = typeof row.data_json === "string" ? JSON.parse(row.data_json) : row.data_json;
    } catch {
      draft = {};
    }
    return NextResponse.json({ draft, updatedAt: row.updated_at });
  } catch (error) {
    console.error("material-order GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 자재 발주 초안 저장 */
export async function PUT(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const estimateId = body.estimateId != null ? parseInt(String(body.estimateId), 10) : NaN;
    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    const check = await sql`
      SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
    `;
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    const data = {
      requiredSiteName: body.requiredSiteName ?? "",
      requiredDeliveryAddress: body.requiredDeliveryAddress ?? "",
      requiredContactName: body.requiredContactName ?? "",
      requiredContactPhone: body.requiredContactPhone ?? "",
      deliveryDateByLabel: body.deliveryDateByLabel ?? {},
      addedRowsByLabel: body.addedRowsByLabel ?? {},
      memoByKey: body.memoByKey ?? {},
      visibleOrderLabels: Array.isArray(body.visibleOrderLabels) ? body.visibleOrderLabels : [],
    };
    const dataJson = JSON.stringify(data);

    await sql`
      INSERT INTO material_order_drafts (company_id, estimate_id, data_json, updated_at)
      VALUES (${company.id}, ${estimateId}, ${dataJson}, NOW())
      ON CONFLICT (company_id, estimate_id)
      DO UPDATE SET data_json = ${dataJson}, updated_at = NOW()
    `;

    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    console.error("material-order PUT error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|material_order_drafts/i.test(msg)) {
      return NextResponse.json(
        { error: "자재 발주 저장 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
