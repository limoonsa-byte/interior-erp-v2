import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { ensureShopProductsHitColumn } from "@/lib/ensure-shop-products-hit";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";

function parseIsHit(v: unknown): boolean | null {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const { sku } = await params;
    const cleanSku = decodeURIComponent(String(sku || "")).trim();
    if (!cleanSku) return NextResponse.json({ error: "sku 누락" }, { status: 400 });
    await ensureShopProductsHitColumn();
    const body = (await request.json().catch(() => ({}))) as { isHit?: unknown };
    const isHit = parseIsHit(body.isHit);
    if (isHit === null) {
      return NextResponse.json({ error: "isHit(true/false)가 필요합니다." }, { status: 400 });
    }
    const upd = await sql`
      UPDATE shop_products SET is_hit = ${isHit}, updated_at = NOW()
      WHERE company_id = ${companyId} AND sku = ${cleanSku}
      RETURNING id
    `;
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, isHit }, { status: 200 });
  } catch (error) {
    console.error("shop-product hit PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
