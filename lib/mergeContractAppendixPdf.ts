import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { sql } from "@vercel/postgres";

function contractsBaseDir() {
  return process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
}

async function readStoredContractPdf(documentPath: string, documentDataB64?: string | null): Promise<Buffer | null> {
  const baseDir = contractsBaseDir();
  const fileName = documentPath.startsWith("contracts/") ? documentPath.slice("contracts/".length) : path.basename(documentPath);
  try {
    return await readFile(path.join(baseDir, fileName));
  } catch {
    if (documentDataB64 && typeof documentDataB64 === "string" && documentDataB64.trim()) {
      try {
        return Buffer.from(documentDataB64, "base64");
      } catch {
        /* ignore */
      }
    }
    if (fileName === "master-template.pdf") {
      try {
        const r = await sql`SELECT document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
        const data = r.rows[0]?.document_data;
        if (data && typeof data === "string") return Buffer.from(data, "base64");
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

/** 회사 관리 계약 PDF → 없으면 마스터 템플릿 PDF (일반 조건 등 부록용) */
export async function loadAppendixTemplatePdf(companyId: number): Promise<Buffer | null> {
  try {
    const tplRow = await sql`SELECT document_path, document_data FROM company_contract_template WHERE company_id = ${companyId} LIMIT 1`;
    const tplPath = tplRow.rows[0]?.document_path;
    const tplData = tplRow.rows[0]?.document_data;
    const tplDataStr = tplData != null && typeof tplData === "string" ? tplData : null;
    if (tplPath && typeof tplPath === "string" && tplPath.trim() && tplPath.toLowerCase().endsWith(".pdf")) {
      const buf = await readStoredContractPdf(tplPath.trim(), tplDataStr);
      if (buf && buf.length > 0) return buf;
    }
    if (tplDataStr && tplDataStr.trim().length > 0) {
      try {
        const buf = Buffer.from(tplDataStr, "base64");
        if (buf.length > 8) return buf;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const masterRow = await sql`SELECT document_path, document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
    const m = masterRow.rows[0] as { document_path?: string; document_data?: string } | undefined;
    const dp = m?.document_path != null ? String(m.document_path) : "";
    const dd = m?.document_data != null ? String(m.document_data) : null;
    if (dp && dp.toLowerCase().endsWith(".pdf")) {
      const buf = await readStoredContractPdf(dp, dd);
      if (buf && buf.length > 0) return buf;
    }
    if (dd && dd.trim().length > 0) {
      try {
        const buf = Buffer.from(dd, "base64");
        if (buf.length > 8) return buf;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function mergePdfAppend(front: Buffer, back: Buffer): Promise<Buffer | null> {
  try {
    const merged = await PDFDocument.create();
    const frontDoc = await PDFDocument.load(front);
    const backDoc = await PDFDocument.load(back);
    for (const p of await merged.copyPages(frontDoc, frontDoc.getPageIndices())) merged.addPage(p);
    for (const p of await merged.copyPages(backDoc, backDoc.getPageIndices())) merged.addPage(p);
    return Buffer.from(await merged.save());
  } catch {
    return null;
  }
}

/** HTML 본문에서 만든 PDF 뒤에, 관리에 등록된 부록 PDF를 이어 붙입니다. */
export async function mergeContractBodyWithStoredAppendix(bodyPdf: Buffer, companyId: number): Promise<Buffer> {
  const appendix = await loadAppendixTemplatePdf(companyId);
  if (!appendix || appendix.length === 0) return bodyPdf;
  const merged = await mergePdfAppend(bodyPdf, appendix);
  return merged ?? bodyPdf;
}
