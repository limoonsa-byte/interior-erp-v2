"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  MessageSquare,
  FileText,
  Package,
  ClipboardList,
  Calendar,
  Signature,
  MessageCircle,
} from "lucide-react";
import { useHasConstructionPhase } from "@/hooks/useHasConstructionPhase";
import { isConstructionGatedHref } from "@/lib/constructionPhase";

const items = [
  { href: "/mobile/consulting", label: "상담", icon: MessageSquare },
  { href: "/mobile/estimate", label: "견적", icon: FileText },
  { href: "/mobile/contract", label: "계약", icon: Signature },
  { href: "/mobile/material-order", label: "발주", icon: Package },
  { href: "/mobile/work-log", label: "일지", icon: ClipboardList },
  { href: "/mobile/schedule", label: "일정", icon: Calendar },
  { href: "/mobile/chat", label: "채팅", icon: MessageCircle },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const hasConstructionPhase = useHasConstructionPhase();
  const visibleItems = items
    .filter((item) => hasConstructionPhase || !isConstructionGatedHref(item.href))
    .slice(0, 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(visibleItems.length, 1)}, minmax(0, 1fr))` }}
      >
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "relative flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  "active:bg-blue-50",
                  isActive ? "text-blue-700" : "text-gray-600"
                )}
              >
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-blue-600"
                  />
                ) : null}
                <Icon className={clsx("h-5 w-5", isActive ? "text-blue-700" : "text-gray-500")} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
