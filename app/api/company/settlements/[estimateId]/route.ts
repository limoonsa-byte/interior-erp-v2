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
    const result = await sql`
      SELECT items, settled_at, created_at, updated_at
      FROM estimate_settlements
      WHERE estimate_id = ${eid} AND company_id = ${company.id}
    `;
    if (result.rows.length === 0) {
      return NextResponse.json(null, { status: 200 });
    }
    const row = result.rows[0] as { items: unknown; settled_at: unknown; created_at: unknown; updated_at: unknown };
    let items: { amount: number; memo: string }[] = [];
    if (row.items != null && String(row.items).trim() !== "") {
      try {
        const parsed = JSON.parse(String(row.items)) as unknown;
        items = Array.isArray(parsed)
          ? (parsed as { amount?: number; memo?: string }[]).map((x) => ({
              amount: Number(x?.amount) || 0,
              memo: typeof x?.memo === "string" ? x.memo : "",
            }))
          : [];
      } catch {
        items = [];
      }
    }
    return NextResponse.json({
      items,
      settledAt: toYYYYMMDD(row.settled_at),
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
    const { items, settledAt } = body;
    const itemsArray = Array.isArray(items)
      ? items.map((x: { amount?: number; memo?: string }) => ({
          amount: Number((x as { amount?: number }).amount) || 0,
          memo: typeof (x as { memo?: string }).memo === "string" ? (x as { memo: string }).memo : "",
        }))
      : [];
    const itemsJson = JSON.stringify(itemsArray);
    const settledAtVal =
      settledAt != null && String(settledAt).trim() !== ""
        ? String(settledAt).trim().slice(0, 10)
        : null;
    const settledAtFinal =
      settledAtVal && /^\d{4}-\d{2}-\d{2}$/.test(settledAtVal) ? settledAtVal : null;
    await sql`
      INSERT INTO estimate_settlements (estimate_id, company_id, items, settled_at, updated_at)
      VALUES (${eid}, ${company.id}, ${itemsJson}, ${settledAtFinal}, NOW())
      ON CONFLICT (estimate_id) DO UPDATE SET
        items = EXCLUDED.items,
        settled_at = EXCLUDED.settled_at,
        updated_at = NOW()
    `;
    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("settlements PUT error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
