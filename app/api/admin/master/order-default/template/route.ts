import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { readFile } from "fs/promises";
import path from "path";

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

const TEMPLATE_FILENAME = "발주_기본품목_템플릿.xlsx";

/** 마스터 전용: 발주 기본 품목 엑셀 템플릿 다운로드 (public 파일 → DB → 임베드 순) */
export async function GET() {
  try {
    const company = await requireMaster();
    if (!company) {
      return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
    }
    const headers = {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILENAME}"`,
    };

    // 1) public 폴더 정적 파일 (로컬/일부 배포)
    try {
      const filePath = path.join(process.cwd(), "public", TEMPLATE_FILENAME);
      const buf = await readFile(filePath);
      if (buf.length > 0) {
        return new NextResponse(new Uint8Array(buf), { status: 200, headers });
      }
    } catch {
      /* 없으면 다음 시도 */
    }

    // 1.5) 같은 배포의 정적 URL에서 가져오기 (Vercel에서 public은 CDN으로 서빙됨)
    try {
      const base = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000";
      const url = `${base}/${encodeURIComponent(TEMPLATE_FILENAME)}`;
      const res = await fetch(url);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 0) {
          return new NextResponse(ab, { status: 200, headers });
        }
      }
    } catch {
      /* 다음 시도 */
    }

    // 2) DB
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
      /* 테이블 없거나 조회 실패 */
    }

    // 3) 코드 임베드 (동적 import - 서버리스에서 실패할 수 있음)
    try {
      const mod = await import("@/lib/order-template-base64");
      const embed = mod.ORDER_TEMPLATE_BASE64;
      if (embed && typeof embed === "string" && embed.length > 100) {
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
      }
    } catch {
      /* 임베드 로드 실패 */
    }

    return NextResponse.json(
      { error: "템플릿 파일을 불러올 수 없습니다. 관리자에게 문의하세요." },
      { status: 500 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("order-default template GET error:", msg);
    return NextResponse.json(
      { error: "템플릿 다운로드에 실패했습니다.", detail: msg },
      { status: 500 }
    );
  }
}
