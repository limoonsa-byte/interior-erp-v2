import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/** 자재발주 품목 드롭다운용 품목명 목록 (마스터에 저장된 기본 품목, 전체 회사 공통) */
export async function GET() {
  try {
    const result = await sql`
      SELECT item_names_json FROM master_default_order_items WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { item_names_json?: string } | undefined;
    let itemNames: string[] = [];
    if (row?.item_names_json?.trim()) {
      try {
        const parsed = JSON.parse(row.item_names_json);
        itemNames = Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === "string") : [];
      } catch {
        itemNames = [];
      }
    }
    return NextResponse.json({ itemNames });
  } catch (error) {
    console.error("order-item-names GET error:", error);
    return NextResponse.json({ itemNames: [] }, { status: 200 });
  }
}
