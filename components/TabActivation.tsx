"use client";

import { useEffect } from "react";

/**
 * 브라우저 탭이 다시 보일 때(활성화될 때) 창에 포커스를 주는 컴포넌트.
 * 사용자가 다른 탭에서 돌아왔을 때 이 탭이 포커스되도록 합니다.
 */
export function TabActivation() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        window.focus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return null;
}
