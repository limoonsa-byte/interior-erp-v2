import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";
import { ensureShopProductsHitColumn } from "@/lib/ensure-shop-products-hit";
import { ensureShopTaxonomySeeded } from "@/lib/shop-taxonomy-seed";

type ShopProductRow = {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  spec: string | null;
  unit: string | null;
  price: string | number;
  sale_price: string | number | null;
  stock_status: string | null;
  image_url: string | null;
  product_url: string | null;
  shop_line: string | null;
  is_active: boolean;
  is_hit: boolean;
  updated_at: string | Date;
};

export async function GET(request: Request) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const category = (url.searchParams.get("category") || "").trim();
    const line = (url.searchParams.get("line") || "").trim();
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const includeLines = url.searchParams.get("includeLines") === "1";
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 200)));

    const hasQ = q.length > 0;
    const hasCat = category.length > 0;
    const hasLine = line.length > 0;
    const likeQ = hasQ ? `%${q}%` : "%";

    const result = await sql`
      SELECT id, sku, name, category, brand, spec, unit, price, sale_price, stock_status, image_url, product_url, shop_line, is_active, COALESCE(is_hit, false) AS is_hit, updated_at,
        (length(trim(COALESCE(image_data, ''))) > 0) AS has_image_blob
      FROM shop_products
      WHERE company_id = ${companyId}
        AND (${includeInactive} = true OR is_active = true)
        AND (${hasLine} = false OR shop_line = ${line})
        AND (${hasCat} = false OR category = ${category})
        AND (name ILIKE ${likeQ} OR sku ILIKE ${likeQ} OR COALESCE(spec,'') ILIKE ${likeQ})
      ORDER BY is_hit DESC, is_active DESC, updated_at DESC, id DESC
      LIMIT ${limit}
    `;

    const products = (
      result.rows as (ShopProductRow & { has_image_blob?: boolean })[]
    ).map((r) => {
      const extUrl = (r.image_url ?? "").trim();
      const imageUrl =
        extUrl ||
        (r.has_image_blob ? `/api/company/shop-product-image?sku=${encodeURIComponent(r.sku)}` : "");
      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        category: r.category ?? "",
        brand: r.brand ?? "",
        spec: r.spec ?? "",
        unit: r.unit ?? "",
        price: Number(r.price) || 0,
        salePrice: r.sale_price == null ? null : Number(r.sale_price) || 0,
        stockStatus: r.stock_status ?? "",
        imageUrl,
        productUrl: r.product_url ?? "",
        shopLine: r.shop_line ?? "",
        isActive: Boolean(r.is_active),
        isHit: Boolean(r.is_hit),
        updatedAt: r.updated_at != null ? String(r.updated_at) : "",
      };
    });

    if (includeLines) {
      await ensureShopTaxonomySeeded(companyId);
      const tr = await sql`
        SELECT name FROM shop_taxonomy_lines
        WHERE company_id = ${companyId}
        ORDER BY sort_order ASC, name ASC
      `;
      /** 상품 shop_line은 칩에 자동 노출하지 않음 — 구분은 관리에서만 추가·삭제 */
      const lines = (tr.rows as { name: string }[]).map((row) => row.name.trim()).filter(Boolean);
      return NextResponse.json({ products, lines }, { status: 200 });
    }

    return NextResponse.json({ products }, { status: 200 });
  } catch (error) {
    console.error("shop-products GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

type JsonBody = Record<string, unknown>;

function parsePrice(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function POST(request: Request) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    await ensureShopProductsHitColumn();
    const body = (await request.json().catch(() => ({}))) as JsonBody;
    const sku = String(body.sku ?? "").trim();
    const name = String(body.name ?? "").trim();
    const price = parsePrice(body.price);
    if (!sku) return NextResponse.json({ error: "sku가 필요합니다." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "상품명이 필요합니다." }, { status: 400 });
    if (price == null) return NextResponse.json({ error: "가격을 올바르게 입력해 주세요." }, { status: 400 });
    const saleRaw = body.salePrice;
    const salePrice =
      saleRaw === null || saleRaw === undefined || String(saleRaw).trim() === ""
        ? null
        : parsePrice(saleRaw);
    if (saleRaw != null && String(saleRaw).trim() !== "" && salePrice == null) {
      return NextResponse.json({ error: "할인가 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const shopLine = String(body.shopLine ?? "").trim() || null;
    const category = String(body.category ?? "").trim() || null;
    const brand = String(body.brand ?? "").trim() || null;
    const spec = String(body.spec ?? "").trim() || null;
    const unit = String(body.unit ?? "").trim() || null;
    const stockStatus = String(body.stockStatus ?? "").trim() || null;
    const imageUrl = String(body.imageUrl ?? "").trim() || null;
    const productUrl = String(body.productUrl ?? "").trim() || null;
    const isActive = !(body.isActive === false || body.isActive === "false" || body.isActive === 0);
    const isHit = body.isHit === true || body.isHit === "true" || body.isHit === 1;
    const dup = await sql`
      SELECT 1 FROM shop_products WHERE company_id = ${companyId} AND sku = ${sku} LIMIT 1
    `;
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "이미 같은 SKU가 있습니다." }, { status: 409 });
    }
    await sql`
      INSERT INTO shop_products (
        company_id, sku, name, shop_line, category, brand, spec, unit,
        price, sale_price, stock_status, image_url, product_url, is_active, is_hit, updated_at
      )
      VALUES (
        ${companyId}, ${sku}, ${name}, ${shopLine}, ${category}, ${brand}, ${spec}, ${unit},
        ${price}, ${salePrice}, ${stockStatus}, ${imageUrl}, ${productUrl}, ${isActive}, ${isHit}, NOW()
      )
    `;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("shop-products POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
