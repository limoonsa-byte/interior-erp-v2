"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const PAGE_TITLES: { match: RegExp; label: string }[] = [
  { match: /^\/mobile\/menu/, label: "전체 메뉴" },
  { match: /^\/mobile\/consulting/, label: "상담 / 미팅" },
  { match: /^\/mobile\/estimate/, label: "견적서" },
  { match: /^\/mobile\/schedule/, label: "일정" },
  { match: /^\/mobile\/contract/, label: "계약서" },
  { match: /^\/mobile\/workers/, label: "인부 DB" },
  { match: /^\/mobile\/material-order/, label: "자재 발주" },
  { match: /^\/mobile\/material-list/, label: "자재 리스트" },
  { match: /^\/mobile\/work-log/, label: "작업일지" },
  { match: /^\/mobile\/labor-pay/, label: "내역서 요청" },
  { match: /^\/mobile\/payment/, label: "결제 승인" },
  { match: /^\/mobile\/settlement/, label: "정산" },
  { match: /^\/mobile\/statistics/, label: "통계" },
  { match: /^\/mobile\/chat/, label: "채팅" },
  { match: /^\/mobile\/calculator/, label: "편의 계산기" },
  { match: /^\/mobile\/admin/, label: "관리" },
  { match: /^\/mobile\/projects/, label: "프로젝트" },
  { match: /^\/mobile\/reception/, label: "접수" },
  { match: /^\/mobile\/dashboard/, label: "대시보드" },
];

function resolveTitle(pathname: string | null): string {
  if (!pathname) return "ERP";
  const hit = PAGE_TITLES.find((row) => row.match.test(pathname));
  return hit?.label ?? "ERP";
}

export function MobileTopMenu() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <Link
        href="/mobile/menu"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm active:bg-gray-100"
        aria-label="전체 메뉴 페이지 열기"
      >
        <Menu className="h-5 w-5" />
        <span>메뉴</span>
      </Link>
      <div className="min-w-0 flex-1 truncate text-center text-base font-semibold text-gray-900">
        {title}
      </div>
      <div className="w-[72px]" aria-hidden />
    </div>
  );
}
