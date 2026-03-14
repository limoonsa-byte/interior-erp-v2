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
    const result = await sql`SELECT stamp_path AS path, stamp_data AS data FROM companies WHERE id = ${companyId}`;
    if (result.rows.length === 0) return null;
    const storedPath = result.rows[0].path;
    const stampData = result.rows[0].data;

    if (storedPath) {
      try {
        const baseDir = process.env.VERCEL ? path.join("/tmp", "company") : path.join(process.cwd(), "uploads", "company");
        return await readFile(path.join(baseDir, String(storedPath).replace(/^company\//, "")));
      } catch { /* fall through to DB */ }
    }

    if (stampData && typeof stampData === "string") {
      return Buffer.from(stampData, "base64");
    }
    return null;
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

/* ------------------------------------------------------------------ */
/*  PDF 페이지 생성 (pdfkit) – 테이블+테두리 레이아웃                   */
/* ------------------------------------------------------------------ */
function buildContractPage(opts: BuildContractPdfOptions): Promise<Buffer> {
  const { details, signerName, signerAddress, signerResidentNumber, signatureDataUrl, companyId } = opts;
  const fonts = getFontPaths();

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocumentKit({ size: "A4", margins: { top: 40, bottom: 40, left: 40, right: 40 } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("Regular", fonts.regular);
      doc.registerFont("Bold", fonts.bold);

      const PAGE_W = 595.28;
      const M = 40;
      const TL = M;
      const TR = PAGE_W - M;
      const TW = TR - TL;

      const C1W = 55;
      const C2W = 110;
      const C1X = TL;
      const C2X = C1X + C1W;
      const C3X = C2X + C2W;
      const C3W = TW - C1W - C2W;
      const RH = 25;
      const PAD = 6;

      doc.lineWidth(0.5).strokeColor("#555555");

      const drawCellText = (
        text: string, x: number, y: number, w: number, h: number,
        bold = false, fontSize = 9, align: "left" | "center" | "right" = "left",
      ) => {
        const lines = text.split("\n");
        const lineH = fontSize * 1.4;
        const totalH = lineH * lines.length;
        const startY = y + (h - totalH) / 2 + fontSize * 0.25;
        doc.font(bold ? "Bold" : "Regular").fontSize(fontSize);
        for (let i = 0; i < lines.length; i++) {
          doc.text(lines[i], x + PAD, startY + lineH * i, {
            width: w - PAD * 2,
            align,
            lineBreak: false,
          });
        }
      };

      const cell = (
        x: number, y: number, w: number, h: number,
        text: string, bold = false, fontSize = 9, align: "left" | "center" | "right" = "left",
      ) => {
        doc.rect(x, y, w, h).stroke();
        if (text) drawCellText(text, x, y, w, h, bold, fontSize, align);
      };

      // ===== 제목 =====
      let y = M;
      doc.font("Bold").fontSize(15);
      doc.text("실내건축공사 표준도급 계약서", TL, y, { width: TW, align: "center" });
      y += 40;

      if (!details || typeof details !== "object") { doc.end(); return; }

      const raw = Number(String(details.contractAmount ?? "").replace(/\D/g, "")) || 0;
      const downPct = String(details.downPaymentPercent ?? "").trim();
      const balPct = String(details.balancePercent ?? "").trim();
      const clientName = signerName || String(details.clientName ?? "");
      const contractorCompany = String(details.contractorCompanyName ?? "");

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

      const payRows: [string, string][] = [];
      payRows.push(["계약금액", raw ? `${raw.toLocaleString("ko-KR")}원 부가세별도` : "-"]);
      payRows.push(["선 금", downPct ? `${fmtAmt(Math.round(raw * Number(downPct) / 100))}원 (${downPct} %) 계약이후 바로` : "-"]);
      interimList.forEach((item, i) => {
        const amt = fmtAmt(raw && item.percent ? Math.round(raw * Number(item.percent) / 100) : 0);
        const label = interimList.length > 1 ? `중도금${i + 1}차` : "중도금";
        payRows.push([label, `${amt}원 (${item.percent} %) 공사로부터 ${item.daysAfter}일후`]);
      });
      payRows.push(["잔 금", balPct ? `${fmtAmt(Math.round(raw * Number(balPct) / 100))}원 (${balPct} %) 공사완료 시` : "-"]);

      // ────────────────────────────────────────
      //  섹션 1: 계약자 (2행)
      // ────────────────────────────────────────
      const s1 = y;
      cell(C1X, s1, C1W, RH * 2, "계\n약\n자", true, 9, "center");
      cell(C2X, s1, C2W, RH, "발주자(수급인)", true, 9, "center");
      doc.rect(C3X, s1, C3W, RH).stroke();
      drawCellText(clientName, C3X, s1, C3W - 35, RH);
      drawCellText("(인)", C3X + C3W - 35, s1, 30, RH, false, 9, "right");

      cell(C2X, s1 + RH, C2W, RH, "시공자(하수급인)", true, 9, "center");
      doc.rect(C3X, s1 + RH, C3W, RH).stroke();
      drawCellText(contractorCompany, C3X, s1 + RH, C3W - 35, RH);
      drawCellText("(인)", C3X + C3W - 35, s1 + RH, 30, RH, false, 9, "right");
      y = s1 + RH * 2;

      // ────────────────────────────────────────
      //  섹션 2: 공사개요 (4행)
      // ────────────────────────────────────────
      const s2 = y;
      cell(C1X, s2, C1W, RH * 4, "공\n사\n개\n요", true, 9, "center");
      cell(C2X, s2, C2W, RH, "공 사 명", true, 9, "center");
      cell(C3X, s2, C3W, RH, String(details.projectName ?? ""));

      cell(C2X, s2 + RH, C2W, RH, "공사장소(현장)", true, 9, "center");
      cell(C3X, s2 + RH, C3W, RH, String(details.projectPlace ?? ""));

      const subW = 55;
      cell(C2X, s2 + RH * 2, C2W, RH * 2, "공사기간", true, 9, "center");
      cell(C3X, s2 + RH * 2, subW, RH, "착 공", false, 9, "center");
      cell(C3X + subW, s2 + RH * 2, C3W - subW, RH, String(details.projectStartDate ?? ""));
      cell(C3X, s2 + RH * 3, subW, RH, "준 공", false, 9, "center");
      cell(C3X + subW, s2 + RH * 3, C3W - subW, RH, String(details.projectEndDate ?? ""));
      y = s2 + RH * 4;

      // ────────────────────────────────────────
      //  섹션 3: 공사대금 (N행)
      // ────────────────────────────────────────
      const s3 = y;
      const s3n = payRows.length;
      cell(C1X, s3, C1W, RH * s3n, "공\n사\n대\n금", true, 9, "center");
      payRows.forEach(([label, value], i) => {
        cell(C2X, s3 + RH * i, C2W, RH, label, true, 9, "center");
        cell(C3X, s3 + RH * i, C3W, RH, value);
      });
      y = s3 + RH * s3n;

      // ────────────────────────────────────────
      //  계약 문구
      // ────────────────────────────────────────
      y += 20;
      doc.font("Regular").fontSize(9);
      doc.text(
        '발주자(수급인, 이하 "갑"이라한다)와 시공자(하수급인, 이하 "을"이라 한다)는',
        TL, y, { width: TW },
      );
      y += 14;
      doc.text("상기와 같이 계약을 체결하고 전자계약으로 작성한다.", TL, y, { width: TW });
      y += 30;

      // ────────────────────────────────────────
      //  서명 섹션 (좌: 발주자, 우: 시공자)
      // ────────────────────────────────────────
      const halfW = TW / 2 - 10;
      const rX = TL + TW / 2 + 10;

      doc.font("Bold").fontSize(10);
      doc.text("발주자(수급인)", TL, y, { width: halfW });
      doc.text("시공자(하수급인)", rX, y, { width: halfW });
      y += 20;

      doc.font("Regular").fontSize(9);
      doc.text(`주소 : ${signerAddress}`, TL, y, { width: halfW });
      doc.text(`주소 : ${String(details.contractorAddress ?? "")}`, rX, y, { width: halfW });
      y += 16;
      doc.text(`주민번호 : ${signerResidentNumber}`, TL, y, { width: halfW });
      doc.text(`상호 : ${contractorCompany}`, rX, y, { width: halfW });
      y += 16;

      const sigDisplay = String(
        details.contractorSignature ?? details.contractorName ?? details.contractorSignatureDirect ?? "",
      ).trim();
      doc.text(`성명 : ${clientName}  (인)`, TL, y, { width: halfW });
      doc.text(`성명 : ${sigDisplay}  (인)`, rX, y, { width: halfW });
      const sigY = y;

      // 서명 이미지
      if (signatureDataUrl) {
        const parsed = parseSignatureDataUrl(signatureDataUrl);
        if (parsed) {
          try {
            doc.image(parsed.buf, TL + 110, sigY - 20, { width: 70, height: 45 });
            doc.image(parsed.buf, rX + 110, sigY - 20, { width: 70, height: 45 });
          } catch { /* ignore bad image */ }
        }
      }

      // 도장 이미지
      const stampBuf = await loadStampImage(companyId);
      if (stampBuf) {
        try {
          doc.image(stampBuf, rX + 190, sigY - 25, { width: 55, height: 55 });
        } catch { /* ignore */ }
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  이미지 기반 PDF 생성 (클라이언트에서 캡처한 이미지 → A4 PDF)          */
/* ------------------------------------------------------------------ */
export async function buildContractPdfFromImage(
  imageDataUrl: string,
  documentPath: string | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const A4_W = 595.28;
  const A4_H = 841.89;

  const match = imageDataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (match) {
    const imgBuf = Buffer.from(match[2], "base64");
    const isPng = match[1] === "png";
    const img = isPng ? await pdfDoc.embedPng(imgBuf) : await pdfDoc.embedJpg(imgBuf);
    /* 캡처한 이미지 그대로 넣기 (비율 유지, 한 페이지에 맞춤) */
    const scale = Math.min(A4_W / img.width, A4_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
  } else {
    pdfDoc.addPage([A4_W, A4_H]);
  }

  if (documentPath && documentPath.toLowerCase().endsWith(".pdf")) {
    const docBuf = await loadDocumentPdf(documentPath);
    if (docBuf) {
      try {
        const existingPdf = await PDFDocument.load(docBuf);
        const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
        for (const p of pages) pdfDoc.addPage(p);
      } catch { /* ignore */ }
    }
  }

  return pdfDoc.save();
}

/* ------------------------------------------------------------------ */
/*  서버 사이드 PDF 생성 (pdfkit 테이블 레이아웃 – fallback용)           */
/* ------------------------------------------------------------------ */
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
