import { NextResponse } from "next/server";
import {
  SHOP_SECRET_COOKIE,
  encodeSecretSession,
  secretCookieOptions,
  validateRawSecretToken,
} from "@/lib/shop-secret-auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = (url.searchParams.get("token") || "").trim();
    if (!token) {
      return NextResponse.json({ error: "토큰이 필요합니다." }, { status: 400 });
    }
    const session = await validateRawSecretToken(token);
    if (!session) {
      return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다." }, { status: 401 });
    }
    const res = NextResponse.json(
      { ok: true, companyId: session.companyId, expiresAt: session.expiresAt },
      { status: 200 }
    );
    res.cookies.set(SHOP_SECRET_COOKIE, encodeSecretSession(session), secretCookieOptions(session.expiresAt));
    return res;
  } catch (error) {
    console.error("shop-secret verify error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
