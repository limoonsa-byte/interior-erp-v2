import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

async function requireMaster() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    const fromCookie = JSON.parse(cookie.value) as { id: number };
    const result = await sql`
      SELECT id FROM companies WHERE id = ${fromCookie.id} AND is_master = true LIMIT 1
    `;
    return result.rows.length > 0 ? fromCookie : null;
  } catch {
    return null;
  }
}

/** 마스터 전용: 발주 기본 품목 엑셀 템플릿 다운로드 (DB 우선, 없으면 임베드 템플릿 사용) */
export async function GET() {
  try {
    const company = await requireMaster();
    if (!company) {
      return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
    }
    const headers = {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="발주_기본품목_템플릿.xlsx"`,
    };
    try {
      const row = await sql`
        SELECT file_content_base64 FROM master_order_template WHERE id = 1 LIMIT 1
      `;
      const base64 = row.rows[0]?.file_content_base64;
      if (base64 && typeof base64 === "string" && base64.length > 100) {
        const buf = Buffer.from(base64, "base64");
        return new NextResponse(new Uint8Array(buf), { status: 200, headers });
      }
    } catch {
      /* 테이블 없거나 조회 실패 → 임베드 사용 */
    }
    const mod = await import("@/lib/order-template-base64");
    const embed = mod.ORDER_TEMPLATE_BASE64;
    if (!embed || typeof embed !== "string" || embed.length < 100) {
      return NextResponse.json(
        { error: "템플릿 데이터가 없습니다. node scripts/generate-order-template.js 실행 후 재배포해 주세요." },
        { status: 500 }
      );
    }
    const buf = Buffer.from(embed, "base64");
    try {
      await sql`
        INSERT INTO master_order_template (id, file_content_base64, updated_at)
        VALUES (1, ${embed}, NOW())
        ON CONFLICT (id) DO UPDATE SET file_content_base64 = EXCLUDED.file_content_base64, updated_at = NOW()
      `;
    } catch {
      /* DB 저장 실패해도 응답은 내려감 */
    }
    return new NextResponse(new Uint8Array(buf), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("order-default template GET error:", msg);
    return NextResponse.json(
      { error: "템플릿 다운로드에 실패했습니다.", detail: msg },
      { status: 500 }
    );
  }
}
