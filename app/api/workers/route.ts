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

/** 회사별 현장 인부 목록 조회 */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT id, name, phone, role, memo, rating, created_at
      FROM company_workers
      WHERE company_id = ${company.id}
      ORDER BY id ASC
    `;

    const list = result.rows.map((row) => {
      const r = row as { id: number; name: string; phone?: string | null; role?: string | null; memo?: string | null; rating?: number | null; created_at?: string | null };
      const rating = r.rating != null ? Math.min(5, Math.max(1, Math.round(Number(r.rating)))) : null;
      return {
        id: Number(r.id),
        name: String(r.name),
        phone: r.phone ?? "",
        role: r.role ?? "",
        memo: r.memo ?? "",
        rating: rating as number | null,
        createdAt: r.created_at ?? null,
      };
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error("workers GET error:", error);
    const msg =
      error instanceof Error && /relation "company_workers"/i.test(error.message)
        ? "DB에 company_workers 테이블이 없습니다. sql/add_company_workers.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 현장 인부 추가 */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const memo = typeof body.memo === "string" ? body.memo.trim() : "";
    const rawRating = body.rating != null ? Number(body.rating) : null;
    const rating = rawRating != null && !Number.isNaN(rawRating) ? Math.min(5, Math.max(1, Math.round(rawRating))) : null;
    if (!name) {
      return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    }

    await sql`
      INSERT INTO company_workers (company_id, name, phone, role, memo, rating)
      VALUES (${company.id}, ${name}, ${phone || null}, ${role || null}, ${memo || null}, ${rating})
    `;

    return NextResponse.json({ message: "추가되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("workers POST error:", error);
    const msg =
      error instanceof Error && /relation "company_workers"/i.test(error.message)
        ? "DB에 company_workers 테이블이 없습니다. sql/add_company_workers.sql 을 실행해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
