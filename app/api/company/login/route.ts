import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      code,
      password,
    }: {
      code?: string;
      password?: string;
    } = body;

    if (!code || !password) {
      return NextResponse.json(
        { error: "code, password는 필수입니다." },
        { status: 400 }
      );
    }

    const result =
      await sql`SELECT id, name, password_hash FROM companies WHERE code = ${code} LIMIT 1`;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "회사코드 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const row = result.rows[0] as {
      id: number;
      name: string;
      password_hash: string | null;
    };

    if (!row.password_hash || row.password_hash !== password) {
      return NextResponse.json(
        { error: "회사코드 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      { companyId: row.id, code, name: row.name },
      { status: 200 }
    );

    // 간단한 회사 세션 쿠키 (추후 보안 강화 여지)
    response.cookies.set(
      "company",
      JSON.stringify({ id: row.id, code, name: row.name }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7일
      }
    );

    return response;
  } catch (error) {
    console.error("company login error:", error);
    const isDbMissing =
      (error instanceof Error && /missing_connection_string|connectionString/i.test(error.message)) ||
      (error && typeof (error as { code?: string }).code === "string" && (error as { code: string }).code === "missing_connection_string");
    const msg = isDbMissing
      ? "로컬/Cursor 미리보기: .env.local에 POSTGRES_URL을 넣고 터미널에서 npm run dev 를 다시 실행해 주세요. (Vercel → Storage → Neon에서 연결 주소 복사)"
      : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

