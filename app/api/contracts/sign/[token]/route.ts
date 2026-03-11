import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

function rowToSignInfo(row: Record<string, unknown>, includeBody: boolean) {
  return {
    id: row.id,
    title: String(row.title ?? ""),
    customerName: String(row.customer_name ?? ""),
    contact: String(row.contact ?? ""),
    status: String(row.status ?? "sent"),
    documentPath: row.document_path != null ? String(row.document_path) : undefined,
    body: includeBody && row.body != null ? String(row.body) : undefined,
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
    if (c.status === "signed") return NextResponse.json({ ...rowToSignInfo(c, true), alreadySigned: true }, { status: 200 });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const documentUrl = c.document_path ? `${baseUrl.replace(/\/$/, "")}/api/contracts/document/${c.id}?token=${encodeURIComponent(token)}` : undefined;
    const includeBody = !documentUrl;
    return NextResponse.json({ ...rowToSignInfo(c, includeBody), documentUrl }, { status: 200 });
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
    const { signerName, signerAddress, signerResidentNumber, signatureData } = body;
    if (!signerName || typeof signerName !== "string" || !signerName.trim()) return NextResponse.json({ error: "서명자 이름을 입력해 주세요." }, { status: 400 });
    const result = await sql`
      SELECT id, status FROM contracts WHERE sign_token = ${token}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 404 });
    if (result.rows[0].status === "signed") return NextResponse.json({ error: "이미 서명이 완료된 계약입니다." }, { status: 400 });
    const sigData = signatureData != null ? String(signatureData) : null;
    const addr = signerAddress != null ? String(signerAddress).trim() : null;
    const rrn = signerResidentNumber != null ? String(signerResidentNumber).trim() : null;
    await sql`
      UPDATE contracts
      SET status = ${"signed"}, signed_at = NOW(), signer_name = ${signerName.trim()}, signer_address = ${addr}, signer_resident_number = ${rrn}, signature_data = ${sigData}, updated_at = NOW()
      WHERE sign_token = ${token}
    `;
    return NextResponse.json({ message: "서명이 완료되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("contracts sign POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
