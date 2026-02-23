import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureConsultationsColumns } from "@/lib/consultations-migrate";

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
      materialOrderedAt,
      contractMeetingAt,
      designMeetingAt,
      constructionStartAt,
      moveInAt,
      schedulePhases,
      consultedDone,
      siteMeasurementDone,
      estimateMeetingDone,
      materialMeetingDone,
      contractMeetingDone,
      designMeetingDone,
    } = body;

    const scopeJson = Array.isArray(scope) ? JSON.stringify(scope) : null;
    const budgetStr = budget != null ? String(budget) : null;
    const completionYearStr = completionYear != null ? String(completionYear) : null;
    const siteMeasurementAtStr = siteMeasurementAt != null ? String(siteMeasurementAt) : null;
    const estimateMeetingAtStr = estimateMeetingAt != null ? String(estimateMeetingAt) : null;
    const materialMeetingAtStr = materialMeetingAt != null ? String(materialMeetingAt) : null;
    const materialOrderedAtStr = materialOrderedAt != null ? String(materialOrderedAt).slice(0, 10) : null;
    const contractMeetingAtStr = contractMeetingAt != null ? String(contractMeetingAt) : null;
    const designMeetingAtStr = designMeetingAt != null ? String(designMeetingAt) : null;
    const constructionStartAtStr = constructionStartAt != null ? String(constructionStartAt) : null;
    const moveInAtStr = moveInAt != null ? String(moveInAt) : null;
    const schedulePhasesJson = Array.isArray(schedulePhases)
      ? JSON.stringify(schedulePhases.map((p: { name?: string; start?: string; end?: string; color?: string }) => ({ name: String(p?.name ?? "").trim() || "공정", start: String(p?.start ?? "").slice(0, 10) || null, end: String(p?.end ?? "").slice(0, 10) || null, color: typeof p?.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(p.color) ? p.color : null })))
      : null;

    await ensureConsultationsColumns();

    let result: { rows: { id: number }[] };
    try {
      result = await sql`
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
          material_meeting_at = ${materialMeetingAtStr},
          material_ordered_at = COALESCE(${materialOrderedAtStr}, material_ordered_at),
          contract_meeting_at = ${contractMeetingAtStr},
          design_meeting_at = ${designMeetingAtStr},
          construction_start_at = COALESCE(${constructionStartAtStr}, construction_start_at),
          move_in_at = COALESCE(${moveInAtStr}, move_in_at),
          schedule_phases = COALESCE(${schedulePhasesJson}, schedule_phases),
          consulted_done = ${consultedDone === true},
          site_measurement_done = ${siteMeasurementDone === true},
          estimate_meeting_done = ${estimateMeetingDone === true},
          material_meeting_done = ${materialMeetingDone === true},
          contract_meeting_done = ${contractMeetingDone === true},
          design_meeting_done = ${designMeetingDone === true}
        WHERE id = ${consultationId} AND company_id = ${company.id}
        RETURNING id
      `;
    } catch (firstError) {
      const isColumnError =
        firstError instanceof Error && /consulted_at|scope|column|does not exist/i.test(firstError.message);
      if (isColumnError) {
        try {
          result = await sql`
            UPDATE consultations
            SET
              construction_start_at = COALESCE(${constructionStartAtStr}, construction_start_at),
              move_in_at = COALESCE(${moveInAtStr}, move_in_at),
              schedule_phases = COALESCE(${schedulePhasesJson}, schedule_phases)
            WHERE id = ${consultationId} AND company_id = ${company.id}
            RETURNING id
          `;
        } catch (fallbackError) {
          console.error("consultations PATCH fallback error:", fallbackError);
          return NextResponse.json(
            {
              error:
                "일정만 저장을 시도했으나 실패했습니다. DB에 construction_start_at, move_in_at, schedule_phases 컬럼이 있는지 확인하거나, 마이그레이션을 실행해 주세요.",
            },
            { status: 500 }
          );
        }
      } else {
        throw firstError;
      }
    }

    if (result!.rows.length === 0) {
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
