import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getCompanyFromCookie, getPicIdFromSession } from "@/lib/company-cookie";

/** 채팅방별 읽지 않은 메시지 개수. lastRead: {"all":10,"8":5,"dm:3":2} */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const myPicId = getPicIdFromSession(company);
  try {
    const { searchParams } = new URL(request.url);
    let lastRead: Record<string, number> = {};
    try {
      const raw = searchParams.get("lastRead");
      if (raw) lastRead = JSON.parse(raw) as Record<string, number>;
    } catch (_) {}

    const rooms: { estimateId: number | null; peerPicId: number | null; unreadCount: number }[] = [];

    const allLast = typeof lastRead.all === "number" ? lastRead.all : 0;
    try {
      const allCount = await sql`
        SELECT COUNT(*)::int AS c FROM company_chat_messages
        WHERE company_id = ${company.id} AND estimate_id IS NULL AND peer_pic_id IS NULL AND id > ${allLast}
      `;
      rooms.push({ estimateId: null, peerPicId: null, unreadCount: Number((allCount.rows[0] as { c: number }).c) || 0 });
    } catch {
      const allCount = await sql`
        SELECT COUNT(*)::int AS c FROM company_chat_messages
        WHERE company_id = ${company.id} AND (estimate_id IS NULL) AND id > ${allLast}
      `;
      rooms.push({ estimateId: null, peerPicId: null, unreadCount: Number((allCount.rows[0] as { c: number }).c) || 0 });
    }

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
        peerPicId: null,
        unreadCount: Number((countRes.rows[0] as { c: number }).c) || 0,
      });
    }

    const estimatesWithChat = await sql`
      SELECT id FROM estimates WHERE company_id = ${company.id}
    `;
    const seenKeys = new Set(rooms.map((r) => (r.estimateId != null ? String(r.estimateId) : r.peerPicId != null ? `dm:${r.peerPicId}` : "all")));
    for (const row of estimatesWithChat.rows as { id: number }[]) {
      if (seenKeys.has(String(row.id))) continue;
      const last = typeof lastRead[String(row.id)] === "number" ? lastRead[String(row.id)] : 0;
      const countRes = await sql`
        SELECT COUNT(*)::int AS c FROM company_chat_messages
        WHERE company_id = ${company.id} AND estimate_id = ${row.id} AND id > ${last}
      `;
      rooms.push({
        estimateId: row.id,
        peerPicId: null,
        unreadCount: Number((countRes.rows[0] as { c: number }).c) || 0,
      });
    }

    if (myPicId != null) {
      try {
        const peerRows = await sql`
          SELECT DISTINCT
            CASE
              WHEN sender_pic_id = ${myPicId} THEN peer_pic_id
              ELSE sender_pic_id
            END AS other_pic_id
          FROM company_chat_messages
          WHERE company_id = ${company.id}
            AND estimate_id IS NULL
            AND peer_pic_id IS NOT NULL
            AND (sender_pic_id = ${myPicId} OR peer_pic_id = ${myPicId})
            AND (
              (sender_pic_id = ${myPicId} AND peer_pic_id IS NOT NULL)
              OR (peer_pic_id = ${myPicId} AND sender_pic_id IS NOT NULL)
            )
        `;
        for (const row of peerRows.rows as { other_pic_id: number | null }[]) {
          const otherId = row.other_pic_id;
          if (otherId == null || otherId === myPicId) continue;
          const key = `dm:${otherId}`;
          const last = typeof lastRead[key] === "number" ? lastRead[key] : 0;
          const countRes = await sql`
            SELECT COUNT(*)::int AS c FROM company_chat_messages
            WHERE company_id = ${company.id}
              AND estimate_id IS NULL
              AND peer_pic_id IS NOT NULL
              AND id > ${last}
              AND (
                (sender_pic_id = ${myPicId} AND peer_pic_id = ${otherId})
                OR (sender_pic_id = ${otherId} AND peer_pic_id = ${myPicId})
              )
          `;
          rooms.push({
            estimateId: null,
            peerPicId: otherId,
            unreadCount: Number((countRes.rows[0] as { c: number }).c) || 0,
          });
        }

        const allPics = await sql`
          SELECT id FROM company_pics WHERE company_id = ${company.id} AND id != ${myPicId}
        `;
        for (const row of allPics.rows as { id: number }[]) {
          const key = `dm:${row.id}`;
          if (rooms.some((r) => r.peerPicId === row.id)) continue;
          const last = typeof lastRead[key] === "number" ? lastRead[key] : 0;
          const countRes = await sql`
            SELECT COUNT(*)::int AS c FROM company_chat_messages
            WHERE company_id = ${company.id}
              AND estimate_id IS NULL
              AND peer_pic_id IS NOT NULL
              AND id > ${last}
              AND (
                (sender_pic_id = ${myPicId} AND peer_pic_id = ${row.id})
                OR (sender_pic_id = ${row.id} AND peer_pic_id = ${myPicId})
              )
          `;
          const unread = Number((countRes.rows[0] as { c: number }).c) || 0;
          if (unread > 0) {
            rooms.push({ estimateId: null, peerPicId: row.id, unreadCount: unread });
          }
        }
      } catch {
        // peer_pic_id 컬럼 없음 — DM 미지원
      }
    }

    return NextResponse.json({ rooms });
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    if (errMsg.includes("company_chat_messages") || errMsg.includes("does not exist")) {
      return NextResponse.json({ rooms: [{ estimateId: null, peerPicId: null, unreadCount: 0 }] });
    }
    console.error("rooms-summary error:", e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
