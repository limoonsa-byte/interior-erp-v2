import type { ReactNode } from "react";

/** 비밀창고: 검정 바탕 + 밝은 글자 */
export default function ShopSecretLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased selection:bg-amber-900/50 selection:text-amber-50">
      {children}
    </div>
  );
}
