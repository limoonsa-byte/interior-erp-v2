import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { mergeLaborPayIntoApproval } from "@/lib/mergeLaborPayIntoApproval";
import {
  attachmentsToMeta,
  normalizeSubmitAttachments,
  parseAttachmentsJson,
} from "@/lib/laborPayAttachments";

/** 공개: 결제 금액 입력 링크 조회 (로그인 없음) */
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

    let result: Awaited<ReturnType<typeof sql>>;
    try {
      result = await sql`
      SELECT r.id, r.worker_name, r.status, r.amount, r.content, r.submitted_at, r.attachments_json,
             e.title AS estimate_title, e.customer_name, e.address,
             cons.title AS consultation_title,
             c.labor_pay_notice
      FROM labor_pay_requests r
      JOIN estimates e ON e.id = r.estimate_id AND e.company_id = r.company_id
      LEFT JOIN consultations cons ON cons.id = e.consultation_id AND cons.company_id = e.company_id
      JOIN companies c ON c.id = r.company_id
      WHERE r.access_token = ${accessToken}
      LIMIT 1
    `;
    } catch {
      result = await sql`
      SELECT r.id, r.worker_name, r.status, r.amount, r.content, r.submitted_at, r.attachments_json,
             e.title AS estimate_title, e.customer_name, e.address,
             c.labor_pay_notice
      FROM labor_pay_requests r
      JOIN estimates e ON e.id = r.estimate_id AND e.company_id = r.company_id
      JOIN companies c ON c.id = r.company_id
      WHERE r.access_token = ${accessToken}
      LIMIT 1
    `;
    }
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "링크를 찾을 수 없거나 만료되었습니다." }, { status: 404 });
    }
    const r = result.rows[0] as Record<string, unknown>;
    const notice = r.labor_pay_notice != null ? String(r.labor_pay_notice).trim() : "";
    const attachments = attachmentsToMeta(parseAttachmentsJson(r.attachments_json));
    const estimateTitle = String(r.estimate_title ?? "").trim();
    const consultationTitle = String(r.consultation_title ?? "").trim();
    const customerName = String(r.customer_name ?? "").trim();
    const siteTitle = consultationTitle || estimateTitle || customerName;
    return NextResponse.json({
      workerName: String(r.worker_name ?? ""),
      status: String(r.status ?? "open"),
      amount: r.amount != null && r.amount !== "" ? Number(r.amount) : null,
      content: r.content != null ? String(r.content) : null,
      submittedAt: r.submitted_at != null ? String(r.submitted_at) : null,
      siteTitle,
      customerName: String(r.customer_name ?? ""),
      address: String(r.address ?? ""),
      notice: notice || null,
      attachments,
    });
  } catch (error) {
    console.error("labor-pay public GET error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/attachments_json/i.test(msg)) {
      return NextResponse.json(
        { error: "첨부 기능 마이그레이션이 필요합니다. 잠시 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 공개: 금액·내용·첨부 제출 */
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
    const normalized = normalizeSubmitAttachments(body.attachments);

    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "금액을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
    }
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const existing = await sql`
      SELECT id, status, company_id, estimate_id, worker_name
      FROM labor_pay_requests WHERE access_token = ${accessToken} LIMIT 1
    `;
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "링크를 찾을 수 없거나 만료되었습니다." }, { status: 404 });
    }
    const existingRow = existing.rows[0] as {
      id: number;
      status?: string;
      company_id: number;
      estimate_id: number;
      worker_name?: string | null;
    };
    if (String(existingRow.status) !== "open") {
      return NextResponse.json({ error: "이미 제출된 링크입니다. 회사에 재발급을 요청해 주세요." }, { status: 409 });
    }

    const roundedAmount = Math.round(amount);
    const attachmentsJson =
      normalized.attachments.length > 0 ? JSON.stringify(normalized.attachments) : null;

    const updated = await sql`
      UPDATE labor_pay_requests
      SET amount = ${roundedAmount},
          content = ${content},
          attachments_json = ${attachmentsJson},
          status = 'submitted',
          submitted_at = NOW(),
          updated_at = NOW()
      WHERE access_token = ${accessToken} AND status = 'open'
      RETURNING id, company_id, estimate_id, worker_name
    `;
    if (updated.rows.length === 0) {
      return NextResponse.json({ error: "이미 제출되었거나 처리할 수 없습니다." }, { status: 409 });
    }

    const row = updated.rows[0] as {
      id: number;
      company_id: number;
      estimate_id: number;
      worker_name?: string | null;
    };
    try {
      await mergeLaborPayIntoApproval({
        estimateId: Number(row.estimate_id),
        companyId: Number(row.company_id),
        laborPayRequestId: Number(row.id),
        workerName: String(row.worker_name ?? ""),
        amount: roundedAmount,
        content,
      });
    } catch (mergeErr) {
      console.error("labor-pay → payment approval merge error:", mergeErr);
    }

    return NextResponse.json({
      message: "제출되었습니다. 감사합니다.",
      attachments: attachmentsToMeta(normalized.attachments),
    });
  } catch (error) {
    console.error("labor-pay public POST error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/attachments_json/i.test(msg)) {
      return NextResponse.json(
        { error: "첨부 기능 마이그레이션이 필요합니다. 배포 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
