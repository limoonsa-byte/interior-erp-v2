import PDFDocumentKit from "pdfkit";
import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";

type ContractDetails = Record<string, string>;

interface BuildContractPdfOptions {
  details: ContractDetails | null;
  signerName: string;
  signerAddress: string;
  signerResidentNumber: string;
  signatureDataUrl: string | null;
  companyId: number;
  documentPath: string | null;
}

function fmtAmt(n: number) {
  return n ? n.toLocaleString("ko-KR") : "";
}

function getFontPaths() {
  const fontsDir = path.join(process.cwd(), "fonts");
  return {
    regular: path.join(fontsDir, "NotoSansKR-Regular.ttf"),
    bold: path.join(fontsDir, "NotoSansKR-Bold.ttf"),
  };
}

async function loadStampImage(companyId: number): Promise<Buffer | null> {
  try {
    const { sql } = await import("@vercel/postgres");
    const result = await sql`SELECT stamp_path AS path FROM companies WHERE id = ${companyId}`;
    if (result.rows.length === 0 || !result.rows[0].path) return null;
    const storedPath = String(result.rows[0].path);
    const baseDir = process.env.VERCEL ? path.join("/tmp", "company") : path.join(process.cwd(), "uploads", "company");
    return await readFile(path.join(baseDir, storedPath.replace(/^company\//, "")));
  } catch {
    return null;
  }
}

async function loadDocumentPdf(documentPath: string): Promise<Buffer | null> {
  const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
  const fileName = documentPath.startsWith("contracts/") ? documentPath.slice("contracts/".length) : path.basename(documentPath);
  try {
    return await readFile(path.join(baseDir, fileName));
  } catch {
    if (fileName === "master-template.pdf") {
      try {
        const { sql } = await import("@vercel/postgres");
        const r = await sql`SELECT document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
        const data = r.rows[0]?.document_data;
        if (data && typeof data === "string") return Buffer.from(data, "base64");
      } catch { /* ignore */ }
    }
    return null;
  }
}

function parseSignatureDataUrl(dataUrl: string): { buf: Buffer; type: "png" | "jpeg" } | null {
  try {
    const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (!match) return null;
    const type = match[1].startsWith("jp") ? "jpeg" as const : "png" as const;
    const buf = Buffer.from(match[2], "base64");
    if (buf.length < 8) return null;
    return { buf, type };
  } catch {
    return null;
  }
}

function buildContractPage(opts: BuildContractPdfOptions): Promise<Buffer> {
  const { details, signerName, signerAddress, signerResidentNumber, signatureDataUrl, companyId } = opts;
  const fonts = getFontPaths();

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocumentKit({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("Regular", fonts.regular);
      doc.registerFont("Bold", fonts.bold);

      const M = 50;
      const W = 595.28;

      doc.font("Bold").fontSize(16).text("실내건축공사 표준도급 계약서", M, M, { align: "center", width: W - M * 2 });

      let y = M + 36;

      const drawLabel = (label: string, value: string, x: number, yPos: number) => {
        doc.font("Bold").fontSize(10).text(label, x, yPos, { continued: false });
        doc.font("Regular").fontSize(10).text(value, x + 120, yPos, { continued: false });
      };

      if (details && typeof details === "object") {
        const raw = Number(String(details.contractAmount ?? "").replace(/\D/g, "")) || 0;
        const downPct = String(details.downPaymentPercent ?? "").trim();
        const balPct = String(details.balancePercent ?? "").trim();
        const clientName = signerName || String(details.clientName ?? "");

        const lines: Array<[string, string]> = [
          ["발주자(수급인)", clientName],
          ["시공자(하수급인)", String(details.contractorCompanyName ?? "")],
          ["공사명", String(details.projectName ?? "")],
          ["공사장소", String(details.projectPlace ?? "")],
          ["착공", String(details.projectStartDate ?? "")],
          ["준공", String(details.projectEndDate ?? "")],
          ["계약금액", raw ? `${raw.toLocaleString("ko-KR")}원 (부가세별도)` : "-"],
          ["선금", downPct ? `${fmtAmt(Math.round(raw * Number(downPct) / 100))}원 (${downPct}%)` : "-"],
        ];

        let interimList: Array<{ percent: string; daysAfter: string }>;
        try {
          const rawP = details.interimPayments;
          if (rawP && typeof rawP === "string" && rawP.trim()) {
            const parsed = JSON.parse(rawP) as Array<{ percent?: string; daysAfter?: string }>;
            interimList = Array.isArray(parsed) && parsed.length > 0
              ? parsed.map((p) => ({ percent: String(p.percent ?? ""), daysAfter: String(p.daysAfter ?? "") }))
              : [{ percent: String(details.interimPercent ?? ""), daysAfter: String(details.interimDaysAfter ?? "") }];
          } else interimList = [{ percent: String(details.interimPercent ?? ""), daysAfter: String(details.interimDaysAfter ?? "") }];
        } catch { interimList = [{ percent: String(details.interimPercent ?? ""), daysAfter: String(details.interimDaysAfter ?? "") }]; }

        for (const item of interimList) {
          const amt = fmtAmt(raw && item.percent ? Math.round(raw * Number(item.percent) / 100) : 0);
          lines.push(["중도금", `${amt}원 (${item.percent}%) - 공사로부터 ${item.daysAfter}일후`]);
        }

        lines.push(["잔금", balPct ? `${fmtAmt(Math.round(raw * Number(balPct) / 100))}원 (${balPct}%)` : "-"]);

        for (const [label, value] of lines) {
          drawLabel(label, value, M, y);
          y += 18;
        }

        y += 14;
        doc.font("Regular").fontSize(9).text(
          "발주자(수급인, 이하 \"갑\"이라한다)와 시공자(하수급인, 이하 \"을\"이라 한다)는", M, y
        );
        y += 14;
        doc.font("Regular").fontSize(9).text(
          "상기와 같이 계약을 체결하고 전자계약으로 작성한다.", M, y
        );
        y += 24;

        doc.font("Bold").fontSize(10).text("[ 발주자(수급인) ]", M, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`주소 : ${signerAddress}`, M, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`주민번호 : ${signerResidentNumber}`, M, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`성명 : ${clientName}  (인)`, M, y);
        const signerNameY = y;
        y += 28;

        const sigDisplay = String(details.contractorSignature ?? details.contractorName ?? details.contractorSignatureDirect ?? "").trim();
        const rightX = W / 2;
        doc.font("Bold").fontSize(10).text("[ 시공자(하수급인) ]", rightX, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`주소 : ${String(details.contractorAddress ?? "")}`, rightX, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`상호 : ${String(details.contractorCompanyName ?? "")}`, rightX, y);
        y += 18;
        doc.font("Regular").fontSize(10).text(`성명 : ${sigDisplay}  (인)`, rightX, y);
        const contractorNameY = y;

        const stampBuf = await loadStampImage(companyId);
        if (stampBuf) {
          try {
            doc.image(stampBuf, rightX + 200, contractorNameY - 10, { width: 60, height: 60 });
          } catch { /* ignore bad stamp image */ }
        }

        if (signatureDataUrl) {
          const parsed = parseSignatureDataUrl(signatureDataUrl);
          if (parsed) {
            try {
              doc.image(parsed.buf, M + 150, signerNameY - 5, { width: 80, height: 50 });
              doc.image(parsed.buf, M + 150, contractorNameY - 5, { width: 80, height: 50 });
            } catch { /* ignore bad signature image */ }
          }
        }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function buildContractPdf(opts: BuildContractPdfOptions): Promise<Uint8Array> {
  const contractPageBuf = await buildContractPage(opts);

  if (!opts.documentPath || !opts.documentPath.toLowerCase().endsWith(".pdf")) {
    return new Uint8Array(contractPageBuf);
  }

  const docBuf = await loadDocumentPdf(opts.documentPath);
  if (!docBuf) return new Uint8Array(contractPageBuf);

  try {
    const merged = await PDFDocument.create();
    const contractPdf = await PDFDocument.load(contractPageBuf);
    const existingPdf = await PDFDocument.load(docBuf);

    const contractPages = await merged.copyPages(contractPdf, contractPdf.getPageIndices());
    for (const p of contractPages) merged.addPage(p);

    const existingPages = await merged.copyPages(existingPdf, existingPdf.getPageIndices());
    for (const p of existingPages) merged.addPage(p);

    return await merged.save();
  } catch {
    return new Uint8Array(contractPageBuf);
  }
}
