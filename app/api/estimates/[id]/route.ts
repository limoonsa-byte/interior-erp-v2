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
  return {
    id: row.id,
    consultationId: row.consultation_id ?? undefined,
    customerName: row.customer_name ?? "",
    contact: row.contact ?? "",
    address: row.address ?? "",
    title: row.title ?? "",
    estimateDate: toYYYYMMDD(row.estimate_date),
    note: row.note ?? "",
    items,
    processOrder,
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
    const result = await sql`
      SELECT id, company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, created_at
      FROM estimates
      WHERE id = ${estimateId} AND company_id = ${company.id}
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(rowToEstimate(result.rows[0]));
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
    } = body;
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : null;
    const processOrderJson = Array.isArray(processOrder) ? JSON.stringify(processOrder) : undefined;
    const estimateDateVal = estimateDate != null && String(estimateDate).trim() !== "" ? String(estimateDate).slice(0, 10) : null;
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
