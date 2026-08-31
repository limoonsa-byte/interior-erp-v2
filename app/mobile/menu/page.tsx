"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  FileText,
  Users,
  Package,
  Wallet,
  Calendar,
  ClipboardList,
  CreditCard,
  BarChart3,
  Settings,
  Shield,
  MessageCircle,
  ExternalLink,
  ListChecks,
  Signature,
  Calculator,
  Briefcase,
  ChevronRight,
  Banknote,
} from "lucide-react";

type MenuItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
};

const baseMenuItems: MenuItem[] = [
  { href: "/mobile/consulting", label: "상담 및 미팅관리", icon: MessageSquare },
  { href: "/mobile/estimate", label: "견적서 작성", icon: FileText },
  { href: "/mobile/contract", label: "계약서 작성", icon: Signature },
  { href: "/mobile/schedule", label: "일정작성", icon: Calendar },
  { href: "/mobile/work-log", label: "작업일지", icon: ClipboardList },
  { href: "/mobile/projects", label: "프로젝트", icon: Briefcase },
  { href: "/mobile/workers", label: "현장 인부 DB", icon: Users },
  { href: "/mobile/material-order", label: "자재 발주", icon: Package },
  { href: "/mobile/material-list", label: "현장용 자재리스트", icon: ListChecks },
  { href: "/mobile/labor-pay", label: "내역서 요청", icon: Banknote },
  { href: "/mobile/payment", label: "결제 승인 관리", icon: CreditCard },
  { href: "/mobile/settlement", label: "정산", icon: Wallet },
  { href: "/mobile/statistics", label: "통계", icon: BarChart3 },
  { href: "/mobile/chat", label: "채팅", icon: MessageCircle },
  { href: "/mobile/calculator", label: "편의 계산기", icon: Calculator },
  { href: "/mobile/admin", label: "관리", icon: Settings },
];

export default function MobileMenuPage() {
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => setIsMaster(Boolean(data.company?.isMaster)))
      .catch(() => setIsMaster(false));
  }, []);

  const menuItems = useMemo(() => {
    return [
      ...baseMenuItems,
      ...(typeof process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL === "string" && process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL
        ? [{ href: process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL, label: "카카오톡 문의", icon: ExternalLink, external: true as const }]
        : []),
      ...(isMaster
        ? [
            { href: "/sign-test", label: "서명 PDF 테스트", icon: FileText },
            { href: "/admin/master", label: "마스터 관리", icon: Shield },
          ]
        : []),
    ];
  }, [isMaster]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h1 className="mb-3 text-lg font-semibold text-gray-900">전체 메뉴</h1>
      <ul className="grid grid-cols-2 gap-2">
        {menuItems.map(({ href, label, icon: Icon, external = false }) => {
          const inner = (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                {label}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
            </>
          );
          const className =
            "flex min-h-[56px] items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 shadow-sm active:bg-gray-50";
          return (
            <li key={external ? `ext-${href}` : href}>
              {external ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                  {inner}
                </a>
              ) : (
                <Link href={href} className={className}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
