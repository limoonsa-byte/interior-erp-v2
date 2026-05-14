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
    const result = await sql`SELECT document_path, document_data FROM contracts WHERE id = ${contractId}`;
    if (result.rows.length === 0) return NextResponse.json({ error: "문서가 없습니다." }, { status: 404 });
    const docPath = result.rows[0].document_path != null ? String(result.rows[0].document_path) : null;
    const docDataB64 = result.rows[0].document_data;

    async function getCompanyPdfBuffer(contractId: number): Promise<Buffer | null> {
      try {
        const cRow = await sql`SELECT company_id FROM contracts WHERE id = ${contractId}`;
        const companyId = cRow.rows[0]?.company_id;
        if (companyId) {
          const tplRow = await sql`SELECT document_path, document_data FROM company_contract_template WHERE company_id = ${companyId} LIMIT 1`;
          const tplPath = tplRow.rows[0]?.document_path;
          const tplDataB64 = tplRow.rows[0]?.document_data;
          if (tplPath && typeof tplPath === "string" && tplPath.trim()) {
            const tplFileName = tplPath.startsWith("contracts/") ? tplPath.slice("contracts/".length) : path.basename(tplPath);
            const tplBaseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
            try {
              return await readFile(path.join(tplBaseDir, tplFileName));
            } catch { /* file not found, continue */ }
          }
          if (tplDataB64 && typeof tplDataB64 === "string" && tplDataB64.trim().length > 0) {
            try {
              return Buffer.from(tplDataB64, "base64");
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
      return null;
    }

    async function getMasterPdfBuffer(): Promise<Buffer | null> {
      try {
        const masterRow = await sql`SELECT document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
        const masterB64 = masterRow.rows[0]?.document_data;
        if (masterB64 && typeof masterB64 === "string" && masterB64.length > 0) {
          return Buffer.from(masterB64, "base64");
        }
      } catch { /* ignore */ }
      return null;
    }

    let buf: Buffer;
    const fileName = docPath ? (docPath.startsWith("contracts/") ? docPath.slice("contracts/".length) : path.basename(docPath)) : "document.pdf";
    if (docPath) {
      const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
      const filePath = path.join(baseDir, fileName);
      try {
        buf = await readFile(filePath);
      } catch {
        if (docDataB64 && typeof docDataB64 === "string") {
          buf = Buffer.from(docDataB64, "base64");
        } else {
          const companyBuf = await getCompanyPdfBuffer(contractId);
          if (companyBuf) buf = companyBuf;
          else {
            const masterBuf = await getMasterPdfBuffer();
            if (masterBuf) buf = masterBuf;
            else return NextResponse.json({ error: "계약 문서를 읽을 수 없습니다. 작성자가 계약서를 저장하면 본문이 자동으로 PDF로 반영됩니다." }, { status: 404 });
          }
        }
      }
    } else if (docDataB64 && typeof docDataB64 === "string") {
      buf = Buffer.from(docDataB64, "base64");
    } else {
      const companyBuf = await getCompanyPdfBuffer(contractId);
      if (companyBuf) buf = companyBuf;
      else {
        const masterBuf = await getMasterPdfBuffer();
        if (masterBuf) buf = masterBuf;
        else return NextResponse.json({ error: "계약 문서가 없습니다. 작성자가 계약서를 저장하면 본문이 자동으로 PDF로 반영됩니다." }, { status: 404 });
      }
    }

    const contentType = fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        /** 서명·pdf.js 미리보기가 예전 응답을 캐시하면 “다운로드 PDF는 1조부터인데 화면만 뒤에서 시작”처럼 보일 수 있음 */
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (error) {
    console.error("contracts document GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
