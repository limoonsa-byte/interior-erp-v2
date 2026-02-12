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

/** 커스텀 메뉴 삭제 (관리 페이지에서 사용) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { id } = await params;
    const menuId = parseInt(id, 10);
    if (Number.isNaN(menuId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM company_custom_menu
      WHERE id = ${menuId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 메뉴를 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company custom-menu DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
