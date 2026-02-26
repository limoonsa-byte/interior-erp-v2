import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

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

/** 견적별 채팅 메시지 목록. estimateId 없으면 회사 전체 채팅방 */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const estimateIdParam = searchParams.get("estimateId");
  const estimateId = estimateIdParam ? parseInt(estimateIdParam, 10) : null;
  if (estimateIdParam != null && (estimateId == null || Number.isNaN(estimateId) || estimateId < 1)) {
    return NextResponse.json({ error: "잘못된 견적 ID입니다." }, { status: 400 });
  }
  try {
    if (estimateId != null) {
      const check = await sql`
        SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
      `;
      if (check.rows.length === 0) {
        return NextResponse.json({ error: "해당 견적을 찾을 수 없습니다." }, { status: 404 });
      }
    }
    try {
      const result = estimateId != null
        ? await sql`
            SELECT id, company_id, estimate_id, sender_name, body, created_at
            FROM company_chat_messages
            WHERE company_id = ${company.id} AND estimate_id = ${estimateId}
            ORDER BY created_at DESC
            LIMIT 200
          `
        : await sql`
            SELECT id, company_id, estimate_id, sender_name, body, created_at
            FROM company_chat_messages
            WHERE company_id = ${company.id} AND (estimate_id IS NULL)
            ORDER BY created_at DESC
            LIMIT 200
          `;
      const messages = result.rows.map((row) => ({
        id: row.id,
        companyId: row.company_id,
        estimateId: (row as { estimate_id?: number }).estimate_id ?? null,
        senderName: row.sender_name,
        body: String(row.body ?? ""),
        createdAt: row.created_at != null ? new Date(row.created_at).toISOString() : null,
      }));
      return NextResponse.json(messages.reverse());
    } catch (colErr: unknown) {
      const errMsg = String(colErr instanceof Error ? colErr.message : colErr);
      if (errMsg.includes("estimate_id") || errMsg.includes("does not exist")) {
        const result = await sql`
          SELECT id, company_id, sender_name, body, created_at
          FROM company_chat_messages
          WHERE company_id = ${company.id}
          ORDER BY created_at DESC
          LIMIT 200
        `;
        const messages = result.rows.map((row) => ({
          id: row.id,
          companyId: row.company_id,
          estimateId: null as number | null,
          senderName: row.sender_name,
          body: String(row.body ?? ""),
          createdAt: row.created_at != null ? new Date(row.created_at).toISOString() : null,
        }));
        return NextResponse.json(estimateId != null ? [] : messages.reverse());
      }
      throw colErr;
    }
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    console.error("chat GET error:", e);
    if (errMsg.includes("does not exist")) {
      return NextResponse.json(
        [],
        { status: 200 }
      );
    }
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** 새 메시지 전송. estimateId 없으면 회사 전체 채팅방 */
export async function POST(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const body = await request.json();
    const estimateIdParam = body.estimateId;
    const estimateId = estimateIdParam != null ? parseInt(String(estimateIdParam), 10) : null;
    if (estimateIdParam != null && (estimateId == null || Number.isNaN(estimateId) || estimateId < 1)) {
      return NextResponse.json({ error: "잘못된 견적 ID입니다." }, { status: 400 });
    }
    if (estimateId != null) {
      const check = await sql`
        SELECT id FROM estimates WHERE id = ${estimateId} AND company_id = ${company.id} LIMIT 1
      `;
      if (check.rows.length === 0) {
        return NextResponse.json({ error: "해당 견적을 찾을 수 없습니다." }, { status: 404 });
      }
    }
    const senderName = typeof body.senderName === "string" ? body.senderName.trim() : company.name || company.code || "사용자";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!messageBody) {
      return NextResponse.json({ error: "메시지를 입력해 주세요." }, { status: 400 });
    }
    try {
      const result = estimateId != null
        ? await sql`
            INSERT INTO company_chat_messages (company_id, estimate_id, sender_name, body)
            VALUES (${company.id}, ${estimateId}, ${senderName}, ${messageBody})
            RETURNING id, company_id, sender_name, body, created_at
          `
        : await sql`
            INSERT INTO company_chat_messages (company_id, sender_name, body)
            VALUES (${company.id}, ${senderName}, ${messageBody})
            RETURNING id, company_id, sender_name, body, created_at
          `;
      const row = result.rows[0] as { id: number; company_id: number; sender_name: string; body: string; created_at: unknown };
      const msg = {
        id: row.id,
        companyId: row.company_id,
        estimateId: estimateId ?? null,
        senderName: row.sender_name,
        body: row.body,
        createdAt: row.created_at != null ? new Date(row.created_at as string).toISOString() : null,
      };
      return NextResponse.json(msg);
    } catch (insertErr: unknown) {
      const errMsg = String(insertErr instanceof Error ? insertErr.message : insertErr);
      if (errMsg.includes("estimate_id") || errMsg.includes("does not exist")) {
        if (estimateId != null) {
          return NextResponse.json(
            { error: "견적별 채팅을 사용하려면 DB 마이그레이션을 실행해 주세요. (npm run build 또는 node scripts/migrate.js)" },
            { status: 503 }
          );
        }
        const result = await sql`
          INSERT INTO company_chat_messages (company_id, sender_name, body)
          VALUES (${company.id}, ${senderName}, ${messageBody})
          RETURNING id, company_id, sender_name, body, created_at
        `;
        const row = result.rows[0] as { id: number; company_id: number; sender_name: string; body: string; created_at: unknown };
        const msg = {
          id: row.id,
          companyId: row.company_id,
          estimateId: null as number | null,
          senderName: row.sender_name,
          body: row.body,
          createdAt: row.created_at != null ? new Date(row.created_at as string).toISOString() : null,
        };
        return NextResponse.json(msg);
      }
      throw insertErr;
    }
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    console.error("chat POST error:", e);
    if (errMsg.includes("does not exist")) {
      return NextResponse.json(
        { error: "채팅 테이블이 없습니다. 터미널에서 npm run build 또는 node scripts/migrate.js 를 실행한 뒤 다시 시도해 주세요." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "전송 실패" }, { status: 500 });
  }
}
