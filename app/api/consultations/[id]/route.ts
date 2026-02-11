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

/**
 * 기존 상담 수정 (고객명 클릭 → 상세 모달 → 저장 시)
 */
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
    const consultationId = parseInt(id, 10);
    if (Number.isNaN(consultationId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
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
    } = body;

    const scopeJson = Array.isArray(scope) ? JSON.stringify(scope) : null;
    const budgetStr = budget != null ? String(budget) : null;
    const completionYearStr = completionYear != null ? String(completionYear) : null;
    const siteMeasurementAtStr = siteMeasurementAt != null ? String(siteMeasurementAt) : null;
    const estimateMeetingAtStr = estimateMeetingAt != null ? String(estimateMeetingAt) : null;
    const materialMeetingAtStr = materialMeetingAt != null ? String(materialMeetingAt) : null;

    const result = await sql`
      UPDATE consultations
      SET
        customer_name = COALESCE(${customerName ?? null}, customer_name),
        contact = COALESCE(${contact ?? null}, contact),
        address = COALESCE(${address ?? null}, address),
        pyung = COALESCE(${pyung ?? null}, pyung),
        status = COALESCE(${status ?? null}, status),
        pic = COALESCE(${pic ?? null}, pic),
        note = COALESCE(${note ?? null}, note),
        consulted_at = COALESCE(${consultedAt ?? null}, consulted_at),
        scope = ${scopeJson},
        budget = ${budgetStr},
        completion_year = ${completionYearStr},
        site_measurement_at = ${siteMeasurementAtStr},
        estimate_meeting_at = ${estimateMeetingAtStr},
        material_meeting_at = ${materialMeetingAtStr}
      WHERE id = ${consultationId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 상담을 찾을 수 없거나 수정 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("consultations PATCH error:", error);
    const message =
      error instanceof Error && /consulted_at|column/i.test(error.message)
        ? "DB에 consulted_at 또는 scope 컬럼이 없을 수 있습니다. Vercel/Neon SQL에서 sql/add_consulted_at.sql, sql/add_scope.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * 상담 삭제 (선택삭제 시)
 */
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
    const consultationId = parseInt(id, 10);
    if (Number.isNaN(consultationId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM consultations
      WHERE id = ${consultationId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 상담을 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("consultations DELETE error:", error);
    const message =
      error instanceof Error && /consulted_at|column/i.test(error.message)
        ? "DB에 consulted_at 또는 scope 컬럼이 없을 수 있습니다. Vercel/Neon SQL에서 sql/add_consulted_at.sql, sql/add_scope.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
