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

/** 견적 템플릿 내용 수정 (견적서 작성에서 "템플릿으로 저장" 시) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { id } = await params;
    const templateId = parseInt(id, 10);
    if (Number.isNaN(templateId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const body = await request.json();
    const items = Array.isArray(body.items) ? JSON.stringify(body.items) : null;
    const processOrder = Array.isArray(body.processOrder) ? JSON.stringify(body.processOrder) : null;

    if (items == null && processOrder == null) {
      return NextResponse.json({ error: "items 또는 processOrder가 필요합니다." }, { status: 400 });
    }

    const result = await sql`
      UPDATE company_estimate_templates
      SET
        items = COALESCE(${items}, items),
        process_order = COALESCE(${processOrder}, process_order)
      WHERE id = ${templateId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 템플릿을 찾을 수 없거나 수정 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company estimate-templates PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 견적 템플릿 삭제 */
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
    const templateId = parseInt(id, 10);
    if (Number.isNaN(templateId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM company_estimate_templates
      WHERE id = ${templateId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 템플릿을 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company estimate-templates DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
