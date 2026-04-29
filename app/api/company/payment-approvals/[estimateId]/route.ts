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

/** 결제 승인서 JSON만 (정산 customer_payment 와 무관) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { estimateId } = await params;
    const eid = parseInt(estimateId, 10);
    if (Number.isNaN(eid)) return NextResponse.json({ error: "잘못된 견적 ID" }, { status: 400 });

    const est = await sql`
      SELECT id FROM estimates WHERE id = ${eid} AND company_id = ${company.id} LIMIT 1
    `;
    if (est.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    try {
      const r = await sql`
        SELECT data_json FROM estimate_payment_approvals
        WHERE estimate_id = ${eid} AND company_id = ${company.id}
      `;
      if (r.rows.length > 0) {
        const raw = (r.rows[0] as { data_json?: unknown }).data_json;
        const data = dbStr(raw);
        if (data.trim() && data.trim() !== "{}") {
          return NextResponse.json({ data });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/estimate_payment_approvals|does not exist/i.test(msg)) throw e;
    }

    /** 전용 테이블 비었으면 estimate_settlements 레거시에서 1회 읽기(정산 배열은 제외) */
    try {
      const s = await sql`
        SELECT customer_payment, payment_approval_data
        FROM estimate_settlements
        WHERE estimate_id = ${eid} AND company_id = ${company.id}
      `;
      if (s.rows.length > 0) {
        const row = s.rows[0] as { customer_payment?: unknown; payment_approval_data?: unknown };
        const paCol = row.payment_approval_data != null ? dbStr(row.payment_approval_data).trim() : "";
        if (paCol && isApprovalV1JsonString(paCol)) {
          return NextResponse.json({ data: paCol });
        }
        const cp = row.customer_payment != null ? dbStr(row.customer_payment).trim() : "";
        if (cp && isApprovalV1JsonString(cp)) {
          return NextResponse.json({ data: cp });
        }
      }
    } catch {
      /* ignore */
    }

    return NextResponse.json({ data: "" });
  } catch (error) {
    console.error("payment-approvals GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ estimateId: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { estimateId } = await params;
    const eid = parseInt(estimateId, 10);
    if (Number.isNaN(eid)) return NextResponse.json({ error: "잘못된 견적 ID" }, { status: 400 });

    const est = await sql`
      SELECT id FROM estimates WHERE id = ${eid} AND company_id = ${company.id} LIMIT 1
    `;
    if (est.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    const body = (await request.json()) as { data?: unknown };
    const raw = body.data;
    const dataJson =
      raw != null ? (typeof raw === "string" ? raw.trim() : JSON.stringify(raw)) : "{}";

    try {
      await sql`
        INSERT INTO estimate_payment_approvals (estimate_id, company_id, data_json, updated_at)
        VALUES (${eid}, ${company.id}, ${dataJson || "{}"}, NOW())
        ON CONFLICT (estimate_id) DO UPDATE SET
          data_json = EXCLUDED.data_json,
          updated_at = NOW()
      `;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/estimate_payment_approvals|does not exist/i.test(msg)) {
        await sql`
          CREATE TABLE IF NOT EXISTS estimate_payment_approvals (
            estimate_id INT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE,
            company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            data_json TEXT NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `;
        await sql`
          INSERT INTO estimate_payment_approvals (estimate_id, company_id, data_json, updated_at)
          VALUES (${eid}, ${company.id}, ${dataJson || "{}"}, NOW())
          ON CONFLICT (estimate_id) DO UPDATE SET
            data_json = EXCLUDED.data_json,
            updated_at = NOW()
        `;
      } else {
        throw e;
      }
    }

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("payment-approvals PUT error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
