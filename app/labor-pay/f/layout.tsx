import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "인건비 지급 입력",
  description: "인건비 금액과 내용을 입력하는 링크입니다.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function LaborPayPublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
