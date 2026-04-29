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

function dbStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isApprovalV1JsonString(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  try {
    const p = JSON.parse(t) as unknown;
    return (
      p != null &&
      typeof p === "object" &&
      (p as { schema?: string }).schema === "approval_v1" &&
      Array.isArray((p as { sections?: unknown }).sections)
    );
  } catch {
    return false;
  }
}

/** 정산 API용 customer_payment: 결제 승인 JSON이 섞여 있으면 정산 화면에는 빈 배열로만 노출 */
function customerPaymentForSettlementApi(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (isApprovalV1JsonString(t)) return "[]";
  return t;
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

    type Row = { items: unknown; settled_at: unknown; customer_payment?: unknown; created_at: unknown; updated_at: unknown };
    let result: Awaited<ReturnType<typeof sql>>;
    try {
      result = await sql`
        SELECT items, settled_at, customer_payment, created_at, updated_at
        FROM estimate_settlements
        WHERE estimate_id = ${eid} AND company_id = ${company.id}
      `;
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

    const row = result.rows[0] as Row;
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

    const cpDb = row.customer_payment != null ? dbStr(row.customer_payment) : "";
    const customerPayment = customerPaymentForSettlementApi(cpDb);

    return NextResponse.json({
      items,
      settledAt: toYYYYMMDD(row.settled_at),
      customerPayment,
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

    const body = (await request.json()) as Record<string, unknown>;
    const hasCustomerPayment = Object.prototype.hasOwnProperty.call(body, "customerPayment");

    let customerPaymentIn: string | null = null;
    if (hasCustomerPayment) {
      const raw = body.customerPayment;
      if (raw != null) {
        customerPaymentIn = typeof raw === "string" ? raw.trim() || null : JSON.stringify(raw);
      } else {
        customerPaymentIn = null;
      }
    }

    const itemsArray = Array.isArray(body.items)
      ? (body.items as { amount?: number; memo?: string; subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }[]).map((x) => {
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

    const settledAt = body.settledAt;
    const settledAtVal =
      settledAt != null && String(settledAt).trim() !== ""
        ? String(settledAt).trim().slice(0, 10)
        : null;
    const settledAtFinal =
      settledAtVal && /^\d{4}-\d{2}-\d{2}$/.test(settledAtVal) ? settledAtVal : null;

    let prevCp: string | null = null;
    try {
      const prev = await sql`
        SELECT customer_payment FROM estimate_settlements
        WHERE estimate_id = ${eid} AND company_id = ${company.id}
      `;
      if (prev.rows.length > 0) {
        prevCp = prev.rows[0].customer_payment != null ? dbStr(prev.rows[0].customer_payment) : null;
      }
    } catch {
      /* ignore */
    }

    const nextCp = hasCustomerPayment ? customerPaymentIn : prevCp;

    const upsertWithCustomerPayment = () =>
      sql`
        INSERT INTO estimate_settlements (estimate_id, company_id, items, settled_at, customer_payment, updated_at)
        VALUES (${eid}, ${company.id}, ${itemsJson}, ${settledAtFinal}, ${nextCp}, NOW())
        ON CONFLICT (estimate_id) DO UPDATE SET
          items = EXCLUDED.items,
          settled_at = EXCLUDED.settled_at,
          customer_payment = EXCLUDED.customer_payment,
          updated_at = NOW()
      `;

    const upsertNoCustomerCol = () =>
      sql`
        INSERT INTO estimate_settlements (estimate_id, company_id, items, settled_at, updated_at)
        VALUES (${eid}, ${company.id}, ${itemsJson}, ${settledAtFinal}, NOW())
        ON CONFLICT (estimate_id) DO UPDATE SET
          items = EXCLUDED.items,
          settled_at = EXCLUDED.settled_at,
          updated_at = NOW()
      `;

    try {
      await upsertWithCustomerPayment();
    } catch (insertError) {
      const insertMsg = insertError instanceof Error ? insertError.message : String(insertError);
      if (/column.*customer_payment|customer_payment.*does not exist/i.test(insertMsg)) {
        try {
          await sql`ALTER TABLE estimate_settlements ADD COLUMN IF NOT EXISTS customer_payment TEXT`;
          await upsertWithCustomerPayment();
        } catch (e2) {
          console.error("settlements PUT after ADD customer_payment:", e2);
          await upsertNoCustomerCol();
        }
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
