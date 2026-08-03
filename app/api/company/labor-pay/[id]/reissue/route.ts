import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { removeLaborPayFromApproval } from "@/lib/mergeLaborPayIntoApproval";

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

/** 제출된 요청 재발급: 새 토큰으로 open 상태 복구 (금액·내용 초기화) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const requestId = parseInt(id, 10);
    if (Number.isNaN(requestId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    const token = randomUUID();
    const result = await sql`
      UPDATE labor_pay_requests
      SET access_token = ${token},
          status = 'open',
          amount = NULL,
          content = NULL,
          attachments_json = NULL,
          submitted_at = NULL,
          updated_at = NOW()
      WHERE id = ${requestId} AND company_id = ${company.id}
      RETURNING id, estimate_id, worker_id, worker_name, access_token, status, amount, content, submitted_at, created_at
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }
    const r = result.rows[0] as Record<string, unknown>;
    try {
      await removeLaborPayFromApproval({
        estimateId: Number(r.estimate_id),
        companyId: company.id,
        laborPayRequestId: Number(r.id),
      });
    } catch (mergeErr) {
      console.error("labor-pay reissue → approval remove error:", mergeErr);
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";
    const accessToken = String(r.access_token ?? "");
    return NextResponse.json({
      request: {
        id: Number(r.id),
        estimateId: Number(r.estimate_id),
        workerId: r.worker_id != null ? Number(r.worker_id) : null,
        workerName: String(r.worker_name ?? ""),
        accessToken,
        status: String(r.status ?? "open"),
        amount: null,
        content: null,
        submittedAt: null,
        createdAt: r.created_at != null ? String(r.created_at) : null,
        linkUrl: `${baseUrl.replace(/\/$/, "")}/labor-pay/f/${accessToken}`,
      },
    });
  } catch (error) {
    console.error("labor-pay reissue error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
