import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 로그인 없이 접근 가능한 경로 (서명 링크는 외부에 전달되므로 공개) */
const publicPaths = ["/login", "/sign"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const companyCookie = request.cookies.get("company");

  if (!companyCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
