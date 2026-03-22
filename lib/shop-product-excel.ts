/**
 * 비밀몰 상품 엑셀 import/export 공통 — 1행 헤더(한글·영문 별칭) 매핑
 */

export const SHOP_PRODUCT_KO_HEADERS = [
  "품목코드",
  "상품명",
  "구분",
  "하부",
  "브랜드",
  "규격",
  "단위",
  "정가",
  "판매가",
  "재고상태",
  "이미지URL",
  "상품링크",
  "판매여부",
] as const;

/** 공백·BOM 제거 후 조회용 키 */
export function compactHeaderKey(raw: string): string {
  return String(raw ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, "");
}

/** 엑셀 열 이름 → 내부 필드명 (sku, name, shop_line, …) */
const HEADER_TO_FIELD: Record<string, string> = {
  sku: "sku",
  품목코드: "sku",
  상품코드: "sku",
  name: "name",
  상품명: "name",
  품명: "name",
  제품명: "name",
  shop_line: "shop_line",
  구분: "shop_line",
  대분류: "shop_line",
  category: "category",
  하부: "category",
  분류: "category",
  카테고리: "category",
  brand: "brand",
  브랜드: "brand",
  제조사: "brand",
  spec: "spec",
  규격: "spec",
  unit: "unit",
  단위: "unit",
  price: "price",
  정가: "price",
  단가: "price",
  가격: "price",
  listprice: "price",
  list_price: "price",
  sale_price: "sale_price",
  판매가: "sale_price",
  할인가: "sale_price",
  stock_status: "stock_status",
  재고: "stock_status",
  재고상태: "stock_status",
  image_url: "image_url",
  imageurl: "image_url",
  이미지url: "image_url",
  이미지: "image_url",
  product_url: "product_url",
  상품링크: "product_url",
  링크: "product_url",
  is_active: "is_active",
  판매여부: "is_active",
  노출: "is_active",
  활성: "is_active",
};

for (const k of Object.keys(HEADER_TO_FIELD)) {
  if (/^[a-z_]+$/i.test(k)) HEADER_TO_FIELD[k.toLowerCase()] = HEADER_TO_FIELD[k]!;
}

export function normalizeShopProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, val] of Object.entries(row)) {
    const c = compactHeaderKey(rawKey);
    if (!c) continue;
    let field = HEADER_TO_FIELD[c] ?? HEADER_TO_FIELD[c.toLowerCase()];
    if (!field && /^[A-Za-z_][A-Za-z0-9_]*$/.test(c)) {
      field = HEADER_TO_FIELD[c.toLowerCase()];
    }
    if (!field) continue;
    if (out[field] === undefined) out[field] = val;
  }
  return out;
}
