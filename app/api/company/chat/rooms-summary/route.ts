import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number };
  } catch {
    return null;
  }
}

/** 채팅방별 읽지 않은 메시지 개수. lastRead: {"all":10,"8":5} 형태의 JSON (방 키별 마지막으로 읽은 메시지 id) */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    let lastRead: Record<string, number> = {};
    try {
      const raw = searchParams.get("lastRead");
      if (raw) lastRead = JSON.parse(raw) as Record<string, number>;
    } catch (_) {}

    const rooms: { estimateId: number | null; unreadCount: number }[] = [];

    const allLast = typeof lastRead.all === "number" ? lastRead.all : 0;
    const allCount = await sql`
      SELECT COUNT(*)::int AS c FROM company_chat_messages
      WHERE company_id = ${company.id} AND (estimate_id IS NULL) AND id > ${allLast}
    `;
    rooms.push({ estimateId: null, unreadCount: Number((allCount.rows[0] as { c: number }).c) || 0 });

    const estimateRows = await sql`
      SELECT DISTINCT estimate_id FROM company_chat_messages
      WHERE company_id = ${company.id} AND estimate_id IS NOT NULL
    `;
    for (const row of estimateRows.rows as { estimate_id: number }[]) {
      const eid = row.estimate_id;
      const last = typeof lastRead[String(eid)] === "number" ? lastRead[String(eid)] : 0;
      const countRes = await sql`
        SELECT COUNT(*)::int AS c FROM company_chat_messages
        WHERE company_id = ${company.id} AND estimate_id = ${eid} AND id > ${last}
      `;
      rooms.push({
        estimateId: eid,
        unreadCount: Number((countRes.rows[0] as { c: number }).c) || 0,
      });
    }

    const estimatesWithChat = await sql`
      SELECT id FROM estimates WHERE company_id = ${company.id}
    `;
    const seenIds = new Set(rooms.map((r) => r.estimateId));
    for (const row of estimatesWithChat.rows as { id: number }[]) {
      if (seenIds.has(row.id)) continue;
      const last = typeof lastRead[String(row.id)] === "number" ? lastRead[String(row.id)] : 0;
      const countRes = await sql`
        SELECT COUNT(*)::int AS c FROM company_chat_messages
        WHERE company_id = ${company.id} AND estimate_id = ${row.id} AND id > ${last}
      `;
      rooms.push({
        estimateId: row.id,
        unreadCount: Number((countRes.rows[0] as { c: number }).c) || 0,
      });
    }

    return NextResponse.json({ rooms });
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    if (errMsg.includes("company_chat_messages") || errMsg.includes("does not exist")) {
      return NextResponse.json({ rooms: [{ estimateId: null, unreadCount: 0 }] });
    }
    console.error("rooms-summary error:", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
