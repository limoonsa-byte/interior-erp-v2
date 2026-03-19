"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";

/**
 * 서명 페이지만 로그인/next-auth 없이 동작.
 * /sign/* 일 때만 SessionProvider를 넣지 않아 세션 요청을 하지 않음.
 */
export function ConditionalAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // pathname이 null이거나 /sign 이면 SessionProvider 미사용 (서명 페이지만 로그인 없이)
  const isSignPage = pathname == null || pathname.startsWith("/sign");
  if (isSignPage) {
    return <>{children}</>;
  }
  return <SessionProvider>{children}</SessionProvider>;
}
