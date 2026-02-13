"use client";

import { Header } from "@/components/layout/Header";
import { useSidebar } from "@/components/layout/SidebarContext";
import { clsx } from "clsx";

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={clsx(
        "min-w-0 flex-1 transition-[margin] duration-200",
        collapsed ? "md:pl-[72px]" : "md:pl-64"
      )}
    >
      <Header />
      <main className="min-w-0 p-3 sm:p-4 md:p-6">{children}</main>
    </div>
  );
}
