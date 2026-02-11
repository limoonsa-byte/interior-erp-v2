"use client";

import { Header } from "@/components/layout/Header";
import { useSidebar } from "@/components/layout/SidebarContext";
import { clsx } from "clsx";

export function MainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={clsx(
        "transition-[margin] duration-200",
        collapsed ? "md:pl-[72px]" : "md:pl-64"
      )}
    >
      <Header />
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}
