"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, MessageSquare, FileText, FolderKanban, Wallet, Calendar, ClipboardList, BarChart3, UserPlus, Settings } from "lucide-react";
import { clsx } from "clsx";

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

export function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden"
        aria-label="메뉴 열기"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      <div className="flex flex-1 items-center justify-between md:ml-0">
        <h1 className="text-lg font-semibold text-gray-900">인테리어 ERP</h1>
      </div>
      <div className="w-10 md:hidden" />

      {/* 모바일 메뉴 드로어 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 pt-14 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        >
          <nav
            className="w-72 max-w-[85vw] border-r border-gray-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="py-2">
              {menuItems.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 px-4 py-3 text-sm",
                      pathname === href
                        ? "bg-gray-100 font-medium text-gray-900"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
