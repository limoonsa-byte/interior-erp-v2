import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCompanyIdFromLoginCookie, requireSecretSession } from "@/lib/shop-secret-auth";
import { SHOP_PRODUCT_KO_HEADERS } from "@/lib/shop-product-excel";

const MAX_ROWS = 10_000;

function filenameDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function GET(request: Request) {
  const session = await requireSecretSession();
  const companyId = session?.companyId ?? (await getCompanyIdFromLoginCookie());
  if (!companyId) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const url = new URL(request.url);
  const templateOnly = url.searchParams.get("template") === "1";

  try {
    const wb = XLSX.utils.book_new();

    if (templateOnly) {
      const ws = XLSX.utils.aoa_to_sheet([Array.from(SHOP_PRODUCT_KO_HEADERS)]);
      XLSX.utils.book_append_sheet(wb, ws, "상품");
    } else {
      const result = await sql`
        SELECT sku, name, shop_line, category, brand, spec, unit, price, sale_price, stock_status, image_url, product_url, is_active
        FROM shop_products
        WHERE company_id = ${companyId}
        ORDER BY is_active DESC, updated_at DESC, id DESC
        LIMIT ${MAX_ROWS}
      `;
      const rows = result.rows as {
        sku: string;
        name: string;
        shop_line: string | null;
        category: string | null;
        brand: string | null;
        spec: string | null;
        unit: string | null;
        price: string | number;
        sale_price: string | number | null;
        stock_status: string | null;
        image_url: string | null;
        product_url: string | null;
        is_active: boolean;
      }[];

      const aoa: (string | number)[][] = [Array.from(SHOP_PRODUCT_KO_HEADERS)];
      for (const r of rows) {
        const price = Number(r.price) || 0;
        const sale = r.sale_price == null ? "" : Number(r.sale_price) || 0;
        aoa.push([
          r.sku,
          r.name,
          r.shop_line ?? "",
          r.category ?? "",
          r.brand ?? "",
          r.spec ?? "",
          r.unit ?? "",
          price,
          sale,
          r.stock_status ?? "",
          r.image_url ?? "",
          r.product_url ?? "",
          r.is_active ? "Y" : "N",
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, "상품");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const body = new Uint8Array(buf);
    const name = templateOnly ? `비밀몰_상품_양식_${filenameDate()}.xlsx` : `비밀몰_상품_목록_${filenameDate()}.xlsx`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (e) {
    console.error("shop-products export-excel error:", e);
    return NextResponse.json({ error: "엑셀 생성 실패" }, { status: 500 });
  }
}
