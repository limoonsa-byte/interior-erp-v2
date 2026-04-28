"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { MessageSquare, FileText, Package, ClipboardList, Calendar } from "lucide-react";

const items = [
  { href: "/mobile/consulting", label: "상담", icon: MessageSquare },
  { href: "/mobile/estimate", label: "견적", icon: FileText },
  { href: "/mobile/material-order", label: "발주", icon: Package },
  { href: "/mobile/work-log", label: "일지", icon: ClipboardList },
  { href: "/mobile/schedule", label: "일정", icon: Calendar },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0px)] backdrop-blur">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={clsx(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  isActive ? "text-blue-700" : "text-gray-600"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
