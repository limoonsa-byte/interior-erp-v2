import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { parseAttachmentsMetaOnly, parseAttachmentsJson, attachmentsToMeta } from "@/lib/laborPayAttachments";

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

function mapRow(r: Record<string, unknown>) {
  let attachments = parseAttachmentsMetaOnly(r.attachments_meta);
  if (attachments.length === 0 && r.attachments_json != null && r.attachments_json !== "") {
    attachments = attachmentsToMeta(parseAttachmentsJson(r.attachments_json));
  }
  return {
    id: Number(r.id),
    estimateId: Number(r.estimate_id),
    workerId: r.worker_id != null ? Number(r.worker_id) : null,
    workerName: String(r.worker_name ?? ""),
    accessToken: String(r.access_token ?? ""),
    status: String(r.status ?? "open"),
    amount: r.amount != null && r.amount !== "" ? Number(r.amount) : null,
    content: r.content != null ? String(r.content) : null,
    submittedAt: r.submitted_at != null ? String(r.submitted_at) : null,
    createdAt: r.created_at != null ? String(r.created_at) : null,
    attachments,
  };
}

/** 현장(견적)별 인건비 요청 목록 */
export async function GET(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const estimateIdParam = searchParams.get("estimateId")?.trim();
    const estimateId = estimateIdParam ? parseInt(estimateIdParam, 10) : NaN;
    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }

    const check = await sql`
      SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
    `;
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    let rows: Record<string, unknown>[] = [];
    try {
      // 목록에서는 base64 본문 없이 메타만 조회 (용량·타임아웃 방지)
      const result = await sql`
        SELECT
          id, estimate_id, worker_id, worker_name, access_token, status, amount, content, submitted_at, created_at,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'kind', t.elem->>'kind',
                  'name', COALESCE(NULLIF(t.elem->>'name', ''), 'attachment'),
                  'mime', COALESCE(NULLIF(t.elem->>'mime', ''), 'application/octet-stream'),
                  'index', (t.ord - 1)
                )
                ORDER BY t.ord
              ),
              '[]'::json
            )
            FROM json_array_elements(
              CASE
                WHEN attachments_json IS NULL OR btrim(attachments_json) = '' THEN '[]'::json
                ELSE attachments_json::json
              END
            ) WITH ORDINALITY AS t(elem, ord)
            WHERE t.elem->>'kind' IN ('photo', 'file')
          ) AS attachments_meta
        FROM labor_pay_requests
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        ORDER BY id DESC
      `;
      rows = result.rows as Record<string, unknown>[];
    } catch (metaErr) {
      console.error("labor-pay GET meta query fallback:", metaErr);
      const result = await sql`
        SELECT id, estimate_id, worker_id, worker_name, access_token, status, amount, content, submitted_at, created_at, attachments_json
        FROM labor_pay_requests
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
        ORDER BY id DESC
      `;
      rows = result.rows as Record<string, unknown>[];
    }

    return NextResponse.json({
      requests: rows.map((row) => mapRow(row)),
    });
  } catch (error) {
    console.error("labor-pay GET error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|labor_pay_requests/i.test(msg)) {
      return NextResponse.json(
        { error: "내역서 요청 테이블이 없습니다. 배포/마이그레이션 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    if (/attachments_json/i.test(msg)) {
      return NextResponse.json(
        { error: "첨부 컬럼 마이그레이션이 필요합니다. 배포 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 인부 지정 후 링크 생성 (이미 open인 동일 worker는 건너뛰고 기존 반환) */
export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const estimateId = body.estimateId != null ? parseInt(String(body.estimateId), 10) : NaN;
    const workerIdsRaw = Array.isArray(body.workerIds) ? body.workerIds : [];
    const parsedIds = (workerIdsRaw as unknown[])
      .map((id) => parseInt(String(id), 10))
      .filter((id) => !Number.isNaN(id) && id > 0);
    const workerIds = [...new Set(parsedIds)];

    if (Number.isNaN(estimateId) || estimateId < 1) {
      return NextResponse.json({ error: "견적 ID가 필요합니다." }, { status: 400 });
    }
    if (workerIds.length === 0) {
      return NextResponse.json({ error: "인부를 선택해 주세요." }, { status: 400 });
    }

    const estCheck = await sql`
      SELECT id, title, customer_name FROM estimates
      WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
    `;
    if (estCheck.rows.length === 0) {
      return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
    }

    const workersRes = await sql`
      SELECT id, name FROM company_workers WHERE company_id = ${company.id}
    `;
    const workerMap = new Map(
      (workersRes.rows as { id: number; name: string }[])
        .map((w) => [Number(w.id), String(w.name)] as const)
        .filter(([id]) => workerIds.includes(id))
    );
    if (workerMap.size === 0) {
      return NextResponse.json({ error: "선택한 인부를 찾을 수 없습니다." }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "";
    const origin = baseUrl.replace(/\/$/, "");
    const created: ReturnType<typeof mapRow>[] = [];

    for (const wid of workerIds) {
      const name = workerMap.get(wid);
      if (!name) continue;

      const existing = await sql`
        SELECT id, estimate_id, worker_id, worker_name, access_token, status, amount, content, submitted_at, created_at
        FROM labor_pay_requests
        WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
          AND worker_id = ${wid} AND status = 'open'
        ORDER BY id DESC LIMIT 1
      `;
      if (existing.rows.length > 0) {
        created.push(mapRow(existing.rows[0] as Record<string, unknown>));
        continue;
      }

      const token = randomUUID();
      const inserted = await sql`
        INSERT INTO labor_pay_requests (company_id, estimate_id, worker_id, worker_name, access_token, status)
        VALUES (${company.id}, ${estimateId}, ${wid}, ${name}, ${token}, 'open')
        RETURNING id, estimate_id, worker_id, worker_name, access_token, status, amount, content, submitted_at, created_at
      `;
      created.push(mapRow(inserted.rows[0] as Record<string, unknown>));
    }

    return NextResponse.json({
      requests: created.map((r) => ({
        ...r,
        linkUrl: `${origin}/labor-pay/f/${r.accessToken}`,
      })),
    });
  } catch (error) {
    console.error("labor-pay POST error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|labor_pay_requests/i.test(msg)) {
      return NextResponse.json(
        { error: "내역서 요청 테이블이 없습니다. 배포/마이그레이션 후 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
