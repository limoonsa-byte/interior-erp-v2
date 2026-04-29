"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Product = {
  sku: string;
  name: string;
  shopLine: string;
  category: string;
  brand: string;
  spec: string;
  unit: string;
  price: number;
  salePrice: number | null;
  stockStatus: string;
  imageUrl: string;
  productUrl: string;
  isActive: boolean;
  isHit?: boolean;
};

const SPEC_KEYS: { label: string; key: keyof Product }[] = [
  { label: "품목코드", key: "sku" },
  { label: "구분", key: "shopLine" },
  { label: "카테고리", key: "category" },
  { label: "브랜드", key: "brand" },
  { label: "규격", key: "spec" },
  { label: "단위", key: "unit" },
  { label: "재고상태", key: "stockStatus" },
];

export default function ProductDetailClient({ sku }: { sku: string }) {
  const searchParams = useSearchParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = (searchParams.get("token") || "").trim();
    const doLoad = async () => {
      if (token) {
        const verify = await fetch(`/api/company/shop-secret/verify?token=${encodeURIComponent(token)}`);
        if (!verify.ok) {
          const d = await verify.json().catch(() => ({}));
          setError((d as { error?: string }).error || "인증 실패");
          setLoading(false);
          return;
        }
      }
      const res = await fetch(`/api/company/shop-products/${encodeURIComponent(sku)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || "상품 조회 실패");
        setLoading(false);
        return;
      }
      setProduct((data as { product?: Product }).product ?? null);
      setLoading(false);
    };
    doLoad().catch(() => {
      setError("상품 조회 실패");
      setLoading(false);
    });
  }, [sku, searchParams]);

  const tokenSuffix = useMemo(() => {
    const t = (searchParams.get("token") || "").trim();
    return t ? `?token=${encodeURIComponent(t)}` : "";
  }, [searchParams]);

  const sale =
    product &&
    product.salePrice != null &&
    product.salePrice > 0 &&
    product.salePrice < product.price;
  const showPrice = product ? (sale ? product.salePrice! : product.price) : 0;

  return (
    <div className="p-4 pb-10 sm:p-6">
      <Link
        href={`/shop-secret${tokenSuffix}`}
        className="text-sm text-neutral-400 hover:text-amber-400 hover:underline"
      >
        ← 목록으로
      </Link>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">불러오는 중…</p>
      ) : error ? (
        <p className="mt-4 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</p>
      ) : !product ? (
        <p className="mt-4 text-sm text-neutral-500">상품이 없습니다.</p>
      ) : (
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-3">
              <div className="flex h-[320px] items-center justify-center overflow-hidden rounded-md bg-zinc-800">
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm text-zinc-500">이미지 없음</span>
                )}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-4">
              <h1 className="text-xl font-semibold text-white">
                {product.isHit ? (
                  <span className="mr-2 inline-block align-middle rounded border border-zinc-500 bg-zinc-800/80 px-1.5 py-0.5 text-xs font-medium text-zinc-200">
                    히트
                  </span>
                ) : null}
                {product.name}
              </h1>
              <p className="text-sm text-zinc-400">SKU: {product.sku}</p>
              {product.shopLine ? (
                <p className="text-sm text-zinc-400">
                  구분:{" "}
                  <span className="rounded border border-amber-800/60 bg-amber-950/50 px-1.5 py-0.5 text-amber-200">
                    {product.shopLine}
                  </span>
                </p>
              ) : null}
              <p className="text-sm text-zinc-400">카테고리: {product.category || "-"}</p>
              <p className="text-sm text-zinc-400">브랜드: {product.brand || "-"}</p>
              <p className="text-sm text-zinc-400">규격: {product.spec || "-"}</p>
              <p className="text-sm text-zinc-400">단위: {product.unit || "-"}</p>
              {sale ? (
                <div className="space-y-1">
                  <p className="text-2xl font-semibold text-white tabular-nums">
                    {showPrice.toLocaleString("ko-KR")}원
                  </p>
                  <p className="text-sm text-zinc-500 line-through tabular-nums">
                    정가 {product.price.toLocaleString("ko-KR")}원
                  </p>
                </div>
              ) : (
                <p className="text-2xl font-semibold text-white tabular-nums">
                  {showPrice.toLocaleString("ko-KR")}원
                </p>
              )}
              <p className="text-sm text-zinc-400">재고상태: {product.stockStatus || "-"}</p>
              {!product.isActive ? (
                <p className="text-sm font-medium text-amber-400/90">현재 비활성 상품입니다.</p>
              ) : null}
              {product.productUrl ? (
                <a
                  href={product.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-lg border border-amber-600/60 bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
                >
                  구매 링크 이동
                </a>
              ) : null}
            </div>
          </div>

          <section className="overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900/50">
            <h2 className="border-b border-zinc-700/80 bg-zinc-900/80 px-4 py-3 text-sm font-semibold text-zinc-200">
              상품정보
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {SPEC_KEYS.map(({ label, key }) => {
                  const raw = String(product[key] ?? "").trim();
                  const val = raw || "-";
                  return (
                    <tr key={label} className="border-b border-zinc-800 last:border-0">
                      <th className="w-[28%] shrink-0 bg-zinc-900/80 px-4 py-2.5 text-left font-normal text-zinc-500">
                        {label}
                      </th>
                      <td className="px-4 py-2.5 text-zinc-200">{val}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
