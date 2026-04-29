"use client";

import SecretWarehouseTitle from "@/components/shop-secret/SecretWarehouseTitle";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  sku: string;
  name: string;
  category: string;
  brand: string;
  spec: string;
  price: number;
  salePrice: number | null;
  imageUrl: string;
  stockStatus: string;
  shopLine: string;
  isHit?: boolean;
};

type SortKey = "recent" | "priceAsc" | "priceDesc" | "name";

function effectivePrice(p: Product): number {
  return p.salePrice != null && p.salePrice > 0 ? p.salePrice : p.price;
}

export default function ShopSecretListClient() {
  const searchParams = useSearchParams();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [line, setLine] = useState(() => (searchParams.get("line") || "").trim());
  const [lineChips, setLineChips] = useState<string[]>([]);
  const [lineSubCategories, setLineSubCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const verifyByToken = useCallback(async () => {
    const token = (searchParams.get("token") || "").trim();
    if (!token) return;
    const res = await fetch(`/api/company/shop-secret/verify?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "인증 실패");
    }
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category.trim()) params.set("category", category.trim());
    if (line.trim()) params.set("line", line.trim());
    params.set("includeLines", "1");
    const res = await fetch(`/api/company/shop-products?${params.toString()}`, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAuthError((data as { error?: string }).error || "상품 조회 실패");
      setProducts([]);
      setLineChips([]);
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({ products: [], lines: [] }));
    setProducts(Array.isArray((data as { products?: unknown[] }).products) ? ((data as { products: Product[] }).products) : []);
    const lines = (data as { lines?: unknown }).lines;
    setLineChips(Array.isArray(lines) ? (lines as string[]).map((s) => String(s).trim()).filter(Boolean) : []);
    setLoading(false);
  }, [query, category, line]);

  useEffect(() => {
    verifyByToken()
      .then(() => {
        setAuthReady(true);
      })
      .catch((e) => {
        setAuthError(e instanceof Error ? e.message : "비밀 링크 인증 실패");
      });
  }, [verifyByToken]);

  useEffect(() => {
    if (!authReady) return;
    queueMicrotask(() => {
      void load().catch(() => {});
    });
  }, [authReady, load]);

  useEffect(() => {
    queueMicrotask(() => setCategory(""));
  }, [line]);

  useEffect(() => {
    if (!authReady || !line.trim()) {
      queueMicrotask(() => setLineSubCategories([]));
      return;
    }
    let cancelled = false;
    const lineTrim = line.trim();
    Promise.all([
      fetch(`/api/company/shop-taxonomy/subcategories?line=${encodeURIComponent(lineTrim)}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { subcategories: [] })),
      fetch(`/api/company/shop-products?line=${encodeURIComponent(lineTrim)}&limit=500`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : { products: [] }
      ),
    ])
      .then(([subData, prodData]) => {
        if (cancelled) return;
        const subs = (subData as { subcategories?: { name: string }[] }).subcategories ?? [];
        const fromTax = subs.map((s) => String(s.name ?? "").trim()).filter(Boolean);
        const setT = new Set(fromTax);
        const prods = (prodData as { products?: Product[] }).products ?? [];
        const fromProd: string[] = [];
        prods.forEach((p) => {
          const c = p.category?.trim();
          if (c && !setT.has(c)) fromProd.push(c);
        });
        fromProd.sort((a, b) => a.localeCompare(b, "ko"));
        setLineSubCategories([...fromTax, ...fromProd]);
      })
      .catch(() => {
        if (!cancelled) setLineSubCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, line]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set.values());
  }, [products]);

  const sortedProducts = useMemo(() => {
    const withIdx = products.map((p, i) => ({ p, i }));
    const hitFirst = (a: { p: Product; i: number }, b: { p: Product; i: number }) => {
      const ah = a.p.isHit ? 1 : 0;
      const bh = b.p.isHit ? 1 : 0;
      if (bh !== ah) return bh - ah;
      return 0;
    };
    withIdx.sort((a, b) => {
      const hf = hitFirst(a, b);
      if (hf !== 0) return hf;
      if (sortBy === "recent") return a.i - b.i;
      if (sortBy === "priceAsc") {
        return effectivePrice(a.p) - effectivePrice(b.p) || a.p.name.localeCompare(b.p.name, "ko");
      }
      if (sortBy === "priceDesc") {
        return effectivePrice(b.p) - effectivePrice(a.p) || a.p.name.localeCompare(b.p.name, "ko");
      }
      return a.p.name.localeCompare(b.p.name, "ko");
    });
    return withIdx.map(({ p }) => p);
  }, [products, sortBy]);

  const tokenSuffix = useMemo(() => {
    const t = (searchParams.get("token") || "").trim();
    return t ? `?token=${encodeURIComponent(t)}` : "";
  }, [searchParams]);

  const chipOn = "border-amber-500/90 bg-amber-950/60 text-amber-100";
  const chipOff = "border-zinc-600 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800";

  return (
    <div className="space-y-4 p-4 pb-10 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
          <SecretWarehouseTitle size="lg" />
          <Link
            href={`/shop-secret/about${tokenSuffix}`}
            className="shrink-0 pb-0.5 text-xs text-neutral-500 hover:text-amber-400 hover:underline"
          >
            소개
          </Link>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => fetch("/api/company/shop-secret/logout", { method: "POST" }).finally(() => location.reload())}
            className="rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            세션 종료
          </button>
          <div className="flex w-[min(100vw-2rem,18rem)] flex-col gap-1.5 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품명·SKU 검색"
              className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 sm:w-36"
            />
            {!line ? (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-zinc-600 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100 sm:w-auto sm:min-w-[6.5rem]"
              >
                <option value="">전체 카테고리</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => load().catch(() => {})}
                className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-700"
              >
                조회
              </button>
              <span className="text-[10px] text-zinc-500">정렬</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded border border-zinc-600 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-100"
              >
                <option value="recent">최신순</option>
                <option value="priceAsc">낮은 가격</option>
                <option value="priceDesc">높은 가격</option>
                <option value="name">상품명</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {authError && (
        <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{authError}</div>
      )}

      <div className="space-y-3 rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-3">
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
          <span className="shrink-0 text-xs font-medium text-neutral-500">구분</span>
          <button
            type="button"
            onClick={() => setLine("")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!line ? chipOn : chipOff}`}
          >
            전체
          </button>
          {lineChips.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setLine(preset)}
              className={`max-w-[10rem] shrink-0 truncate rounded-full border px-3 py-1 text-xs font-medium ${line === preset ? chipOn : chipOff}`}
              title={preset}
            >
              {preset}
            </button>
          ))}
        </div>

        {line ? (
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
            <span className="shrink-0 text-xs font-medium text-neutral-500">하부</span>
            <button
              type="button"
              onClick={() => setCategory("")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!category ? chipOn : chipOff}`}
            >
              전체
            </button>
            {lineSubCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`max-w-[9rem] shrink-0 truncate rounded-full border px-3 py-1 text-xs font-medium ${category === c ? chipOn : chipOff}`}
                title={c}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">
        상품 <span className="font-medium text-zinc-300">{sortedProducts.length}</span>개
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {loading ? (
          <p className="col-span-full text-sm text-neutral-500">불러오는 중…</p>
        ) : sortedProducts.length === 0 ? (
          <p className="col-span-full text-sm text-neutral-500">표시할 상품이 없습니다.</p>
        ) : (
          sortedProducts.map((p) => {
            const sale = p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price;
            const show = effectivePrice(p);
            return (
              <Link
                href={`/shop-secret/products/${encodeURIComponent(p.sku)}${tokenSuffix}`}
                key={p.id}
                className="flex min-w-0 flex-col rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-2 hover:border-amber-800/50"
              >
                <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-md bg-zinc-800">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-zinc-500">
                      이미지 없음
                    </span>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-snug text-zinc-100">
                  {p.isHit ? (
                    <span className="mr-1 inline-block shrink-0 rounded border border-zinc-500 bg-zinc-800/80 px-1 py-0 align-middle text-[9px] font-medium text-zinc-200">
                      히트
                    </span>
                  ) : null}
                  {p.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                  {p.shopLine ? (
                    <span className="rounded border border-amber-800/60 bg-amber-950/50 px-1 py-0.5 text-[9px] font-medium text-amber-200">
                      {p.shopLine}
                    </span>
                  ) : null}
                  {p.category || p.brand ? (
                    <span className="line-clamp-1 min-w-0 text-[10px] text-zinc-500">
                      {[p.category, p.brand].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-auto pt-0.5">
                  {sale ? (
                    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
                      <span className="text-[11px] font-semibold tabular-nums text-white">{show.toLocaleString("ko-KR")}원</span>
                      <span className="text-[9px] tabular-nums text-zinc-500 line-through">{p.price.toLocaleString("ko-KR")}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] font-semibold tabular-nums text-white">
                      {show.toLocaleString("ko-KR")}원
                    </p>
                  )}
                </div>
                {p.stockStatus ? <p className="line-clamp-1 text-[10px] text-zinc-500">{p.stockStatus}</p> : null}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
