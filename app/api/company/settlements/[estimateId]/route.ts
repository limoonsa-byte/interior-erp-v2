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

function toYYYYMMDD(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === "string") {
    const s = val.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  }
  if (val instanceof Date && !Number.isNaN((val as Date).getTime())) {
    const d = val as Date;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { estimateId } = await params;
    const eid = parseInt(estimateId, 10);
    if (Number.isNaN(eid)) {
      return NextResponse.json({ error: "잘못된 견적 ID" }, { status: 400 });
    }
    let result: Awaited<ReturnType<typeof sql>>;
    let hasCustomerPayment = false;
    try {
      result = await sql`
        SELECT items, settled_at, customer_payment, created_at, updated_at
        FROM estimate_settlements
        WHERE estimate_id = ${eid} AND company_id = ${company.id}
      `;
      hasCustomerPayment = true;
    } catch (colError) {
      const colMsg = colError instanceof Error ? colError.message : String(colError);
      if (/column.*customer_payment|customer_payment.*does not exist/i.test(colMsg)) {
        result = await sql`
          SELECT items, settled_at, created_at, updated_at
          FROM estimate_settlements
          WHERE estimate_id = ${eid} AND company_id = ${company.id}
        `;
      } else {
        throw colError;
      }
    }
    if (result.rows.length === 0) {
      return NextResponse.json(null, { status: 200 });
    }
    const row = result.rows[0] as { items: unknown; settled_at: unknown; customer_payment?: unknown; created_at: unknown; updated_at: unknown };
    let items: { amount: number; memo: string; subItems?: { amount: number; dateUsed: string; content: string; fromWorkLog?: boolean }[] }[] = [];
    if (row.items != null && String(row.items).trim() !== "") {
      try {
        const parsed = JSON.parse(String(row.items)) as unknown;
        items = Array.isArray(parsed)
          ? (parsed as { amount?: number; memo?: string; subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }[]).map((x) => ({
              amount: Number(x?.amount) || 0,
              memo: typeof x?.memo === "string" ? x.memo : "",
              subItems: Array.isArray(x?.subItems)
                ? (x.subItems as { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[])
                    .map((s) => ({
                      amount: Number(s?.amount) || 0,
                      dateUsed: typeof s?.dateUsed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.dateUsed.trim().slice(0, 10)) ? s.dateUsed.trim().slice(0, 10) : "",
                      content: typeof s?.content === "string" ? s.content : "",
                      ...(typeof (s as { fromWorkLog?: boolean }).fromWorkLog === "boolean" ? { fromWorkLog: (s as { fromWorkLog: boolean }).fromWorkLog } : {}),
                    }))
                : undefined,
            }))
          : [];
      } catch {
        items = [];
      }
    }
    return NextResponse.json({
      items,
      settledAt: toYYYYMMDD(row.settled_at),
      customerPayment: hasCustomerPayment && typeof row.customer_payment === "string" ? row.customer_payment : "",
      createdAt: row.created_at != null ? String(row.created_at) : undefined,
      updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
    });
  } catch (error) {
    console.error("settlements GET error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|estimate_settlements/i.test(msg)) {
      return NextResponse.json(null, { status: 200 });
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { estimateId } = await params;
    const eid = parseInt(estimateId, 10);
    if (Number.isNaN(eid)) {
      return NextResponse.json({ error: "잘못된 견적 ID" }, { status: 400 });
    }
    const estimateCheck = await sql`
      SELECT id FROM estimates WHERE id = ${eid} AND company_id = ${company.id}
    `;
    if (estimateCheck.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }
    const body = await request.json();
    const { items, settledAt, customerPayment } = body;
    const itemsArray = Array.isArray(items)
      ? items.map((x: { amount?: number; memo?: string; subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }) => {
          const subItems = Array.isArray((x as { subItems?: unknown }).subItems)
            ? ((x as { subItems: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }).subItems).map((s) => ({
                amount: Number(s?.amount) || 0,
                dateUsed: typeof s?.dateUsed === "string" ? String(s.dateUsed).trim().slice(0, 10) : "",
                content: typeof s?.content === "string" ? s.content : "",
                ...(typeof (s as { fromWorkLog?: boolean }).fromWorkLog === "boolean" ? { fromWorkLog: (s as { fromWorkLog: boolean }).fromWorkLog } : {}),
              }))
            : undefined;
          return {
            amount: Number((x as { amount?: number }).amount) || 0,
            memo: typeof (x as { memo?: string }).memo === "string" ? (x as { memo: string }).memo : "",
            ...(subItems && subItems.length > 0 ? { subItems } : {}),
          };
        })
      : [];
    const itemsJson = JSON.stringify(itemsArray);
    const settledAtVal =
      settledAt != null && String(settledAt).trim() !== ""
        ? String(settledAt).trim().slice(0, 10)
        : null;
    const settledAtFinal =
      settledAtVal && /^\d{4}-\d{2}-\d{2}$/.test(settledAtVal) ? settledAtVal : null;
    const customerPaymentVal =
      customerPayment != null && typeof customerPayment === "string" ? customerPayment.trim() : null;
    try {
      await sql`
        INSERT INTO estimate_settlements (estimate_id, company_id, items, settled_at, customer_payment, updated_at)
        VALUES (${eid}, ${company.id}, ${itemsJson}, ${settledAtFinal}, ${customerPaymentVal}, NOW())
        ON CONFLICT (estimate_id) DO UPDATE SET
          items = EXCLUDED.items,
          settled_at = EXCLUDED.settled_at,
          customer_payment = EXCLUDED.customer_payment,
          updated_at = NOW()
      `;
    } catch (insertError) {
      const insertMsg = insertError instanceof Error ? insertError.message : String(insertError);
      if (/column.*customer_payment|customer_payment.*does not exist/i.test(insertMsg)) {
        await sql`
          INSERT INTO estimate_settlements (estimate_id, company_id, items, settled_at, updated_at)
          VALUES (${eid}, ${company.id}, ${itemsJson}, ${settledAtFinal}, NOW())
          ON CONFLICT (estimate_id) DO UPDATE SET
            items = EXCLUDED.items,
            settled_at = EXCLUDED.settled_at,
            updated_at = NOW()
        `;
      } else {
        throw insertError;
      }
    }
    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("settlements PUT error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
