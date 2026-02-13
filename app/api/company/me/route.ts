import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ company: null }, { status: 200 });
  }

  try {
    const fromCookie = JSON.parse(cookie.value) as {
      id: number;
      code: string;
      name: string;
    };
    const result = await sql`
      SELECT id, name, code, is_master
      FROM companies
      WHERE id = ${fromCookie.id}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ company: null }, { status: 200 });
    }
    const row = result.rows[0] as { id: number; name: string; code: string; is_master: boolean | null };
    const company = {
      id: row.id,
      code: row.code,
      name: row.name,
      isMaster: Boolean(row.is_master),
    };
    return NextResponse.json({ company }, { status: 200 });
  } catch {
    return NextResponse.json({ company: null }, { status: 200 });
  }
}

