import { NextResponse } from "next/server";

const raw = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
const vapidPublic = raw ? raw.trim().replace(/\s/g, "").replace(/=+$/, "") : "";

/** 푸시 구독 시 필요한 VAPID 공개키 (클라이언트용) */
export async function GET() {
  if (!vapidPublic) {
    return NextResponse.json({ publicKey: null });
  }
  return NextResponse.json({ publicKey: vapidPublic });
}
