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

export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json([], { status: 200 });
    let result: Awaited<ReturnType<typeof sql>>;
    try {
      result = await sql`
      SELECT id, company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, pic_name, created_at
      FROM estimates WHERE company_id = ${company.id} ORDER BY id DESC
    `;
    } catch (colErr) {
      const msg = colErr instanceof Error ? colErr.message : String(colErr);
      if (/column.*pic_name/i.test(msg)) {
        result = await sql`
      SELECT id, company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, created_at
      FROM estimates WHERE company_id = ${company.id} ORDER BY id DESC
    `;
      } else {
        throw colErr;
      }
    }
    const rows = result.rows.map((row: Record<string, unknown>) => {
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
        overheadPercent: row.overhead_percent != null ? Number(row.overhead_percent) : 5,
        profitPercent: row.profit_percent != null ? Number(row.profit_percent) : 10,
        picName: row.pic_name != null ? String(row.pic_name) : undefined,
        createdAt: row.created_at != null ? String(row.created_at) : undefined,
      };
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error("estimates GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const body = await request.json();
    const { consultationId, customerName, contact, address, title, estimateDate, note, items, processOrder, overheadPercent, profitPercent, picName } = body;
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : "[]";
    const processOrderJson = Array.isArray(processOrder) ? JSON.stringify(processOrder) : null;
    const estimateDateVal = estimateDate != null && String(estimateDate).trim() !== "" ? String(estimateDate).slice(0, 10) : null;
    const overheadVal = overheadPercent != null && !Number.isNaN(Number(overheadPercent)) ? Math.min(100, Math.max(0, Math.round(Number(overheadPercent)))) : 5;
    const profitVal = profitPercent != null && !Number.isNaN(Number(profitPercent)) ? Math.min(100, Math.max(0, Math.round(Number(profitPercent)))) : 10;
    const picNameVal = picName != null && String(picName).trim() !== "" ? String(picName).trim() : null;
    try {
      await sql`
      INSERT INTO estimates (company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, pic_name)
      VALUES (${company.id}, ${consultationId ?? null}, ${customerName ?? ""}, ${contact ?? ""}, ${address ?? ""}, ${title ?? ""}, ${estimateDateVal}, ${note ?? ""}, ${itemsJson}, ${processOrderJson}, ${overheadVal}, ${profitVal}, ${picNameVal})
    `;
    } catch (insertErr) {
      const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (/column.*pic_name/i.test(msg)) {
        await sql`
      INSERT INTO estimates (company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent)
      VALUES (${company.id}, ${consultationId ?? null}, ${customerName ?? ""}, ${contact ?? ""}, ${address ?? ""}, ${title ?? ""}, ${estimateDateVal}, ${note ?? ""}, ${itemsJson}, ${processOrderJson}, ${overheadVal}, ${profitVal})
    `;
      } else {
        throw insertErr;
      }
    }
    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("estimates POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
