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
};

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
    setCategory("");
  }, [line]);

  useEffect(() => {
    if (!authReady || !line.trim()) {
      setLineSubCategories([]);
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

  /** 상세·소개로 갈 때 token 유지 (쿠키 미설정 환경 대비) */
  const tokenSuffix = useMemo(() => {
    const t = (searchParams.get("token") || "").trim();
    return t ? `?token=${encodeURIComponent(t)}` : "";
  }, [searchParams]);

  const chipOn = "border-amber-500/90 bg-amber-950/60 text-amber-100";
  const chipOff = "border-zinc-600 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800";

  return (
    <div className="p-4 sm:p-6 space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <SecretWarehouseTitle size="lg" />
          <Link
            href={`/shop-secret/about${tokenSuffix}`}
            className="shrink-0 pb-0.5 text-xs text-neutral-500 hover:text-amber-400 hover:underline"
          >
            소개
          </Link>
        </div>
        <button
          type="button"
          onClick={() => fetch("/api/company/shop-secret/logout", { method: "POST" }).finally(() => location.reload())}
          className="rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          세션 종료
        </button>
      </div>
      {authError && (
        <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{authError}</div>
      )}
      <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-3 space-y-3">
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
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border max-w-[10rem] truncate ${line === preset ? chipOn : chipOff}`}
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
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border max-w-[9rem] truncate ${category === c ? chipOn : chipOff}`}
                title={c}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명/sku 검색"
            className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
          />
          {!line ? (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
            >
              <option value="">전체 카테고리</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : null}
          <button
            onClick={() => load().catch(() => {})}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
          >
            조회
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {loading ? (
          <p className="col-span-full text-sm text-neutral-500">불러오는 중…</p>
        ) : products.length === 0 ? (
          <p className="col-span-full text-sm text-neutral-500">표시할 상품이 없습니다.</p>
        ) : (
          products.map((p) => (
            <Link
              href={`/shop-secret/products/${encodeURIComponent(p.sku)}${tokenSuffix}`}
              key={p.id}
              className="flex flex-col rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-2 min-w-0 hover:border-amber-800/50"
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
              <p className="mt-1.5 text-xs font-medium leading-snug text-zinc-100 line-clamp-2 min-h-[2.25rem]">{p.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                {p.shopLine ? (
                  <span className="rounded border border-amber-800/60 bg-amber-950/50 px-1 py-0.5 text-[9px] font-medium text-amber-200">
                    {p.shopLine}
                  </span>
                ) : null}
                {p.category || p.brand ? (
                  <span className="text-[10px] text-zinc-500 line-clamp-1 min-w-0">
                    {[p.category, p.brand].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </div>
              <p className="mt-auto pt-0.5 text-[11px] font-semibold text-white tabular-nums">
                {(p.salePrice ?? p.price).toLocaleString("ko-KR")}원
              </p>
              {p.stockStatus ? <p className="text-[10px] text-zinc-500 line-clamp-1">{p.stockStatus}</p> : null}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
