import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const { sku } = await params;
    const cleanSku = decodeURIComponent(String(sku || "")).trim();
    if (!cleanSku) return NextResponse.json({ error: "sku 누락" }, { status: 400 });
    const result = await sql`
      SELECT id, sku, name, category, brand, spec, unit, price, sale_price, stock_status, image_url, product_url, shop_line, is_active, updated_at,
        (length(trim(COALESCE(image_data, ''))) > 0) AS has_image_blob
      FROM shop_products
      WHERE company_id = ${companyId}
        AND sku = ${cleanSku}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }
    const r = result.rows[0] as {
      id: number;
      sku: string;
      name: string;
      category: string | null;
      brand: string | null;
      spec: string | null;
      unit: string | null;
      price: number | string;
      sale_price: number | string | null;
      stock_status: string | null;
      image_url: string | null;
      product_url: string | null;
      shop_line: string | null;
      is_active: boolean;
      updated_at: string | Date;
      has_image_blob?: boolean;
    };
    const extUrl = (r.image_url ?? "").trim();
    const imageUrl =
      extUrl ||
      (r.has_image_blob ? `/api/company/shop-product-image?sku=${encodeURIComponent(r.sku)}` : "");
    return NextResponse.json(
      {
        product: {
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
          updatedAt: String(r.updated_at ?? ""),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("shop-product detail GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

type JsonBody = Record<string, unknown>;

function parsePrice(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const { sku } = await params;
    const cleanSku = decodeURIComponent(String(sku || "")).trim();
    if (!cleanSku) return NextResponse.json({ error: "sku 누락" }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as JsonBody;
    const name = String(body.name ?? "").trim();
    const price = parsePrice(body.price);
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
    const expectedStoredImageUrl = `/api/company/shop-product-image?sku=${encodeURIComponent(cleanSku)}`;
    const keepStoredImage = imageUrl === expectedStoredImageUrl;
    const upd = await sql`
      UPDATE shop_products SET
        name = ${name},
        shop_line = ${shopLine},
        category = ${category},
        brand = ${brand},
        spec = ${spec},
        unit = ${unit},
        price = ${price},
        sale_price = ${salePrice},
        stock_status = ${stockStatus},
        image_url = ${imageUrl},
        image_data = CASE WHEN ${keepStoredImage} THEN image_data ELSE NULL END,
        image_mime = CASE WHEN ${keepStoredImage} THEN image_mime ELSE NULL END,
        product_url = ${productUrl},
        is_active = ${isActive},
        updated_at = NOW()
      WHERE company_id = ${companyId} AND sku = ${cleanSku}
      RETURNING id
    `;
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("shop-product PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
    const { sku } = await params;
    const cleanSku = decodeURIComponent(String(sku || "")).trim();
    if (!cleanSku) return NextResponse.json({ error: "sku 누락" }, { status: 400 });
    const del = await sql`
      DELETE FROM shop_products
      WHERE company_id = ${companyId} AND sku = ${cleanSku}
      RETURNING id
    `;
    if (del.rows.length === 0) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("shop-product DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
