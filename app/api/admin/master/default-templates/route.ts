import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function requireMaster() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    const fromCookie = JSON.parse(cookie.value) as { id: number };
    const result = await sql`
      SELECT id FROM companies WHERE id = ${fromCookie.id} AND is_master = true LIMIT 1
    `;
    return result.rows.length > 0 ? fromCookie : null;
  } catch {
    return null;
  }
}

function parseRow(row: { id: number; title: string; items: string; process_order: string | null; note: string | null; created_at: string }) {
  let items: unknown[] = [];
  if (row.items != null && String(row.items).trim() !== "") {
    try {
      items = JSON.parse(String(row.items)) as unknown[];
    } catch {
      items = [];
    }
  }
  let processOrder: string[] | undefined;
  if (row.process_order != null && String(row.process_order).trim() !== "") {
    try {
      processOrder = JSON.parse(String(row.process_order)) as string[];
    } catch {
      processOrder = undefined;
    }
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    items,
    processOrder,
    note: row.note != null ? String(row.note) : undefined,
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

/** 마스터 전용: 기본 견적 템플릿 목록 */
export async function GET() {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await sql`
      SELECT id, title, items, process_order, note, created_at
      FROM master_default_estimate_templates
      ORDER BY created_at DESC
    `;
    const list = result.rows.map((r) => parseRow(r as Parameters<typeof parseRow>[0]));
    return NextResponse.json(list);
  } catch (error) {
    console.error("master default-templates GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 마스터 전용: 기본 견적 템플릿 추가 */
export async function POST(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "템플릿 제목을 입력해 주세요." }, { status: 400 });
    }
    const itemsArr = Array.isArray(body.items) ? body.items : [];
    const processOrderArr = Array.isArray(body.processOrder) ? body.processOrder : [];
    const note = typeof body.note === "string" ? body.note : null;
    const items = JSON.stringify(itemsArr);
    const processOrderJson = JSON.stringify(processOrderArr);

    if (items.length > 1_000_000) {
      return NextResponse.json(
        { error: "항목 데이터가 너무 큽니다. 항목 수를 줄이거나, 여러 개의 템플릿으로 나눠 등록해 주세요." },
        { status: 400 }
      );
    }

    await sql`
      INSERT INTO master_default_estimate_templates (title, items, process_order, note)
      VALUES (${title}, ${items}, ${processOrderJson}, ${note})
    `;
    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("master default-templates POST error:", error);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return NextResponse.json(
        { error: "DB 테이블이 없습니다. 배포 후 한 번 더 배포하거나, node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "저장 실패했습니다. " + (msg.length > 80 ? msg.slice(0, 80) + "…" : msg) },
      { status: 500 }
    );
  }
}
