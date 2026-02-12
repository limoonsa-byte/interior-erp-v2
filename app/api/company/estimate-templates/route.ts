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

/** 회사별 견적 템플릿 목록 (견적서 작성 시 커스텀 견적 불러오기용) */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT id, title, items, process_order, created_at
      FROM company_estimate_templates
      WHERE company_id = ${company.id}
      ORDER BY created_at DESC
    `;

    const list = result.rows.map((row) => {
      let items: unknown[] = [];
      if ((row as { items: string }).items != null && String((row as { items: string }).items).trim() !== "") {
        try {
          items = JSON.parse(String((row as { items: string }).items)) as unknown[];
        } catch {
          items = [];
        }
      }
      let processOrder: string[] | undefined;
      const po = (row as { process_order: string | null }).process_order;
      if (po != null && String(po).trim() !== "") {
        try {
          processOrder = JSON.parse(String(po)) as string[];
        } catch {
          processOrder = undefined;
        }
      }
      return {
        id: Number((row as { id: number }).id),
        title: String((row as { title: string }).title),
        items,
        processOrder,
        createdAt: (row as { created_at: string }).created_at != null ? String((row as { created_at: string }).created_at) : undefined,
      };
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error("company estimate-templates GET error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("company_estimate_templates") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json(
        { error: "견적 템플릿 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 견적 템플릿 저장 (관리에서 제목만 저장 or 견적서 작성에서 현재 내용으로 저장) */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "템플릿 제목을 입력해 주세요." }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? JSON.stringify(body.items) : "[]";
    const processOrderJson = Array.isArray(body.processOrder) ? JSON.stringify(body.processOrder) : "[]";

    await sql`
      INSERT INTO company_estimate_templates (company_id, title, items, process_order)
      VALUES (${company.id}, ${title}, ${items}, ${processOrderJson})
    `;

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company estimate-templates POST error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("company_estimate_templates") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json(
        { error: "견적 템플릿 테이블이 없습니다. 터미널에서 node scripts/migrate.js 를 실행한 뒤 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
