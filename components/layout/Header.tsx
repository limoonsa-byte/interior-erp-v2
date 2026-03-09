"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, MessageSquare, FileText, Users, Package, Wallet, Calendar, ClipboardList, BarChart3, Settings, Shield, Link2, MessageCircle, ExternalLink, Signature } from "lucide-react";
import { clsx } from "clsx";

/** 기본 메뉴 - 대시보드 제거, 왼쪽 사이드바가 항시 메뉴 역할 */
const defaultMenuItems = [
  { href: "/consulting", label: "상담 및 미팅관리", icon: MessageSquare },
  { href: "/estimate", label: "견적서 작성", icon: FileText },
  { href: "/schedule", label: "일정작성", icon: Calendar },
  { href: "/contract", label: "계약서 작성", icon: Signature },
  { href: "/workers", label: "현장 인부 DB", icon: Users },
  { href: "/material-order", label: "자재발주페이지", icon: Package },
  { href: "/work-log", label: "작업일지", icon: ClipboardList },
  { href: "/settlement", label: "정산", icon: Wallet },
  { href: "/statistics", label: "통계", icon: BarChart3 },
  { href: "/chat", label: "채팅", icon: MessageCircle },
  { href: "/admin", label: "관리", icon: Settings },
];

type MenuEntry = { id?: number; href: string; label: string; icon: React.ComponentType<{ className?: string }>; external?: boolean };

export function Header() {
  const [open, setOpen] = useState(false);
  const [customMenu, setCustomMenu] = useState<{ id: number; label: string; href: string }[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/company/custom-menu")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setCustomMenu(data) : setCustomMenu([])))
      .catch(() => setCustomMenu([]));
  }, []);
  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => setIsMaster(Boolean(data.company?.isMaster)))
      .catch(() => setIsMaster(false));
  }, []);

  const baseItems: MenuEntry[] = [
    ...defaultMenuItems.map((m) => ({ ...m, id: undefined })),
    ...(typeof process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL === "string" && process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL
      ? [{ href: process.env.NEXT_PUBLIC_KAKAO_CHANNEL_URL, label: "카카오톡 문의", icon: ExternalLink, id: undefined as number | undefined, external: true }]
      : []),
    ...(isMaster ? [{ href: "/admin/master", label: "마스터 관리", icon: Shield, id: undefined as number | undefined }] : []),
  ];
  const menuItems: MenuEntry[] = [
    ...baseItems,
    ...customMenu.map((m) => ({
      id: m.id,
      href: m.href,
      label: m.label,
      icon: Link2,
      external: /^https?:\/\//i.test(m.href),
    })),
  ];

  return (
    <header className="sticky top-0 z-20 flex min-h-[52px] sm:h-14 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-4 md:px-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 active:bg-gray-200 md:hidden"
        aria-label="메뉴 열기"
      >
        {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      <div className="flex flex-1 items-center justify-between md:ml-0">
        <h1 className="text-lg font-semibold text-gray-900">인테리어 올인원 ERP시스템</h1>
      </div>
      <div className="min-w-[44px] md:hidden" />

      {/* 모바일 메뉴 드로어 */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 pt-14 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        >
          <nav
            className="w-72 max-w-[85vw] border-r border-gray-200 bg-white shadow-lg overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="py-2">
              {menuItems.map(({ id, href, label, icon: Icon, external }) => (
                <li key={id != null ? `custom-${id}` : href}>
                  {external ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-4 min-h-[48px] text-sm",
                        "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-4 min-h-[48px] text-sm",
                        pathname === href
                          ? "bg-gray-100 font-medium text-gray-900"
                          : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
