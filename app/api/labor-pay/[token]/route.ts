import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

/** 공개: 인건비 입력 링크 조회 (로그인 없음) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const accessToken = String(token ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "잘못된 링크입니다." }, { status: 400 });
    }

    const result = await sql`
      SELECT r.id, r.worker_name, r.status, r.amount, r.content, r.submitted_at,
             e.title AS estimate_title, e.customer_name, e.address,
             c.labor_pay_notice
      FROM labor_pay_requests r
      JOIN estimates e ON e.id = r.estimate_id AND e.company_id = r.company_id
      JOIN companies c ON c.id = r.company_id
      WHERE r.access_token = ${accessToken}
      LIMIT 1
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "링크를 찾을 수 없거나 만료되었습니다." }, { status: 404 });
    }
    const r = result.rows[0] as Record<string, unknown>;
    const notice = r.labor_pay_notice != null ? String(r.labor_pay_notice).trim() : "";
    return NextResponse.json({
      workerName: String(r.worker_name ?? ""),
      status: String(r.status ?? "open"),
      amount: r.amount != null && r.amount !== "" ? Number(r.amount) : null,
      content: r.content != null ? String(r.content) : null,
      submittedAt: r.submitted_at != null ? String(r.submitted_at) : null,
      siteTitle: String(r.estimate_title ?? ""),
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      notice: notice || null,
    });
  } catch (error) {
    console.error("labor-pay public GET error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 공개: 금액·내용 제출 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const accessToken = String(token ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "잘못된 링크입니다." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const amountRaw = String(body.amount ?? "").replace(/[^\d.-]/g, "");
    const amount = amountRaw === "" || amountRaw === "-" ? NaN : Number(amountRaw);
    const content = String(body.content ?? "").trim();

    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "금액을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
    }

    const existing = await sql`
      SELECT id, status FROM labor_pay_requests WHERE access_token = ${accessToken} LIMIT 1
    `;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "링크를 찾을 수 없거나 만료되었습니다." }, { status: 404 });
    }
    if (String((existing.rows[0] as { status?: string }).status) !== "open") {
      return NextResponse.json({ error: "이미 제출된 링크입니다. 회사에 재발급을 요청해 주세요." }, { status: 409 });
    }

    const updated = await sql`
      UPDATE labor_pay_requests
      SET amount = ${Math.round(amount)},
          content = ${content},
          status = 'submitted',
          submitted_at = NOW(),
          updated_at = NOW()
      WHERE access_token = ${accessToken} AND status = 'open'
      RETURNING id
    `;
    if (updated.rows.length === 0) {
      return NextResponse.json({ error: "이미 제출되었거나 처리할 수 없습니다." }, { status: 409 });
    }

    return NextResponse.json({ message: "제출되었습니다. 감사합니다." });
  } catch (error) {
    console.error("labor-pay public POST error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
