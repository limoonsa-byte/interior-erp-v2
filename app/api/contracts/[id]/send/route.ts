import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const contractId = parseInt(id, 10);
    if (Number.isNaN(contractId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    const row = await sql`SELECT id, sign_token, status FROM contracts WHERE id = ${contractId} AND company_id = ${company.id}`;
    if (row.rows.length === 0) return NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 });
    let signToken = row.rows[0].sign_token != null ? String(row.rows[0].sign_token) : null;
    if (!signToken) {
      signToken = randomUUID();
      await sql`UPDATE contracts SET sign_token = ${signToken}, status = ${"sent"}, updated_at = NOW() WHERE id = ${contractId} AND company_id = ${company.id}`;
    } else if (row.rows[0].status === "draft") {
      await sql`UPDATE contracts SET status = ${"sent"}, updated_at = NOW() WHERE id = ${contractId} AND company_id = ${company.id}`;
    }
    const body = await request.json().catch(() => ({}));
    const email = body.email != null ? String(body.email).trim() : "";
    if (email) {
      await sql`UPDATE contracts SET signer_email = ${email}, updated_at = NOW() WHERE id = ${contractId} AND company_id = ${company.id}`;
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";
    const signUrl = `${baseUrl.replace(/\/$/, "")}/sign/${signToken}`;
    return NextResponse.json({ signUrl, signToken }, { status: 200 });
  } catch (error) {
    console.error("contracts send error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
