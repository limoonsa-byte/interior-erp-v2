import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number };
  } catch {
    return null;
  }
}

/** 전체 회사 공용: 마스터가 등록한 기본 견적 템플릿 목록 (견적서 작성 > 커스텀 견적 불러오기에서 사용) */
export async function GET() {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  try {
    const result = await sql`
      SELECT id, title, items, process_order, created_at
      FROM master_default_estimate_templates
      ORDER BY created_at DESC
    `;
    const list = result.rows.map((row) => {
      const r = row as { id: number; title: string; items: string; process_order: string | null; created_at: string };
      let items: unknown[] = [];
      if (r.items != null && String(r.items).trim() !== "") {
        try {
          items = JSON.parse(String(r.items)) as unknown[];
        } catch {
          items = [];
        }
      }
      let processOrder: string[] | undefined;
      if (r.process_order != null && String(r.process_order).trim() !== "") {
        try {
          processOrder = JSON.parse(String(r.process_order)) as string[];
        } catch {
          processOrder = undefined;
        }
      }
      return {
        id: Number(r.id),
        title: String(r.title),
        items,
        processOrder,
        createdAt: r.created_at != null ? String(r.created_at) : undefined,
      };
    });
    return NextResponse.json(list);
  } catch (error) {
    console.error("default-estimate-templates GET error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("master_default_estimate_templates") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
