import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getCompanyFromCookie, getPicIdFromSession } from "@/lib/company-cookie";

/** Push 구독 등록 (채팅 페이지에서 호출) */
export async function POST(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const myPicId = getPicIdFromSession(company);
  try {
    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
    const subscriberName = typeof body.subscriberName === "string" ? body.subscriberName.trim() : null;
    const subscriberPicIdParam = body.subscriberPicId;
    const subscriberPicId =
      subscriberPicIdParam != null
        ? parseInt(String(subscriberPicIdParam), 10)
        : myPicId;
    const estimateIdParam = body.estimateId;
    const estimateId = estimateIdParam != null ? parseInt(String(estimateIdParam), 10) : null;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "endpoint, keys.p256dh, keys.auth 가 필요합니다." },
        { status: 400 }
      );
    }
    try {
      await sql`
        INSERT INTO chat_push_subscriptions (company_id, estimate_id, endpoint, p256dh, auth, subscriber_name, subscriber_pic_id)
        VALUES (${company.id}, ${estimateId}, ${endpoint}, ${p256dh}, ${auth}, ${subscriberName}, ${subscriberPicId})
        ON CONFLICT (endpoint) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          estimate_id = EXCLUDED.estimate_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          subscriber_name = EXCLUDED.subscriber_name,
          subscriber_pic_id = EXCLUDED.subscriber_pic_id
      `;
    } catch {
      await sql`
        INSERT INTO chat_push_subscriptions (company_id, estimate_id, endpoint, p256dh, auth, subscriber_name)
        VALUES (${company.id}, ${estimateId}, ${endpoint}, ${p256dh}, ${auth}, ${subscriberName})
        ON CONFLICT (endpoint) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          estimate_id = EXCLUDED.estimate_id,
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          subscriber_name = EXCLUDED.subscriber_name
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const errMsg = String(e instanceof Error ? e.message : e);
    if (errMsg.includes("chat_push_subscriptions") || errMsg.includes("does not exist")) {
      return NextResponse.json(
        { error: "Push 구독 테이블이 없습니다. npm run build 또는 node scripts/migrate.js 를 실행해 주세요." },
        { status: 503 }
      );
    }
    console.error("push-subscription POST error:", e);
    return NextResponse.json({ error: "등록 실패" }, { status: 500 });
  }
}
