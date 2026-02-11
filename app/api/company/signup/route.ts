import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      code,
      password,
      ownerEmail,
    }: {
      name?: string;
      code?: string;
      password?: string;
      ownerEmail?: string;
    } = body;

    if (!name || !code || !password) {
      return NextResponse.json(
        { error: "name, code, password는 필수입니다." },
        { status: 400 }
      );
    }

    const exists =
      await sql`SELECT id FROM companies WHERE code = ${code} LIMIT 1`;
    if (exists.rows.length > 0) {
      return NextResponse.json(
        { error: "이미 사용 중인 회사코드입니다." },
        { status: 409 }
      );
    }

    // TODO: 보안 강화 단계에서 bcrypt 등으로 암호화 처리
    const inserted =
      await sql`INSERT INTO companies (name, code, password_hash) VALUES (${name}, ${code}, ${password}) RETURNING id`;

    const companyId = inserted.rows[0].id as number;

    if (ownerEmail) {
      await sql`
        INSERT INTO members (company_id, email, role)
        VALUES (${companyId}, ${ownerEmail}, 'owner')
      `;
    }

    const response = NextResponse.json(
      { companyId, code, name },
      { status: 201 }
    );

    response.cookies.set(
      "company",
      JSON.stringify({ id: companyId, code, name }),
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return response;
  } catch (error) {
    console.error("company signup error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

