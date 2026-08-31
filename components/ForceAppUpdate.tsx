"use client";

import { useEffect } from "react";

/**
 * 예전 PWA(sw.js) 캐시 때문에 배포 후에도 옛 JS가 남는 문제를 끊는다.
 * 한 번만 서비스워커/캐시를 비우고 최신 번들을 받게 한다.
 */
const CACHE_BUST_KEY = "erp-cache-bust-v20260831-contract-before-schedule";

export function ForceAppUpdate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(CACHE_BUST_KEY) === "1") return;
    } catch {
      // localStorage 불가 환경은 매 로드마다 시도
    }

    const run = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            regs.map(async (reg) => {
              const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || "";
              const scope = reg.scope || "";
              // 앱 셸 캐시용 /sw.js 제거
              if (url.includes("/sw.js") && !url.includes("sw-push")) {
                await reg.unregister();
                return;
              }
              // 예전 scope=/chat 푸시를 제거하고 루트 scope로 재구독되게 함
              if (url.includes("sw-push") && scope.includes("/chat")) {
                await reg.unregister();
              }
            })
          );
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => /workbox|precache|next|start-url|pages/i.test(k))
              .map((k) => caches.delete(k))
          );
        }
      } catch {
        // ignore
      } finally {
        try {
          window.localStorage.setItem(CACHE_BUST_KEY, "1");
        } catch {
          // ignore
        }
      }
    };

    void run();
  }, []);

  return null;
}
