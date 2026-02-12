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

// 회사별 상담 조회
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json([], { status: 200 });
    }

    const result =
      await sql`SELECT * FROM consultations WHERE company_id = ${company.id} ORDER BY id DESC`;

    const formatted = result.rows.map((row) => {
      let scope: string[] | undefined;
      if (row.scope != null && String(row.scope).trim() !== "") {
        try {
          scope = JSON.parse(String(row.scope)) as string[];
        } catch {
          scope = undefined;
        }
      }
      return {
        id: row.id,
        customerName: row.customer_name,
        contact: row.contact,
        address: row.address,
        pyung: row.pyung,
        status: row.status,
        pic: row.pic,
        note: row.note,
        consultedAt: row.consulted_at != null ? String(row.consulted_at) : undefined,
        scope,
        budget: row.budget != null ? String(row.budget) : undefined,
        completionYear: row.completion_year != null ? String(row.completion_year) : undefined,
        siteMeasurementAt: row.site_measurement_at != null ? String(row.site_measurement_at) : undefined,
        estimateMeetingAt: row.estimate_meeting_at != null ? String(row.estimate_meeting_at) : undefined,
        materialMeetingAt: row.material_meeting_at != null ? String(row.material_meeting_at) : undefined,
        contractMeetingAt: row.contract_meeting_at != null ? String(row.contract_meeting_at) : undefined,
        designMeetingAt: row.design_meeting_at != null ? String(row.design_meeting_at) : undefined,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("DB Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

// 회사별 상담 저장
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const {
      customerName,
      contact,
      address,
      pyung,
      status,
      pic,
      note,
      consultedAt,
      scope,
      budget,
      completionYear,
      siteMeasurementAt,
      estimateMeetingAt,
      materialMeetingAt,
      contractMeetingAt,
      designMeetingAt,
    } = body;

    const scopeJson = Array.isArray(scope) ? JSON.stringify(scope) : null;
    const budgetStr = budget != null ? String(budget) : null;
    const completionYearStr = completionYear != null ? String(completionYear) : null;
    const siteMeasurementAtStr = siteMeasurementAt != null ? String(siteMeasurementAt) : null;
    const estimateMeetingAtStr = estimateMeetingAt != null ? String(estimateMeetingAt) : null;
    const materialMeetingAtStr = materialMeetingAt != null ? String(materialMeetingAt) : null;
    const contractMeetingAtStr = contractMeetingAt != null ? String(contractMeetingAt) : null;
    const designMeetingAtStr = designMeetingAt != null ? String(designMeetingAt) : null;

    await sql`
      INSERT INTO consultations (company_id, customer_name, contact, address, pyung, status, pic, note, consulted_at, scope, budget, completion_year, site_measurement_at, estimate_meeting_at, material_meeting_at, contract_meeting_at, design_meeting_at)
      VALUES (${company.id}, ${customerName}, ${contact}, ${address}, ${pyung}, ${status}, ${pic}, ${note}, ${consultedAt ?? null}, ${scopeJson}, ${budgetStr}, ${completionYearStr}, ${siteMeasurementAtStr}, ${estimateMeetingAtStr}, ${materialMeetingAtStr}, ${contractMeetingAtStr}, ${designMeetingAtStr})
    `;

    return NextResponse.json({ message: "Success" }, { status: 200 });
  } catch (error) {
    console.error("DB Error:", error);
    const message =
      error instanceof Error && /consulted_at|scope|budget|column/i.test(error.message)
        ? "DB에 consulted_at, scope, budget 등 컬럼이 없을 수 있습니다. sql 마이그레이션을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

