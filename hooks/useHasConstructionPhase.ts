"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { companyHasConstructionPhase } from "@/lib/constructionPhase";

/**
 * 상담 중 공사진행(또는 완료) 건이 있으면 true.
 * 일정작성~정산 메뉴 표시 여부에 사용.
 * 페이지 이동 시마다 다시 확인한다.
 */
export function useHasConstructionPhase(): boolean {
  const pathname = usePathname();
  const [hasConstruction, setHasConstruction] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/consultations", { credentials: "include" })
      .then((res) => res.json())
      .then((list) => {
        if (cancelled) return;
        setHasConstruction(Array.isArray(list) ? companyHasConstructionPhase(list) : false);
      })
      .catch(() => {
        if (!cancelled) setHasConstruction(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return hasConstruction;
}
