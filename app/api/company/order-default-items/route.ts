import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/** 자재 발주 페이지용: 마스터에 등록한 발주 유형별 기본 품목 조회 (전체 회사 공통) */
export async function GET() {
  try {
    const result = await sql`
      SELECT items_json FROM master_default_order_items WHERE id = 1 LIMIT 1
    `;
    const row = result.rows[0] as { items_json?: string } | undefined;
    let itemsByLabel: Record<string, { id: string; processGroup: string; category: string; spec: string; unit: string; qty: string; materialUnitPrice: string; note: string }[]> = {};
    if (row?.items_json?.trim()) {
      try {
        itemsByLabel = JSON.parse(row.items_json) as Record<string, { id: string; processGroup: string; category: string; spec: string; unit: string; qty: string; materialUnitPrice: string; note: string }[]>;
      } catch {
        itemsByLabel = {};
      }
    }
    return NextResponse.json({ itemsByLabel });
  } catch (error) {
    console.error("order-default-items GET error:", error);
    return NextResponse.json({ itemsByLabel: {} }, { status: 200 });
  }
}
