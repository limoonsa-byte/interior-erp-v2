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

function mapItemRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    itemName: (row.item_name ?? "") as string,
    imageUrl: (row.image_url ?? "") as string,
    productNameCode: (row.product_name_code ?? "") as string,
    size: (row.size ?? "") as string,
    remarks: (row.remarks ?? "") as string,
    shoppingLink: (row.shopping_link ?? "") as string,
    sortOrder: Number(row.sort_order) || 0,
  };
}

/** 현장(견적)별 자재 목록 조회 - 큰 항목(섹션) 단위 */
export async function GET(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const estimateIdParam = searchParams.get("estimateId")?.trim();
    const estimateId = estimateIdParam ? parseInt(estimateIdParam, 10) : NaN;
    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }
    const skipImages = searchParams.get("skipImages") === "1";

    let sections: { id: number; title: string; sortOrder: number }[] = [];
    const itemsBySection = new Map<number | null, Record<string, unknown>[]>();

    try {
      const sectionsResult = await sql`
        SELECT id, title, sort_order
        FROM site_material_list_sections
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        ORDER BY sort_order ASC, id ASC
      `;
      sections = sectionsResult.rows.map((r) => ({
        id: Number((r as { id: number }).id),
        title: String((r as { title: string | null }).title ?? ""),
        sortOrder: Number((r as { sort_order: number }).sort_order) || 0,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/relation.*does not exist|site_material_list_sections/i.test(msg)) throw e;
    }

    try {
      if (skipImages) {
        const itemsResult = await sql`
          SELECT id, item_name, '' AS image_url, COALESCE(product_name_code, '') AS product_name_code, size, remarks, COALESCE(shopping_link, '') AS shopping_link, sort_order, section_id
          FROM site_material_list_items
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
          ORDER BY sort_order ASC, id ASC
        `;
        const rows = itemsResult.rows as Record<string, unknown>[];
        for (const row of rows) {
          const sid = (row.section_id as number | null) ?? null;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(row);
        }
      } else {
        const itemsResult = await sql`
          SELECT id, item_name, image_url, COALESCE(product_name_code, '') AS product_name_code, size, remarks, COALESCE(shopping_link, '') AS shopping_link, sort_order, section_id
          FROM site_material_list_items
          WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
          ORDER BY sort_order ASC, id ASC
        `;
        const rows = itemsResult.rows as Record<string, unknown>[];
        for (const row of rows) {
          const sid = (row.section_id as number | null) ?? null;
          if (!itemsBySection.has(sid)) itemsBySection.set(sid, []);
          itemsBySection.get(sid)!.push(row);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation.*does not exist|site_material_list_items|column.*product_name_code|column.*shopping_link|column.*section_id/i.test(msg)) {
        const legacy = skipImages
          ? await sql`
              SELECT id, item_name, '' AS image_url, size, remarks, sort_order
              FROM site_material_list_items
              WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
              ORDER BY sort_order ASC, id ASC
            `
          : await sql`
              SELECT id, item_name, image_url, size, remarks, sort_order
              FROM site_material_list_items
              WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
              ORDER BY sort_order ASC, id ASC
            `;
        const legacyRows = legacy.rows as Record<string, unknown>[];
        const defaultItems = legacyRows.map((r) => ({ ...r, product_name_code: "", shopping_link: "", section_id: null }));
        itemsBySection.set(null, defaultItems);
      } else {
        throw err;
      }
    }

    const legacyItems = itemsBySection.get(null) ?? [];
    const outSections: { id: number | null; title: string; sortOrder: number; items: ReturnType<typeof mapItemRow>[] }[] = [];

    if (legacyItems.length > 0 && sections.length === 0) {
      outSections.push({
        id: null,
        title: "기본",
        sortOrder: 0,
        items: legacyItems.map((r) => mapItemRow(r)),
      });
    }

    for (const sec of sections) {
      const items = itemsBySection.get(sec.id) ?? [];
      outSections.push({
        id: sec.id,
        title: sec.title,
        sortOrder: sec.sortOrder,
        items: items.map((r) => mapItemRow(r)),
      });
    }

    return NextResponse.json({ sections: outSections });
  } catch (error) {
    console.error("material-list GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 현장(견적)별 자재 목록 전체 저장 - 큰 항목(섹션) 단위 */
export async function PUT(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const estimateId = body.estimateId != null ? parseInt(String(body.estimateId), 10) : NaN;
    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    const estimateCheck = await sql`
      SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
    `;
    if (estimateCheck.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    const rawSections = Array.isArray(body.sections) ? body.sections : [];
    const sections = rawSections.map(
      (
        s: { id?: number; title?: string; items?: { itemName?: string; imageUrl?: string; productNameCode?: string; size?: string; remarks?: string; shoppingLink?: string }[] },
        idx: number
      ) => ({
        title: typeof s.title === "string" ? s.title.trim() : "",
        sortOrder: idx,
        items: (Array.isArray(s.items) ? s.items : []).map(
          (x: { itemName?: string; imageUrl?: string; productNameCode?: string; size?: string; remarks?: string; shoppingLink?: string }, i: number) => ({
            itemName: typeof x.itemName === "string" ? x.itemName.trim() : "",
            imageUrl: typeof x.imageUrl === "string" ? x.imageUrl.trim() : "",
            productNameCode: typeof x.productNameCode === "string" ? x.productNameCode.trim() : "",
            size: typeof x.size === "string" ? x.size.trim() : "",
            remarks: typeof x.remarks === "string" ? x.remarks.trim() : "",
            shoppingLink: typeof x.shoppingLink === "string" ? x.shoppingLink.trim() : "",
            sortOrder: i,
          })
        ),
      })
    );

    await sql`
      DELETE FROM site_material_list_items
      WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
    `;

    let sectionsTableExists = true;
    try {
      await sql`
        DELETE FROM site_material_list_sections
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
      `;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/relation.*does not exist|site_material_list_sections/i.test(msg)) {
        sectionsTableExists = false;
      } else {
        throw e;
      }
    }

    if (sectionsTableExists) {
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        const sectionResult = await sql`
          INSERT INTO site_material_list_sections (company_id, estimate_id, title, sort_order)
          VALUES (${company.id}, ${estimateId}, ${sec.title || ""}, ${si})
          RETURNING id
        `;
        const sectionId = (sectionResult.rows[0] as { id: number }).id;
        for (let i = 0; i < sec.items.length; i++) {
          const it = sec.items[i];
          try {
            await sql`
              INSERT INTO site_material_list_items (company_id, estimate_id, section_id, item_name, image_url, product_name_code, size, remarks, shopping_link, sort_order)
              VALUES (${company.id}, ${estimateId}, ${sectionId}, ${it.itemName || null}, ${it.imageUrl || null}, ${it.productNameCode || null}, ${it.size || null}, ${it.remarks || null}, ${it.shoppingLink || null}, ${i})
            `;
          } catch (itemErr) {
            const itemMsg = itemErr instanceof Error ? itemErr.message : String(itemErr);
            if (/column.*section_id.*does not exist/i.test(itemMsg)) {
              await sql`
                INSERT INTO site_material_list_items (company_id, estimate_id, item_name, image_url, product_name_code, size, remarks, shopping_link, sort_order)
                VALUES (${company.id}, ${estimateId}, ${it.itemName || null}, ${it.imageUrl || null}, ${it.productNameCode || null}, ${it.size || null}, ${it.remarks || null}, ${it.shoppingLink || null}, ${i})
              `;
            } else {
              throw itemErr;
            }
          }
        }
      }
    } else {
      type Sec = { items: { itemName?: string; imageUrl?: string; productNameCode?: string; size?: string; remarks?: string; shoppingLink?: string; sortOrder: number }[] };
      const allItems = sections.flatMap((sec: Sec) => sec.items);
      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        await sql`
          INSERT INTO site_material_list_items (company_id, estimate_id, item_name, image_url, product_name_code, size, remarks, shopping_link, sort_order)
          VALUES (${company.id}, ${estimateId}, ${it.itemName || null}, ${it.imageUrl || null}, ${it.productNameCode || null}, ${it.size || null}, ${it.remarks || null}, ${it.shoppingLink || null}, ${i})
        `;
      }
    }

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("material-list PUT error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|site_material_list_items/i.test(msg)) {
      return NextResponse.json(
        { error: "자재리스트 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
