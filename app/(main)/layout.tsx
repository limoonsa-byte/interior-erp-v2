import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { RightPanelProvider } from "@/components/layout/RightPanelContext";
import { ProgressPanel } from "@/components/layout/ProgressPanel";
import { MainContent } from "@/components/layout/MainContent";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <RightPanelProvider>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <MainContent>{children}</MainContent>
          <ProgressPanel />
        </div>
      </RightPanelProvider>
    </SidebarProvider>
  );
}
