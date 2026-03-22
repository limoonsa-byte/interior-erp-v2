import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";

/** 비밀창고 상품에 업로드한 이미지 (DB image_data). 쿠키(ERP 로그인) 또는 비밀창고 세션으로만 조회 */
export async function GET(request: Request) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const url = new URL(request.url);
    const sku = decodeURIComponent((url.searchParams.get("sku") || "").trim());
    if (!sku) return NextResponse.json({ error: "sku가 필요합니다." }, { status: 400 });

    const result = await sql`
      SELECT image_data, image_mime
      FROM shop_products
      WHERE company_id = ${companyId} AND sku = ${sku}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }
    const row = result.rows[0] as { image_data: string | null; image_mime: string | null };
    const data = row.image_data?.trim();
    if (!data) {
      return NextResponse.json({ error: "저장된 이미지가 없습니다." }, { status: 404 });
    }
    const mime = (row.image_mime && row.image_mime.trim()) || "image/jpeg";
    let buf: Buffer;
    try {
      buf = Buffer.from(data, "base64");
    } catch {
      return NextResponse.json({ error: "이미지 데이터 오류" }, { status: 500 });
    }
    if (buf.length === 0) {
      return NextResponse.json({ error: "이미지 데이터 오류" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("shop-product-image GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
