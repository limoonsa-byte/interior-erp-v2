import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { normalizeAttachmentMime, parseAttachmentsJson } from "@/lib/laborPayAttachments";

/** 공개: 제출된 첨부 파일 다운로드/미리보기 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const accessToken = String(token ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "잘못된 링크입니다." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const index = parseInt(searchParams.get("index") ?? "0", 10);
    if (Number.isNaN(index) || index < 0) {
      return NextResponse.json({ error: "잘못된 첨부 번호입니다." }, { status: 400 });
    }

    const result = await sql`
      SELECT attachments_json FROM labor_pay_requests
      WHERE access_token = ${accessToken}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "링크를 찾을 수 없습니다." }, { status: 404 });
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
    console.error("labor-pay public attachment GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
