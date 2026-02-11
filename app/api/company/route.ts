import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

// GET /api/company - 현재 로그인한 회사 정보 (drawing_list_api_url 포함)
export async function GET() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const company = JSON.parse(cookie.value) as { id: number; code: string; name: string };
    
    const { rows } = await sql`
      SELECT id, code, name, drawing_list_api_url
      FROM companies
      WHERE id = ${company.id}
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "회사를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      id: rows[0].id,
      code: rows[0].code,
      name: rows[0].name,
      drawingListApiUrl: rows[0].drawing_list_api_url || "",
    });
  } catch (error) {
    console.error("회사 정보 조회 실패:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// PATCH /api/company - 회사 정보 수정 (관리자 전용)
export async function PATCH(req: NextRequest) {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");

  if (!cookie) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const company = JSON.parse(cookie.value) as { id: number; code: string; name: string };
    const body = await req.json();
    const { drawingListApiUrl } = body;

    await sql`
      UPDATE companies
      SET drawing_list_api_url = ${drawingListApiUrl || null}
      WHERE id = ${company.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("회사 정보 수정 실패:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
