import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_SIZE = 1024 * 1024; // 1MB (DB base64 한도 고려)

function internalImageUrl(sku: string): string {
  return `/api/company/shop-product-image?sku=${encodeURIComponent(sku)}`;
}

/** 상품 이미지 파일 → DB image_data + image_url(내부 API 경로) */
export async function POST(request: Request) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const formData = await request.formData();
    const sku = String(formData.get("sku") ?? "").trim();
    const file = formData.get("file");
    if (!sku) return NextResponse.json({ error: "sku가 필요합니다." }, { status: 400 });
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 1MB 이하여야 합니다." }, { status: 400 });
    }
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_TYPES.includes(mime)) {
      return NextResponse.json({ error: "PNG, JPG, GIF, WebP만 가능합니다." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = buf.toString("base64");

    const upd = await sql`
      UPDATE shop_products
      SET
        image_data = ${b64},
        image_mime = ${mime},
        image_url = ${internalImageUrl(sku)},
        updated_at = NOW()
      WHERE company_id = ${companyId} AND sku = ${sku}
      RETURNING id
    `;
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "해당 SKU 상품이 없습니다. 먼저 상품을 저장한 뒤 이미지를 올려 주세요." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, imageUrl: internalImageUrl(sku) }, { status: 200 });
  } catch (error) {
    console.error("shop-products upload-image error:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
