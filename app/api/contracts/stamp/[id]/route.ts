import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";

/** 서명 링크(token)로 계약 회사의 도장 이미지 반환 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contractId = parseInt(id, 10);
    if (Number.isNaN(contractId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
    const row = await sql`
      SELECT c.company_id FROM contracts c
      WHERE c.id = ${contractId} AND c.sign_token = ${token}
    `;
    if (row.rows.length === 0) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    const companyId = Number(row.rows[0].company_id);
    const result = await sql`SELECT stamp_path AS path FROM companies WHERE id = ${companyId}`;
    if (result.rows.length === 0 || !result.rows[0].path) return NextResponse.json({ error: "도장 이미지가 없습니다." }, { status: 404 });
    const storedPath = String(result.rows[0].path);
    const baseDir = process.env.VERCEL ? path.join("/tmp", "company") : path.join(process.cwd(), "uploads", "company");
    const filePath = path.join(baseDir, storedPath.replace(/^company\//, ""));

    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      const dr = await sql`SELECT stamp_data AS d FROM companies WHERE id = ${companyId}`;
      const b64 = dr.rows[0]?.d;
      if (!b64 || typeof b64 !== "string") {
        return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 404 });
      }
      buf = Buffer.from(b64, "base64");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("contracts stamp GET error:", error);
    return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 404 });
  }
}
