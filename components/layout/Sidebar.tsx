"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  FolderKanban,
  Wallet,
  Calendar,
  ClipboardList,
  BarChart3,
  UserPlus,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

const menuItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/consulting", label: "상담 및 미팅관리", icon: MessageSquare },
  { href: "/estimate", label: "견적서 작성", icon: FileText },
  { href: "/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/settlement", label: "정산", icon: Wallet },
  { href: "/schedule", label: "일정", icon: Calendar },
  { href: "/work-log", label: "작업일지", icon: ClipboardList },
  { href: "/statistics", label: "통계", icon: BarChart3 },
  { href: "/reception", label: "접수", icon: UserPlus },
  { href: "/admin", label: "관리", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();
  const [companyLabel, setCompanyLabel] = useState("로그인 회사");

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.company?.name) {
          setCompanyLabel(data.company.name);
        } else if (data.company?.code) {
          setCompanyLabel(data.company.code);
        }
      })
      .catch(() => {
        setCompanyLabel("로그인 회사");
      });
  }, []);

  return (
    <aside
      className={clsx(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-700/50 bg-[#1e293b] text-white transition-[width] duration-200",
        "hidden md:flex",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex h-16 flex-col justify-center border-b border-slate-700/50 px-3">
        {!collapsed && (
          <button
            type="button"
            onClick={() => {
              document.cookie =
                "company=; Max-Age=0; path=/; SameSite=Lax; Secure";
              window.location.href = "/login";
            }}
            className="flex flex-col items-start text-left"
          >
            <span className="truncate text-lg font-semibold">
              인테리어 ERP
            </span>
            <span className="mt-0.5 truncate text-[11px] text-slate-300 underline-offset-2 hover:underline">
              {companyLabel} 님, 환영합니다. (클릭 시 로그아웃)
            </span>
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {menuItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    isActive
                      ? "bg-slate-600/80 text-white"
                      : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
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
