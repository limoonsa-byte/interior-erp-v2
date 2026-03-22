import { NextResponse } from "next/server";
import { SHOP_SECRET_COOKIE } from "@/lib/shop-secret-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SHOP_SECRET_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
