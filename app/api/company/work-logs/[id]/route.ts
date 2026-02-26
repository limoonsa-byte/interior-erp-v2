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

/** 작업일지 수정 */
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
    const logId = parseInt(id, 10);
    if (Number.isNaN(logId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const body = await request.json();
    const logDate = typeof body.log_date === "string" ? body.log_date.trim().slice(0, 10) : null;
    if (logDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json({ error: "작업일 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const content = typeof body.content === "string" ? body.content.trim() : null;
    let estimateId: number | null | undefined = undefined;
    if (body.estimate_id !== undefined) {
      if (body.estimate_id == null || body.estimate_id === "") estimateId = null;
      else {
        const n = Number(body.estimate_id);
        estimateId = Number.isInteger(n) && n > 0 ? n : null;
      }
    }
    let picId: number | null | undefined = undefined;
    if (body.pic_id !== undefined) {
      if (body.pic_id == null || body.pic_id === "") picId = null;
      else {
        const n = Number(body.pic_id);
        picId = Number.isInteger(n) && n > 0 ? n : null;
      }
    }

    if (estimateId != null) {
      const est = await sql`SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1`;
      if (est.rows.length === 0) {
        return NextResponse.json({ error: "선택한 견적을 찾을 수 없습니다." }, { status: 400 });
      }
    }
    if (picId != null) {
      const pic = await sql`SELECT id FROM company_pics WHERE id = ${picId} AND company_id = ${company.id} LIMIT 1`;
      if (pic.rows.length === 0) {
        return NextResponse.json({ error: "선택한 담당자를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const existing = await sql`
      SELECT id, log_date, content, estimate_id, pic_id FROM company_work_logs WHERE id = ${logId} AND company_id = ${company.id} LIMIT 1
    `;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "해당 작업일지를 찾을 수 없습니다." }, { status: 404 });
    }

    const row = existing.rows[0] as { log_date: unknown; content: string | null; estimate_id: number | null; pic_id: number | null };
    function toDateStr(val: unknown): string {
      if (val == null) return "";
      if (typeof val === "string") return val.trim().slice(0, 10);
      if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString().slice(0, 10);
      return "";
    }
    const finalLogDate = logDate != null && /^\d{4}-\d{2}-\d{2}$/.test(logDate.trim().slice(0, 10))
      ? logDate.trim().slice(0, 10)
      : toDateStr(row.log_date);
    const finalContent = content !== null ? content : (row.content ?? "");
    const finalEstimateId = estimateId !== undefined ? estimateId : row.estimate_id;
    const finalPicId = picId !== undefined ? picId : row.pic_id;

    if (!finalLogDate || !/^\d{4}-\d{2}-\d{2}$/.test(finalLogDate)) {
      return NextResponse.json({ error: "작업일 형식이 올바르지 않습니다." }, { status: 400 });
    }

    let expensesJson: string | null = null;
    let updateExpenses = false;
    if (body.expenses !== undefined) {
      updateExpenses = true;
      if (!Array.isArray(body.expenses)) expensesJson = null;
      else {
        const arr = body.expenses
          .filter((x: unknown): x is { label?: string; content?: string; amount?: number } => x != null && typeof x === "object")
          .map((x: { label?: string; content?: string; amount?: number }) => ({
            label: typeof x.label === "string" ? x.label.trim() : "",
            content: typeof x.content === "string" ? x.content.trim() : "",
            amount: Number(x.amount) || 0,
          }))
          .filter((x: { label: string; content: string; amount: number }) => x.label !== "" || x.content !== "" || x.amount !== 0);
        expensesJson = arr.length > 0 ? JSON.stringify(arr) : null;
      }
    }

    // 한 번의 UPDATE로 모든 필드 반영 (DB에 확실히 반영되도록)
    try {
      if (updateExpenses) {
        const result = await sql`
          UPDATE company_work_logs
          SET log_date = ${finalLogDate}::date, content = ${finalContent},
              estimate_id = ${finalEstimateId}, pic_id = ${finalPicId}, expenses = ${expensesJson}
          WHERE id = ${logId} AND company_id = ${company.id}
          RETURNING id, log_date
        `;
        if (result.rows.length > 0) {
          const updated = result.rows[0] as { id: number; log_date: unknown };
          const savedDate = typeof updated.log_date === "string" ? updated.log_date.slice(0, 10) : "";
          return NextResponse.json({ message: "저장되었습니다.", log_date: savedDate }, { status: 200 });
        }
      } else {
        const result = await sql`
          UPDATE company_work_logs
          SET log_date = ${finalLogDate}::date, content = ${finalContent},
              estimate_id = ${finalEstimateId}, pic_id = ${finalPicId}
          WHERE id = ${logId} AND company_id = ${company.id}
          RETURNING id, log_date
        `;
        if (result.rows.length > 0) {
          const updated = result.rows[0] as { id: number; log_date: unknown };
          const savedDate = typeof updated.log_date === "string" ? updated.log_date.slice(0, 10) : "";
          return NextResponse.json({ message: "저장되었습니다.", log_date: savedDate }, { status: 200 });
        }
      }
    } catch (upErr) {
      const upMsg = upErr instanceof Error ? upErr.message : "";
      if (updateExpenses && /column.*expenses|expenses.*does not exist/i.test(upMsg)) {
        const result = await sql`
          UPDATE company_work_logs
          SET log_date = ${finalLogDate}::date, content = ${finalContent},
              estimate_id = ${finalEstimateId}, pic_id = ${finalPicId}
          WHERE id = ${logId} AND company_id = ${company.id}
          RETURNING id, log_date
        `;
        if (result.rows.length > 0) {
          const updated = result.rows[0] as { id: number; log_date: unknown };
          const savedDate = typeof updated.log_date === "string" ? updated.log_date.slice(0, 10) : "";
          return NextResponse.json({ message: "저장되었습니다.", log_date: savedDate }, { status: 200 });
        }
      }
      throw upErr;
    }

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company work-logs PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 작업일지 삭제 */
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
    const logId = parseInt(id, 10);
    if (Number.isNaN(logId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM company_work_logs
      WHERE id = ${logId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 작업일지를 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company work-logs DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
