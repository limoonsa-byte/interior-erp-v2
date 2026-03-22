import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

function sumCustomerPaymentJson(raw: unknown): number {
  if (raw == null) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  try {
    const parsed = JSON.parse(str) as unknown;
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce((s: number, r: { amount?: unknown }) => s + (Number((r as { amount?: unknown })?.amount) || 0), 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get("company");
    if (!cookie?.value) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    let company: { id: number };
    try {
      company = JSON.parse(cookie.value) as { id: number };
    } catch {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    let rows: { estimate_id: number; customer_payment?: string | null }[];
    try {
      const result = await sql`
        SELECT estimate_id, customer_payment
        FROM estimate_settlements
        WHERE company_id = ${company.id}
      `;
      rows = result.rows as { estimate_id: number; customer_payment?: string | null }[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/column.*customer_payment|customer_payment.*does not exist/i.test(msg)) {
        const result = await sql`
          SELECT estimate_id
          FROM estimate_settlements
          WHERE company_id = ${company.id}
        `;
        rows = (result.rows as { estimate_id: number }[]).map((r) => ({
          estimate_id: r.estimate_id,
          customer_payment: null,
        }));
      } else if (/relation.*does not exist|estimate_settlements/i.test(msg)) {
        return NextResponse.json({ summaries: {} }, { status: 200 });
      } else {
        throw e;
      }
    }

    const summaries: Record<string, number> = {};
    for (const row of rows) {
      const id = Number(row.estimate_id);
      if (Number.isNaN(id)) continue;
      summaries[String(id)] = sumCustomerPaymentJson(row.customer_payment);
    }
    return NextResponse.json({ summaries }, { status: 200 });
  } catch (error) {
    console.error("settlement-summaries GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
