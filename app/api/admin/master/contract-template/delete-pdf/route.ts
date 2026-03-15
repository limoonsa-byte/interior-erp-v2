import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unlink } from "fs/promises";
import path from "path";
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

const MASTER_PDF_NAME = "master-template.pdf";

/** 마스터 전용: 저장된 계약서 PDF 삭제 (document_path, document_data 초기화) */
export async function POST() {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    await sql`
      UPDATE master_contract_template
      SET document_path = NULL, document_data = NULL, updated_at = NOW()
      WHERE id = 1
    `;
    const dir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    const filePath = path.join(dir, MASTER_PDF_NAME);
    try {
      await unlink(filePath);
    } catch {
      /* 파일 없으면 무시 */
    }
    return NextResponse.json({ message: "PDF가 삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("contract-template delete-pdf error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF 삭제 실패" },
      { status: 500 }
    );
  }
}
