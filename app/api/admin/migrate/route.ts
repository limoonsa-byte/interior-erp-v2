import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/** 배포 후 SQL Editor 대신 이 API를 호출하면 DB 마이그레이션이 자동 실행됩니다. (GET: 안내만 표시) */
export async function GET() {
  return NextResponse.json({
    message: "DB 마이그레이션을 실행하려면 POST로 호출하세요.",
    steps: [
      "1. Vercel → 프로젝트 → Settings → Environment Variables",
      "2. MIGRATE_SECRET 추가 (예: 아무 비밀 문자열)",
      "3. 재배포 후 아래처럼 호출:",
      '   curl -X POST "https://배포주소/api/admin/migrate" -H "x-migrate-secret: 설정한비밀값"',
    ],
    run: "POST /api/admin/migrate + Header: x-migrate-secret = (MIGRATE_SECRET 값)",
  });
}

/**
 * POST: consulted_at, scope 컬럼 추가 + company_pics 테이블 생성 실행.
 * Header "x-migrate-secret" 이 환경변수 MIGRATE_SECRET 과 일치해야 합니다.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-migrate-secret");
  const expected = process.env.MIGRATE_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json(
      { error: "MIGRATE_SECRET이 설정되지 않았거나 일치하지 않습니다." },
      { status: 401 }
    );
  }

  const results: string[] = [];

  try {
    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS consulted_at TEXT`;
    results.push("consulted_at 컬럼 확인");

    await sql`ALTER TABLE consultations ADD COLUMN IF NOT EXISTS scope TEXT`;
    results.push("scope 컬럼 확인");

    await sql`
      CREATE TABLE IF NOT EXISTS company_pics (
        id SERIAL PRIMARY KEY,
        company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        UNIQUE(company_id, name)
      )
    `;
    results.push("company_pics 테이블 확인");

    return NextResponse.json({
      message: "마이그레이션 완료",
      done: results,
    });
  } catch (error) {
    console.error("migrate error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "마이그레이션 실패", detail: msg },
      { status: 500 }
    );
  }
}
