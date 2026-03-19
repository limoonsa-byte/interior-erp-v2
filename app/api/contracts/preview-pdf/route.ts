import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { buildContractPdf } from "@/lib/buildContractPdf";
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

/** 이메일 발송 시 사용하는 것과 동일한 PDF를 반환 (미리보기/테스트용) */
export async function GET(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    if (!contractId || !/^\d+$/.test(contractId)) {
      return NextResponse.json({ error: "contractId(숫자)가 필요합니다." }, { status: 400 });
    }

    const companyId = company.id;
    const result = await sql`
      SELECT id, title, status, company_id, document_path, document_data, details, signer_name, signer_address, signer_resident_number, signature_data
      FROM contracts
      WHERE id = ${Number(contractId)} AND company_id = ${companyId}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });

    const c = result.rows[0];
    if (c.status !== "signed") {
      return NextResponse.json({ error: "서명 완료된 계약서만 미리보기가 가능합니다." }, { status: 400 });
    }

    const contractIdNum = Number(contractId);
    const documentPath = c.document_path ? String(c.document_path) : null;
    let documentDataB64 =
      c.document_data != null && typeof c.document_data === "string" && String(c.document_data).trim().length > 0
        ? String(c.document_data)
        : null;

    if (!documentDataB64 && documentPath && contractIdNum) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
        const docRes = await fetch(`${String(base).replace(/\/$/, "")}/api/contracts/document/${contractIdNum}`, {
          headers: { cookie: request.headers.get("cookie") || "" },
        });
        if (docRes.ok) documentDataB64 = Buffer.from(await docRes.arrayBuffer()).toString("base64");
      } catch (_) { /* ignore */ }
    }

    let contractDetails: Record<string, string> | null = null;
    try {
      contractDetails = c.details != null
        ? (typeof c.details === "string" ? JSON.parse(c.details as string) : c.details as Record<string, string>)
        : null;
    } catch {
      contractDetails = null;
    }

    const pdfBytes = await buildContractPdf({
      details: contractDetails,
      signerName: String(c.signer_name ?? ""),
      signerAddress: String(c.signer_address ?? ""),
      signerResidentNumber: String(c.signer_resident_number ?? ""),
      signatureDataUrl: c.signature_data ? String(c.signature_data) : null,
      companyId,
      documentPath,
      documentDataB64: documentDataB64 ?? undefined,
    });

    const title = String(c.title ?? "계약서");
    const safeFileName = title.replace(/[/\\:*?"<>|]/g, " ").trim() || "계약서";

    return new NextResponse(pdfBytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(safeFileName)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("계약서 PDF 미리보기 실패:", detail, error);
    return NextResponse.json({ error: `PDF 생성 실패: ${detail}` }, { status: 500 });
  }
}
