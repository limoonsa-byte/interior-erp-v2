import PDFDocumentKit from "pdfkit";
import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";
import { computePaymentScheduleForDisplay, parseInterimLinesFromDetails } from "@/lib/contractPaymentSchedule";

type ContractDetails = Record<string, string>;

interface BuildContractPdfOptions {
  details: ContractDetails | null;
  signerName: string;
  signerAddress: string;
  signerResidentNumber: string;
  signatureDataUrl: string | null;
  companyId: number;
  documentPath: string | null;
  /** DB 등에 저장된 본문 PDF base64 (파일 없을 때 사용) */
  documentDataB64?: string | null;
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

async function loadDocumentPdf(documentPath: string, documentDataB64?: string | null): Promise<Buffer | null> {
  const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
  const fileName = documentPath.startsWith("contracts/") ? documentPath.slice("contracts/".length) : path.basename(documentPath);
  try {
    return await readFile(path.join(baseDir, fileName));
  } catch {
    if (documentDataB64 && typeof documentDataB64 === "string" && documentDataB64.trim().length > 0) {
      try {
        return Buffer.from(documentDataB64, "base64");
      } catch {
        /* ignore */
      }
    }
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
      const balPctLegacy = String(details.balancePercent ?? "").trim();
      const interimList = parseInterimLinesFromDetails(details as unknown as Record<string, unknown>);
      const schedule = computePaymentScheduleForDisplay(raw, downPct, interimList, balPctLegacy);
      const clientName = signerName || String(details.clientName ?? "");
      const contractorCompany = String(details.contractorCompanyName ?? "");

      const stampBuf = await loadStampImage(companyId);
      const parsedSig = signatureDataUrl ? parseSignatureDataUrl(signatureDataUrl) : null;

      const payRows: [string, string][] = [];
      payRows.push(["계약금액", raw ? `${raw.toLocaleString("ko-KR")}원 부가세별도` : "-"]);
      payRows.push(["선 금", downPct ? `${fmtAmt(schedule.downAmount)}원 (${downPct} %) 계약이후 바로` : "-"]);
      interimList.forEach((item, i) => {
        const amt = fmtAmt(schedule.interimAmounts[i] ?? 0);
        const label = interimList.length > 1 ? `중도금${i + 1}차` : "중도금";
        const d = String(item.daysAfter ?? "").trim();
        const mid = d ? `${d}일` : "   ";
        payRows.push([label, `${amt}원 (${item.percent} %) 공사로부터 ${mid}후`]);
      });
      const hasAnyMoneyRow =
        raw > 0 &&
        (String(downPct).trim() !== "" ||
          interimList.some((l) => String(l.percent).trim() !== "") ||
          schedule.balanceAmount > 0 ||
          String(balPctLegacy).trim() !== "");
      const balancePctLabel = schedule.balancePercentLabel || balPctLegacy || "0";
      payRows.push([
        "잔 금",
        hasAnyMoneyRow ? `${fmtAmt(schedule.balanceAmount)}원 (${balancePctLabel} %) 공사완료 시` : "-",
      ]);

      // ────────────────────────────────────────
      //  섹션 1: 계약자 (2행) — 상단 (인) 칸에 서명·도장 배치
      // ────────────────────────────────────────
      const inCellW = 32;
      const s1 = y;
      cell(C1X, s1, C1W, RH * 2, "계\n약\n자", true, 9, "center");
      cell(C2X, s1, C2W, RH, "발주자(수급인)", true, 9, "center");
      doc.rect(C3X, s1, C3W, RH).stroke();
      drawCellText(clientName, C3X, s1, C3W - inCellW, RH);
      drawCellText("(인)", C3X + C3W - inCellW, s1, inCellW, RH, false, 9, "right");
      if (parsedSig) {
        try {
          const w = 26;
          const h = Math.min(18, RH - 4);
          doc.image(parsedSig.buf, C3X + C3W - inCellW + (inCellW - w) / 2, s1 + (RH - h) / 2, { width: w, height: h });
        } catch { /* ignore */ }
      }

      cell(C2X, s1 + RH, C2W, RH, "시공자(하수급인)", true, 9, "center");
      doc.rect(C3X, s1 + RH, C3W, RH).stroke();
      drawCellText(contractorCompany, C3X, s1 + RH, C3W - inCellW, RH);
      drawCellText("(인)", C3X + C3W - inCellW, s1 + RH, inCellW, RH, false, 9, "right");
      if (stampBuf) {
        try {
          const sz = Math.min(22, RH - 4);
          doc.image(stampBuf, C3X + C3W - inCellW + (inCellW - sz) / 2, s1 + RH + (RH - sz) / 2, { width: sz, height: sz });
        } catch { /* ignore */ }
      }
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
      // (인)을 항상 같은 위치에 두기 위해 성명과 (인)을 분리해서 그림. 인 칸 너비 42pt.
      const inW = 42;
      doc.text(`성명 : ${clientName}`, TL, y, { width: halfW - inW });
      doc.text("(인)", TL + halfW - inW, y, { width: inW, align: "right" });
      doc.text(`성명 : ${sigDisplay}`, rX, y, { width: halfW - inW });
      doc.text("(인)", rX + halfW - inW, y, { width: inW, align: "right" });
      const sigY = y;

      // 발주자(좌측) 서명: (인) 칸 안에 맞춤 (인 칸: TL + halfW - inW ~ TL + halfW)
      if (parsedSig) {
        try {
          const sigW = 70;
          const sigH = 45;
          const sigX = TL + halfW - inW - sigW + 6;
          const sigYPos = sigY - sigH;
          doc.image(parsedSig.buf, sigX, sigYPos, { width: sigW, height: sigH });
        } catch { /* ignore bad image */ }
      }

      // 시공자(우측) 도장: (인) 칸 안에 맞춤 (인 칸: rX + halfW - inW ~ rX + halfW)
      if (stampBuf) {
        try {
          const stampW = 55;
          const stampH = 55;
          const stampX = rX + halfW - inW - stampW + 4;
          const stampY = sigY - stampH;
          doc.image(stampBuf, stampX, stampY, { width: stampW, height: stampH });
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
  docPageImages?: string[],
  documentDataB64?: string | null,
  /** 서버에서 이미 확보한 본문 PDF 버퍼(선택). 있으면 loadDocumentPdf 호출 생략 */
  documentBuffer?: Buffer | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const A4_W = 595.28;
  const A4_H = 841.89;

  const match = imageDataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
  if (match) {
    const imgBuf = Buffer.from(match[2], "base64");
    const isPng = match[1] === "png";
    const img = isPng ? await pdfDoc.embedPng(imgBuf) : await pdfDoc.embedJpg(imgBuf);
    const scale = Math.min(A4_W / img.width, A4_H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = pdfDoc.addPage([A4_W, A4_H]);
    page.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
  } else {
    pdfDoc.addPage([A4_W, A4_H]);
  }

  if (docPageImages && docPageImages.length > 0) {
    for (const dataUrl of docPageImages) {
      const m = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
      if (m) {
        const buf = Buffer.from(m[2], "base64");
        const isPng = m[1] === "png";
        const img = isPng ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf);
        const scale = Math.min(A4_W / img.width, A4_H / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const p = pdfDoc.addPage([A4_W, A4_H]);
        p.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
      }
    }
  }

  let docBuf: Buffer | null = documentBuffer ?? null;
  if (docBuf == null && ((documentPath && documentPath.toLowerCase().endsWith(".pdf")) || (documentDataB64 && typeof documentDataB64 === "string" && documentDataB64.trim().length > 0))) {
    docBuf = await loadDocumentPdf(documentPath ?? "", documentDataB64);
  }
  if (docBuf && docBuf.length > 0) {
    try {
      const existingPdf = await PDFDocument.load(docBuf);
      const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
      for (const p of pages) pdfDoc.addPage(p);
    } catch { /* ignore */ }
  }

  return pdfDoc.save();
}

/* ------------------------------------------------------------------ */
/*  서버 첫 페이지 PDF + (본문을 캡처한) 문서 페이지 이미지 병합  */
/* ------------------------------------------------------------------ */
export async function buildContractPdfFromFirstPagePdf(
  firstPagePdfBytes: Uint8Array,
  docPageImages: string[] | undefined,
  documentPath: string | null,
  documentDataB64?: string | null,
): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  const firstDoc = await PDFDocument.load(firstPagePdfBytes);
  const firstPages = await merged.copyPages(firstDoc, firstDoc.getPageIndices());
  for (const p of firstPages) merged.addPage(p);

  const A4_W = 595.28;
  const A4_H = 841.89;

  let existingPdfPageCount = 0;
  let existingPdf: PDFDocument | null = null;

  // document_path가 없어도(또는 .pdf가 아니어도) document_data가 있으면 반드시 합쳐야 한다.
  if (documentPath && documentPath.toLowerCase().endsWith(".pdf")) {
    const docBuf = await loadDocumentPdf(documentPath, documentDataB64);
    if (docBuf) {
      try {
        existingPdf = await PDFDocument.load(docBuf);
        existingPdfPageCount = existingPdf.getPageCount();
      } catch {
        /* ignore */
      }
    }
  } else if (documentDataB64 && typeof documentDataB64 === "string" && documentDataB64.trim().length > 0) {
    try {
      const docBuf = Buffer.from(documentDataB64, "base64");
      existingPdf = await PDFDocument.load(docBuf);
      existingPdfPageCount = existingPdf.getPageCount();
    } catch {
      /* ignore */
    }
  }

  // 본문 이미지(docPageImages)가 있을 때만 추가하고,
  // 기존 PDF에 이미 2페이지 이상이 들어있으면 중복 방지로 본문 이미지를 스킵합니다.
  if (docPageImages && docPageImages.length > 0 && existingPdfPageCount <= 1) {
    for (const dataUrl of docPageImages) {
      const m = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
      if (!m) continue;
      const buf = Buffer.from(m[2], "base64");
      const isPng = m[1] === "png";
      const img = isPng ? await merged.embedPng(buf) : await merged.embedJpg(buf);
      const scale = Math.min(A4_W / img.width, A4_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const page = merged.addPage([A4_W, A4_H]);
      page.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
    }
  }

  if (existingPdf) {
    const pages = await merged.copyPages(existingPdf, existingPdf.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }

  return merged.save();
}

/* ------------------------------------------------------------------ */
/*  서버 사이드 PDF 생성 (pdfkit 테이블 레이아웃 – fallback용)           */
/* ------------------------------------------------------------------ */
export async function buildContractPdf(opts: BuildContractPdfOptions): Promise<Uint8Array> {
  const contractPageBuf = await buildContractPage(opts);

  const hasDocPath = opts.documentPath && opts.documentPath.toLowerCase().endsWith(".pdf");
  if (!hasDocPath && !(opts.documentDataB64 && String(opts.documentDataB64).trim().length > 0)) {
    return new Uint8Array(contractPageBuf);
  }

  const docBuf = await loadDocumentPdf(opts.documentPath ?? "", opts.documentDataB64);
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
