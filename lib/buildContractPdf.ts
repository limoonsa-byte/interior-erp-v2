import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
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

let fontCache: { regular: Buffer; bold: Buffer } | null = null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const fontsDir = path.join(process.cwd(), "fonts");
  const [regular, bold] = await Promise.all([
    readFile(path.join(fontsDir, "NanumGothic-Regular.ttf")),
    readFile(path.join(fontsDir, "NanumGothic-Bold.ttf")),
  ]);
  fontCache = { regular, bold };
  return fontCache;
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
  pdfDoc.registerFontkit(fontkit);

  const fontData = await loadFonts();
  const font = await pdfDoc.embedFont(fontData.regular);
  const fontBold = await pdfDoc.embedFont(fontData.bold);

  const W = 595.28;
  const H = 841.89;
  const M = 50;

  const page = pdfDoc.addPage([W, H]);

  let y = H - M;

  const drawText = (text: string, x: number, yPos: number, size: number, bold = false) => {
    page.drawText(text, { x, y: yPos, size, font: bold ? fontBold : font, color: rgb(0, 0, 0) });
  };

  drawText("실내건축공사 표준도급 계약서", M + 120, y, 16, true);
  y -= 36;

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
      drawText(label, M, y, 10, true);
      drawText(value, M + 120, y, 10);
      y -= 18;
    }

    y -= 14;
    drawText("발주자(수급인, 이하 \"갑\"이라한다)와 시공자(하수급인, 이하 \"을\"이라 한다)는", M, y, 9);
    y -= 14;
    drawText("상기와 같이 계약을 체결하고 전자계약으로 작성한다.", M, y, 9);
    y -= 24;

    drawText("[ 발주자(수급인) ]", M, y, 10, true);
    y -= 18;
    drawText(`주소 : ${signerAddress}`, M, y, 10);
    y -= 18;
    drawText(`주민번호 : ${signerResidentNumber}`, M, y, 10);
    y -= 18;
    drawText(`성명 : ${clientName}  (인)`, M, y, 10);
    const signerNameY = y;
    y -= 28;

    const sigDisplay = String(details.contractorSignature ?? details.contractorName ?? details.contractorSignatureDirect ?? "").trim();
    drawText("[ 시공자(하수급인) ]", W / 2, y, 10, true);
    y -= 18;
    drawText(`주소 : ${String(details.contractorAddress ?? "")}`, W / 2, y, 10);
    y -= 18;
    drawText(`상호 : ${String(details.contractorCompanyName ?? "")}`, W / 2, y, 10);
    y -= 18;
    drawText(`성명 : ${sigDisplay}  (인)`, W / 2, y, 10);
    const contractorNameY = y;
    y -= 30;

    const stampBuf = await loadStampImage(companyId);
    if (stampBuf) {
      try {
        const isPng = stampBuf[0] === 0x89 && stampBuf[1] === 0x50;
        const stampImg = isPng
          ? await pdfDoc.embedPng(stampBuf)
          : await pdfDoc.embedJpg(stampBuf);
        page.drawImage(stampImg, { x: W / 2 + 200, y: contractorNameY - 20, width: 60, height: 60 });
      } catch { /* ignore */ }
    }

    if (signatureDataUrl) {
      const parsed = parseSignatureDataUrl(signatureDataUrl);
      if (parsed) {
        try {
          const sigImg = parsed.type === "png"
            ? await pdfDoc.embedPng(parsed.bytes)
            : await pdfDoc.embedJpg(parsed.bytes);
          page.drawImage(sigImg, { x: M + 150, y: signerNameY - 20, width: 80, height: 50 });
          page.drawImage(sigImg, { x: M + 150, y: contractorNameY - 20, width: 80, height: 50 });
        } catch { /* ignore */ }
      }
    }
  }

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
