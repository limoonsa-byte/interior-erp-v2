import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cleanupOrphanEstimates } from "@/lib/cleanupOrphanEstimates";
import { ensureConsultationsColumns } from "@/lib/consultations-migrate";
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

export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json([], { status: 200 });
    // 삭제된 상담에 묶여 있던 고아 견적·계약·작업일지 등 정리 (사이드바 주요 메뉴 공통)
    try {
      await cleanupOrphanEstimates(company.id);
    } catch (cleanupErr) {
      console.error("estimates GET cleanup error:", cleanupErr);
    }
    await ensureConsultationsColumns();

    let result: Awaited<ReturnType<typeof sql>>;
    try {
      result = await sql`
      SELECT e.id, e.company_id, e.consultation_id, e.customer_name, e.contact, e.address, e.title, e.estimate_date, e.note, e.items, e.process_order, e.overhead_percent, e.profit_percent, e.pic_name, e.created_at,
             c.title AS consultation_title
      FROM estimates e
      LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = e.company_id
      WHERE e.company_id = ${company.id}
      ORDER BY e.id DESC
    `;
    } catch (colErr) {
      const msg = colErr instanceof Error ? colErr.message : String(colErr);
      if (/column.*pic_name/i.test(msg)) {
        result = await sql`
      SELECT e.id, e.company_id, e.consultation_id, e.customer_name, e.contact, e.address, e.title, e.estimate_date, e.note, e.items, e.process_order, e.overhead_percent, e.profit_percent, e.created_at,
             c.title AS consultation_title
      FROM estimates e
      LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = e.company_id
      WHERE e.company_id = ${company.id}
      ORDER BY e.id DESC
    `;
      } else if (/consultation_title|c\.title|column.*title/i.test(msg)) {
        // consultations.title 미적용 환경 폴백
        result = await sql`
      SELECT id, company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, pic_name, created_at
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
        /** 화면 표시용: 상담 프로젝트 제목 → 견적 제목 → 고객명 */
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
    let titleVal = title != null ? String(title).trim() : "";
    // 제목이 비어 있고 상담이 연결되어 있으면 상담 프로젝트 제목을 사용
    if (!titleVal && consultationId != null) {
      try {
        const consultRes = await sql`
          SELECT title FROM consultations
          WHERE id = ${Number(consultationId)} AND company_id = ${company.id}
          LIMIT 1
        `;
        titleVal = String(consultRes.rows[0]?.title ?? "").trim();
      } catch {
        // consultations.title 미적용 환경은 빈 제목 유지
      }
    }
    const itemsJson = Array.isArray(items) ? JSON.stringify(items) : "[]";
    const processOrderJson = Array.isArray(processOrder) ? JSON.stringify(processOrder) : null;
    const estimateDateVal = estimateDate != null && String(estimateDate).trim() !== "" ? String(estimateDate).slice(0, 10) : null;
    const overheadVal = overheadPercent != null && !Number.isNaN(Number(overheadPercent)) ? Math.min(100, Math.max(0, Math.round(Number(overheadPercent)))) : 5;
    const profitVal = profitPercent != null && !Number.isNaN(Number(profitPercent)) ? Math.min(100, Math.max(0, Math.round(Number(profitPercent)))) : 10;
    const picNameVal = picName != null && String(picName).trim() !== "" ? String(picName).trim() : null;
    try {
      await sql`
      INSERT INTO estimates (company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent, pic_name)
      VALUES (${company.id}, ${consultationId ?? null}, ${customerName ?? ""}, ${contact ?? ""}, ${address ?? ""}, ${titleVal}, ${estimateDateVal}, ${note ?? ""}, ${itemsJson}, ${processOrderJson}, ${overheadVal}, ${profitVal}, ${picNameVal})
    `;
    } catch (insertErr) {
      const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
      if (/column.*pic_name/i.test(msg)) {
        await sql`
      INSERT INTO estimates (company_id, consultation_id, customer_name, contact, address, title, estimate_date, note, items, process_order, overhead_percent, profit_percent)
      VALUES (${company.id}, ${consultationId ?? null}, ${customerName ?? ""}, ${contact ?? ""}, ${address ?? ""}, ${titleVal}, ${estimateDateVal}, ${note ?? ""}, ${itemsJson}, ${processOrderJson}, ${overheadVal}, ${profitVal})
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
