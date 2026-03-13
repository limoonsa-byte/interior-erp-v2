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
  if (row.details != null) {
    if (typeof row.details === "string") {
      try {
        details = JSON.parse(row.details) as Record<string, unknown>;
      } catch {
        details = undefined;
      }
    } else if (typeof row.details === "object" && row.details !== null) {
      details = row.details as Record<string, unknown>;
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
    signerAddress: row.signer_address != null ? String(row.signer_address) : undefined,
    signerResidentNumber: row.signer_resident_number != null ? String(row.signer_resident_number) : undefined,
    signatureData: row.signature_data != null ? String(row.signature_data) : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
    updatedAt: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json([], { status: 200 });
    const result = await sql`
      SELECT id, company_id, consultation_id, estimate_id, title, customer_name, contact, signer_email, document_path, body, details, status, sign_token, signed_at, signer_name, signer_address, signer_resident_number, signature_data, created_at, updated_at
      FROM contracts
      WHERE company_id = ${company.id}
      ORDER BY id DESC
    `;
    const list = result.rows.map((row: Record<string, unknown>) => rowToContract(row));
    return NextResponse.json(list);
  } catch (error) {
    console.error("contracts GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const body = await request.json();
    const {
      consultationId,
      estimateId,
      title,
      customerName,
      contact,
      signerEmail,
      documentPath,
      body: bodyText,
      details: detailsObj,
    } = body;
    const status = "draft";
    const detailsStr = detailsObj != null ? (typeof detailsObj === "string" ? detailsObj : JSON.stringify(detailsObj)) : null;
    const result = await sql`
      INSERT INTO contracts (company_id, consultation_id, estimate_id, title, customer_name, contact, signer_email, document_path, body, details, status, updated_at)
      VALUES (${company.id}, ${consultationId ?? null}, ${estimateId ?? null}, ${title ?? ""}, ${customerName ?? ""}, ${contact ?? ""}, ${signerEmail ?? null}, ${documentPath ?? null}, ${bodyText ?? null}, ${detailsStr}, ${status}, NOW())
      RETURNING id
    `;
    const newId = result.rows[0]?.id;
    return NextResponse.json({ message: "저장되었습니다.", id: newId }, { status: 200 });
  } catch (error) {
    console.error("contracts POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
