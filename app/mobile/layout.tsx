import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { MobileTopMenu } from "@/components/layout/MobileTopMenu";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ paddingBottom: "calc(64px + env(safe-area-inset-bottom))" }}
    >
      <header
        className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <MobileTopMenu />
      </header>
      <main className="min-w-0 p-3">{children}</main>
      <MobileBottomNav />
    </div>
  );
}
