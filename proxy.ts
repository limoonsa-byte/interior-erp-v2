import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 로그인 없이 접근 가능한 경로 (서명 링크는 외부에 전달되므로 공개) */
const publicPaths = ["/login", "/sign"];
const mobilePrefix = "/mobile";
const mobileTargets = new Set([
  "/consulting",
  "/estimate",
  "/schedule",
  "/contract",
  "/workers",
  "/material-order",
  "/material-list",
  "/work-log",
  "/payment",
  "/settlement",
  "/statistics",
  "/chat",
  "/admin",
]);

function isMobileUserAgent(userAgent: string): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
}

function toMobilePath(pathname: string): string | null {
  if (mobileTargets.has(pathname)) return `${mobilePrefix}${pathname}`;
  if (pathname.startsWith("/schedule/")) return `${mobilePrefix}${pathname}`;
  if (pathname.startsWith("/payment/")) return `${mobilePrefix}${pathname}`;
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get("user-agent") ?? "";
  const isMobile = isMobileUserAgent(userAgent);

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const companyCookie = request.cookies.get("company");

  if (!companyCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (isMobile && !pathname.startsWith(mobilePrefix)) {
    const mobilePath = toMobilePath(pathname);
    if (mobilePath) {
      const nextUrl = new URL(mobilePath, request.url);
      if (request.nextUrl.search) {
        nextUrl.search = request.nextUrl.search;
      }
      return NextResponse.redirect(nextUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
