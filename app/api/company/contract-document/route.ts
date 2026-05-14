import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { sql } from "@vercel/postgres";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number };
  } catch {
    return null;
  }
}

/** 디스크 → 마스터 PDF → 회사 양식 document_data → 해당 회사 계약 document_data 순으로 PDF/이미지 바이트 조회 */
async function loadContractFileBuffer(
  companyId: number,
  pathParam: string,
  filePath: string,
  fileName: string
): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch {
    /* 로컬 uploads 또는 Vercel /tmp에 없음 */
  }
  const normPath = pathParam.trim();
  if (fileName === "master-template.pdf") {
    try {
      const r = await sql`SELECT document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
      const data = r.rows[0]?.document_data;
      if (data && typeof data === "string" && data.trim()) {
        return Buffer.from(data, "base64");
      }
    } catch {
      return null;
    }
    return null;
  }
  try {
    await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS document_data TEXT`;
    const tpl = await sql`
      SELECT document_data FROM company_contract_template
      WHERE company_id = ${companyId} AND document_path = ${normPath}
      LIMIT 1
    `;
    const td = tpl.rows[0]?.document_data;
    if (td && typeof td === "string" && td.trim()) {
      return Buffer.from(td, "base64");
    }
  } catch {
    /* ignore */
  }
  try {
    await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_data TEXT`;
    const cr = await sql`
      SELECT document_data FROM contracts
      WHERE company_id = ${companyId}
        AND document_path = ${normPath}
        AND document_data IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const cd = cr.rows[0]?.document_data;
    if (cd && typeof cd === "string" && cd.trim()) {
      return Buffer.from(cd, "base64");
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 로그인 회사: 계약서 작성 시 본문 PDF 미리보기·PdfToA4Images용. Vercel 등 디스크 없을 때 DB document_data 사용 */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  if (!pathParam || typeof pathParam !== "string" || !pathParam.startsWith("contracts/") || pathParam.includes("..")) {
    return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  }
  const fileName = pathParam.slice("contracts/".length) || path.basename(pathParam);
  if (!fileName) return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
  const filePath = path.join(baseDir, fileName);
  let buf = await loadContractFileBuffer(company.id, pathParam, filePath, fileName);
  if (!buf) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  if (isPdf && fileName === "master-template.pdf") {
    try {
      const doc = await PDFDocument.load(buf);
      doc.setTitle("계약서양식");
      const bytes = await doc.save();
      buf = Buffer.from(bytes);
    } catch (_) {
      /* 메타데이터 수정 실패 시 원본 그대로 */
    }
  }
  const contentType = isPdf ? "application/pdf" : "image/png";
  const displayName = isPdf && fileName === "master-template.pdf" ? "계약서양식.pdf" : fileName;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(displayName)}"`,
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
