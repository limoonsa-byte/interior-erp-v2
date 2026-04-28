"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

export function MobileTopMenu() {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Link
        href="/mobile/menu"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm"
        aria-label="전체 메뉴 페이지 열기"
      >
          <Menu className="h-5 w-5" />
          <span>메뉴</span>
      </Link>
      <div className="text-base font-semibold text-gray-900">인테리어 올인원 ERP</div>
      <div className="w-[72px]" aria-hidden />
    </div>
  );
}
