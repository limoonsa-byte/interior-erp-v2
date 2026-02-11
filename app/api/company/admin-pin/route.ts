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

/** 관리 비밀번호 설정 여부 조회 */
export async function GET() {
  try {
    const company = await getCompany();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT 1 FROM company_admin_pin WHERE company_id = ${company.id} LIMIT 1
    `;
    return NextResponse.json({ hasPin: result.rows.length > 0 });
  } catch (error) {
    console.error("admin-pin GET error:", error);
    const msg =
      error instanceof Error && /relation "company_admin_pin"/i.test(error.message)
        ? "DB에 company_admin_pin 테이블이 없습니다. sql/add_company_admin_pin.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 최초 설정(설정 시) 또는 확인(입력 시). body: { pin: "1234" } */
export async function POST(request: Request) {
  try {
    const company = await getCompany();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const pin = typeof body.pin === "string" ? body.pin.replace(/\D/g, "").slice(0, 4) : "";
    if (pin.length !== 4) {
      return NextResponse.json({ error: "숫자 4자리를 입력해 주세요." }, { status: 400 });
    }

    const existing = await sql`
      SELECT pin FROM company_admin_pin WHERE company_id = ${company.id} LIMIT 1
    `;

    if (existing.rows.length === 0) {
      await sql`
        INSERT INTO company_admin_pin (company_id, pin) VALUES (${company.id}, ${pin})
      `;
      return NextResponse.json({ set: true });
    }

    const stored = (existing.rows[0] as { pin: string }).pin;
    return NextResponse.json({ ok: stored === pin });
  } catch (error) {
    console.error("admin-pin POST error:", error);
    const msg =
      error instanceof Error && /relation "company_admin_pin"/i.test(error.message)
        ? "DB에 company_admin_pin 테이블이 없습니다."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 비밀번호 변경. body: { currentPin, newPin } */
export async function PATCH(request: Request) {
  try {
    const company = await getCompany();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const currentPin = typeof body.currentPin === "string" ? body.currentPin.replace(/\D/g, "").slice(0, 4) : "";
    const newPin = typeof body.newPin === "string" ? body.newPin.replace(/\D/g, "").slice(0, 4) : "";
    if (currentPin.length !== 4 || newPin.length !== 4) {
      return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호 모두 숫자 4자리여야 합니다." }, { status: 400 });
    }

    const existing = await sql`
      SELECT pin FROM company_admin_pin WHERE company_id = ${company.id} LIMIT 1
    `;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "설정된 비밀번호가 없습니다." }, { status: 400 });
    }

    const stored = (existing.rows[0] as { pin: string }).pin;
    if (stored !== currentPin) {
      return NextResponse.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }

    await sql`UPDATE company_admin_pin SET pin = ${newPin} WHERE company_id = ${company.id}`;
    return NextResponse.json({ message: "변경되었습니다." });
  } catch (error) {
    console.error("admin-pin PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
