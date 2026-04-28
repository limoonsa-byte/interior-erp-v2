"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

function toMobilePath(pathname: string): string | null {
  if (mobileTargets.has(pathname)) return `/mobile${pathname}`;
  if (pathname.startsWith("/schedule/")) return `/mobile${pathname}`;
  if (pathname.startsWith("/payment/")) return `/mobile${pathname}`;
  return null;
}

function isMobileLikeClient(): boolean {
  const ua = window.navigator.userAgent || "";
  const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const narrowViewport = window.matchMedia("(max-width: 900px)").matches;
  return uaMobile || narrowViewport;
}

export function MobileAutoRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/mobile")) return;
    if (!isMobileLikeClient()) return;
    const mobilePath = toMobilePath(pathname);
    if (!mobilePath) return;
    const query = searchParams?.toString();
    router.replace(query ? `${mobilePath}?${query}` : mobilePath);
  }, [pathname, router, searchParams]);

  return null;
}
