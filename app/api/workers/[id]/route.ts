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

/** 현장 인부 수정 */
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
    const workerId = parseInt(id, 10);
    if (Number.isNaN(workerId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    const bankAccount = typeof body.bankAccount === "string" ? body.bankAccount.trim() : "";
    const rawRating = body.rating != null ? Number(body.rating) : undefined;
    const rating = rawRating != null && !Number.isNaN(rawRating) ? Math.min(5, Math.max(1, Math.round(rawRating))) : null;

    if (!name) {
      return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    }

    const result = await sql`
      UPDATE company_workers
      SET name = ${name}, phone = ${phone || null}, role = ${role || null}, memo = ${memo || null}, rating = ${rating}, bank_account = ${bankAccount || null}
      WHERE id = ${workerId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 인부를 찾을 수 없거나 수정 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "수정되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("workers PATCH error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 현장 인부 삭제 */
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
    const workerId = parseInt(id, 10);
    if (Number.isNaN(workerId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM company_workers
      WHERE id = ${workerId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 인부를 찾을 수 없거나 삭제 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: "삭제되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("workers DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
