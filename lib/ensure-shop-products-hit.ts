import { sql } from "@vercel/postgres";

/** DB에 `is_hit` 컬럼이 없으면 목록 API 등이 500이 나므로, 요청 시점에 컬럼을 보장합니다. */
export async function ensureShopProductsHitColumn(): Promise<void> {
  try {
    await sql`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS is_hit BOOLEAN NOT NULL DEFAULT false`;
  } catch {
    /* 권한·테이블 없음 등은 이후 쿼리에서 드러남 */
  }
}
