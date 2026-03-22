import type { Metadata, Viewport } from "next";

const signTitle = "계약서 서명하기";
const signDescription = "계약서 서명 링크입니다. 링크를 열어 서명을 진행해 주세요.";

export const metadata: Metadata = {
  title: signTitle,
  description: signDescription,
  openGraph: {
    title: signTitle,
    description: signDescription,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: signTitle,
    description: signDescription,
  },
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
