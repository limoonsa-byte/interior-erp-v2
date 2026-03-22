import type { Metadata } from "next";
import SecretWarehouseTitle from "@/components/shop-secret/SecretWarehouseTitle";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개 · 업자들의 비밀창고",
  robots: { index: false, follow: false },
};

export default async function ShopSecretAboutPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token.trim() : "";
  const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : "";

  return (
    <div className="px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-md">
        <Link
          href={`/shop-secret${tokenSuffix}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-amber-400"
        >
          <span aria-hidden>←</span> 상품 목록
        </Link>

        <div className="mt-6 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-lg shadow-black/40 sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-500/90">비밀 링크 전용</p>
          <div className="mt-2">
            <SecretWarehouseTitle size="md" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-neutral-300">
            시공·자재 업체를 위한 상품 안내 공간입니다. 발급받은 링크로만 들어올 수 있고, 노출 상품과 가격은 업체 정책에 맞춰 제공됩니다.
          </p>

          <ul className="mt-5 space-y-2 border-t border-zinc-700/80 pt-5 text-sm text-neutral-400">
            <li className="flex gap-2">
              <span className="text-amber-500" aria-hidden>
                ·
              </span>
              <span>목록에서 구분·카테고리로 상품을 찾을 수 있습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-amber-500" aria-hidden>
                ·
              </span>
              <span>문의·견적·납기는 소속 업체 담당자에게 연락해 주세요.</span>
            </li>
          </ul>

          <div className="mt-8">
            <Link
              href={`/shop-secret${tokenSuffix}`}
              className="inline-flex w-full items-center justify-center rounded-lg border border-amber-600/60 bg-amber-600 px-4 py-3 text-sm font-medium text-neutral-950 hover:bg-amber-500 sm:w-auto sm:px-6"
            >
              상품 보러 가기
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">이 페이지는 검색엔진에 노출되지 않습니다.</p>
      </div>
    </div>
  );
}
