"use client";

import { useCallback, useEffect, useState } from "react";

export type EditorProductForm = {
  sku: string;
  name: string;
  shopLine: string;
  category: string;
  brand: string;
  spec: string;
  unit: string;
  price: string;
  salePrice: string;
  stockStatus: string;
  imageUrl: string;
  productUrl: string;
  isActive: boolean;
  isHit: boolean;
};

const EMPTY: EditorProductForm = {
  sku: "",
  name: "",
  shopLine: "",
  category: "",
  brand: "",
  spec: "",
  unit: "",
  price: "",
  salePrice: "",
  stockStatus: "",
  imageUrl: "",
  productUrl: "",
  isActive: true,
  isHit: false,
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  editSku: string | null;
  onClose: () => void;
  onSaved: () => void;
};

function fieldClass() {
  return "mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 disabled:opacity-60";
}

export default function AdminProductEditor({ open, mode, editSku, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditorProductForm>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (mode === "create") {
      setForm(EMPTY);
      setPendingImageFile(null);
      return;
    }
    if (!editSku) return;
    setLoading(true);
    fetch(`/api/company/shop-products/${encodeURIComponent(editSku)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((data as { error?: string }).error || "불러오기 실패");
        return data as { product?: Record<string, unknown> };
      })
      .then((data) => {
        const p = data.product;
        if (!p) throw new Error("데이터 없음");
        setForm({
          sku: String(p.sku ?? ""),
          name: String(p.name ?? ""),
          shopLine: String(p.shopLine ?? ""),
          category: String(p.category ?? ""),
          brand: String(p.brand ?? ""),
          spec: String(p.spec ?? ""),
          unit: String(p.unit ?? ""),
          price: String(p.price ?? ""),
          salePrice: p.salePrice == null ? "" : String(p.salePrice),
          stockStatus: String(p.stockStatus ?? ""),
          imageUrl: String(p.imageUrl ?? ""),
          productUrl: String(p.productUrl ?? ""),
          isActive: Boolean(p.isActive),
          isHit: Boolean(p.isHit),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, [open, mode, editSku]);

  const set = useCallback(<K extends keyof EditorProductForm>(key: K, value: EditorProductForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const uploadPendingImage = useCallback(async (sku: string) => {
    if (!pendingImageFile || !sku.trim()) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("sku", sku.trim());
      fd.set("file", pendingImageFile);
      const res = await fetch("/api/company/shop-products/upload-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "이미지 업로드 실패");
      const url = String((data as { imageUrl?: string }).imageUrl || "");
      if (url) setForm((prev) => ({ ...prev, imageUrl: url }));
      setPendingImageFile(null);
    } finally {
      setUploading(false);
    }
  }, [pendingImageFile]);

  const submit = useCallback(async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        shopLine: form.shopLine.trim(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        spec: form.spec.trim(),
        unit: form.unit.trim(),
        price: form.price,
        salePrice: form.salePrice.trim() === "" ? null : form.salePrice,
        stockStatus: form.stockStatus.trim(),
        imageUrl: form.imageUrl.trim(),
        productUrl: form.productUrl.trim(),
        isActive: form.isActive,
        isHit: form.isHit,
      };
      if (mode === "create") {
        const sku = form.sku.trim();
        const res = await fetch("/api/company/shop-products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, sku }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "저장 실패");
        if (pendingImageFile) {
          const fd = new FormData();
          fd.set("sku", sku);
          fd.set("file", pendingImageFile);
          const up = await fetch("/api/company/shop-products/upload-image", {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          const upData = await up.json().catch(() => ({}));
          if (!up.ok) {
            throw new Error(
              (upData as { error?: string }).error || "상품은 저장되었으나 이미지 업로드에 실패했습니다. 수정에서 다시 올려 주세요."
            );
          }
          setPendingImageFile(null);
        }
      } else {
        if (!editSku) throw new Error("SKU 없음");
        const res = await fetch(`/api/company/shop-products/${encodeURIComponent(editSku)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "저장 실패");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }, [form, mode, editSku, onSaved, onClose, pendingImageFile]);

  if (!open) return null;

  const title = mode === "create" ? "상품 등록" : "상품 수정";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-600 bg-zinc-900 p-4 shadow-xl shadow-black/50 sm:p-5"
        role="dialog"
        aria-labelledby="admin-product-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="admin-product-editor-title" className="text-lg font-semibold text-white">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800">
            닫기
          </button>
        </div>

        {error && (
          <p className="mt-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-sm text-red-200">{error}</p>
        )}

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <label className="text-zinc-300">
                SKU {mode === "edit" ? <span className="text-zinc-500">(변경 불가)</span> : null}
              </label>
              <input
                className={fieldClass()}
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                disabled={mode === "edit"}
                placeholder="예: ITEM-001"
              />
            </div>
            <div>
              <label className="text-zinc-300">상품명 *</label>
              <input className={fieldClass()} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-zinc-300">구분 (shop_line)</label>
                <input className={fieldClass()} value={form.shopLine} onChange={(e) => set("shopLine", e.target.value)} placeholder="목재, 마루…" />
              </div>
              <div>
                <label className="text-zinc-300">카테고리</label>
                <input className={fieldClass()} value={form.category} onChange={(e) => set("category", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-zinc-300">브랜드</label>
                <input className={fieldClass()} value={form.brand} onChange={(e) => set("brand", e.target.value)} />
              </div>
              <div>
                <label className="text-zinc-300">단위</label>
                <input className={fieldClass()} value={form.unit} onChange={(e) => set("unit", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-zinc-300">규격</label>
              <input className={fieldClass()} value={form.spec} onChange={(e) => set("spec", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-zinc-300">가격 *</label>
                <input className={fieldClass()} value={form.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" />
              </div>
              <div>
                <label className="text-zinc-300">할인가</label>
                <input className={fieldClass()} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} inputMode="decimal" placeholder="없으면 비움" />
              </div>
            </div>
            <div>
              <label className="text-zinc-300">재고 상태</label>
              <input className={fieldClass()} value={form.stockStatus} onChange={(e) => set("stockStatus", e.target.value)} />
            </div>
            <div>
              <label className="text-zinc-300">이미지</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                외부 주소(URL)를 넣거나, 파일을 올리면 서버에 저장됩니다. 파일은 PNG·JPG·GIF·WebP, 최대 1MB. 신규 등록 시 파일을 고른 뒤 저장하면 상품 저장 직후 이미지가 함께 올라갑니다.
              </p>
              {form.imageUrl.trim() ? (
                <div className="mt-2 overflow-hidden rounded-md border border-zinc-600 bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="" className="max-h-28 w-full object-contain object-left" />
                </div>
              ) : null}
              <input
                className={fieldClass()}
                value={form.imageUrl}
                onChange={(e) => set("imageUrl", e.target.value)}
                placeholder="https://… (외부 이미지 URL)"
              />
              <p className="mt-2 text-[11px] text-zinc-500">
                「파일 선택」은 이 상품 썸네일로 쓸 <strong className="font-medium text-zinc-400">사진 파일</strong>을 PC에서 고르는 버튼입니다 (PNG·JPG·GIF·WebP).
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                  aria-label="상품 이미지 파일 선택"
                  className="max-w-full text-xs text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-2 file:py-1 file:text-zinc-100"
                  onChange={(e) => setPendingImageFile(e.target.files?.[0] ?? null)}
                />
                {mode === "edit" && editSku ? (
                  <button
                    type="button"
                    disabled={uploading || !pendingImageFile}
                    onClick={() => uploadPendingImage(editSku).catch((err) => setError(err instanceof Error ? err.message : "업로드 실패"))}
                    className="rounded border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-950/60 disabled:opacity-40"
                  >
                    {uploading ? "업로드 중…" : "선택 파일 지금 올리기"}
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <label className="text-zinc-300">구매/상품 링크 URL</label>
              <input className={fieldClass()} value={form.productUrl} onChange={(e) => set("productUrl", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
              />
              활성 (비밀창고에 노출)
            </label>
            <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={form.isHit}
                onChange={(e) => set("isHit", e.target.checked)}
                className="rounded border-zinc-500 bg-zinc-950 text-amber-600"
              />
              히트 (목록 상단·비밀몰 우선)
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-700/80 pt-4">
              <button type="button" onClick={onClose} className="rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700">
                취소
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => submit().catch(() => {})}
                className="rounded border border-amber-600/60 bg-amber-600 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
