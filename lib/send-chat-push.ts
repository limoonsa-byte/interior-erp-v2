import { sql } from "@vercel/postgres";
import webpush from "web-push";

const rawPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
const rawPrivate = process.env.VAPID_PRIVATE_KEY;

function normalizeVapidKey(key: string | undefined): string {
  if (!key) return "";
  return key.trim().replace(/\s/g, "").replace(/=+$/, "");
}

const vapidPublic = normalizeVapidKey(rawPublic);
const vapidPrivate = normalizeVapidKey(rawPrivate);

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(
    "mailto:support@example.com",
    vapidPublic,
    vapidPrivate
  );
}

export type SendChatPushParams = {
  companyId: number;
  estimateId: number | null;
  senderName: string;
  body: string;
};

/** 새 채팅 메시지 시 해당 방 구독자에게 푸시 전송 (실패 시 무시) */
export async function sendChatPush(params: SendChatPushParams): Promise<void> {
  if (!vapidPublic || !vapidPrivate) return;
  try {
    const rows =
      params.estimateId == null
        ? await sql`
            SELECT endpoint, p256dh, auth
            FROM chat_push_subscriptions
            WHERE company_id = ${params.companyId} AND estimate_id IS NULL
          `
        : await sql`
            SELECT endpoint, p256dh, auth
            FROM chat_push_subscriptions
            WHERE company_id = ${params.companyId}
              AND (estimate_id IS NULL OR estimate_id = ${params.estimateId})
          `;
    const payload = JSON.stringify({
      title: "뾰로롱",
      body: params.body.slice(0, 80) + (params.body.length > 80 ? "…" : ""),
      tag: `chat-${params.estimateId ?? "all"}`,
      url: params.estimateId != null ? `/chat?estimateId=${params.estimateId}` : "/chat",
    });
    for (const row of rows.rows as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          { TTL: 60 }
        );
      } catch (_) {
        // 구독 만료 등 시 무시
      }
    }
  } catch (_) {
    // DB/테이블 없음 등 무시
  }
}
