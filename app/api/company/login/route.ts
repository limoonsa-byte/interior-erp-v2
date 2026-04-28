import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, employeeCode, password } = body as {
      code?: string;
      employeeCode?: string;
      password?: string;
    };

    if (!code || !password) {
      return NextResponse.json(
        { error: "회사아이디와 비밀번호는 필수입니다." },
        { status: 400 }
      );
    }

    if (!employeeCode || typeof employeeCode !== "string" || employeeCode.trim() === "") {
      return NextResponse.json(
        { error: "개인코드는 필수입니다." },
        { status: 400 }
      );
    }

    const companyCode = String(code).trim();
    const companyResult = await sql`
      SELECT id, name, password_hash FROM companies WHERE LOWER(TRIM(code)) = LOWER(${companyCode}) LIMIT 1
    `;

    if (companyResult.rows.length === 0) {
      const res: { error: string; debug?: string } = {
        error: "회사아이디·개인코드 또는 비밀번호가 올바르지 않습니다.",
      };
      if (process.env.NODE_ENV === "development") res.debug = "회사아이디를 찾을 수 없습니다. (code: " + companyCode + ")";
      return NextResponse.json(res, { status: 401 });
    }

    const company = companyResult.rows[0] as {
      id: number;
      name: string;
      password_hash: string | null;
    };

    const trimmedCode = String(employeeCode).trim();
    const picResult = await sql`
      SELECT id, name, password_hash FROM company_pics
      WHERE company_id = ${company.id} AND TRIM(COALESCE(employee_code, '')) = ${trimmedCode}
      LIMIT 1
    `;

    if (picResult.rows.length === 0) {
      const res: { error: string; debug?: string } = {
        error: "회사아이디·개인코드 또는 비밀번호가 올바르지 않습니다.",
      };
      if (process.env.NODE_ENV === "development") res.debug = "해당 회사의 담당자(개인코드)를 찾을 수 없습니다. (개인코드: " + trimmedCode + ")";
      return NextResponse.json(res, { status: 401 });
    }

    const pic = picResult.rows[0] as { id: number; name: string; password_hash: string | null };
    const picHasPassword = pic.password_hash != null && String(pic.password_hash).trim() !== "";
    const pwd = String(password ?? "").trim();
    const companyPwd = company.password_hash != null ? String(company.password_hash).trim() : null;
    const picPwd = pic.password_hash != null ? String(pic.password_hash).trim() : null;
    const passwordOk = picHasPassword
      ? picPwd === pwd
      : (companyPwd != null && companyPwd.toLowerCase() === pwd.toLowerCase());
    if (!passwordOk) {
      const res: { error: string; debug?: string } = {
        error: "회사아이디·개인코드 또는 비밀번호가 올바르지 않습니다.",
      };
      if (process.env.NODE_ENV === "development")
        res.debug = "비밀번호가 일치하지 않습니다. (담당자 비밀번호 없음 → 회사 비밀번호 사용)";
      return NextResponse.json(res, { status: 401 });
    }

    const response = NextResponse.json(
      { companyId: company.id, code, name: company.name, picId: pic.id, picName: pic.name },
      { status: 200 }
    );

    response.cookies.set(
      "company",
      JSON.stringify({
        id: company.id,
        code,
        name: company.name,
        picId: pic.id,
        picName: pic.name,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    );

    return response;
  } catch (err) {
    console.error("company login error:", err);
    let msg = "서버 오류가 발생했습니다.";
    if (err instanceof Error && err.message) {
      const re = new RegExp("missing_connection_string|connectionString", "i");
      if (re.test(String(err.message))) {
        msg =
          "로컬/Cursor 미리보기: .env.local에 POSTGRES_URL을 넣고 터미널에서 npm run dev 를 다시 실행해 주세요. (Vercel → Storage → Neon에서 연결 주소 복사)";
      }
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
