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
    const senderKey = params.senderName.trim().toLowerCase();
    const rows =
      params.estimateId == null
        ? await sql`
            SELECT endpoint, p256dh, auth
            FROM chat_push_subscriptions
            WHERE company_id = ${params.companyId} AND estimate_id IS NULL
              AND (subscriber_name IS NULL OR LOWER(TRIM(subscriber_name)) <> ${senderKey})
          `
        : await sql`
            SELECT endpoint, p256dh, auth
            FROM chat_push_subscriptions
            WHERE company_id = ${params.companyId}
              AND (estimate_id IS NULL OR estimate_id = ${params.estimateId})
              AND (subscriber_name IS NULL OR LOWER(TRIM(subscriber_name)) <> ${senderKey})
          `;
    const payload = JSON.stringify({
      title: "erp메세지",
      senderName: params.senderName.trim() || "",
      body: params.body.slice(0, 80) + (params.body.length > 80 ? "…" : ""),
      tag: `chat-${params.estimateId ?? "all"}`,
      url: params.estimateId != null ? `/chat?estimateId=${params.estimateId}` : "/chat",
    });
    const options = { TTL: 60 };
    const sendPromises = (rows.rows as { endpoint: string; p256dh: string; auth: string }[]).map((row) =>
      webpush
        .sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
          options
        )
        .catch(() => {})
    );
    await Promise.all(sendPromises);
  } catch (_) {
    // DB/테이블 없음 등 무시
  }
}
