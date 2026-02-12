import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getCompany() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

/** 관리 PIN 검증 후 env_backup 조회/저장 허용 */
async function verifyAdminPin(pin: string) {
  const company = await getCompany();
  if (!company) return null;
  const normalized = pin.replace(/\D/g, "").slice(0, 4);
  if (normalized.length !== 4) return null;
  const result = await sql`
    SELECT pin FROM company_admin_pin WHERE company_id = ${company.id} LIMIT 1
  `;
  if (result.rows.length === 0) return null;
  const stored = (result.rows[0] as { pin: string }).pin;
  return stored === normalized ? company : null;
}

/** .env.local 백업 내용 불러오기. Header: x-admin-pin (숫자 4자리) */
export async function GET(request: Request) {
  try {
    const pin = request.headers.get("x-admin-pin") ?? "";
    const company = await verifyAdminPin(pin);
    if (!company) {
      return NextResponse.json(
        { error: "로그인 후 관리 비밀번호를 확인해 주세요." },
        { status: 401 }
      );
    }

    const result = await sql`
      SELECT content, updated_at FROM env_backup WHERE id = 1 LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ content: "", updatedAt: null });
    }
    const row = result.rows[0] as { content: string | null; updated_at: string | null };
    return NextResponse.json({
      content: row.content ?? "",
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error("env-backup GET error:", error);
    const msg =
      error instanceof Error && /relation "env_backup"/i.test(error.message)
        ? "env_backup 테이블이 없습니다. 마이그레이션을 실행해 주세요."
        : "서버 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** .env.local 백업 저장. body: { pin: string, content: string } */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pin = typeof body.pin === "string" ? body.pin : "";
    const content = typeof body.content === "string" ? body.content : "";

    const company = await verifyAdminPin(pin);
    if (!company) {
      return NextResponse.json(
        { error: "로그인 후 관리 비밀번호를 확인해 주세요." },
        { status: 401 }
      );
    }

    await sql`
      INSERT INTO env_backup (id, content, updated_at) VALUES (1, ${content}, NOW())
      ON CONFLICT (id) DO UPDATE SET content = ${content}, updated_at = NOW()
    `;
    return NextResponse.json({ ok: true, message: "저장되었습니다." });
  } catch (error) {
    console.error("env-backup POST error:", error);
    const msg =
      error instanceof Error && /relation "env_backup"/i.test(error.message)
        ? "env_backup 테이블이 없습니다. 마이그레이션을 실행해 주세요."
        : "서버 오류";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
