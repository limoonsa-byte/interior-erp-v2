import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";

const MAX_SKUS = 500;

type JsonBody = {
  skus?: unknown;
  delete?: unknown;
  patch?: unknown;
};

function asSkuList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const s = String(x ?? "").trim();
    if (s) out.push(s);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const session = await requireSecretSession();
    const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
    if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as JsonBody;
    const skus = asSkuList(body.skus);
    if (skus.length === 0) {
      return NextResponse.json({ error: "선택된 상품(sku)이 없습니다." }, { status: 400 });
    }
    if (skus.length > MAX_SKUS) {
      return NextResponse.json({ error: `한 번에 최대 ${MAX_SKUS}개까지 처리할 수 있습니다.` }, { status: 400 });
    }

    if (body.delete === true) {
      for (const sku of skus) {
        await sql`
          DELETE FROM shop_products
          WHERE company_id = ${companyId} AND sku = ${sku}
        `;
      }
      return NextResponse.json({ ok: true, deleted: skus.length }, { status: 200 });
    }

    const patch = body.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return NextResponse.json({ error: "delete 또는 patch가 필요합니다." }, { status: 400 });
    }

    const p = patch as Record<string, unknown>;
    const hasLine = Object.prototype.hasOwnProperty.call(p, "shopLine");
    const hasCat = Object.prototype.hasOwnProperty.call(p, "category");
    if (!hasLine && !hasCat) {
      return NextResponse.json({ error: "patch에 shopLine 또는 category를 지정해 주세요." }, { status: 400 });
    }

    const shopLine = hasLine
      ? p.shopLine === null || p.shopLine === undefined
        ? null
        : String(p.shopLine).trim() || null
      : undefined;
    const category = hasCat
      ? p.category === null || p.category === undefined
        ? null
        : String(p.category).trim() || null
      : undefined;

    for (const sku of skus) {
      if (hasLine && hasCat) {
        await sql`
          UPDATE shop_products SET
            shop_line = ${shopLine},
            category = ${category},
            updated_at = NOW()
          WHERE company_id = ${companyId} AND sku = ${sku}
        `;
      } else if (hasLine) {
        await sql`
          UPDATE shop_products SET shop_line = ${shopLine}, updated_at = NOW()
          WHERE company_id = ${companyId} AND sku = ${sku}
        `;
      } else {
        await sql`
          UPDATE shop_products SET category = ${category}, updated_at = NOW()
          WHERE company_id = ${companyId} AND sku = ${sku}
        `;
      }
    }

    return NextResponse.json({ ok: true, updated: skus.length }, { status: 200 });
  } catch (error) {
    console.error("shop-products batch error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
