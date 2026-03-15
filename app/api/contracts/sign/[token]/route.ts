import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { buildContractPdf, buildContractPdfFromImage } from "@/lib/buildContractPdf";
import { getTransporter } from "@/lib/smtp";

async function sendSignedContractEmail(
  companyId: number,
  to: string,
  title: string,
  _contractId: number,
  _token: string,
  pdfBytes: Uint8Array
) {
  const result = await getTransporter(companyId);
  if (!result) {
    console.error("SMTP 설정이 없어 이메일을 보낼 수 없습니다.");
    return;
  }
  const { transporter, from } = result;
  const subject = title ? `[계약서 서명 완료] ${title}` : "계약서 서명 완료";
  const safeFileName = (title || "계약서").replace(/[/\\:*?"<>|]/g, " ").trim() || "계약서";
  const text = `계약서 서명이 완료되었습니다.\n\n계약서 제목: ${title}\n\n첨부된 PDF 파일을 확인해 주세요.`;
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;">` +
    `<h2 style="color:#1a73e8;">계약서 서명이 완료되었습니다</h2>` +
    `<p><strong>계약서 제목:</strong> ${title}</p>` +
    `<p>첨부된 PDF 파일을 확인해 주세요.</p>` +
    `<p style="color:#666;font-size:12px;">본 메일은 자동 발송된 메일입니다.</p>` +
    `</body></html>`;
  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `${safeFileName}.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      },
    ],
  });
}

function rowToSignInfo(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: String(row.title ?? ""),
    customerName: String(row.customer_name ?? ""),
    contact: String(row.contact ?? ""),
    status: String(row.status ?? "sent"),
    documentPath: row.document_path != null ? String(row.document_path) : undefined,
    body: row.body != null && String(row.body).trim() !== "" ? String(row.body) : undefined,
    details: row.details != null ? row.details : undefined,
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
      SELECT id, title, customer_name, contact, status, document_path, body, details
      FROM contracts
      WHERE sign_token = ${token}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 404 });
    const c = result.rows[0];
    const info = rowToSignInfo(c);
    if (c.status === "signed") return NextResponse.json({ ...info, alreadySigned: true }, { status: 200 });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const documentUrl = c.document_path != null && String(c.document_path).trim() !== ""
      ? `${baseUrl.replace(/\/$/, "")}/api/contracts/document/${c.id}?token=${encodeURIComponent(token)}`
      : undefined;
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
    const { signerName, signerAddress, signerResidentNumber, signatureData, signerEmail, summaryImage } = body;
    if (!signerName || typeof signerName !== "string" || !signerName.trim()) return NextResponse.json({ error: "서명자 이름을 입력해 주세요." }, { status: 400 });
    const result = await sql`
      SELECT id, title, status, company_id, document_path, details FROM contracts WHERE sign_token = ${token}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 404 });
    if (result.rows[0].status === "signed") return NextResponse.json({ error: "이미 서명이 완료된 계약입니다." }, { status: 400 });
    const contractId = result.rows[0].id;
    const contractTitle = String(result.rows[0].title ?? "");
    const companyId = Number(result.rows[0].company_id);
    const documentPath = result.rows[0].document_path != null ? String(result.rows[0].document_path) : null;
    let contractDetails: Record<string, string> | null = null;
    try {
      contractDetails = result.rows[0].details != null
        ? (typeof result.rows[0].details === "string" ? JSON.parse(result.rows[0].details as string) : result.rows[0].details as Record<string, string>)
        : null;
    } catch { contractDetails = null; }
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
    let emailSent = false;
    let emailError = "";
    try {
      const companyRow = await sql`SELECT company_email FROM companies WHERE id = ${companyId}`;
      const companyEmail = companyRow.rows.length > 0 && companyRow.rows[0].company_email
        ? String(companyRow.rows[0].company_email).trim()
        : null;
      if (email || companyEmail) {
        let pdfBytes: Uint8Array;
        if (summaryImage && typeof summaryImage === "string" && summaryImage.startsWith("data:image/")) {
          pdfBytes = await buildContractPdfFromImage(summaryImage, documentPath);
        } else {
          pdfBytes = await buildContractPdf({
            details: contractDetails,
            signerName: signerName.trim(),
            signerAddress: addr || "",
            signerResidentNumber: rrn || "",
            signatureDataUrl: sigData,
            companyId,
            documentPath,
          });
        }
        if (email) {
          await sendSignedContractEmail(companyId, email, contractTitle, contractId, token, pdfBytes);
          emailSent = true;
        }
        if (companyEmail && companyEmail !== email) {
          await sendSignedContractEmail(companyId, companyEmail, contractTitle, contractId, token, pdfBytes);
        }
      }
    } catch (emailErr) {
      emailError = emailErr instanceof Error ? emailErr.message : String(emailErr);
      console.error("서명 완료 이메일 발송 실패:", emailError, emailErr);
    }
    return NextResponse.json({
      message: "서명이 완료되었습니다.",
      emailSent,
      emailError: emailError || undefined,
      emailTo: email || undefined,
    }, { status: 200 });
  } catch (error) {
    console.error("contracts sign POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
