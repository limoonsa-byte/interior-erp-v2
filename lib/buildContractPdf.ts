import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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
  try {
    const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    const fileName = documentPath.startsWith("contracts/") ? documentPath.slice("contracts/".length) : path.basename(documentPath);
    return await readFile(path.join(baseDir, fileName));
  } catch {
    return null;
  }
}

function parseSignatureDataUrl(dataUrl: string): { bytes: Uint8Array; type: "png" | "jpg" } | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (!match) return null;
  const type = match[1].startsWith("jp") ? "jpg" as const : "png" as const;
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return { bytes, type };
}

export async function buildContractPdf(opts: BuildContractPdfOptions): Promise<Uint8Array> {
  const { details, signerName, signerAddress, signerResidentNumber, signatureDataUrl, companyId, documentPath } = opts;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28; // A4 width
  const H = 841.89; // A4 height
  const M = 50;

  const page = pdfDoc.addPage([W, H]);

  let y = H - M;

  const drawText = (text: string, x: number, yPos: number, size: number, bold = false) => {
    page.drawText(text, { x, y: yPos, size, font: bold ? fontBold : font, color: rgb(0, 0, 0) });
  };

  const drawRedText = (text: string, x: number, yPos: number, size: number) => {
    page.drawText(text, { x, y: yPos, size, font, color: rgb(0.8, 0, 0) });
  };

  // Title
  const titleText = "Contract Summary";
  drawText(titleText, W / 2 - 60, y, 16, true);
  y -= 30;

  if (details && typeof details === "object") {
    const raw = Number(String(details.contractAmount ?? "").replace(/\D/g, "")) || 0;
    const downPct = String(details.downPaymentPercent ?? "").trim();
    const balPct = String(details.balancePercent ?? "").trim();

    const lines: Array<[string, string]> = [
      ["Customer", signerName || String(details.clientName ?? "")],
      ["Contractor", String(details.contractorCompanyName ?? "")],
      ["Project", String(details.projectName ?? "")],
      ["Location", String(details.projectPlace ?? "")],
      ["Start Date", String(details.projectStartDate ?? "")],
      ["End Date", String(details.projectEndDate ?? "")],
      ["Contract Amount", raw ? `${raw.toLocaleString("ko-KR")} won` : "-"],
      ["Down Payment", downPct ? `${fmtAmt(Math.round(raw * Number(downPct) / 100))} won (${downPct}%)` : "-"],
      ["Balance", balPct ? `${fmtAmt(Math.round(raw * Number(balPct) / 100))} won (${balPct}%)` : "-"],
    ];

    for (const [label, value] of lines) {
      drawText(label + ":", M, y, 10, true);
      drawText(value, M + 120, y, 10);
      y -= 18;
    }

    y -= 10;

    // Signer info
    drawText("--- Signer ---", M, y, 10, true);
    y -= 18;
    drawText("Name: " + signerName, M, y, 10);
    y -= 18;
    drawText("Address: " + signerAddress, M, y, 10);
    y -= 18;

    // Contractor info
    y -= 10;
    drawText("--- Contractor ---", M, y, 10, true);
    y -= 18;
    drawText("Company: " + String(details.contractorCompanyName ?? ""), M, y, 10);
    y -= 18;
    drawText("Address: " + String(details.contractorAddress ?? ""), M, y, 10);
    y -= 18;
    drawText("Name: " + String(details.contractorSignature ?? details.contractorName ?? ""), M, y, 10);
    y -= 30;
  }

  // Embed stamp
  const stampBuf = await loadStampImage(companyId);
  if (stampBuf) {
    try {
      const isPng = stampBuf[0] === 0x89 && stampBuf[1] === 0x50;
      const stampImg = isPng
        ? await pdfDoc.embedPng(stampBuf)
        : await pdfDoc.embedJpg(stampBuf);
      page.drawImage(stampImg, { x: W - M - 80, y: y + 10, width: 70, height: 70 });
    } catch { /* ignore */ }
  }

  // Embed signature
  if (signatureDataUrl) {
    const parsed = parseSignatureDataUrl(signatureDataUrl);
    if (parsed) {
      try {
        const sigImg = parsed.type === "png"
          ? await pdfDoc.embedPng(parsed.bytes)
          : await pdfDoc.embedJpg(parsed.bytes);
        page.drawImage(sigImg, { x: M + 60, y: y + 10, width: 100, height: 60 });
        page.drawImage(sigImg, { x: W / 2 + 20, y: y + 10, width: 100, height: 60 });
      } catch { /* ignore */ }
    }
  }

  // Merge uploaded document PDF
  if (documentPath && documentPath.toLowerCase().endsWith(".pdf")) {
    const docBuf = await loadDocumentPdf(documentPath);
    if (docBuf) {
      try {
        const existingPdf = await PDFDocument.load(docBuf);
        const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
        for (const p of pages) {
          pdfDoc.addPage(p);
        }
      } catch { /* ignore */ }
    }
  }

  return pdfDoc.save();
}
