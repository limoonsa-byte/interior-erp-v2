import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { hashSecretToken } from "@/lib/shop-secret-auth";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie?.value) return null;
  try {
    const parsed = JSON.parse(cookie.value) as { id: number };
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const result = await sql`
      SELECT id, note, expires_at, revoked_at, created_at
      FROM shop_secret_tokens
      WHERE company_id = ${company.id}
      ORDER BY created_at DESC
      LIMIT 30
    `;
    return NextResponse.json({ tokens: result.rows }, { status: 200 });
  } catch (error) {
    console.error("shop-secret tokens GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const days = Math.max(1, Math.min(180, Number((body as { days?: unknown }).days) || 30));
    const note = String((body as { note?: unknown }).note ?? "").trim().slice(0, 80);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const rawToken = randomBytes(24).toString("hex");
    const tokenHash = hashSecretToken(rawToken);
    await sql`
      INSERT INTO shop_secret_tokens (company_id, token_hash, note, expires_at)
      VALUES (${company.id}, ${tokenHash}, ${note || null}, ${expiresAt.toISOString()})
    `;
    return NextResponse.json(
      {
        token: rawToken,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("shop-secret tokens POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
