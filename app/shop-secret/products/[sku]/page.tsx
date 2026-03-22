import type { Metadata } from "next";
import ProductDetailClient from "./ProductDetailClient";

export const metadata: Metadata = {
  title: "상품 상세 · 업자들의 비밀창고",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <ProductDetailClient sku={decodeURIComponent(sku)} />;
}
