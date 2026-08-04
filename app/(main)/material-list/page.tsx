"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ListChecks,
  Plus,
  Trash2,
  ImageOff,
  FolderPlus,
  Printer,
  Eye,
  X,
  GripVertical,
} from "lucide-react";

type EstimateItemRow = {
  qty?: number | string;
  materialUnitPrice?: number | string;
  unitPrice?: number;
  laborUnitPrice?: number | string;
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName?: string;
  contact?: string;
  title?: string;
  displayTitle?: string;
  estimateDate?: string;
  items?: EstimateItemRow[];
  overheadPercent?: number;
  profitPercent?: number;
};

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatDateYMD(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function estimateTotal(est: Estimate): number {
  const subtotal = (est.items || []).reduce(
    (s, i) =>
      s +
      (Number(i.qty) || 0) * (Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0) +
      (Number(i.qty) || 0) * (Number(i.laborUnitPrice ?? 0) || 0),
    0
  );
  const ohRate = (Number(est.overheadPercent) ?? 5) / 100;
  const prRate = (Number(est.profitPercent) ?? 10) / 100;
  return subtotal + Math.floor(subtotal * ohRate) + Math.floor(subtotal * prRate);
}

type Consultation = {
  id: number;
  status?: string;
};

type MaterialItem = {
  id?: number;
  /** React 리스트 key / 행 순서 변경 시 안정화 (저장 시 API로 보내지 않음) */
  _clientKey?: string;
  itemName: string;
  imageUrl: string;
  productNameCode: string;
  size: string;
  remarks: string;
  shoppingLink: string;
};

type MaterialSection = {
  id?: number | null;
  title: string;
  items: MaterialItem[];
};

const REMARKS_IMPORTANT_PREFIX = "[중요] ";

function newClientKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyItem(): MaterialItem {
  return {
    _clientKey: newClientKey(),
    itemName: "",
    imageUrl: "",
    productNameCode: "",
    size: "",
    remarks: "",
    shoppingLink: "",
  };
}

function createEmptySection(): MaterialSection {
  return { id: null, title: "", items: [] };
}

function isRemarksImportant(remarks: string): boolean {
  return remarks.startsWith(REMARKS_IMPORTANT_PREFIX);
}

function getRemarksDisplay(remarks: string): string {
  return isRemarksImportant(remarks) ? remarks.slice(REMARKS_IMPORTANT_PREFIX.length) : remarks;
}

function setRemarksImportant(remarks: string, important: boolean): string {
  const content = getRemarksDisplay(remarks);
  return important ? REMARKS_IMPORTANT_PREFIX + content : content;
}

/** `toFinal`: 이동 후 배열에서의 목표 인덱스(0…length). 같은 위치면 순서 유지. */
function moveRowInArray<T>(items: readonly T[], fromIndex: number, toFinal: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length) return [...items];
  if (toFinal < 0 || toFinal > items.length) return [...items];
  const x = items[fromIndex];
  const without = items.filter((_, i) => i !== fromIndex);
  return [...without.slice(0, toFinal), x, ...without.slice(toFinal)];
}

const MAX_IMAGE_PX = 720;
const MAX_IMAGE_KB = 220;

/** 복사·붙여넣기·드래그 시 이미지를 자동으로 줄여서 저장 (용량 제한 방지, 사진 유지) */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not image"));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let dw = w;
      let dh = h;
      if (w > MAX_IMAGE_PX || h > MAX_IMAGE_PX) {
        if (w >= h) {
          dw = MAX_IMAGE_PX;
          dh = Math.round((h * MAX_IMAGE_PX) / w);
        } else {
          dh = MAX_IMAGE_PX;
          dw = Math.round((w * MAX_IMAGE_PX) / h);
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
        return;
      }
      ctx.drawImage(img, 0, 0, dw, dh);
      let quality = 0.88;
      const tryExport = (): string | null => {
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const kb = (dataUrl.length * 3) / 4 / 1024;
          if (kb <= MAX_IMAGE_KB) return dataUrl;
          quality -= 0.15;
          if (quality < 0.4) return dataUrl;
          return null;
        } catch {
          return null;
        }
      };
      let out = tryExport();
      while (out === null) out = tryExport();
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

