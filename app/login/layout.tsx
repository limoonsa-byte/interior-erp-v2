import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인 | 인테리어 올인원 ERP시스템",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen min-h-[100dvh] w-full bg-gray-50"
      style={{ isolation: "isolate" }}
    >
      {children}
    </div>
  );
}
