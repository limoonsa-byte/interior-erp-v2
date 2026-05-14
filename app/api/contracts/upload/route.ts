import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { mergeContractBodyWithStoredAppendix } from "@/lib/mergeContractAppendixPdf";

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

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    const type = file.type?.toLowerCase() || "";
    if (!ALLOWED_TYPES.includes(type) && !type.startsWith("image/")) return NextResponse.json({ error: "PDF 또는 이미지 파일만 업로드 가능합니다." }, { status: 400 });
    const contractIdRaw = formData.get("contractId");
    const contractId = contractIdRaw != null ? parseInt(String(contractIdRaw), 10) : null;
    const mergeAppendixRaw = formData.get("mergeCompanyContractAppendix");
    const mergeAppendix =
      mergeAppendixRaw != null && ["1", "true", "yes"].includes(String(mergeAppendixRaw).toLowerCase());
    const companyTemplateRaw = formData.get("companyTemplate");
    const companyTemplate =
      companyTemplateRaw != null &&
      ["1", "true", "yes"].includes(String(companyTemplateRaw).toLowerCase());
    const dir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    await mkdir(dir, { recursive: true });
    const ext = type === "application/pdf" ? "pdf" : type.replace("image/", "") || "bin";
    const safeName = `${Date.now()}-${company.id}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const filePath = path.join(dir, safeName);
    let buf = Buffer.from(await file.arrayBuffer());
    if (
      mergeAppendix &&
      contractId != null &&
      !Number.isNaN(contractId) &&
      type === "application/pdf"
    ) {
      try {
        const cRow = await sql`SELECT id FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
        if (cRow.rows.length > 0) {
          const merged = await mergeContractBodyWithStoredAppendix(buf, company.id);
          buf = Buffer.from(merged);
        }
      } catch (e) {
        console.error("contracts upload: merge appendix failed", e);
      }
    }
    await writeFile(filePath, buf);
    const documentPath = `contracts/${safeName}`;
    if (companyTemplate && type === "application/pdf") {
      try {
        await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS document_data TEXT`;
        await sql`ALTER TABLE company_contract_template ADD COLUMN IF NOT EXISTS body_margins TEXT`;
        const dataB64 = buf.toString("base64");
        const defaultMargins = '{"top":15,"right":15,"bottom":15,"left":15}';
        await sql`
          INSERT INTO company_contract_template (company_id, title, body, document_path, document_data, body_margins, updated_at)
          VALUES (${company.id}, '', '', ${documentPath}, ${dataB64}, ${defaultMargins}, NOW())
          ON CONFLICT (company_id) DO UPDATE SET
            document_path = EXCLUDED.document_path,
            document_data = EXCLUDED.document_data,
            updated_at = NOW()
        `;
      } catch (e) {
        console.error("contracts upload: company template document_data failed", e);
      }
    }
    if (contractId != null && !Number.isNaN(contractId)) {
      try {
        await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_data TEXT`;
        const row = await sql`SELECT id FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
        if (row.rows.length > 0) {
          const dataB64 = buf.toString("base64");
          await sql`UPDATE contracts SET document_path = ${documentPath}, document_data = ${dataB64}, updated_at = NOW() WHERE id = ${contractId} AND company_id = ${company.id}`;
        }
      } catch (e) {
        console.error("contracts upload: save document_data failed", e);
      }
    }
    return NextResponse.json({ documentPath }, { status: 200 });
  } catch (error) {
    console.error("contracts upload error:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
