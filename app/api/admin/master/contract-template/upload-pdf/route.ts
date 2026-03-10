import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { ensureMasterContractTemplateDocumentPath } from "@/lib/master-contract-template-migrate";

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
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 마스터 전용: PDF 파일을 그대로 저장 (텍스트 추출 없음, 순서·볼드 등 유지) */
export async function POST(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    await ensureMasterContractTemplateDocumentPath();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "PDF 파일을 선택해 주세요." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }
    const dir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, MASTER_PDF_NAME);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buf);
    const documentPath = `contracts/${MASTER_PDF_NAME}`;
    await sql`
      UPDATE master_contract_template
      SET document_path = ${documentPath}, updated_at = NOW()
      WHERE id = 1
    `;
    return NextResponse.json({ message: "PDF가 그대로 저장되었습니다.", documentPath }, { status: 200 });
  } catch (error) {
    console.error("contract-template upload-pdf error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF 저장 실패" },
      { status: 500 }
    );
  }
}
