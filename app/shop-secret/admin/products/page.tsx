import type { Metadata } from "next";
import AdminProductsClient from "./AdminProductsClient";

export const metadata: Metadata = {
  title: "상품관리 · 업자들의 비밀창고",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminProductsClient />;
}
