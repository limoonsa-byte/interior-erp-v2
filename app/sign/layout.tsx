import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "계약서 서명 | 인테리어 올인원 ERP",
  description: "계약서 서명 페이지",
};

/** 모바일·시크릿 모드에서도 항상 밝은 배경·진한 글자로 표시 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function SignLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
