import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureConsultationsColumns } from "@/lib/consultations-migrate";
import { cleanupOrphanEstimates } from "@/lib/cleanupOrphanEstimates";

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

function bodyHas(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

/** 요청에 키가 있을 때만 문자열·null 반영 (없으면 UPDATE에서 해당 컬럼 유지) */
function optionalTextField(body: Record<string, unknown>, key: string, raw: unknown): string | null {
  if (!bodyHas(body, key)) return null;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/**
 * 기존 상담 수정 (고객명 클릭 → 상세 모달 → 저장 시)
 * 공사 일정·자재발주 등 일부 필드만 PATCH 할 때, 보내지 않은 진행날짜·완료 플래그가 지워지지 않도록
 * body에 포함된 키만 갱신한다.
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

    const body = (await request.json()) as Record<string, unknown>;
    const {
      title,
      customerName,
      contact,
      email,
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

    const hasTitle = bodyHas(body, "title");
    const hasCustomerName = bodyHas(body, "customerName");
    const hasContact = bodyHas(body, "contact");
    const hasEmail = bodyHas(body, "email");
    const hasAddress = bodyHas(body, "address");
    const hasPyung = bodyHas(body, "pyung");
    const hasStatus = bodyHas(body, "status");
    const hasPic = bodyHas(body, "pic");
    const hasNote = bodyHas(body, "note");
    const titleStr = hasTitle
      ? title != null
        ? String(title).trim() || null
        : null
      : null;
    const hasConsultedAt = bodyHas(body, "consultedAt");
    const hasScope = bodyHas(body, "scope");
    const hasBudget = bodyHas(body, "budget");
    const hasCompletionYear = bodyHas(body, "completionYear");
    const hasSiteMeasurementAt = bodyHas(body, "siteMeasurementAt");
    const hasEstimateMeetingAt = bodyHas(body, "estimateMeetingAt");
    const hasMaterialMeetingAt = bodyHas(body, "materialMeetingAt");
    const hasMaterialOrderedAt = bodyHas(body, "materialOrderedAt");
    const hasContractMeetingAt = bodyHas(body, "contractMeetingAt");
    const hasDesignMeetingAt = bodyHas(body, "designMeetingAt");
    const hasConstructionStartAt = bodyHas(body, "constructionStartAt");
    const hasMoveInAt = bodyHas(body, "moveInAt");
    const hasSchedulePhases = bodyHas(body, "schedulePhases");
    const hasConsultedDone = bodyHas(body, "consultedDone");
    const hasSiteMeasurementDone = bodyHas(body, "siteMeasurementDone");
    const hasEstimateMeetingDone = bodyHas(body, "estimateMeetingDone");
    const hasMaterialMeetingDone = bodyHas(body, "materialMeetingDone");
    const hasContractMeetingDone = bodyHas(body, "contractMeetingDone");
    const hasDesignMeetingDone = bodyHas(body, "designMeetingDone");
    const scheduleMemoProvided = bodyHas(body, "scheduleMemo");

    const scopeJson = Array.isArray(scope) ? JSON.stringify(scope) : null;
    const budgetStr = budget != null ? String(budget) : null;
    const completionYearStr = completionYear != null ? String(completionYear) : null;
    const siteMeasurementAtStr = optionalTextField(body, "siteMeasurementAt", siteMeasurementAt);
    const estimateMeetingAtStr = optionalTextField(body, "estimateMeetingAt", estimateMeetingAt);
    const materialMeetingAtStr = optionalTextField(body, "materialMeetingAt", materialMeetingAt);
    const materialOrderedAtStr = hasMaterialOrderedAt
      ? materialOrderedAt != null
        ? String(materialOrderedAt).slice(0, 10)
        : null
      : null;
    const contractMeetingAtStr = optionalTextField(body, "contractMeetingAt", contractMeetingAt);
    const designMeetingAtStr = optionalTextField(body, "designMeetingAt", designMeetingAt);
    const constructionStartAtStr = optionalTextField(body, "constructionStartAt", constructionStartAt);
    const moveInAtStr = optionalTextField(body, "moveInAt", moveInAt);
    const consultedAtStr = optionalTextField(body, "consultedAt", consultedAt);
    const schedulePhasesJson = Array.isArray(schedulePhases)
      ? JSON.stringify(
          schedulePhases.map((p: { name?: string; start?: string; end?: string; color?: string }) => ({
            name: String(p?.name ?? "").trim() || "공정",
            start: String(p?.start ?? "").slice(0, 10) || null,
            end: String(p?.end ?? "").slice(0, 10) || null,
            color:
              typeof p?.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(p.color) ? p.color : null,
          }))
        )
      : null;
    const scheduleMemoRaw = body.scheduleMemo;
    const scheduleMemoVal = scheduleMemoProvided
      ? String(scheduleMemoRaw ?? "").trim().slice(0, 4000) || null
      : null;

    await ensureConsultationsColumns();

    let result: { rows: { id: number }[] };
    try {
      result = await sql`
        UPDATE consultations
        SET
          title = CASE WHEN ${hasTitle} THEN ${titleStr} ELSE title END,
          customer_name = CASE WHEN ${hasCustomerName} THEN COALESCE(${customerName != null ? String(customerName) : null}, customer_name) ELSE customer_name END,
          contact = CASE WHEN ${hasContact} THEN COALESCE(${contact != null ? String(contact) : null}, contact) ELSE contact END,
          email = CASE WHEN ${hasEmail} THEN ${email != null ? String(email) : null} ELSE email END,
          address = CASE WHEN ${hasAddress} THEN COALESCE(${address != null ? String(address) : null}, address) ELSE address END,
          pyung = CASE WHEN ${hasPyung} THEN COALESCE(${pyung != null ? Number(pyung) : null}, pyung) ELSE pyung END,
          status = CASE WHEN ${hasStatus} THEN COALESCE(${status != null ? String(status) : null}, status) ELSE status END,
          pic = CASE WHEN ${hasPic} THEN COALESCE(${pic != null ? String(pic) : null}, pic) ELSE pic END,
          note = CASE WHEN ${hasNote} THEN COALESCE(${note != null ? String(note) : null}, note) ELSE note END,
          consulted_at = CASE WHEN ${hasConsultedAt} THEN ${consultedAtStr} ELSE consulted_at END,
          scope = CASE WHEN ${hasScope} THEN ${scopeJson} ELSE scope END,
          budget = CASE WHEN ${hasBudget} THEN ${budgetStr} ELSE budget END,
          completion_year = CASE WHEN ${hasCompletionYear} THEN ${completionYearStr} ELSE completion_year END,
          site_measurement_at = CASE WHEN ${hasSiteMeasurementAt} THEN ${siteMeasurementAtStr} ELSE site_measurement_at END,
          estimate_meeting_at = CASE WHEN ${hasEstimateMeetingAt} THEN ${estimateMeetingAtStr} ELSE estimate_meeting_at END,
          material_meeting_at = CASE WHEN ${hasMaterialMeetingAt} THEN ${materialMeetingAtStr} ELSE material_meeting_at END,
          material_ordered_at = CASE WHEN ${hasMaterialOrderedAt} THEN ${materialOrderedAtStr} ELSE material_ordered_at END,
          contract_meeting_at = CASE WHEN ${hasContractMeetingAt} THEN ${contractMeetingAtStr} ELSE contract_meeting_at END,
          design_meeting_at = CASE WHEN ${hasDesignMeetingAt} THEN ${designMeetingAtStr} ELSE design_meeting_at END,
          construction_start_at = CASE WHEN ${hasConstructionStartAt} THEN ${constructionStartAtStr} ELSE construction_start_at END,
          move_in_at = CASE WHEN ${hasMoveInAt} THEN ${moveInAtStr} ELSE move_in_at END,
          schedule_phases = CASE WHEN ${hasSchedulePhases} THEN ${schedulePhasesJson} ELSE schedule_phases END,
          consulted_done = CASE WHEN ${hasConsultedDone} THEN ${consultedDone === true} ELSE consulted_done END,
          site_measurement_done = CASE WHEN ${hasSiteMeasurementDone} THEN ${siteMeasurementDone === true} ELSE site_measurement_done END,
          estimate_meeting_done = CASE WHEN ${hasEstimateMeetingDone} THEN ${estimateMeetingDone === true} ELSE estimate_meeting_done END,
          material_meeting_done = CASE WHEN ${hasMaterialMeetingDone} THEN ${materialMeetingDone === true} ELSE material_meeting_done END,
          contract_meeting_done = CASE WHEN ${hasContractMeetingDone} THEN ${contractMeetingDone === true} ELSE contract_meeting_done END,
          design_meeting_done = CASE WHEN ${hasDesignMeetingDone} THEN ${designMeetingDone === true} ELSE design_meeting_done END,
          schedule_memo = CASE WHEN ${scheduleMemoProvided} THEN ${scheduleMemoVal} ELSE schedule_memo END
        WHERE id = ${consultationId} AND company_id = ${company.id}
        RETURNING id
      `;
    } catch (firstError) {
      const isColumnError =
        firstError instanceof Error && /consulted_at|scope|column|does not exist/i.test(firstError.message);
      if (isColumnError && (hasConstructionStartAt || hasMoveInAt || hasSchedulePhases)) {
        try {
          result = await sql`
            UPDATE consultations
            SET
              construction_start_at = CASE WHEN ${hasConstructionStartAt} THEN ${constructionStartAtStr} ELSE construction_start_at END,
              move_in_at = CASE WHEN ${hasMoveInAt} THEN ${moveInAtStr} ELSE move_in_at END,
              schedule_phases = CASE WHEN ${hasSchedulePhases} THEN ${schedulePhasesJson} ELSE schedule_phases END,
              schedule_memo = CASE WHEN ${scheduleMemoProvided} THEN ${scheduleMemoVal} ELSE schedule_memo END
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
 * 연결된 견적·계약·작업일지 등도 함께 삭제. 일정(schedule_phases)은 상담 행에 있어 함께 제거됨.
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

    const owned = await sql`
      SELECT id FROM consultations
      WHERE id = ${consultationId} AND company_id = ${company.id}
      LIMIT 1
    `;
    if (owned.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 상담을 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    const estimateRows = await sql`
      SELECT id FROM estimates
      WHERE company_id = ${company.id} AND consultation_id = ${consultationId}
    `;
    const estimateIds = (estimateRows.rows as { id: number }[]).map((r) => Number(r.id)).filter((n) => !Number.isNaN(n));

    // 계약: 상담 직접 연결 + 해당 견적 연결
    await sql`
      DELETE FROM contracts
      WHERE company_id = ${company.id} AND consultation_id = ${consultationId}
    `;
    for (const estimateId of estimateIds) {
      await sql`
        DELETE FROM contracts
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
      `;
      await sql`
        DELETE FROM company_work_logs
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
      `;
      // FK CASCADE가 예전 DB에 없을 수 있어 자재발주·자재리스트도 명시 삭제
      await sql`
        DELETE FROM material_order_drafts
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
      `;
      try {
        await sql`
          DELETE FROM site_material_list_items
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        `;
        await sql`
          DELETE FROM site_material_list_sections
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        `;
      } catch {
        /* 테이블 없을 수 있음 */
      }
      try {
        await sql`
          DELETE FROM estimate_settlements
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        `;
        await sql`
          DELETE FROM estimate_payment_approvals
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        `;
      } catch {
        /* ignore */
      }
    }

    // 견적 삭제 → 남은 CASCADE
    if (estimateIds.length > 0) {
      await sql`
        DELETE FROM estimates
        WHERE company_id = ${company.id} AND consultation_id = ${consultationId}
      `;
    }

    // 과거에 ON DELETE SET NULL 로 남은 고아 견적(상담 없음) 정리
    await cleanupOrphanEstimates(company.id);

    // 상담 삭제 → 일정 필드 포함, 채팅(상담) CASCADE
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

    return NextResponse.json(
      {
        message: "삭제되었습니다.",
        deletedEstimates: estimateIds.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("consultations DELETE error:", error);
    const message =
      error instanceof Error && /consulted_at|column/i.test(error.message)
        ? "DB에 consulted_at 또는 scope 컬럼이 없을 수 있습니다. Vercel/Neon SQL에서 sql/add_consulted_at.sql, sql/add_scope.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
