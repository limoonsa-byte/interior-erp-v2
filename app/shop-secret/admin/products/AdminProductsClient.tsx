"use client";

import SecretWarehouseTitle from "@/components/shop-secret/SecretWarehouseTitle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminProductEditor from "./AdminProductEditor";

/** 일괄 하부 select: 목록에 없는 이름을 쓸 때 */
const BULK_CATEGORY_OTHER = "__OTHER__";

type TaxLine = { id: number; name: string; sortOrder: number };

type Product = {
  id: number;
  sku: string;
  name: string;
  shopLine: string;
  category: string;
  price: number;
  isActive: boolean;
  isHit: boolean;
  updatedAt: string;
};

export default function AdminProductsClient() {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string>("");
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [line, setLine] = useState(() => {
    const fromUrl = (searchParams.get("line") || "").trim();
    return fromUrl || "";
  });
  const [category, setCategory] = useState(() => (searchParams.get("category") || "").trim());
  const [taxonomyLines, setTaxonomyLines] = useState<TaxLine[]>([]);
  const [mergedSubNames, setMergedSubNames] = useState<string[]>([]);
  const [subMetaByName, setSubMetaByName] = useState<Map<string, number>>(() => new Map());
  const [taxTick, setTaxTick] = useState(0);
  const [newLineName, setNewLineName] = useState("");
  const [newSubName, setNewSubName] = useState("");
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);
  const [customLineDraft, setCustomLineDraft] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editor, setEditor] = useState<null | { mode: "create" } | { mode: "edit"; sku: string }>(null);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(() => new Set());
  const [bulkShopLine, setBulkShopLine] = useState("");
  const [bulkShopLineCustom, setBulkShopLineCustom] = useState("");
  const [bulkCategoryText, setBulkCategoryText] = useState("");
  const [bulkCategoryUseManual, setBulkCategoryUseManual] = useState(false);
  const [bulkCategoryClear, setBulkCategoryClear] = useState(false);
  const [bulkMergedSubNames, setBulkMergedSubNames] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hitSavingSku, setHitSavingSku] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const lineChangeSkipClear = useRef(true);

  const runVerify = useCallback(async () => {
    const token = (searchParams.get("token") || "").trim();
    if (!token) {
      setAuthReady(true);
      return;
    }
    const res = await fetch(`/api/company/shop-secret/verify?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAuthError((data as { error?: string }).error || "비밀 링크 인증 실패");
      setAuthReady(false);
      return;
    }
    setAuthReady(true);
  }, [searchParams]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (line.trim()) params.set("line", line.trim());
    if (category.trim()) params.set("category", category.trim());
    if (showInactive) params.set("includeInactive", "1");
    const res = await fetch(`/api/company/shop-products?${params.toString()}`, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAuthError((data as { error?: string }).error || "상품 조회 실패");
      setProducts([]);
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => ({ products: [], lines: [] }));
    setProducts(Array.isArray((data as { products?: unknown[] }).products) ? ((data as { products: Product[] }).products) : []);
    setLoading(false);
  }, [query, line, category, showInactive]);

  useEffect(() => {
    runVerify()
      .then(() => setAuthReady(true))
      .catch(() => setAuthError("비밀 링크 인증 실패"));
  }, [runVerify]);

  useEffect(() => {
    if (!authReady) return;
    loadProducts().catch(() => {});
  }, [authReady, loadProducts]);

  useEffect(() => {
    const valid = new Set(products.map((p) => p.sku));
    setSelectedSkus((prev) => new Set([...prev].filter((s) => valid.has(s))));
  }, [products]);

  const loadTaxonomyLines = useCallback(async () => {
    const r = await fetch("/api/company/shop-taxonomy/lines", { credentials: "include" });
    if (!r.ok) return;
    const d = (await r.json().catch(() => ({}))) as { lines?: TaxLine[] };
    setTaxonomyLines(Array.isArray(d.lines) ? d.lines : []);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    loadTaxonomyLines().catch(() => {});
  }, [authReady, loadTaxonomyLines]);

  useEffect(() => {
    if (lineChangeSkipClear.current) {
      lineChangeSkipClear.current = false;
      return;
    }
    setCategory("");
  }, [line]);

  useEffect(() => {
    if (!authReady || !line.trim()) {
      setMergedSubNames([]);
      setSubMetaByName(new Map());
      return;
    }
    let cancelled = false;
    const lineTrim = line.trim();
    Promise.all([
      fetch(`/api/company/shop-taxonomy/subcategories?line=${encodeURIComponent(lineTrim)}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { subcategories: [] })),
      fetch(`/api/company/shop-products?line=${encodeURIComponent(lineTrim)}&limit=500&includeInactive=1`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { products: [] })),
    ])
      .then(([subData, prodData]) => {
        if (cancelled) return;
        const subs = (subData as { subcategories?: { id: number; name: string }[] }).subcategories ?? [];
        const fromTaxNames = subs.map((s) => String(s.name ?? "").trim()).filter(Boolean);
        const idMap = new Map<string, number>();
        subs.forEach((s) => {
          const n = String(s.name ?? "").trim();
          if (n) idMap.set(n, s.id);
        });
        const setT = new Set(fromTaxNames);
        const prods = (prodData as { products?: Product[] }).products ?? [];
        const fromProd: string[] = [];
        prods.forEach((p) => {
          const c = p.category?.trim();
          if (c && !setT.has(c)) fromProd.push(c);
        });
        fromProd.sort((a, b) => a.localeCompare(b, "ko"));
        setMergedSubNames([...fromTaxNames, ...fromProd]);
        setSubMetaByName(idMap);
      })
      .catch(() => {
        if (!cancelled) {
          setMergedSubNames([]);
          setSubMetaByName(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, line, taxTick]);

  /** 일괄 작업: 구분 드롭다운 또는 직접입력 기준으로 하부 목록을 맞춤 */
  const bulkTargetLine = useMemo(() => {
    const custom = bulkShopLineCustom.trim();
    if (custom) return custom;
    if (bulkShopLine && bulkShopLine !== "__CLEAR__") return bulkShopLine.trim();
    return "";
  }, [bulkShopLineCustom, bulkShopLine]);

  useEffect(() => {
    if (!authReady || !bulkTargetLine) {
      setBulkMergedSubNames([]);
      return;
    }
    let cancelled = false;
    const lineTrim = bulkTargetLine;
    Promise.all([
      fetch(`/api/company/shop-taxonomy/subcategories?line=${encodeURIComponent(lineTrim)}`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { subcategories: [] })),
      fetch(`/api/company/shop-products?line=${encodeURIComponent(lineTrim)}&limit=500&includeInactive=1`, {
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : { products: [] })),
    ])
      .then(([subData, prodData]) => {
        if (cancelled) return;
        const subs = (subData as { subcategories?: { id: number; name: string }[] }).subcategories ?? [];
        const fromTaxNames = subs.map((s) => String(s.name ?? "").trim()).filter(Boolean);
        const setT = new Set(fromTaxNames);
        const prods = (prodData as { products?: Product[] }).products ?? [];
        const fromProd: string[] = [];
        prods.forEach((p) => {
          const c = p.category?.trim();
          if (c && !setT.has(c)) fromProd.push(c);
        });
        fromProd.sort((a, b) => a.localeCompare(b, "ko"));
        setBulkMergedSubNames([...fromTaxNames, ...fromProd]);
      })
      .catch(() => {
        if (!cancelled) setBulkMergedSubNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, bulkTargetLine, taxTick]);

  useEffect(() => {
    setBulkCategoryText("");
    setBulkCategoryUseManual(false);
  }, [bulkTargetLine]);

  const bumpTaxonomy = useCallback(() => setTaxTick((t) => t + 1), []);

  const categoriesWhenNoLine = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      if (p.category?.trim()) s.add(p.category.trim());
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
  }, [products]);

  const chipOn = "border-amber-500/90 bg-amber-950/60 text-amber-100";
  const chipOff = "border-zinc-600 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800";

  const filtered = useMemo(
    () => products.filter((p) => (showInactive ? true : p.isActive)),
    [products, showInactive]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selectedSkus.has(p.sku));
  const someFilteredSelected = filtered.some((p) => selectedSkus.has(p.sku));

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someFilteredSelected && !allFilteredSelected;
  }, [someFilteredSelected, allFilteredSelected]);

  /** 일괄 작업 하부 제안: 구분이 정해지면 해당 구분의 taxonomy·상품 하부만 */
  const bulkCategoryDatalistOptions = useMemo(() => {
    if (bulkTargetLine) {
      return [...bulkMergedSubNames].sort((a, b) => a.localeCompare(b, "ko"));
    }
    return categoriesWhenNoLine;
  }, [bulkTargetLine, bulkMergedSubNames, categoriesWhenNoLine]);

  const bulkCategorySelectValue = useMemo(() => {
    if (bulkCategoryUseManual) return BULK_CATEGORY_OTHER;
    const t = bulkCategoryText.trim();
    if (!t) return "";
    const hit = bulkCategoryDatalistOptions.find((o) => o === bulkCategoryText || o === t);
    if (hit) return hit;
    return BULK_CATEGORY_OTHER;
  }, [bulkCategoryUseManual, bulkCategoryText, bulkCategoryDatalistOptions]);

  const showBulkCategoryManual = bulkCategorySelectValue === BULK_CATEGORY_OTHER;

  const toggleSkuSelected = useCallback((sku: string) => {
    setSelectedSkus((prev) => {
      const n = new Set(prev);
      if (n.has(sku)) n.delete(sku);
      else n.add(sku);
      return n;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedSkus((prev) => {
      const n = new Set(prev);
      if (filtered.length > 0 && filtered.every((p) => n.has(p.sku))) {
        filtered.forEach((p) => n.delete(p.sku));
      } else {
        filtered.forEach((p) => n.add(p.sku));
      }
      return n;
    });
  }, [filtered]);

  const patchProductHit = useCallback(
    async (sku: string, isHit: boolean) => {
      setHitSavingSku(sku);
      try {
        const res = await fetch(`/api/company/shop-products/${encodeURIComponent(sku)}/hit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isHit }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "히트 저장 실패");
        await loadProducts();
      } catch (e) {
        alert(e instanceof Error ? e.message : "히트 저장 실패");
      } finally {
        setHitSavingSku(null);
      }
    },
    [loadProducts]
  );

  const batchDeleteSelected = useCallback(async () => {
    const skus = [...selectedSkus];
    if (skus.length === 0) {
      alert("선택된 상품이 없습니다.");
      return;
    }
    if (!window.confirm(`${skus.length}개 상품을 삭제할까요?`)) return;
    setBulkBusy(true);
    try {
      const r = await fetch("/api/company/shop-products/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, delete: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || "삭제 실패");
      setSelectedSkus(new Set());
      await loadProducts();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBulkBusy(false);
    }
  }, [selectedSkus, loadProducts]);

  const applyBulkLineCategory = useCallback(async () => {
    const skus = [...selectedSkus];
    if (skus.length === 0) {
      alert("선택된 상품이 없습니다.");
      return;
    }
    const patch: Record<string, string | null> = {};
    const customLine = bulkShopLineCustom.trim();
    if (customLine) patch.shopLine = customLine;
    else if (bulkShopLine === "__CLEAR__") patch.shopLine = null;
    else if (bulkShopLine.trim() !== "") patch.shopLine = bulkShopLine.trim();
    if (bulkCategoryClear) patch.category = null;
    else if (bulkCategoryText.trim() !== "") patch.category = bulkCategoryText.trim();
    if (Object.keys(patch).length === 0) {
      alert("구분 또는 하부(카테고리) 변경을 선택해 주세요.");
      return;
    }
    if (!window.confirm(`${skus.length}개 상품의 구분/하부를 변경할까요?`)) return;
    setBulkBusy(true);
    try {
      const r = await fetch("/api/company/shop-products/batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, patch }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || "적용 실패");
      setSelectedSkus(new Set());
      await loadProducts();
      bumpTaxonomy();
    } catch (e) {
      alert(e instanceof Error ? e.message : "적용 실패");
    } finally {
      setBulkBusy(false);
    }
  }, [selectedSkus, bulkShopLine, bulkShopLineCustom, bulkCategoryClear, bulkCategoryText, loadProducts, bumpTaxonomy]);

  const handleUpload = useCallback(async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    setUploadResult("");
    const res = await fetch("/api/company/shop-products/import-excel", {
      method: "POST",
      body: form,
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) {
      setUploadResult(`실패: ${(data as { error?: string }).error || "업로드 실패"}`);
      return;
    }
    const d = data as { totalRows?: number; success?: number; failed?: number; errors?: { row: number; reason: string }[] };
    let msg = `완료: 총 ${d.totalRows ?? 0}행, 성공 ${d.success ?? 0}, 실패 ${d.failed ?? 0}`;
    if (Array.isArray(d.errors) && d.errors.length > 0) {
      const sample = d.errors
        .slice(0, 5)
        .map((e) => `${e.row}행 ${e.reason}`)
        .join(" · ");
      msg += ` — ${sample}${d.errors.length > 5 ? " …" : ""}`;
    }
    setUploadResult(msg);
    loadProducts().catch(() => {});
    loadTaxonomyLines().catch(() => {});
  }, [loadProducts, loadTaxonomyLines]);

  const downloadShopExcel = useCallback(async (template: boolean) => {
    setUploadResult("");
    const url = template ? "/api/company/shop-products/export-excel?template=1" : "/api/company/shop-products/export-excel";
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadResult(`다운로드 실패: ${(err as { error?: string }).error || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      let fname = template ? "shop-product-template.xlsx" : "shop-products.xlsx";
      const star = cd?.match(/filename\*=UTF-8''([^;\s]+)/);
      if (star?.[1]) {
        try {
          fname = decodeURIComponent(star[1]);
        } catch {
          /* keep default */
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      setUploadResult("다운로드 중 오류가 났습니다.");
    }
  }, []);

  const addTaxonomyLine = useCallback(async () => {
    const name = newLineName.trim();
    if (!name) return;
    setTaxonomyBusy(true);
    try {
      const r = await fetch("/api/company/shop-taxonomy/lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || "추가 실패");
      setNewLineName("");
      await loadTaxonomyLines();
      await loadProducts();
      bumpTaxonomy();
    } catch (e) {
      alert(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setTaxonomyBusy(false);
    }
  }, [newLineName, loadTaxonomyLines, loadProducts, bumpTaxonomy]);

  const deleteTaxonomyLine = useCallback(
    async (id: number, name: string) => {
      if (!window.confirm(`구분「${name}」을 삭제할까요? 이 구분의 하부 항목도 함께 삭제됩니다.`)) return;
      setTaxonomyBusy(true);
      try {
        const r = await fetch(`/api/company/shop-taxonomy/lines?id=${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error || "삭제 실패");
        if (line === name) setLine("");
        await loadTaxonomyLines();
        await loadProducts();
        bumpTaxonomy();
      } catch (e) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      } finally {
        setTaxonomyBusy(false);
      }
    },
    [line, loadTaxonomyLines, loadProducts, bumpTaxonomy]
  );

  const addSubcategory = useCallback(async () => {
    const name = newSubName.trim();
    const lineTrim = line.trim();
    if (!name || !lineTrim) return;
    setTaxonomyBusy(true);
    try {
      const r = await fetch("/api/company/shop-taxonomy/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line: lineTrim, name }),
        credentials: "include",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error || "추가 실패");
      setNewSubName("");
      bumpTaxonomy();
    } catch (e) {
      alert(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setTaxonomyBusy(false);
    }
  }, [newSubName, line, bumpTaxonomy]);

  const deleteSubcategory = useCallback(
    async (id: number, name: string) => {
      if (!window.confirm(`하부「${name}」을 삭제할까요?`)) return;
      setTaxonomyBusy(true);
      try {
        const r = await fetch(`/api/company/shop-taxonomy/subcategories?id=${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string }).error || "삭제 실패");
        if (category === name) setCategory("");
        bumpTaxonomy();
      } catch (e) {
        alert(e instanceof Error ? e.message : "삭제 실패");
      } finally {
        setTaxonomyBusy(false);
      }
    },
    [category, bumpTaxonomy]
  );

  return (
    <div className="space-y-4 p-4 pb-10 sm:p-6">
      <AdminProductEditor
        open={editor != null}
        mode={editor?.mode === "edit" ? "edit" : "create"}
        editSku={editor?.mode === "edit" ? editor.sku : null}
        onClose={() => setEditor(null)}
        onSaved={() => {
          loadProducts().catch(() => {});
          loadTaxonomyLines().catch(() => {});
        }}
      />
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <SecretWarehouseTitle size="lg" />
        <span className="pb-1 text-lg font-medium text-zinc-500">· 상품관리</span>
      </div>
      <p className="text-xs text-neutral-500">
        관리자 전용 · 상품을 직접 등록·수정·삭제하거나, 아래 엑셀로 일괄 반영할 수 있습니다. 주소:{" "}
        <code className="rounded border border-zinc-700 bg-zinc-900 px-1 text-zinc-300">/shop-secret/admin/products</code>
      </p>
      <p className="text-sm text-zinc-400">
        <span className="font-medium text-zinc-300">엑셀 1행</span>은 아래 한글 헤더(양식 다운로드와 동일) 또는 영문{" "}
        <code className="rounded border border-zinc-700 bg-zinc-900 px-1 text-xs text-zinc-300">
          sku,name,shop_line,category,brand,spec,unit,price,sale_price,…
        </code>{" "}
        모두 됩니다. 필수: <span className="text-zinc-300">품목코드·상품명·정가</span>. 같은 품목코드면 업로드 시 수정(덮어쓰기)됩니다. 구분·하부는 관리 화면과 동일하게 쓰면 필터에 맞습니다.{" "}
        <span className="text-zinc-500">히트(Y/N) 열은 선택이며, 열이 없으면 기존 히트 설정을 유지합니다.</span>
      </p>
      {authError && (
        <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{authError}</div>
      )}
      <div className="space-y-3 rounded-lg border border-zinc-700/80 bg-zinc-900/50 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <div className="min-w-0 shrink-0">
            <p className="text-xs font-medium text-zinc-300">엑셀·CSV 일괄 반영</p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              양식을 받아 채운 뒤 「파일 선택」으로 올리면 추가·수정됩니다. 목록을 받아 수정 후 다시 올려도 됩니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadShopExcel(true).catch(() => {})}
              className="rounded border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              양식 다운로드
            </button>
            <button
              type="button"
              onClick={() => downloadShopExcel(false).catch(() => {})}
              className="rounded border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700"
            >
              상품 목록 엑셀 받기
            </button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              aria-label="상품 일괄 반영용 엑셀 또는 CSV 파일 선택"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file).catch(() => {});
                e.target.value = "";
              }}
              className="text-sm text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-2 file:py-1 file:text-sm file:text-zinc-100"
            />
          </div>
          {uploading && <span className="text-sm text-zinc-500">업로드 중…</span>}
          {uploadResult && <span className="w-full text-sm text-zinc-300">{uploadResult}</span>}
        </div>
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-zinc-500">
            <span className="font-medium text-zinc-400">구분 칩</span>은 여기서 추가한 것만 보입니다. 엑셀에만 있는 구분으로 보려면 아래「목록에만 있는 구분으로만 필터」에 입력하세요. ×는 구분 삭제입니다.
          </p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
            <span className="shrink-0 text-xs font-medium text-zinc-500">구분</span>
            <button
              type="button"
              onClick={() => setLine("")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!line.trim() ? chipOn : chipOff}`}
            >
              전체
            </button>
            {taxonomyLines.map((tl) => (
              <span
                key={tl.id}
                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border pl-2.5 pr-1 py-0.5 text-xs font-medium ${
                  line === tl.name ? chipOn : chipOff
                }`}
              >
                <button type="button" onClick={() => setLine(tl.name)} className="max-w-[8rem] truncate py-0.5 text-left" title={tl.name}>
                  {tl.name}
                </button>
                <button
                  type="button"
                  disabled={taxonomyBusy}
                  onClick={() => deleteTaxonomyLine(tl.id, tl.name).catch(() => {})}
                  className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-black/20 hover:text-red-300 disabled:opacity-40"
                  title="구분 삭제"
                  aria-label={`${tl.name} 삭제`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-zinc-700/60 pt-2">
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className="text-xs text-zinc-500">구분 추가</span>
              <div className="flex flex-wrap gap-1">
                <input
                  value={newLineName}
                  onChange={(e) => setNewLineName(e.target.value)}
                  placeholder="새 구분 이름"
                  className="min-w-[8rem] flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  disabled={taxonomyBusy || !newLineName.trim()}
                  onClick={() => addTaxonomyLine().catch(() => {})}
                  className="rounded border border-amber-700/40 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-950/50 disabled:opacity-40"
                >
                  추가
                </button>
              </div>
            </div>
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className="text-xs text-zinc-500">목록에만 있는 구분으로만 필터</span>
              <div className="flex flex-wrap gap-1">
                <input
                  value={customLineDraft}
                  onChange={(e) => setCustomLineDraft(e.target.value)}
                  placeholder="예: 엑셀에만 있는 구분"
                  className="min-w-[8rem] flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = customLineDraft.trim();
                    if (t) setLine(t);
                  }}
                  className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
          {line.trim() ? (
            <div className="space-y-2 border-t border-zinc-700/60 pt-2">
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
                <span className="shrink-0 text-xs font-medium text-zinc-500">하부</span>
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!category.trim() ? chipOn : chipOff}`}
                >
                  전체
                </button>
                {mergedSubNames.map((c) => {
                  const subId = subMetaByName.get(c);
                  const isTax = subId != null;
                  return (
                    <span
                      key={c}
                      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border pl-2.5 pr-1 py-0.5 text-xs font-medium ${
                        category === c ? chipOn : isTax ? chipOff : "border-dashed border-zinc-500 bg-zinc-900/40 text-zinc-400"
                      }`}
                    >
                      <button type="button" onClick={() => setCategory(c)} className="max-w-[7rem] truncate py-0.5 text-left" title={c}>
                        {c}
                      </button>
                      {isTax ? (
                        <button
                          type="button"
                          disabled={taxonomyBusy}
                          onClick={() => deleteSubcategory(subId, c).catch(() => {})}
                          className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-black/20 hover:text-red-300 disabled:opacity-40"
                          title="하부 삭제"
                          aria-label={`${c} 삭제`}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <span className="text-xs text-zinc-500">「{line}」에 하부 추가</span>
                <input
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="예: 각재, 판재…"
                  className="min-w-[8rem] rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  disabled={taxonomyBusy || !newSubName.trim()}
                  onClick={() => addSubcategory().catch(() => {})}
                  className="rounded border border-amber-700/40 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-950/50 disabled:opacity-40"
                >
                  하부 추가
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 border-t border-zinc-700/60 pt-2">
              <span className="shrink-0 text-xs font-medium text-zinc-500">하부</span>
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!category.trim() ? chipOn : chipOff}`}
              >
                전체
              </button>
              {categoriesWhenNoLine.map((c) => (
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
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-700/60 pt-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품명·SKU 검색"
              className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
            <label className="inline-flex items-center gap-1 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
              />
              비활성 포함
            </label>
            <button
              type="button"
              onClick={() => loadProducts().catch(() => {})}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
            >
              조회
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className="rounded-lg border border-amber-600/60 bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500"
          >
            상품 추가
          </button>
        </div>
        <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/40 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-300">목록에서 선택 후 일괄 작업</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-400">
                선택 <span className="font-semibold text-zinc-200">{selectedSkus.size}</span>개
              </span>
              <button
                type="button"
                disabled={bulkBusy || selectedSkus.size === 0}
                onClick={() => batchDeleteSelected().catch(() => {})}
                className="rounded border border-red-900/50 bg-red-950/30 px-2.5 py-1 text-xs font-medium text-red-200 hover:bg-red-950/50 disabled:opacity-40"
              >
                선택 삭제
              </button>
            </div>
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto border-t border-zinc-800 pt-3 [-ms-overflow-style:none] [scrollbar-width:thin] lg:border-t-0 lg:pt-0 [&::-webkit-scrollbar]:h-1">
              <span className="shrink-0 text-xs text-zinc-500" title="대분류(구분)으로 옮기기">
                구분
              </span>
              <select
                value={bulkShopLine}
                disabled={bulkBusy}
                onChange={(e) => setBulkShopLine(e.target.value)}
                className="shrink-0 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50 min-w-[8.5rem] max-w-[11rem]"
              >
                <option value="">— 변경 안 함 —</option>
                <option value="__CLEAR__">— 비우기 —</option>
                {taxonomyLines.map((tl) => (
                  <option key={tl.id} value={tl.name}>
                    {tl.name}
                  </option>
                ))}
              </select>
              <input
                value={bulkShopLineCustom}
                disabled={bulkBusy}
                onChange={(e) => setBulkShopLineCustom(e.target.value)}
                title="직접 입력 시 위 구분 선택보다 우선 적용됩니다."
                placeholder="직접 입력"
                className="w-28 shrink-0 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 disabled:opacity-50 sm:w-32"
              />
              <span className="shrink-0 text-xs text-zinc-500" title="하부(카테고리)">
                하부
              </span>
              <select
                value={bulkCategoryClear ? "" : bulkCategorySelectValue}
                disabled={bulkBusy || bulkCategoryClear || !bulkTargetLine}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || v === BULK_CATEGORY_OTHER) setBulkCategoryText("");
                  else setBulkCategoryText(v);
                }}
                title={
                  bulkTargetLine
                    ? `「${bulkTargetLine}」에 등록된 하부에서 선택`
                    : "구분(또는 직접 입력)을 먼저 정해 주세요."
                }
                className="min-w-[6.5rem] max-w-[10rem] shrink rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50 sm:min-w-[8rem] sm:max-w-[12rem]"
              >
                <option value="">{bulkTargetLine ? "— 이름 선택 —" : "— 구분 먼저 —"}</option>
                {bulkCategoryDatalistOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={BULK_CATEGORY_OTHER}>직접 입력…</option>
              </select>
              {showBulkCategoryManual && !bulkCategoryClear && bulkTargetLine ? (
                <input
                  value={bulkCategoryText}
                  disabled={bulkBusy}
                  onChange={(e) => setBulkCategoryText(e.target.value)}
                  placeholder="하부 이름"
                  title="목록에 없을 때 직접 입력"
                  className="w-24 min-w-[5rem] max-w-[9rem] shrink rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 disabled:opacity-50 sm:w-28"
                />
              ) : null}
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={bulkCategoryClear}
                  disabled={bulkBusy}
                  onChange={(e) => {
                    setBulkCategoryClear(e.target.checked);
                    if (e.target.checked) {
                      setBulkCategoryText("");
                      setBulkCategoryUseManual(false);
                    }
                  }}
                  className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
                />
                하부 비우기
              </label>
              <button
                type="button"
                disabled={bulkBusy || selectedSkus.size === 0}
                onClick={() => applyBulkLineCategory().catch(() => {})}
                className="shrink-0 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
              >
                구분/하부 적용
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-700/80 bg-zinc-900/40">
        <table className="w-full text-left text-sm text-zinc-200">
          <thead className="border-b border-zinc-700/80 bg-zinc-900/80 text-zinc-400">
            <tr>
              <th className="w-10 p-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allFilteredSelected && filtered.length > 0}
                  disabled={loading || filtered.length === 0 || bulkBusy}
                  onChange={() => toggleSelectAllFiltered()}
                  aria-label="현재 목록 전체 선택"
                  className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
                />
              </th>
              <th className="p-2">SKU</th>
              <th className="p-2">상품명</th>
              <th className="p-2">구분</th>
              <th className="p-2">카테고리</th>
              <th className="p-2 text-right">가격</th>
              <th className="p-2">상태</th>
              <th className="p-2">수정시각</th>
              <th className="w-28 p-2">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-zinc-500">
                  불러오는 중…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-zinc-500">
                  상품이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-800/40">
                  <td className="p-2 align-middle">
                    <input
                      type="checkbox"
                      checked={selectedSkus.has(p.sku)}
                      disabled={bulkBusy}
                      onChange={() => toggleSkuSelected(p.sku)}
                      aria-label={`${p.sku} 선택`}
                      className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
                    />
                  </td>
                  <td className="p-2 font-mono text-xs text-zinc-300">{p.sku}</td>
                  <td className="p-2 text-zinc-100">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(p.isHit)}
                        disabled={bulkBusy || hitSavingSku === p.sku}
                        onChange={(e) => {
                          patchProductHit(p.sku, e.target.checked).catch(() => {});
                        }}
                        aria-label={`${p.name} 히트 상단 노출`}
                        title="히트(목록·비밀몰 상단)"
                        className="shrink-0 rounded border-zinc-500 bg-zinc-950 text-amber-600"
                      />
                      <span className="min-w-0">{p.name}</span>
                    </div>
                  </td>
                  <td className="p-2">{p.shopLine || "-"}</td>
                  <td className="p-2">{p.category || "-"}</td>
                  <td className="p-2 text-right tabular-nums">{p.price.toLocaleString("ko-KR")}원</td>
                  <td className="p-2">{p.isActive ? "활성" : "비활성"}</td>
                  <td className="whitespace-nowrap p-2 text-zinc-400">{String(p.updatedAt).slice(0, 16).replace("T", " ")}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setEditor({ mode: "edit", sku: p.sku })}
                        className="rounded border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-100 hover:bg-zinc-700"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`SKU "${p.sku}" 상품을 삭제할까요?`)) return;
                          fetch(`/api/company/shop-products/${encodeURIComponent(p.sku)}`, { method: "DELETE" })
                            .then(async (r) => {
                              const d = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error((d as { error?: string }).error || "삭제 실패");
                            })
                            .then(() => loadProducts().catch(() => {}))
                            .catch((e) => alert(e instanceof Error ? e.message : "삭제 실패"));
                        }}
                        className="rounded border border-red-900/50 bg-red-950/30 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950/50"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
