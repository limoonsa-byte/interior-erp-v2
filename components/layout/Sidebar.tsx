"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
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
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Calculator,
  ExternalLink,
  ListChecks,
  Signature,
  Banknote,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

const baseMenuItems: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; external?: boolean }[] = [
  { href: "/consulting", label: "상담 및 미팅관리", icon: MessageSquare },
  { href: "/estimate", label: "견적서 작성", icon: FileText },
  { href: "/contract", label: "계약서 작성", icon: Signature },
  { href: "/schedule", label: "일정작성", icon: Calendar },
  { href: "/work-log", label: "작업일지", icon: ClipboardList },
  { href: "/workers", label: "현장 인부 DB", icon: Users },
  { href: "/material-order", label: "자재 발주", icon: Package },
  { href: "/material-list", label: "현장용 자재리스트", icon: ListChecks },
  { href: "/labor-pay", label: "내역서 요청", icon: Banknote },
  { href: "/payment", label: "결제 승인 관리", icon: CreditCard },
  { href: "/settlement", label: "정산", icon: Wallet },
  { href: "/statistics", label: "통계", icon: BarChart3 },
  { href: "/chat", label: "채팅", icon: MessageCircle },
  { href: "/calculator", label: "편의 계산기", icon: Calculator },
  { href: "/admin", label: "관리", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();
  const [companyLabel, setCompanyLabel] = useState("로그인 회사");
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.company?.name) {
          setCompanyLabel(data.company.name);
        } else if (data.company?.code) {
          setCompanyLabel(data.company.code);
        }
        if (data.company?.picName) {
          setCompanyLabel((prev) => `${prev} (${data.company.picName})`);
        }
        setIsMaster(Boolean(data.company?.isMaster));
      })
      .catch(() => {
        setCompanyLabel("로그인 회사");
        setIsMaster(false);
      });
  }, []);

  const menuItems = [
    ...baseMenuItems,
    ...(typeof process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL === "string" && process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL
      ? [{ href: process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL, label: "카카오톡 문의", icon: ExternalLink as React.ComponentType<{ className?: string }>, external: true as const }]
      : []),
    ...(isMaster
      ? [
          { href: "/sign-test", label: "서명 PDF 테스트", icon: FileText, external: false as const },
          { href: "/admin/master", label: "마스터 관리", icon: Shield, external: false as const },
        ]
      : []),
  ];

  return (
    <aside
      className={clsx(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-700/50 bg-[#1e293b] text-white transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 flex-col justify-center border-b border-slate-700/50 px-3">
        {!collapsed && (
          <button
            type="button"
            onClick={() => {
              document.cookie =
                "company=; Max-Age=0; path=/; SameSite=Lax";
              window.location.href = "/login";
            }}
            className="flex flex-col items-start text-left"
          >
            <span className="truncate text-lg font-semibold">
              인테리어 올인원 ERP시스템
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-300 underline-offset-2 hover:underline">
              <span className="block truncate">{companyLabel} 님, 환영합니다.</span>
              <span className="block truncate">(클릭 시 로그아웃)</span>
            </span>
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {menuItems.map(({ href, label, icon: Icon, external = false }) => {
            const isActive = !external && pathname === href;
            const linkClass = clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              isActive
                ? "bg-slate-600/80 text-white"
                : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
            );
            return (
              <li key={external ? `kakao-${href}` : href}>
                {external ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </a>
                ) : (
                  <Link href={href} className={linkClass}>
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-12 items-center justify-center border-t border-slate-700/50 text-slate-400 hover:bg-slate-700/50 hover:text-white"
        aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        {collapsed ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>
    </aside>
  );
}
