"use client";

import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";

/**
 * 서명·인건비 공개 페이지만 로그인/next-auth 없이 동작.
 * /sign/*, /labor-pay/f/* 일 때 SessionProvider를 넣지 않음.
 */
export function ConditionalAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicNoAuth =
    pathname == null || pathname.startsWith("/sign") || pathname.startsWith("/labor-pay/f");
  if (isPublicNoAuth) {
    return <>{children}</>;
  }
  return <SessionProvider>{children}</SessionProvider>;
}
