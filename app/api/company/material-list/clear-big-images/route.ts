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

/** 용량이 큰 base64 이미지(image_url)만 비웁니다. 적어둔 텍스트는 그대로 두고, DB 조회/저장이 가능해집니다. */
export async function POST() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      UPDATE site_material_list_items
      SET image_url = ''
      WHERE company_id = ${company.id} AND length(image_url) > 50000
      RETURNING id
    `;
    const count = result.rowCount ?? result.rows.length;

    return NextResponse.json({
      message: `${count}개 행의 큰 이미지를 비웠습니다. 적어두신 품목·비고 등은 그대로 있습니다.`,
      clearedCount: count,
    });
  } catch (error) {
    console.error("clear-big-images error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
