import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getAppBaseUrl } from "@/lib/appUrl";
import { buildContractPdfFromImage } from "@/lib/buildContractPdf";
import { getTransporter } from "@/lib/smtp";

function rowToSignInfo(row: Record<string, unknown>) {
  let bodyMargins: { top: number; right: number; bottom: number; left: number } | undefined;
  if (row.body_margins != null) {
    try {
      const parsed = typeof row.body_margins === "string" ? JSON.parse(row.body_margins) : row.body_margins;
      bodyMargins = {
        top: Number(parsed.top) || 15,
        right: Number(parsed.right) || 15,
        bottom: Number(parsed.bottom) || 15,
        left: Number(parsed.left) || 15,
      };
    } catch { /* default 15mm */ }
  }
  return {
    id: row.id,
    title: String(row.title ?? ""),
    customerName: String(row.customer_name ?? ""),
    contact: String(row.contact ?? ""),
    status: String(row.status ?? "sent"),
    documentPath: row.document_path != null ? String(row.document_path) : undefined,
    body: row.body != null && String(row.body).trim() !== "" ? String(row.body) : undefined,
    details: row.details != null ? row.details : undefined,
    bodyMargins,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
    const result = await sql`
      SELECT id, title, customer_name, contact, status, document_path, body, details, body_margins
      FROM contracts
      WHERE sign_token = ${token}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 404 });
    const c = result.rows[0];
    const info = rowToSignInfo(c);
    if (c.status === "signed") return NextResponse.json({ ...info, alreadySigned: true }, { status: 200 });
    /**
     * 반드시 **경로만** 보냄 (앞에 /). 브라우저가 현재 호스트(localhost, 배포 도메인)로 요청하게 해야 pdf.js·fetch가 CORS 없이 동작함.
     * 절대 URL(getAppBaseUrl)을 쓰면 로컬에서 NEXT_PUBLIC_APP_URL 이 배포 주소로만 잡혀 있을 때 서명 페이지는 localhost 인데 PDF만 다른 도메인으로 가서 전부 실패하고,
     * PdfToA4Images 가 "PDF 없음" 메시지로 오인 표시하는 문제가 생김.
     */
    const documentUrl = `/api/contracts/document/${c.id}?token=${encodeURIComponent(token)}`;
    return NextResponse.json({ ...info, documentUrl }, { status: 200 });
  } catch (error) {
    console.error("contracts sign GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ error: "토큰이 없습니다." }, { status: 400 });
    const body = await request.json();
    const { signerName, signerAddress, signerResidentNumber, signatureData, signerEmail, pdfBase64, summaryImage, docPageImages } = body;
    if (!signerName || typeof signerName !== "string" || !signerName.trim()) return NextResponse.json({ error: "서명자 이름을 입력해 주세요." }, { status: 400 });
    const result = await sql`
      SELECT id, status, company_id, title, document_path, document_data
      FROM contracts
      WHERE sign_token = ${token}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 404 });
    if (result.rows[0].status === "signed") return NextResponse.json({ error: "이미 서명이 완료된 계약입니다." }, { status: 400 });
    const contractId = result.rows[0].id;
    const companyId = Number(result.rows[0].company_id);
    const sigData = signatureData != null ? String(signatureData) : null;
    const addr = signerAddress != null ? String(signerAddress).trim() : null;
    const rrn = signerResidentNumber != null ? String(signerResidentNumber).trim() : null;
    const email = signerEmail != null ? String(signerEmail).trim() : null;
    await sql`
      UPDATE contracts
      SET status = ${"signed"}, signed_at = NOW(), signer_name = ${signerName.trim()}, signer_address = ${addr}, signer_resident_number = ${rrn}, signature_data = ${sigData}, updated_at = NOW()
      WHERE sign_token = ${token}
    `;
    if (email) {
      await sql`UPDATE contracts SET signer_email = ${email}, updated_at = NOW() WHERE id = ${contractId}`;
    }

    // 테스트 페이지와 동일: 클라이언트가 보낸 1페이지(summaryImage/pdfBase64)+본문만 사용. 서버 pdfkit 안 씀.
    let emailSent = false;
    let emailError: string | undefined;
    if (email && (pdfBase64 || summaryImage)) {
      try {
        const documentPath = result.rows[0].document_path != null ? String(result.rows[0].document_path) : null;
        let documentDataB64 =
          result.rows[0].document_data != null && typeof result.rows[0].document_data === "string" && String(result.rows[0].document_data).trim().length > 0
            ? String(result.rows[0].document_data)
            : null;
        if (!documentDataB64 && documentPath && contractId) {
          try {
            const base = getAppBaseUrl();
            const docRes = await fetch(`${base}/api/contracts/document/${contractId}?token=${encodeURIComponent(token)}`);
            if (docRes.ok) documentDataB64 = Buffer.from(await docRes.arrayBuffer()).toString("base64");
          } catch (_) { /* ignore */ }
        }
        const bodyImages = Array.isArray(docPageImages)
          ? docPageImages.filter((u: unknown) => typeof u === "string" && (u as string).startsWith("data:image/"))
          : [];
        let pdfBytes: Uint8Array;
        if (pdfBase64 && typeof pdfBase64 === "string" && pdfBase64.length > 0) {
          pdfBytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
          // 클라이언트가 1페이지만 보냈을 수 있음 → 서버에서 본문 붙임 (3/17 본문 잘 오던 것과 동일하게)
          if (documentDataB64 && documentDataB64.trim().length > 0) {
            try {
              const clientPdf = await PDFDocument.load(pdfBytes);
              if (clientPdf.getPageCount() === 1) {
                const docBuf = Buffer.from(documentDataB64, "base64");
                const bodyPdf = await PDFDocument.load(docBuf);
                const merged = await PDFDocument.create();
                const [firstPage] = await merged.copyPages(clientPdf, [0]);
                merged.addPage(firstPage);
                const bodyPages = await merged.copyPages(bodyPdf, bodyPdf.getPageIndices());
                for (const p of bodyPages) merged.addPage(p);
                pdfBytes = new Uint8Array(await merged.save());
              }
            } catch (_) { /* 본문 병합 실패 시 원본 pdfBytes 유지 */ }
          }
        } else if (summaryImage && typeof summaryImage === "string" && summaryImage.startsWith("data:image/")) {
          pdfBytes = await buildContractPdfFromImage(summaryImage, documentPath, bodyImages.length > 0 ? bodyImages : undefined, documentDataB64);
        } else {
          throw new Error("1페이지 이미지가 없습니다.");
        }
        const smtp = await getTransporter(companyId);
        if (smtp) {
          const title = String(result.rows[0].title ?? "계약서");
          const safeFileName = title.replace(/[/\\:*?"<>|]/g, " ").trim() || "계약서";
          await smtp.transporter.sendMail({
            from: smtp.from,
            to: email,
            subject: `[계약서 서명 완료] ${title}`,
            text: `계약서 서명이 완료되었습니다.\n\n계약서 제목: ${title}\n\n첨부된 PDF 파일을 확인해 주세요.`,
            html: `<!DOCTYPE html><html><body style="font-family:sans-serif;"><h2 style="color:#1a73e8;">계약서 서명이 완료되었습니다</h2><p><strong>계약서 제목:</strong> ${title}</p><p>첨부된 PDF 파일을 확인해 주세요.</p><p style="color:#666;font-size:12px;">본 메일은 자동 발송된 메일입니다.</p></body></html>`,
            attachments: [{ filename: `${safeFileName}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" }],
          });
          emailSent = true;
        } else {
          emailError = "SMTP 설정이 없어 이메일을 보낼 수 없습니다.";
        }
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
        console.error("서명 완료 이메일 발송 실패:", emailError, e);
      }
    }

    const res = NextResponse.json({
      message: "서명이 완료되었습니다.",
      emailSent,
      emailError,
      emailTo: email || undefined,
      _build: "mail-only-202503",
    }, { status: 200 });
    res.headers.set("X-Contract-Sign-Build", "mail-only-202503");
    return res;
  } catch (error) {
    console.error("contracts sign POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
