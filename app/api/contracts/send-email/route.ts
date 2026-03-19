import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { buildContractPdfFromImage, buildContractPdf } from "@/lib/buildContractPdf";
import { getTransporter } from "@/lib/smtp";
import { cookies } from "next/headers";

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

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { contractId, email, summaryImage, pdfBase64 } = await request.json();
    if (!contractId || !email) return NextResponse.json({ error: "contractId와 email은 필수입니다." }, { status: 400 });

    const companyId = company.id;
    const result = await sql`
      SELECT id, title, status, company_id, document_path, document_data, details, signer_name, signer_address, signer_resident_number, signature_data, sign_token
      FROM contracts WHERE id = ${contractId} AND company_id = ${companyId}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });

    const c = result.rows[0];
    if (c.status !== "signed") return NextResponse.json({ error: "서명 완료된 계약서만 이메일 발송이 가능합니다." }, { status: 400 });

    const smtp = await getTransporter(companyId);
    if (!smtp) return NextResponse.json({ error: "SMTP 설정이 없어 이메일을 보낼 수 없습니다. 마스터 관리자라면 마스터 관리 → 마스터 메일(OAuth)에서 Gmail 앱 비밀번호로 연결하거나 OAuth로 연결해 주세요." }, { status: 500 });

    const documentPath = c.document_path ? String(c.document_path) : null;
    let documentDataB64 =
      c.document_data != null && typeof c.document_data === "string" && String(c.document_data).trim().length > 0
        ? String(c.document_data)
        : null;

    // DB에 본문이 없고 document_path만 있으면 문서 API로 본문 PDF 조회 (서버리스에서 파일 없을 때)
    if (!documentDataB64 && documentPath && contractId) {
      try {
        const base = (await import("@/lib/appUrl")).getAppBaseUrl();
        const docRes = await fetch(`${base}/api/contracts/document/${contractId}`, {
          headers: { cookie: request.headers.get("cookie") || "" },
        });
        if (docRes.ok) {
          const buf = await docRes.arrayBuffer();
          documentDataB64 = Buffer.from(buf).toString("base64");
        }
      } catch (_) { /* ignore */ }
    }

    // 1페이지는 계약서 작성 인쇄 미리보기와 동일하게 클라이언트 캡처(summaryImage)만 사용. 서버 pdfkit으로 크기/위치 바꾸지 않음.
    let pdfBytes: Uint8Array;
    if (pdfBase64 && typeof pdfBase64 === "string" && pdfBase64.length > 0) {
      pdfBytes = new Uint8Array(Buffer.from(pdfBase64, "base64"));
    } else if (summaryImage && typeof summaryImage === "string" && summaryImage.startsWith("data:image/")) {
      pdfBytes = await buildContractPdfFromImage(summaryImage, documentPath, undefined, documentDataB64);
    } else {
      return NextResponse.json(
        { error: "계약서 작성 화면에서 해당 계약서를 열고 [이메일 보내기]로 보내 주세요. (1페이지는 인쇄 미리보기와 동일하게만 사용됩니다.)" },
        { status: 400 }
      );
    }

    const title = String(c.title ?? "계약서");
    const safeFileName = title.replace(/[/\\:*?"<>|]/g, " ").trim() || "계약서";

    await smtp.transporter.sendMail({
      from: smtp.from,
      to: String(email).trim(),
      subject: `[계약서 서명 완료] ${title}`,
      text: `계약서 서명이 완료되었습니다.\n\n계약서 제목: ${title}\n\n첨부된 PDF 파일을 확인해 주세요.`,
      html: `<!DOCTYPE html><html><body style="font-family:sans-serif;"><h2 style="color:#1a73e8;">계약서 서명이 완료되었습니다</h2><p><strong>계약서 제목:</strong> ${title}</p><p>첨부된 PDF 파일을 확인해 주세요.</p><p style="color:#666;font-size:12px;">본 메일은 자동 발송된 메일입니다.</p></body></html>`,
      attachments: [{ filename: `${safeFileName}.pdf`, content: Buffer.from(pdfBytes), contentType: "application/pdf" }],
    });

    return NextResponse.json({ message: "이메일이 발송되었습니다." });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("계약서 이메일 발송 실패:", detail, error);
    return NextResponse.json({ error: `이메일 발송에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
