import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { buildContractPdf } from "@/lib/buildContractPdf";
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

    const { contractId, email } = await request.json();
    if (!contractId || !email) return NextResponse.json({ error: "contractId와 email은 필수입니다." }, { status: 400 });

    const companyId = company.id;
    const result = await sql`
      SELECT id, title, status, company_id, document_path, details, signer_name, signer_address, signer_resident_number, signature_data, sign_token
      FROM contracts WHERE id = ${contractId} AND company_id = ${companyId}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });

    const c = result.rows[0];
    if (c.status !== "signed") return NextResponse.json({ error: "서명 완료된 계약서만 이메일 발송이 가능합니다." }, { status: 400 });

    const smtp = await getTransporter(companyId);
    if (!smtp) return NextResponse.json({ error: "SMTP 설정이 없어 이메일을 보낼 수 없습니다. 마스터 관리자라면 마스터 관리 → 마스터 메일(OAuth)에서 Gmail로 연결해 주세요." }, { status: 500 });

    let contractDetails: Record<string, string> | null = null;
    try {
      contractDetails = c.details != null
        ? (typeof c.details === "string" ? JSON.parse(c.details as string) : c.details as Record<string, string>)
        : null;
    } catch { contractDetails = null; }

    const pdfBytes = await buildContractPdf({
      details: contractDetails,
      signerName: String(c.signer_name ?? ""),
      signerAddress: String(c.signer_address ?? ""),
      signerResidentNumber: String(c.signer_resident_number ?? ""),
      signatureDataUrl: c.signature_data ? String(c.signature_data) : null,
      companyId,
      documentPath: c.document_path ? String(c.document_path) : null,
    });

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
    console.error("계약서 이메일 발송 실패:", error);
    return NextResponse.json({ error: "이메일 발송에 실패했습니다." }, { status: 500 });
  }
}
