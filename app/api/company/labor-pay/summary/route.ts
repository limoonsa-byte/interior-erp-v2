import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { displayProjectTitle } from "@/lib/projectTitle";

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

/**
 * 진행상황 패널용: 인부가 제출한 내역서(status=submitted) 요약
 * GET /api/company/labor-pay/summary
 */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    let countRes: { rows: { cnt: string | number }[] };
    let recentRes: { rows: Record<string, unknown>[] };
    try {
      countRes = await sql`
        SELECT COUNT(*)::int AS cnt
        FROM labor_pay_requests
        WHERE company_id = ${company.id} AND status = 'submitted'
      `;
      recentRes = await sql`
        SELECT
          r.id,
          r.estimate_id,
          r.worker_name,
          r.amount,
          r.submitted_at,
          e.title AS estimate_title,
          e.customer_name,
          c.title AS consultation_title
        FROM labor_pay_requests r
        LEFT JOIN estimates e ON e.id = r.estimate_id AND e.company_id = r.company_id
        LEFT JOIN consultations c ON c.id = e.consultation_id AND c.company_id = r.company_id
        WHERE r.company_id = ${company.id} AND r.status = 'submitted'
        ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC
        LIMIT 5
      `;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/relation.*does not exist|labor_pay_requests/i.test(msg)) {
        return NextResponse.json({ submittedCount: 0, recent: [] });
      }
      if (/consultation_title|c\.title|column.*title/i.test(msg)) {
        countRes = await sql`
          SELECT COUNT(*)::int AS cnt
          FROM labor_pay_requests
          WHERE company_id = ${company.id} AND status = 'submitted'
        `;
        recentRes = await sql`
          SELECT
            r.id,
            r.estimate_id,
            r.worker_name,
            r.amount,
            r.submitted_at,
            e.title AS estimate_title,
            e.customer_name
          FROM labor_pay_requests r
          LEFT JOIN estimates e ON e.id = r.estimate_id AND e.company_id = r.company_id
          WHERE r.company_id = ${company.id} AND r.status = 'submitted'
          ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC
          LIMIT 5
        `;
      } else {
        throw err;
      }
    }

    const submittedCount = Number(countRes.rows[0]?.cnt ?? 0) || 0;
    const recent = (recentRes.rows as Record<string, unknown>[]).map((r) => {
      const siteTitle = displayProjectTitle({
        consultationTitle: r.consultation_title != null ? String(r.consultation_title) : undefined,
        estimateTitle: r.estimate_title != null ? String(r.estimate_title) : undefined,
        customerName: r.customer_name != null ? String(r.customer_name) : undefined,
        fallback: "현장",
      });
      return {
        id: Number(r.id),
        estimateId: Number(r.estimate_id),
        workerName: String(r.worker_name ?? ""),
        amount: r.amount != null && r.amount !== "" ? Number(r.amount) : null,
        submittedAt: r.submitted_at != null ? String(r.submitted_at) : null,
        siteTitle,
      };
    });
    const latestSubmittedId = recent.reduce((m, r) => Math.max(m, r.id || 0), 0);

    return NextResponse.json({ submittedCount, latestSubmittedId, recent });
  } catch (error) {
    console.error("labor-pay summary GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
