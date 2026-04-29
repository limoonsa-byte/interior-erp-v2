import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** 정산「고객결제 상황」배열만 합산 */
function sumArrayCustomerPaymentOnly(raw: unknown): number {
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

/** 결제 승인서 approval_v1 합산 */
function sumApprovalV1Only(raw: unknown): number {
  if (raw == null) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  try {
    const parsed = JSON.parse(str) as unknown;
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      (parsed as { schema?: unknown }).schema !== "approval_v1" ||
      !Array.isArray((parsed as { sections?: unknown }).sections)
    ) {
      return 0;
    }
    const sections = (parsed as { sections: { entries?: { amount?: unknown }[] }[] }).sections;
    return sections.reduce(
      (sum, section) =>
        sum +
        (Array.isArray(section.entries)
          ? section.entries.reduce((sub, entry) => sub + (Number(entry?.amount) || 0), 0)
          : 0),
      0
    );
  } catch {
    return 0;
  }
}

type SetRow = {
  estimate_id: number;
  items?: string | null;
  customer_payment?: string | null;
  payment_approval_data?: string | null;
};

/** 정산 공정 items 합계(쓴금액) */
function sumSettlementItemsOnly(raw: unknown): number {
  if (raw == null) return 0;
  const str = String(raw).trim();
  if (!str) return 0;
  try {
    const parsed = JSON.parse(str) as unknown;
    if (!Array.isArray(parsed)) return 0;
    return (parsed as { amount?: unknown }[]).reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
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

    const summaries: Record<string, number> = {};
    const approvalSummaries: Record<string, number> = {};
    const usedSummaries: Record<string, number> = {};

    let setRows: SetRow[] = [];
    try {
      const result = await sql`
        SELECT estimate_id, items, customer_payment, payment_approval_data
        FROM estimate_settlements
        WHERE company_id = ${company.id}
      `;
      setRows = result.rows as SetRow[];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/payment_approval_data|does not exist/i.test(msg)) {
        try {
          const result = await sql`
            SELECT estimate_id, items, customer_payment
            FROM estimate_settlements
            WHERE company_id = ${company.id}
          `;
          setRows = (result.rows as { estimate_id: number; items?: string | null; customer_payment?: string | null }[]).map((r) => ({
            ...r,
            payment_approval_data: null,
          }));
        } catch (e2) {
          const m2 = e2 instanceof Error ? e2.message : String(e2);
          if (/relation.*does not exist|estimate_settlements/i.test(m2)) {
            setRows = [];
          } else {
            throw e2;
          }
        }
      } else if (/relation.*does not exist|estimate_settlements/i.test(msg)) {
        setRows = [];
      } else {
        throw e;
      }
    }

    for (const row of setRows) {
      const id = Number(row.estimate_id);
      if (Number.isNaN(id)) continue;
      const key = String(id);
      summaries[key] = sumArrayCustomerPaymentOnly(row.customer_payment);
      usedSummaries[key] = sumSettlementItemsOnly(row.items);
    }

    try {
      const appr = await sql`
        SELECT estimate_id, data_json FROM estimate_payment_approvals
        WHERE company_id = ${company.id}
      `;
      for (const row of appr.rows as { estimate_id: number; data_json?: unknown }[]) {
        const id = Number(row.estimate_id);
        if (Number.isNaN(id)) continue;
        approvalSummaries[String(id)] = sumApprovalV1Only(row.data_json);
      }
    } catch {
      /* 전용 테이블 없음 */
    }

    for (const row of setRows) {
      const id = Number(row.estimate_id);
      if (Number.isNaN(id)) continue;
      const key = String(id);
      if ((approvalSummaries[key] ?? 0) > 0) continue;
      let s = sumApprovalV1Only(row.payment_approval_data);
      if (s === 0) s = sumApprovalV1Only(row.customer_payment);
      if (s > 0) approvalSummaries[key] = s;
    }

    return NextResponse.json({ summaries, approvalSummaries, usedSummaries }, { status: 200 });
  } catch (error) {
    console.error("settlement-summaries GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
