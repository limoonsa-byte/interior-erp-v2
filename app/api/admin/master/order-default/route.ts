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

export type AddedOrderRow = {
  id: string;
  processGroup: string;
  category: string;
  spec: string;
  unit: string;
  qty: string;
  materialUnitPrice: string;
  note: string;
};

/** 마스터 전용: 발주 기본 품목 조회 */
export async function GET() {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await sql`
      SELECT items_json, item_names_json FROM master_default_order_items WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { items_json: string; item_names_json?: string } | undefined;
    let itemsByLabel: Record<string, AddedOrderRow[]> = {};
    let itemNames: string[] = [];
    if (row?.items_json?.trim()) {
      try {
        itemsByLabel = JSON.parse(row.items_json) as Record<string, AddedOrderRow[]>;
      } catch {
        itemsByLabel = {};
      }
    }
    if (row?.item_names_json?.trim()) {
      try {
        const parsed = JSON.parse(row.item_names_json);
        itemNames = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
      } catch {
        itemNames = [];
      }
    }
    return NextResponse.json({ itemsByLabel, itemNames });
  } catch (error) {
    console.error("order-default GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 마스터 전용: 발주 기본 품목 저장 */
export async function POST(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const itemNames = body.itemNames != null && Array.isArray(body.itemNames)
      ? body.itemNames.filter((x: unknown): x is string => typeof x === "string").slice(0, 2000)
      : undefined;

    if (itemNames !== undefined) {
      const itemNamesJson = JSON.stringify(itemNames);
      const itemsByLabel = body.itemsByLabel != null && typeof body.itemsByLabel === "object" ? body.itemsByLabel : null;
      if (itemsByLabel !== null) {
        const itemsJson = JSON.stringify(itemsByLabel);
        if (itemsJson.length > 2_000_000) {
          return NextResponse.json(
            { error: "항목 데이터가 너무 큽니다. 항목 수를 줄여 주세요." },
            { status: 400 }
          );
        }
        await sql`
          UPDATE master_default_order_items SET items_json = ${itemsJson}, item_names_json = ${itemNamesJson}, updated_at = NOW() WHERE id = 1
        `;
      } else {
        await sql`
          UPDATE master_default_order_items SET item_names_json = ${itemNamesJson}, updated_at = NOW() WHERE id = 1
        `;
      }
    } else {
      const itemsByLabel = body.itemsByLabel != null && typeof body.itemsByLabel === "object" ? body.itemsByLabel : {};
      const itemsJson = JSON.stringify(itemsByLabel);
      if (itemsJson.length > 2_000_000) {
        return NextResponse.json(
          { error: "항목 데이터가 너무 큽니다. 항목 수를 줄여 주세요." },
          { status: 400 }
        );
      }
      await sql`
        UPDATE master_default_order_items SET items_json = ${itemsJson}, updated_at = NOW() WHERE id = 1
      `;
    }
    return NextResponse.json({ message: "저장되었습니다." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("order-default POST error:", error);
    if (String(msg).includes("does not exist") || String(msg).includes("relation")) {
      return NextResponse.json(
        { error: "DB 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "저장 실패했습니다." }, { status: 500 });
  }
}
