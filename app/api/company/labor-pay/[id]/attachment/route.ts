import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { parseAttachmentsJson } from "@/lib/laborPayAttachments";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

/** 회사: 인건비 제출 첨부 보기/다운로드 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const { id } = await params;
    const requestId = parseInt(id, 10);
    if (Number.isNaN(requestId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const index = parseInt(searchParams.get("index") ?? "0", 10);
    if (Number.isNaN(index) || index < 0) {
      return NextResponse.json({ error: "잘못된 첨부 번호입니다." }, { status: 400 });
    }

    const result = await sql`
      SELECT attachments_json FROM labor_pay_requests
      WHERE id = ${requestId} AND company_id = ${company.id}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }

    const list = parseAttachmentsJson((result.rows[0] as { attachments_json?: unknown }).attachments_json);
    const item = list[index];
    if (!item) {
      return NextResponse.json({ error: "첨부를 찾을 수 없습니다." }, { status: 404 });
    }

    const buf = Buffer.from(item.data, "base64");
    const headers = new Headers();
    headers.set("Content-Type", item.mime || "application/octet-stream");
    headers.set("Content-Length", String(buf.length));
    headers.set(
      "Content-Disposition",
      item.kind === "photo"
        ? `inline; filename*=UTF-8''${encodeURIComponent(item.name)}`
        : `attachment; filename*=UTF-8''${encodeURIComponent(item.name)}`
    );
    headers.set("Cache-Control", "private, max-age=3600");
    return new NextResponse(buf, { status: 200, headers });
  } catch (error) {
    console.error("labor-pay company attachment GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
