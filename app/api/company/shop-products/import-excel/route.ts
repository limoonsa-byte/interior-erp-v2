import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";
import { ensureShopProductsHitColumn } from "@/lib/ensure-shop-products-hit";
import { normalizeShopProductRow } from "@/lib/shop-product-excel";

const MAX_SIZE = 6 * 1024 * 1024;

type ImportRow = {
  sku: string;
  name: string;
  shopLine: string;
  category: string;
  brand: string;
  spec: string;
  unit: string;
  price: number;
  salePrice: number | null;
  stockStatus: string;
  imageUrl: string;
  productUrl: string;
  isActive: boolean;
  /** 엑셀에 히트 열이 있었을 때만 true — 없으면 기존 DB 값 유지 */
  hasHitExplicit: boolean;
  isHit: boolean;
};

function toBoolYN(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  if (v === "n" || v === "0" || v === "false" || v === "no") return false;
  if (v === "아니오" || v === "미판매" || v === "미노출" || v === "숨김") return false;
  return true;
}

function parseHitFromRow(n: Record<string, unknown>): { hasHitExplicit: boolean; isHit: boolean } {
  if (n.is_hit === undefined || n.is_hit === null) return { hasHitExplicit: false, isHit: false };
  const s = String(n.is_hit).trim();
  if (!s) return { hasHitExplicit: false, isHit: false };
  return { hasHitExplicit: true, isHit: toBoolYN(n.is_hit) };
}

function toNum(value: unknown): number {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

export async function POST(request: Request) {
  const session = await requireSecretSession();
  const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
  if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  try {
    await ensureShopProductsHitColumn();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 6MB 이하여야 합니다." }, { status: 400 });
    }
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "엑셀 시트가 없습니다." }, { status: 400 });
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
    if (!rows.length) {
      return NextResponse.json({ error: "시트 내용이 비어 있습니다." }, { status: 400 });
    }

    const parsed: ImportRow[] = [];
    const errors: { row: number; reason: string }[] = [];
    rows.forEach((r, idx) => {
      const rowNo = idx + 2;
      const n = normalizeShopProductRow(r);
      const sku = String(n.sku ?? "").trim();
      const name = String(n.name ?? "").trim();
      const price = toNum(n.price);
      const salePriceRaw = String(n.sale_price ?? "").trim();
      const salePrice = salePriceRaw ? toNum(salePriceRaw) : NaN;
      if (!sku) {
        errors.push({ row: rowNo, reason: "품목코드(sku) 누락" });
        return;
      }
      if (!name) {
        errors.push({ row: rowNo, reason: "상품명 누락" });
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        errors.push({ row: rowNo, reason: "정가(price) 숫자 오류" });
        return;
      }
      if (salePriceRaw && (!Number.isFinite(salePrice) || salePrice < 0)) {
        errors.push({ row: rowNo, reason: "판매가 숫자 오류" });
        return;
      }
      const shopLineRaw = n.shop_line ?? "";
      const hitParsed = parseHitFromRow(n);
      parsed.push({
        sku,
        name,
        shopLine: String(shopLineRaw ?? "").trim(),
        category: String(n.category ?? "").trim(),
        brand: String(n.brand ?? "").trim(),
        spec: String(n.spec ?? "").trim(),
        unit: String(n.unit ?? "").trim(),
        price,
        salePrice: salePriceRaw ? salePrice : null,
        stockStatus: String(n.stock_status ?? "").trim(),
        imageUrl: String(n.image_url ?? "").trim(),
        productUrl: String(n.product_url ?? "").trim(),
        isActive: toBoolYN(n.is_active),
        hasHitExplicit: hitParsed.hasHitExplicit,
        isHit: hitParsed.isHit,
      });
    });

    let success = 0;
    for (const item of parsed) {
      const insertHit = item.hasHitExplicit ? item.isHit : false;
      await sql`
        INSERT INTO shop_products (
          company_id, sku, name, shop_line, category, brand, spec, unit,
          price, sale_price, stock_status, image_url, product_url, is_active, is_hit, updated_at
        )
        VALUES (
          ${companyId}, ${item.sku}, ${item.name}, ${item.shopLine || null}, ${item.category || null}, ${item.brand || null}, ${item.spec || null}, ${item.unit || null},
          ${item.price}, ${item.salePrice}, ${item.stockStatus || null}, ${item.imageUrl || null}, ${item.productUrl || null}, ${item.isActive}, ${insertHit}, NOW()
        )
        ON CONFLICT (company_id, sku) DO UPDATE SET
          name = EXCLUDED.name,
          shop_line = EXCLUDED.shop_line,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          spec = EXCLUDED.spec,
          unit = EXCLUDED.unit,
          price = EXCLUDED.price,
          sale_price = EXCLUDED.sale_price,
          stock_status = EXCLUDED.stock_status,
          image_url = EXCLUDED.image_url,
          product_url = EXCLUDED.product_url,
          is_active = EXCLUDED.is_active,
          is_hit = CASE WHEN ${item.hasHitExplicit} THEN EXCLUDED.is_hit ELSE shop_products.is_hit END,
          updated_at = NOW()
      `;
      success += 1;
    }

    return NextResponse.json(
      {
        message: "엑셀 업로드 완료",
        totalRows: rows.length,
        success,
        failed: errors.length,
        errors: errors.slice(0, 200),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("shop-products import-excel error:", error);
    return NextResponse.json({ error: "엑셀 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
