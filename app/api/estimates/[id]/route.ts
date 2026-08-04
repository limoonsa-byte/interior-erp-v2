import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { displayProjectTitle } from "@/lib/projectTitle";

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

/** DB에서 나온 estimate_date (Date 객체 또는 문자열) → YYYY-MM-DD */
function toYYYYMMDD(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === "string") {
    const s = val.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return undefined;
}

function rowToEstimate(row: Record<string, unknown>) {
  let items: unknown[] = [];
  if (row.items != null && String(row.items).trim() !== "") {
    try {
      items = JSON.parse(String(row.items)) as unknown[];
    } catch {
      items = [];
    }
  }
  let processOrder: string[] | undefined;
  if (row.process_order != null && String(row.process_order).trim() !== "") {
    try {
      processOrder = JSON.parse(String(row.process_order)) as string[];
    } catch {
      processOrder = undefined;
    }
  }
  const consultationTitle =
    row.consultation_title != null ? String(row.consultation_title) : undefined;
  const rawTitle = row.title != null ? String(row.title) : "";
  const customerName = row.customer_name != null ? String(row.customer_name) : "";
  return {
    id: row.id,
    consultationId: row.consultation_id ?? undefined,
    customerName,
    contact: row.contact ?? "",
    address: row.address ?? "",
    title: rawTitle,
    displayTitle: displayProjectTitle({
      consultationTitle,
      estimateTitle: rawTitle,
      customerName,
    }),
    consultationTitle,
    estimateDate: toYYYYMMDD(row.estimate_date),
    note: row.note ?? "",
    items,
    processOrder,
    overheadPercent: row.overhead_percent != null ? Number(row.overhead_percent) : 5,
    profitPercent: row.profit_percent != null ? Number(row.profit_percent) : 10,
    picName: row.pic_name != null ? String(row.pic_name) : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { id } = await params;
    const estimateId = parseInt(id, 10);
    if (Number.isNaN(estimateId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }
    let result: Awaited<ReturnType<typeof sql>>;
    try {
      result = await sql`
        SELECT e.id, e.company_id, e.consultation_id, e.customer_name, e.contact, e.address, e.title, e.estimate_date, e.note, e.items, e.process_order, e.overhead_percent, e.profit_percent, e.pic_name, e.created_at,
               c.title AS consultation_title
        FROM estimates e
        LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = e.company_id
        WHERE e.id = ${estimateId} AND e.company_id = ${company.id}
      `;
    } catch (colErr) {
      const msg = colErr instanceof Error ? colErr.message : String(colErr);
      if (/column.*overhead_percent|column.*profit_percent/i.test(msg)) {
        result = await sql`
          SELECT e.id, e.company_id, e.consultation_id, e.customer_name, e.contact, e.address, e.title, e.estimate_date, e.note, e.items, e.process_order, e.created_at,
                 c.title AS consultation_title
          FROM estimates e
          LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = e.company_id
          WHERE e.id = ${estimateId} AND e.company_id = ${company.id}
        `;
      } else if (/column.*pic_name/i.test(msg)) {
        result = await sql`
          SELECT e.id, e.company_id, e.consultation_id, e.customer_name, e.contact, e.address, e.title, e.estimate_date, e.note, e.items, e.process_order, e.overhead_percent, e.profit_percent, e.created_at,
                 c.title AS consultation_title
          FROM estimates e
          LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = e.company_id
          WHERE e.id = ${estimateId} AND e.company_id = ${company.id}
        `;
      } else if (/consultation_title|c\.title|column.*title/i.test(msg)) {
        result = await sql`
          SELECT id, company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, pic_name, created_at
          FROM estimates
          WHERE id = ${estimateId} AND company_id = ${company.id}
        `;
      } else {
        throw colErr;
      }
    }
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(rowToEstimate(result.rows[0] as Record<string, unknown>));
  } catch (error) {
    console.error("estimates [id] GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

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
    const estimateId = parseInt(id, 10);
    if (Number.isNaN(estimateId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }
    const body = await request.json();
    const {
      consultationId,
      customerName,
      contact,
      address,
      title,
      estimateDate,
      note,
      items,
      processOrder,
      overheadPercent,
      profitPercent,
      picName,
    } = body;
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : null;
    const processOrderJson = Array.isArray(processOrder) ? JSON.stringify(processOrder) : undefined;
    const estimateDateVal = estimateDate != null && String(estimateDate).trim() !== "" ? String(estimateDate).slice(0, 10) : null;
    const overheadVal = overheadPercent != null && !Number.isNaN(Number(overheadPercent)) ? Math.min(100, Math.max(0, Math.round(Number(overheadPercent)))) : undefined;
    const profitVal = profitPercent != null && !Number.isNaN(Number(profitPercent)) ? Math.min(100, Math.max(0, Math.round(Number(profitPercent)))) : undefined;
    const picNameVal = picName !== undefined ? (picName != null && String(picName).trim() !== "" ? String(picName).trim() : null) : undefined;
    try {
      const result =
        picNameVal !== undefined
          ? await sql`
              UPDATE estimates
              SET
                consultation_id = COALESCE(${consultationId ?? null}, consultation_id),
                customer_name = COALESCE(${customerName ?? null}, customer_name),
                contact = COALESCE(${contact ?? null}, contact),
                address = COALESCE(${address ?? null}, address),
                title = COALESCE(${title ?? null}, title),
                estimate_date = ${estimateDateVal},
                note = COALESCE(${note ?? null}, note),
                items = COALESCE(${itemsJson}, items),
                process_order = COALESCE(${processOrderJson ?? null}, process_order),
                overhead_percent = COALESCE(${overheadVal ?? null}, overhead_percent),
                profit_percent = COALESCE(${profitVal ?? null}, profit_percent),
                pic_name = ${picNameVal}
              WHERE id = ${estimateId} AND company_id = ${company.id}
              RETURNING id
            `
          : await sql`
              UPDATE estimates
              SET
                consultation_id = COALESCE(${consultationId ?? null}, consultation_id),
                customer_name = COALESCE(${customerName ?? null}, customer_name),
                contact = COALESCE(${contact ?? null}, contact),
                address = COALESCE(${address ?? null}, address),
                title = COALESCE(${title ?? null}, title),
                estimate_date = ${estimateDateVal},
                note = COALESCE(${note ?? null}, note),
                items = COALESCE(${itemsJson}, items),
                process_order = COALESCE(${processOrderJson ?? null}, process_order),
                overhead_percent = COALESCE(${overheadVal ?? null}, overhead_percent),
                profit_percent = COALESCE(${profitVal ?? null}, profit_percent)
              WHERE id = ${estimateId} AND company_id = ${company.id}
              RETURNING id
            `;
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
      }
    } catch (updateErr) {
      const msg = updateErr instanceof Error ? updateErr.message : String(updateErr);
      if (/column.*overhead_percent|column.*profit_percent/i.test(msg)) {
        const result = await sql`
          UPDATE estimates
          SET
            consultation_id = COALESCE(${consultationId ?? null}, consultation_id),
            customer_name = COALESCE(${customerName ?? null}, customer_name),
            contact = COALESCE(${contact ?? null}, contact),
            address = COALESCE(${address ?? null}, address),
            title = COALESCE(${title ?? null}, title),
            estimate_date = ${estimateDateVal},
            note = COALESCE(${note ?? null}, note),
            items = COALESCE(${itemsJson}, items),
            process_order = COALESCE(${processOrderJson ?? null}, process_order)
          WHERE id = ${estimateId} AND company_id = ${company.id}
          RETURNING id
        `;
        if (result.rows.length === 0) {
          return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
        }
      } else if (/column.*pic_name/i.test(msg) && picNameVal !== undefined) {
        const result = await sql`
          UPDATE estimates
          SET
            consultation_id = COALESCE(${consultationId ?? null}, consultation_id),
            customer_name = COALESCE(${customerName ?? null}, customer_name),
            contact = COALESCE(${contact ?? null}, contact),
            address = COALESCE(${address ?? null}, address),
            title = COALESCE(${title ?? null}, title),
            estimate_date = ${estimateDateVal},
            note = COALESCE(${note ?? null}, note),
            items = COALESCE(${itemsJson}, items),
            process_order = COALESCE(${processOrderJson ?? null}, process_order),
            overhead_percent = COALESCE(${overheadVal ?? null}, overhead_percent),
            profit_percent = COALESCE(${profitVal ?? null}, profit_percent)
          WHERE id = ${estimateId} AND company_id = ${company.id}
          RETURNING id
        `;
        if (result.rows.length === 0) {
          return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
        }
      } else {
        throw updateErr;
      }
    }

    // 견적 폼 "프로젝트 제목" → 상담 프로젝트 제목 + 같은 상담 메인 견적 동기화
    if (title != null) {
      const { syncProjectTitleFromEstimate } = await import("@/lib/consultations-migrate");
      await syncProjectTitleFromEstimate({
        companyId: company.id,
        estimateId,
        consultationId: consultationId != null ? Number(consultationId) : null,
        title: String(title),
      });
    }

    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("estimates [id] PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

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
    const estimateId = parseInt(id, 10);
    if (Number.isNaN(estimateId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }
    const result = await sql`
      DELETE FROM estimates
      WHERE id = ${estimateId} AND company_id = ${company.id}
      RETURNING id
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("estimates [id] DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
