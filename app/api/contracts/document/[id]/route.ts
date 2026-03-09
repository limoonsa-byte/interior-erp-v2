import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";

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
    let allowed = false;
    if (token) {
      const row = await sql`SELECT id FROM contracts WHERE sign_token = ${token} AND id = ${contractId}`;
      allowed = row.rows.length > 0;
    }
    if (!allowed) {
      const company = await getCompanyFromCookie();
      if (company) {
        const row = await sql`SELECT id FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
        allowed = row.rows.length > 0;
      }
    }
    if (!allowed) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    const result = await sql`SELECT document_path FROM contracts WHERE id = ${contractId}`;
    if (result.rows.length === 0 || !result.rows[0].document_path) return NextResponse.json({ error: "문서가 없습니다." }, { status: 404 });
    const docPath = String(result.rows[0].document_path);
    const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    const fileName = docPath.startsWith("contracts/") ? docPath.slice("contracts/".length) : path.basename(docPath);
    const filePath = path.join(baseDir, fileName);
    try {
      const buf = await readFile(filePath);
      const contentType = fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      return new NextResponse(buf, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 404 });
    }
  } catch (error) {
    console.error("contracts document GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
