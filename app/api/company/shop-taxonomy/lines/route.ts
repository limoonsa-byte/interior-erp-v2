import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";
import { ensureShopTaxonomySeeded } from "@/lib/shop-taxonomy-seed";

async function companyId(): Promise<number | null> {
  const session = await requireSecretSession();
  return session?.companyId ?? (await getCompanyIdFromLoginCookie());
}

export async function GET() {
  try {
    const cid = await companyId();
    if (!cid) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    await ensureShopTaxonomySeeded(cid);
    const result = await sql`
      SELECT id, name, sort_order
      FROM shop_taxonomy_lines
      WHERE company_id = ${cid}
      ORDER BY sort_order ASC, name ASC
    `;
    const lines = (result.rows as { id: number; name: string; sort_order: number }[]).map((r) => ({
      id: r.id,
      name: r.name.trim(),
      sortOrder: r.sort_order,
    }));
    return NextResponse.json({ lines }, { status: 200 });
  } catch (e) {
    console.error("shop-taxonomy lines GET", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cid = await companyId();
    if (!cid) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    await ensureShopTaxonomySeeded(cid);
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "구분 이름을 입력하세요." }, { status: 400 });
    const maxR = await sql`
      SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM shop_taxonomy_lines WHERE company_id = ${cid}
    `;
    const nextOrder = Number((maxR.rows[0] as { m?: number })?.m) + 1;
    const ins = await sql`
      INSERT INTO shop_taxonomy_lines (company_id, name, sort_order)
      VALUES (${cid}, ${name}, ${nextOrder})
      ON CONFLICT (company_id, name) DO NOTHING
      RETURNING id, name, sort_order
    `;
    if (ins.rows.length === 0) {
      return NextResponse.json({ error: "이미 같은 구분이 있습니다." }, { status: 409 });
    }
    const row = ins.rows[0] as { id: number; name: string; sort_order: number };
    return NextResponse.json(
      { line: { id: row.id, name: row.name.trim(), sortOrder: row.sort_order } },
      { status: 201 }
    );
  } catch (e) {
    console.error("shop-taxonomy lines POST", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const cid = await companyId();
    if (!cid) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") || "");
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    }
    const lineRow = await sql`
      SELECT name FROM shop_taxonomy_lines WHERE company_id = ${cid} AND id = ${id} LIMIT 1
    `;
    if (lineRow.rows.length === 0) {
      return NextResponse.json({ error: "구분을 찾을 수 없습니다." }, { status: 404 });
    }
    const lineName = String((lineRow.rows[0] as { name: string }).name);
    await sql`DELETE FROM shop_taxonomy_subcategories WHERE company_id = ${cid} AND shop_line = ${lineName}`;
    await sql`DELETE FROM shop_taxonomy_lines WHERE company_id = ${cid} AND id = ${id}`;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("shop-taxonomy lines DELETE", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
