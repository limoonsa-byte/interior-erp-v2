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

/** DB에서 나온 log_date를 YYYY-MM-DD 문자열로 */
function toDateString(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") {
    const s = val.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

/** 회사별 작업일지 목록 (날짜 범위 선택 가능) */
export async function GET(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom")?.trim().slice(0, 10);
    const dateTo = searchParams.get("dateTo")?.trim().slice(0, 10);
    const fromDate = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : "1970-01-01";
    const toDate = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : "2100-12-31";

    let result: { rows: Record<string, unknown>[] };
    try {
      result = await sql`
        SELECT w.id, w.log_date, w.estimate_id, w.pic_id, w.content, w.expenses, w.created_at,
          e.title AS estimate_title,
          p.name AS pic_name
        FROM company_work_logs w
        LEFT JOIN estimates e ON e.id = w.estimate_id AND e.company_id = w.company_id
        LEFT JOIN company_pics p ON p.id = w.pic_id AND p.company_id = w.company_id
        WHERE w.company_id = ${company.id}
        AND w.log_date >= ${fromDate}::date
        AND w.log_date <= ${toDate}::date
        ORDER BY w.log_date DESC, w.created_at DESC
      `;
    } catch (colErr) {
      const colMsg = colErr instanceof Error ? colErr.message : "";
      if (/column.*expenses|expenses.*does not exist/i.test(colMsg)) {
        result = await sql`
          SELECT w.id, w.log_date, w.estimate_id, w.pic_id, w.content, w.created_at,
            e.title AS estimate_title,
            p.name AS pic_name
          FROM company_work_logs w
          LEFT JOIN estimates e ON e.id = w.estimate_id AND e.company_id = w.company_id
          LEFT JOIN company_pics p ON p.id = w.pic_id AND p.company_id = w.company_id
          WHERE w.company_id = ${company.id}
          AND w.log_date >= ${fromDate}::date
          AND w.log_date <= ${toDate}::date
          ORDER BY w.log_date DESC, w.created_at DESC
        `;
        (result.rows as Record<string, unknown>[]).forEach((row) => {
          row.expenses = null;
        });
      } else {
        throw colErr;
      }
    }

    const list = result.rows.map((row) => {
      let expenses: { label: string; content: string; amount: number }[] = [];
      const expRaw = (row as { expenses: string | null }).expenses;
      if (expRaw && typeof expRaw === "string" && expRaw.trim()) {
        try {
          const parsed = JSON.parse(expRaw) as unknown;
          if (Array.isArray(parsed)) {
            expenses = parsed
              .filter((x): x is { label?: string; content?: string; amount?: number } => x != null && typeof x === "object")
              .map((x) => ({
                label: typeof x.label === "string" ? x.label : "",
                content: typeof x.content === "string" ? x.content : "",
                amount: Number(x.amount) || 0,
              }));
          }
        } catch {
          expenses = [];
        }
      }
      return {
        id: Number((row as { id: number }).id),
        logDate: toDateString((row as { log_date: unknown }).log_date),
        estimateId: (row as { estimate_id: number | null }).estimate_id != null ? Number((row as { estimate_id: number }).estimate_id) : null,
        picId: (row as { pic_id: number | null }).pic_id != null ? Number((row as { pic_id: number }).pic_id) : null,
        content: String((row as { content: string | null }).content ?? ""),
        expenses,
        createdAt: (row as { created_at: string }).created_at,
        estimateTitle: (row as { estimate_title: string | null }).estimate_title ?? null,
        picName: (row as { pic_name: string | null }).pic_name ?? null,
      };
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error("company work-logs GET error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("company_work_logs") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json(
        { error: "작업일지 테이블이 없습니다. 배포 후 다시 시도하거나 node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 작업일지 추가 */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const logDate = typeof body.log_date === "string" ? body.log_date.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json({ error: "작업일을 선택해 주세요." }, { status: 400 });
    }
    const content = typeof body.content === "string" ? body.content.trim() : "";
    let estimateId: number | null = null;
    if (body.estimate_id != null && body.estimate_id !== "") {
      const n = Number(body.estimate_id);
      if (Number.isInteger(n) && n > 0) estimateId = n;
    }
    let picId: number | null = null;
    if (body.pic_id != null && body.pic_id !== "") {
      const n = Number(body.pic_id);
      if (Number.isInteger(n) && n > 0) picId = n;
    }

    if (estimateId != null) {
      const est = await sql`SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1`;
      if (est.rows.length === 0) {
        return NextResponse.json({ error: "선택한 견적을 찾을 수 없습니다." }, { status: 400 });
      }
    }
    if (picId != null) {
      const pic = await sql`SELECT id FROM company_pics WHERE id = ${picId} AND company_id = ${company.id} LIMIT 1`;
      if (pic.rows.length === 0) {
        return NextResponse.json({ error: "선택한 담당자를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const expensesJson = (() => {
      if (!Array.isArray(body.expenses)) return null;
      const arr = body.expenses
        .filter((x: unknown): x is { label?: string; content?: string; amount?: number } => x != null && typeof x === "object")
        .map((x: { label?: string; content?: string; amount?: number }) => ({
          label: typeof x.label === "string" ? x.label.trim() : "",
          content: typeof x.content === "string" ? x.content.trim() : "",
          amount: Number(x.amount) || 0,
        }))
        .filter((x: { label: string; content: string; amount: number }) => x.label !== "" || x.content !== "" || x.amount !== 0);
      return arr.length > 0 ? JSON.stringify(arr) : null;
    })();

    try {
      await sql`
        INSERT INTO company_work_logs (company_id, log_date, estimate_id, pic_id, content, expenses)
        VALUES (${company.id}, ${logDate}::date, ${estimateId}, ${picId}, ${content}, ${expensesJson})
      `;
    } catch (insErr) {
      const insMsg = insErr instanceof Error ? insErr.message : "";
      if (/column.*expenses|expenses.*does not exist/i.test(insMsg)) {
        await sql`
          INSERT INTO company_work_logs (company_id, log_date, estimate_id, pic_id, content)
          VALUES (${company.id}, ${logDate}::date, ${estimateId}, ${picId}, ${content})
        `;
      } else {
        throw insErr;
      }
    }

    return NextResponse.json({ message: "저장되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("company work-logs POST error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("company_work_logs") && (msg.includes("does not exist") || msg.includes("relation"))) {
      return NextResponse.json(
        { error: "작업일지 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
