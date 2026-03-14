import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
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

function rowToContract(row: Record<string, unknown>) {
  let details: Record<string, unknown> | undefined;
  if (row.details != null && typeof row.details === "string") {
    try {
      details = JSON.parse(row.details) as Record<string, unknown>;
    } catch {
      details = undefined;
    }
  }
  return {
    id: row.id,
    companyId: row.company_id,
    consultationId: row.consultation_id ?? undefined,
    estimateId: row.estimate_id ?? undefined,
    title: String(row.title ?? ""),
    customerName: String(row.customer_name ?? ""),
    contact: String(row.contact ?? ""),
    signerEmail: row.signer_email != null ? String(row.signer_email) : undefined,
    documentPath: row.document_path != null ? String(row.document_path) : undefined,
    body: row.body != null ? String(row.body) : undefined,
    details: details ?? undefined,
    status: String(row.status ?? "draft"),
    signToken: row.sign_token != null ? String(row.sign_token) : undefined,
    signedAt: row.signed_at != null ? String(row.signed_at) : undefined,
    signerName: row.signer_name != null ? String(row.signer_name) : undefined,
    signatureData: row.signature_data != null ? String(row.signature_data) : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
    updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const contractId = parseInt(id, 10);
    if (Number.isNaN(contractId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    const result = await sql`
      SELECT id, company_id, consultation_id, estimate_id, title, customer_name, contact, signer_email, document_path, body, details, status, sign_token, signed_at, signer_name, signature_data, created_at, updated_at
      FROM contracts
      WHERE id = ${contractId} AND company_id = ${company.id}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(rowToContract(result.rows[0]));
  } catch (error) {
    console.error("contracts [id] GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const contractId = parseInt(id, 10);
    if (Number.isNaN(contractId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    const check = await sql`SELECT status FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
    if (check.rows.length === 0) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
    const status = String(check.rows[0].status ?? "");
    if (status !== "draft" && status !== "sent") return NextResponse.json({ error: "서명 완료된 계약은 수정할 수 없습니다." }, { status: 400 });
    const body = await request.json();
    const { title, customerName, contact, signerEmail, documentPath, documentData, body: bodyText, consultationId, estimateId, details: detailsObj } = body;
    const cur = await sql`SELECT title, customer_name, contact, signer_email, document_path, body, details, consultation_id, estimate_id FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
    if (cur.rows.length === 0) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
    const r = cur.rows[0] as Record<string, unknown>;
    const newTitle = title !== undefined ? String(title) : String(r.title ?? "");
    const newCustomerName = customerName !== undefined ? String(customerName) : String(r.customer_name ?? "");
    const newContact = contact !== undefined ? String(contact) : String(r.contact ?? "");
    const newSignerEmail = signerEmail !== undefined ? (signerEmail === "" ? null : String(signerEmail)) : (r.signer_email != null ? String(r.signer_email) : null);
    const newDocumentPath = documentPath !== undefined ? (documentPath === "" ? null : String(documentPath)) : (r.document_path != null ? String(r.document_path) : null);
    const newDocumentData = documentData !== undefined ? (documentData === "" ? null : String(documentData)) : undefined;
    const newBody = bodyText !== undefined ? (bodyText === "" ? null : String(bodyText)) : (r.body != null ? String(r.body) : null);
    const newDetails = detailsObj !== undefined ? (detailsObj == null || (typeof detailsObj === "object" && Object.keys(detailsObj).length === 0) ? null : (typeof detailsObj === "string" ? detailsObj : JSON.stringify(detailsObj))) : (r.details != null ? String(r.details) : null);
    const newConsultationId = consultationId !== undefined ? (consultationId == null ? null : Number(consultationId)) : (r.consultation_id != null ? Number(r.consultation_id) : null);
    const newEstimateId = estimateId !== undefined ? (estimateId == null ? null : Number(estimateId)) : (r.estimate_id != null ? Number(r.estimate_id) : null);
    if (newDocumentData !== undefined) {
      await sql`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS document_data TEXT`;
      await sql`
        UPDATE contracts
        SET title = ${newTitle}, customer_name = ${newCustomerName}, contact = ${newContact}, signer_email = ${newSignerEmail}, document_path = ${newDocumentPath}, document_data = ${newDocumentData}, body = ${newBody}, details = ${newDetails}, consultation_id = ${newConsultationId}, estimate_id = ${newEstimateId}, updated_at = NOW()
        WHERE id = ${contractId} AND company_id = ${company.id}
      `;
    } else {
      await sql`
        UPDATE contracts
        SET title = ${newTitle}, customer_name = ${newCustomerName}, contact = ${newContact}, signer_email = ${newSignerEmail}, document_path = ${newDocumentPath}, body = ${newBody}, details = ${newDetails}, consultation_id = ${newConsultationId}, estimate_id = ${newEstimateId}, updated_at = NOW()
        WHERE id = ${contractId} AND company_id = ${company.id}
      `;
    }
    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("contracts [id] PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const contractId = parseInt(id, 10);
    if (Number.isNaN(contractId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    const result = await sql`
      DELETE FROM contracts WHERE id = ${contractId} AND company_id = ${company.id} RETURNING id
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("contracts [id] DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
