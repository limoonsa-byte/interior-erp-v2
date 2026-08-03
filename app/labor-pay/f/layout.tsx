import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "결제 금액 입력",
  description: "결제 금액과 내용을 입력하는 링크입니다.",
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
