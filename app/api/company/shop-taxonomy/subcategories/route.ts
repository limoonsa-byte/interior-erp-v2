import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";
import { ensureShopTaxonomySeeded } from "@/lib/shop-taxonomy-seed";

async function companyId(): Promise<number | null> {
  const session = await requireSecretSession();
  return session?.companyId ?? (await getCompanyIdFromLoginCookie());
}

/** 해당 회사에 등록된 구분 이름인지 */
async function lineExists(cid: number, shopLine: string): Promise<boolean> {
  const r = await sql`
    SELECT 1 FROM shop_taxonomy_lines WHERE company_id = ${cid} AND name = ${shopLine} LIMIT 1
  `;
  return r.rows.length > 0;
}

export async function GET(request: Request) {
  try {
    const cid = await companyId();
    if (!cid) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    await ensureShopTaxonomySeeded(cid);
    const url = new URL(request.url);
    const line = String(url.searchParams.get("line") || "").trim();
    if (!line) return NextResponse.json({ error: "line 파라미터가 필요합니다." }, { status: 400 });
    const result = await sql`
      SELECT id, name, sort_order
      FROM shop_taxonomy_subcategories
      WHERE company_id = ${cid} AND shop_line = ${line}
      ORDER BY sort_order ASC, name ASC
    `;
    const subcategories = (result.rows as { id: number; name: string; sort_order: number }[]).map((r) => ({
      id: r.id,
      name: r.name.trim(),
      sortOrder: r.sort_order,
    }));
    return NextResponse.json({ subcategories }, { status: 200 });
  } catch (e) {
    console.error("shop-taxonomy subcategories GET", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cid = await companyId();
    if (!cid) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    await ensureShopTaxonomySeeded(cid);
    const body = (await request.json().catch(() => ({}))) as { line?: string; name?: string };
    const shopLine = String(body.line ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!shopLine) return NextResponse.json({ error: "구분(line)이 필요합니다." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "하부 항목 이름을 입력하세요." }, { status: 400 });
    if (!(await lineExists(cid, shopLine))) {
      return NextResponse.json({ error: "등록된 구분이 아닙니다. 먼저 구분을 추가하세요." }, { status: 400 });
    }
    const maxR = await sql`
      SELECT COALESCE(MAX(sort_order), 0)::int AS m
      FROM shop_taxonomy_subcategories
      WHERE company_id = ${cid} AND shop_line = ${shopLine}
    `;
    const nextOrder = Number((maxR.rows[0] as { m?: number })?.m) + 1;
    const ins = await sql`
      INSERT INTO shop_taxonomy_subcategories (company_id, shop_line, name, sort_order)
      VALUES (${cid}, ${shopLine}, ${name}, ${nextOrder})
      ON CONFLICT (company_id, shop_line, name) DO NOTHING
      RETURNING id, name, sort_order
    `;
    if (ins.rows.length === 0) {
      return NextResponse.json({ error: "이 구분에 같은 하부 항목이 이미 있습니다." }, { status: 409 });
    }
    const row = ins.rows[0] as { id: number; name: string; sort_order: number };
    return NextResponse.json(
      { subcategory: { id: row.id, name: row.name.trim(), sortOrder: row.sort_order } },
      { status: 201 }
    );
  } catch (e) {
    console.error("shop-taxonomy subcategories POST", e);
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
    const del = await sql`
      DELETE FROM shop_taxonomy_subcategories WHERE company_id = ${cid} AND id = ${id} RETURNING id
    `;
    if (del.rows.length === 0) {
      return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("shop-taxonomy subcategories DELETE", e);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