export default function MaterialListPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimateListLoading, setEstimateListLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sections, setSections] = useState<MaterialSection[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagesSkipped, setImagesSkipped] = useState(false);
  const [clearImagesLoading, setClearImagesLoading] = useState(false);
  const [imageCompressingCell, setImageCompressingCell] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  /** 같은 섹션 안에서 행 순서 드래그 */
  const [draggingRow, setDraggingRow] = useState<{ sectionIndex: number; itemIndex: number } | null>(null);
  const [dragOverRow, setDragOverRow] = useState<{ sectionIndex: number; itemIndex: number } | null>(null);

  /** 인쇄 스타일은 globals.css 의 body.material-list-print-open 에서 적용 (전역 img 숨김 등과 충돌 방지) */
  useEffect(() => {
    if (!showPrintPreview) {
      document.body.classList.remove("material-list-print-open");
      return;
    }
    document.body.classList.add("material-list-print-open");
    return () => {
      document.body.classList.remove("material-list-print-open");
    };
  }, [showPrintPreview]);

  useEffect(() => {
    let cancelled = false;
    setEstimateListLoading(true);
    setError(null);
    (async () => {
      try {
        await fetch("/api/company/cleanup-orphan-estimates", { method: "POST", credentials: "include" });
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      Promise.all([
        fetch("/api/estimates", { credentials: "include" }).then((r) => r.json()),
        fetch("/api/consultations", { credentials: "include" }).then((r) => r.json()),
      ])
        .then(([estData, consData]) => {
          if (cancelled) return;
          if (Array.isArray(estData)) {
            setEstimates(estData as Estimate[]);
          } else {
            setError((estData as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
          }
          if (Array.isArray(consData)) setConsultations(consData as Consultation[]);
          else setConsultations([]);
        })
        .catch(() => {
          if (!cancelled) setError("견적 목록을 불러올 수 없습니다.");
        })
        .finally(() => {
          if (!cancelled) setEstimateListLoading(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 현장 선택 목록: 상담이 남아 있는 견적만. 완료 건 보기 꺼짐이면 완료 상담 제외 */
  const filteredEstimates = useMemo(() => {
    return estimates.filter((est) => {
      if (est.consultationId == null) return false;
      const c = consultations.find((x) => x.id === est.consultationId);
      if (!c) return false;
      if (showCompleted) return true;
      const status = c.status ?? "";
      return status !== "완료및정산" && status !== "완료";
    });
  }, [estimates, consultations, showCompleted]);

  /** 필터에서 빠져도 현재 선택 견적은 목록에 유지 */
  const estimatesForTable = useMemo(() => {
    if (selectedId == null) return filteredEstimates;
    if (filteredEstimates.some((e) => e.id === selectedId)) return filteredEstimates;
    const selected = estimates.find((e) => e.id === selectedId);
    return selected ? [selected, ...filteredEstimates] : filteredEstimates;
  }, [filteredEstimates, estimates, selectedId]);

  const applySectionsFromData = useCallback((data: { sections?: { id?: number | null; title?: string; items?: Record<string, unknown>[] }[] }) => {
    if (data && Array.isArray(data.sections)) {
      setSections(
        data.sections.map((s: { id?: number | null; title?: string; items?: Record<string, unknown>[] }) => ({
          id: s.id ?? null,
          title: (s.title ?? "") as string,
          items: (Array.isArray(s.items) ? s.items : []).map((x: Record<string, unknown>) => {
            const id = typeof x.id === "number" ? x.id : undefined;
            return {
              id,
              _clientKey: id == null ? newClientKey() : undefined,
              itemName: (x.itemName ?? "") as string,
              imageUrl: (x.imageUrl ?? "") as string,
              productNameCode: (x.productNameCode ?? "") as string,
              size: (x.size ?? "") as string,
              remarks: (x.remarks ?? "") as string,
              shoppingLink: (x.shoppingLink ?? "") as string,
            };
          }),
        }))
      );
    } else {
      setSections([]);
    }
  }, []);

  const loadItems = useCallback((estimateId: number) => {
    setItemsLoading(true);
    setError(null);
    setImagesSkipped(false);
    fetch(`/api/company/material-list?estimateId=${estimateId}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        applySectionsFromData(data);
      })
      .catch(() => {
        return fetch(`/api/company/material-list?estimateId=${estimateId}&skipImages=1`, { credentials: "include" })
          .then(async (r) => {
            if (!r.ok) throw new Error("retry failed");
            return r.json();
          })
          .then((data) => {
            setImagesSkipped(true);
            applySectionsFromData(data);
          })
          .catch(() => {
            setError("자재 목록을 불러올 수 없습니다. 응답이 너무 클 수 있습니다. 아래 '큰 이미지 비우기'로 복구 후 다시 시도해 보세요.");
            setSections([]);
          });
      })
      .finally(() => setItemsLoading(false));
  }, [applySectionsFromData]);

  useEffect(() => {
    if (selectedId == null) {
      setSections([]);
      return;
    }
    loadItems(selectedId);
  }, [selectedId, loadItems]);

  const setSectionTitle = useCallback((sectionIndex: number, title: string) => {
    setSections((prev) => {
      const next = [...prev];
      if (sectionIndex < 0 || sectionIndex >= next.length) return prev;
      next[sectionIndex] = { ...next[sectionIndex], title };
      return next;
    });
  }, []);

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, createEmptySection()]);
  }, []);

  const removeSection = useCallback((sectionIndex: number) => {
    setSections((prev) => prev.filter((_, i) => i !== sectionIndex));
  }, []);

  const setItem = useCallback((sectionIndex: number, itemIndex: number, field: keyof MaterialItem, value: string) => {
    setSections((prev) => {
      const next = [...prev];
      if (sectionIndex < 0 || sectionIndex >= next.length) return prev;
      const sec = next[sectionIndex];
      if (itemIndex < 0 || itemIndex >= sec.items.length) return prev;
      const items = [...sec.items];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      next[sectionIndex] = { ...sec, items };
      return next;
    });
  }, []);

  const addRow = useCallback((sectionIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      if (sectionIndex < 0 || sectionIndex >= next.length) return prev;
      next[sectionIndex] = { ...next[sectionIndex], items: [...next[sectionIndex].items, createEmptyItem()] };
      return next;
    });
  }, []);

  const removeRow = useCallback((sectionIndex: number, itemIndex: number) => {
    setSections((prev) => {
      const next = [...prev];
      if (sectionIndex < 0 || sectionIndex >= next.length) return prev;
      next[sectionIndex] = {
        ...next[sectionIndex],
        items: next[sectionIndex].items.filter((_, i) => i !== itemIndex),
      };
      return next;
    });
  }, []);

  const moveRow = useCallback((sectionIndex: number, fromIndex: number, toFinal: number) => {
    setSections((prev) => {
      const next = [...prev];
      if (sectionIndex < 0 || sectionIndex >= next.length) return prev;
      const items = next[sectionIndex].items;
      if (fromIndex < 0 || fromIndex >= items.length) return prev;
      if (toFinal < 0 || toFinal > items.length) return prev;
      const nextItems = moveRowInArray(items, fromIndex, toFinal);
      next[sectionIndex] = { ...next[sectionIndex], items: nextItems };
      return next;
    });
  }, []);

  const handleMaterialRowDrop = useCallback(
    (e: React.DragEvent, sectionIndex: number, itemIndex: number, itemCount: number) => {
      const raw = e.dataTransfer.getData("application/x-material-row");
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const p = JSON.parse(raw) as { sectionIndex: number; itemIndex: number };
        if (p.sectionIndex !== sectionIndex) return;
        const tr = (e.currentTarget as HTMLElement).closest("tr");
        if (!tr) return;
        const rect = tr.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2;
        let toFinal = insertBefore ? itemIndex : itemIndex + 1;
        if (toFinal < 0) toFinal = 0;
        if (toFinal > itemCount) toFinal = itemCount;
        moveRow(sectionIndex, p.itemIndex, toFinal);
      } catch {
        /* ignore */
      }
    },
    [moveRow]
  );

  const handleImagePaste = useCallback(
    (e: React.ClipboardEvent, sectionIndex: number, itemIndex: number) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const key = `${sectionIndex}-${itemIndex}`;
            setImageCompressingCell(key);
            fileToDataUrl(file)
              .then((url) => setItem(sectionIndex, itemIndex, "imageUrl", url))
              .catch(() => {})
              .finally(() => setImageCompressingCell((k) => (k === key ? null : k)));
          }
          return;
        }
      }
    },
    [setItem]
  );

  const handleImageDrop = useCallback(
    (e: React.DragEvent, sectionIndex: number, itemIndex: number, itemCount: number) => {
      if (e.dataTransfer.types.includes("application/x-material-row")) {
        handleMaterialRowDrop(e, sectionIndex, itemIndex, itemCount);
        return;
      }
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files?.length) return;
      for (let j = 0; j < files.length; j++) {
        if (files[j].type.startsWith("image/")) {
          const key = `${sectionIndex}-${itemIndex}`;
          setImageCompressingCell(key);
          fileToDataUrl(files[j])
            .then((url) => setItem(sectionIndex, itemIndex, "imageUrl", url))
            .catch(() => {})
            .finally(() => setImageCompressingCell((k) => (k === key ? null : k)));
          return;
        }
      }
    },
    [setItem, handleMaterialRowDrop]
  );

  const handleImageDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-material-row")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleImageFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, sectionIndex: number, itemIndex: number) => {
      const file = e.target.files?.[0];
      if (file?.type.startsWith("image/")) {
        const key = `${sectionIndex}-${itemIndex}`;
        setImageCompressingCell(key);
        fileToDataUrl(file)
          .then((url) => setItem(sectionIndex, itemIndex, "imageUrl", url))
          .catch(() => {})
          .finally(() => setImageCompressingCell((k) => (k === key ? null : k)));
      }
      e.target.value = "";
    },
    [setItem]
  );

  const handleSave = useCallback(() => {
    if (selectedId == null) return;
    setSaveLoading(true);
    setError(null);
    const payload = {
      estimateId: selectedId,
      sections: sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        items: sec.items.map((it) => ({
          itemName: it.itemName,
          imageUrl: it.imageUrl,
          productNameCode: it.productNameCode,
          size: it.size,
          remarks: it.remarks,
          shoppingLink: it.shoppingLink,
        })),
      })),
    };
    fetch("/api/company/material-list", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          alert("저장되었습니다.");
          loadItems(selectedId);
        } else {
          const msg = (data as { error?: string }).error || "저장에 실패했습니다.";
          if (r.status === 413 || /payload|body|too large|용량|크기/i.test(msg)) {
            setError("사진이 너무 많거나 커서 저장이 제한되었습니다. 사진 개수를 줄이거나, 각 사진을 더 작게 찍어서 다시 넣어 주세요.");
          } else {
            setError(msg);
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
      })
      .finally(() => setSaveLoading(false));
  }, [selectedId, sections, loadItems]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
        <ListChecks className="h-6 w-6 text-slate-600" />
        현장용 자재리스트
      </h1>
      <p className="text-sm text-gray-500">
        현장(견적)을 선택한 뒤 자재 목록을 기입·저장하면 현장에서 보기 편하게 사용할 수 있습니다.
      </p>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {imagesSkipped && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          이미지는 용량 제한으로 불러오지 못했지만, <strong>적어두신 품목·비고·사이즈 등은 그대로</strong> 불러왔습니다. 수정 후 저장하시면 텍스트는 유지됩니다. 필요하면 사진만 다시 넣어 주세요.
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-medium text-gray-700">현장(견적) 선택</label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300"
            />
            완료된 항목 보기
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
              <tr>
                <th className="row-actions-sticky min-w-[10rem] p-2 font-semibold sm:p-3">프로젝트 제목</th>
                <th className="p-2 sm:p-3 font-semibold">견적일자</th>
                <th className="p-2 sm:p-3 font-semibold">고객명</th>
                <th className="p-2 sm:p-3 font-semibold">연락처</th>
                <th className="p-2 sm:p-3 text-right font-semibold">합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {estimateListLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : estimates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    저장된 견적이 없습니다. 견적서 작성에서 먼저 견적을 저장해 주세요.
                  </td>
                </tr>
              ) : estimatesForTable.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    표시할 견적이 없습니다. &apos;완료된 항목 보기&apos;를 켜 보세요.
                  </td>
                </tr>
              ) : (
                estimatesForTable.map((est) => {
                  const total = estimateTotal(est);
                  const isSelected = selectedId === est.id;
                  const shownTitle = (est.displayTitle || est.title || "").trim() || "제목 없음";
                  const titleSpan = (
                    <span className="text-left text-blue-600 font-medium group-hover:underline">
                      {shownTitle}
                    </span>
                  );
                  return (
                    <tr
                      key={est.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(est.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(est.id);
                        }
                      }}
                      className={`group cursor-pointer text-gray-700 transition-colors ${
                        isSelected ? "bg-blue-50/80 ring-1 ring-inset ring-blue-200" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="row-actions-sticky p-2 align-middle font-medium sm:p-3">
                        <div className="max-w-[18rem] truncate" title={shownTitle}>{titleSpan}</div>
                      </td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">{formatDateYMD(est.estimateDate)}</td>
                      <td className="p-2 sm:p-3">{est.customerName || "-"}</td>
                      <td className="p-2 sm:p-3">{est.contact?.trim() ? est.contact : "-"}</td>
                      <td className="p-2 sm:p-3 text-right tabular-nums">{formatNumber(total)}원</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          행을 클릭하면 해당 견적의 자재리스트를 편집합니다. 선택된 행은 연한 파란색으로 표시됩니다.
        </p>
      </div>

      {itemsLoading && (
        <p className="py-6 text-sm text-gray-500">자재 목록을 불러오는 중…</p>
      )}

      {!itemsLoading && selectedId != null && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-gray-400 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50/50"
            >
              <FolderPlus className="h-4 w-4" />
              큰 항목 제목 추가
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saveLoading ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirm("DB에 저장된 큰 사진(base64)만 비웁니다. 적어두신 품목·비고 등 텍스트는 그대로 둡니다. 진행할까요?")) return;
                setClearImagesLoading(true);
                fetch("/api/company/material-list/clear-big-images", { method: "POST", credentials: "include" })
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.error) alert(data.error);
                    else {
                      alert((data as { message?: string }).message ?? "처리되었습니다.");
                      if (selectedId != null) loadItems(selectedId);
                    }
                  })
                  .catch(() => alert("요청에 실패했습니다."))
                  .finally(() => setClearImagesLoading(false));
              }}
              disabled={clearImagesLoading}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              title="응답이 너무 커서 목록이 안 불러와질 때 사용"
            >
              {clearImagesLoading ? "처리 중…" : "큰 이미지 비우기"}
            </button>
            <button
              type="button"
              onClick={() => setShowPrintPreview(true)}
              disabled={sections.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="인쇄용으로 보기"
            >
              <Eye className="h-4 w-4" />
              미리보기
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPrintPreview(true);
              }}
              disabled={sections.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              title="미리보기 후 인쇄 가능"
            >
              <Printer className="h-4 w-4" />
              인쇄
            </button>
          </div>
          <p className="text-xs text-gray-500">
            같은 큰 항목 안에서 <strong>품목</strong> 줄 왼쪽의 세로 점(⋮⋮) 아이콘을 끌어 놓으면 행 순서가 바뀝니다. 다른 줄의 <strong>위쪽 절반</strong>에 놓으면 그 줄 앞에, <strong>아래쪽 절반</strong>에 놓으면 그 줄 뒤에 끼워 넣습니다. 변경 후 <strong>저장</strong>하면 순서가 반영됩니다.
          </p>

          {sections.length === 0 && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              위에서 &quot;큰 항목 제목 추가&quot;를 누른 뒤, 항목 제목을 입력하고 하부에 &quot;행 추가&quot;로 자재 행을 넣어 주세요.
            </p>
          )}

          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="rounded-lg border-2 border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => setSectionTitle(sectionIndex, e.target.value)}
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-semibold"
                  placeholder="큰 항목 제목 (예: 가전, 조명)"
                />
                <button
                  type="button"
                  onClick={() => removeSection(sectionIndex)}
                  className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="이 항목 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-100">
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 w-28">품목</th>
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 w-36">이미지</th>
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 min-w-[120px]">제품명(코드)</th>
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 min-w-[140px]">사이즈</th>
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 min-w-[140px]">비고/특이사항</th>
                      <th className="p-3 font-semibold text-gray-700 border-r border-gray-300 min-w-[160px]">쇼핑링크</th>
                      <th className="p-3 font-semibold text-gray-700 w-14" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {section.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-4 text-center text-gray-500 text-xs">
                          행이 없습니다. 아래 &quot;행 추가&quot;로 넣어 주세요.
                        </td>
                      </tr>
                    )}
                    {section.items.map((row, itemIndex) => (
                      <tr
                        key={row.id != null ? `id-${row.id}` : row._clientKey ?? `s${sectionIndex}-i${itemIndex}`}
                        className={`hover:bg-gray-50/70 ${
                          draggingRow?.sectionIndex === sectionIndex && draggingRow?.itemIndex === itemIndex
                            ? "opacity-50"
                            : ""
                        } ${
                          dragOverRow?.sectionIndex === sectionIndex && dragOverRow?.itemIndex === itemIndex
                            ? "bg-blue-50/80"
                            : ""
                        }`}
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes("application/x-material-row")) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDrop={(e) => handleMaterialRowDrop(e, sectionIndex, itemIndex, section.items.length)}
                        onDragEnter={(e) => {
                          if (e.dataTransfer.types.includes("application/x-material-row")) {
                            setDragOverRow({ sectionIndex, itemIndex });
                          }
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDragOverRow((prev) =>
                              prev?.sectionIndex === sectionIndex && prev?.itemIndex === itemIndex
                                ? null
                                : prev
                            );
                          }
                        }}
                      >
                        <td className="p-2 align-top border-r border-gray-200">
                          <div className="flex items-start gap-1.5">
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/x-material-row",
                                  JSON.stringify({ sectionIndex, itemIndex })
                                );
                                e.dataTransfer.effectAllowed = "move";
                                setDraggingRow({ sectionIndex, itemIndex });
                              }}
                              onDragEnd={() => {
                                setDraggingRow(null);
                                setDragOverRow(null);
                              }}
                              className="mt-1 shrink-0 cursor-grab rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 active:cursor-grabbing"
                              title="끌어서 순서 변경"
                              aria-label="행 순서 변경"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <input
                              type="text"
                              value={row.itemName}
                              onChange={(e) => setItem(sectionIndex, itemIndex, "itemName", e.target.value)}
                              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="예: 인덕션"
                            />
                          </div>
                        </td>
                        <td className="p-2 align-top border-r border-gray-200">
                          <div
                            className="flex flex-col gap-1.5"
                            onPaste={(e) => handleImagePaste(e, sectionIndex, itemIndex)}
                          >
                            <div
                              className="h-[70px] w-[70px] flex-shrink-0 overflow-hidden rounded border-2 border-gray-300 bg-gray-100 flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-gray-50"
                              onDragOver={handleImageDragOver}
                              onDrop={(e) => handleImageDrop(e, sectionIndex, itemIndex, section.items.length)}
                              onClick={() => document.getElementById(`material-list-img-${sectionIndex}-${itemIndex}`)?.click()}
                              title="이미지 붙여넣기(Ctrl+V), 끌어다 놓기, 또는 클릭해서 선택 (자동으로 줄여서 저장)"
                            >
                              {imageCompressingCell === `${sectionIndex}-${itemIndex}` ? (
                                <span className="text-xs text-gray-500 text-center px-1">줄이는 중…</span>
                              ) : row.imageUrl.trim() ? (
                                <img
                                  src={row.imageUrl}
                                  alt=""
                                  className="h-full w-full object-contain pointer-events-none"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : null}
                              {!row.imageUrl.trim() && imageCompressingCell !== `${sectionIndex}-${itemIndex}` ? (
                                <span className="text-gray-400 text-xs">붙여넣기 / 끌어오기</span>
                              ) : null}
                            </div>
                            <input
                              id={`material-list-img-${sectionIndex}-${itemIndex}`}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleImageFileSelect(e, sectionIndex, itemIndex)}
                            />
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={row.imageUrl}
                                onChange={(e) => setItem(sectionIndex, itemIndex, "imageUrl", e.target.value)}
                                className="flex-1 min-w-0 rounded border border-gray-300 px-1.5 py-1 text-xs"
                                placeholder="이미지 URL 또는 붙여넣기/드래그 (붙여넣기 시 자동 축소)"
                              />
                              <button
                                type="button"
                                onClick={() => setItem(sectionIndex, itemIndex, "imageUrl", "")}
                                className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-600"
                                title="이미지 지우기"
                              >
                                <ImageOff className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="p-2 align-top border-r border-gray-200">
                          <input
                            type="text"
                            value={row.productNameCode}
                            onChange={(e) => setItem(sectionIndex, itemIndex, "productNameCode", e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            placeholder="제품명 또는 코드"
                          />
                        </td>
                        <td className="p-2 align-top border-r border-gray-200">
                          <textarea
                            value={row.size}
                            onChange={(e) => setItem(sectionIndex, itemIndex, "size", e.target.value)}
                            rows={3}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-y min-h-[60px]"
                            placeholder={"제품사이즈\n580*500*72\n중량 14KG"}
                          />
                        </td>
                        <td className="p-2 align-top border-r border-gray-200">
                          <div className="flex flex-col gap-1">
                            <label className="flex items-center gap-1.5 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={isRemarksImportant(row.remarks)}
                                onChange={(e) => setItem(sectionIndex, itemIndex, "remarks", setRemarksImportant(row.remarks, e.target.checked))}
                              />
                              중요
                            </label>
                            <textarea
                              value={getRemarksDisplay(row.remarks)}
                              onChange={(e) =>
                                setItem(
                                  sectionIndex,
                                  itemIndex,
                                  "remarks",
                                  isRemarksImportant(row.remarks) ? REMARKS_IMPORTANT_PREFIX + e.target.value : e.target.value
                                )
                              }
                              rows={2}
                              className={`w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-y min-h-[52px] ${isRemarksImportant(row.remarks) ? "text-red-600 font-medium" : ""}`}
                              placeholder="전력 체크 요망 등"
                            />
                          </div>
                        </td>
                        <td className="p-2 align-top border-r border-gray-200">
                          <input
                            type="url"
                            value={row.shoppingLink}
                            onChange={(e) => setItem(sectionIndex, itemIndex, "shoppingLink", e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            placeholder="https://..."
                          />
                        </td>
                        <td className="p-2 align-top">
                          <button
                            type="button"
                            onClick={() => removeRow(sectionIndex, itemIndex)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="행 삭제"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
                <button
                  type="button"
                  onClick={() => addRow(sectionIndex)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  행 추가
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!itemsLoading && selectedId == null && estimates.length > 0 && estimatesForTable.length > 0 && (
        <p className="py-4 text-sm text-gray-500">위 목록에서 프로젝트 제목을 눌러 현장(견적)을 선택해 주세요.</p>
      )}

      {showPrintPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="material-list-print-area"
            className="fixed inset-0 z-[9999] bg-white overflow-auto p-6"
          >
            <div className="no-print flex flex-wrap items-center gap-3 border-b border-gray-200 pb-4 mb-6">
              <p className="w-full text-xs text-gray-500">
                인쇄 창에서 <strong>방향: 가로</strong>, <strong>용지: A4</strong>, <strong>확대/축소: 용지에 맞춤</strong>(또는 100% 이하)을 확인하세요. 표는 가로 폭에 맞게 줄어듭니다. 사진이 안 나오면{" "}
                <strong>배경 그래픽</strong>(Chrome) / <strong>배경 인쇄</strong>(Edge)을 켜 보세요.
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" />
                인쇄
              </button>
              <button
                type="button"
                onClick={() => setShowPrintPreview(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
                닫기
              </button>
            </div>
            <div className="print-content">
              <h1 className="text-xl font-bold text-gray-900 mb-1">
                현장용 자재리스트
              </h1>
              <p className="text-sm text-gray-600 mb-6">
                {selectedId != null
                  ? (() => {
                      const est = estimates.find((e) => e.id === selectedId);
                      return est
                        ? `${(est.displayTitle || est.title || "").trim() || "제목 없음"} / ${est.customerName || "고객"} (${est.estimateDate || "-"})`
                        : "";
                    })()
                  : ""}
              </p>
              {sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="mb-8 print:mb-4">
                  <h2 className="text-base font-semibold text-gray-800 border-b border-gray-300 pb-2 mb-3">
                    {section.title || "(항목 제목)"}
                  </h2>
                  <table className="material-list-print-table w-full text-sm border-collapse border border-gray-300">
                    <colgroup>
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "22%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "20%" }} />
                      <col style={{ width: "14%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 p-2 text-left font-semibold">품목</th>
                        <th className="border border-gray-300 p-2 text-left font-semibold">이미지</th>
                        <th className="border border-gray-300 p-2 text-left font-semibold">제품명(코드)</th>
                        <th className="border border-gray-300 p-2 text-left font-semibold">사이즈</th>
                        <th className="border border-gray-300 p-2 text-left font-semibold">비고</th>
                        <th className="border border-gray-300 p-2 text-left font-semibold">쇼핑링크</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.items.map((row, itemIndex) => (
                        <tr key={itemIndex} className="border-b border-gray-200">
                          <td className="border border-gray-300 p-2 align-top">{row.itemName || "-"}</td>
                          <td className="border border-gray-300 p-2 align-top">
                            {row.imageUrl.trim() ? (
                              <img
                                src={row.imageUrl}
                                alt=""
                                className="material-list-print-img max-h-28 max-w-36 object-contain"
                                decoding="async"
                              />
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="border border-gray-300 p-2 align-top">{row.productNameCode || "-"}</td>
                          <td className="border border-gray-300 p-2 align-top whitespace-pre-wrap">{row.size || "-"}</td>
                          <td className="border border-gray-300 p-2 align-top">
                            {getRemarksDisplay(row.remarks) || "-"}
                          </td>
                          <td className="border border-gray-300 p-2 align-top">
                            {row.shoppingLink ? (
                              <a href={row.shoppingLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                                링크
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
