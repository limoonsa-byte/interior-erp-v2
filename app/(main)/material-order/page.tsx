"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toPng } from "html-to-image";

type EstimateItem = {
  processGroup?: string;
  category?: string;
  spec?: string;
  unit?: string;
  qty?: number | string;
  materialUnitPrice?: number | string;
  laborUnitPrice?: number | string;
  unitPrice?: number;
  note?: string;
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName: string;
  contact?: string;
  address: string;
  title: string;
  estimateDate?: string;
  note?: string;
  items: EstimateItem[];
  processOrder?: string[];
  createdAt?: string;
};

type Consultation = {
  id: number;
  status?: string;
  customerName: string;
  address?: string;
  materialMeetingAt?: string;
  materialOrderedAt?: string;
};

function hasMaterial(item: EstimateItem): boolean {
  const q = Number(item.qty) ?? 0;
  const p = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) ?? 0;
  return q > 0 && p > 0;
}

function materialAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const p = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) || 0;
  return q * p;
}

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function addedRowAmount(row: AddedOrderRow): number {
  return (Number(row.qty) || 0) * (Number(row.materialUnitPrice) || 0);
}

/** 발주 유형별 자재 금액 합계 (견적 행 + 직접 추가 행) */
function sumCategoryAmount(catItems: EstimateItem[], addedRows: AddedOrderRow[]): number {
  let sum = 0;
  for (const it of catItems) sum += materialAmount(it);
  for (const row of addedRows) sum += addedRowAmount(row);
  return sum;
}

/** 발주 유형 10개 (고정 순서). 공정/품목 키워드로 매칭 */
const ORDER_CATEGORIES: { label: string; keywords: string[]; shopLines?: string[] }[] = [
  { label: "목재발주", keywords: ["목재"], shopLines: ["목재"] },
  { label: "중문발주", keywords: ["중문"] },
  { label: "조명", keywords: ["조명", "전기조명"], shopLines: ["조명"] },
  { label: "전기부자재 발주", keywords: ["전기"], shopLines: ["전기"] },
  { label: "타일(화장실용품)발주", keywords: ["타일", "도기", "화장실"], shopLines: ["타일"] },
  { label: "목공방재발주", keywords: ["목공", "목공방재"], shopLines: ["목재"] },
  { label: "도배발주", keywords: ["도배"], shopLines: ["도배"] },
  { label: "바닥재발주", keywords: ["마루", "바닥", "바닥재"], shopLines: ["마루", "장판"] },
  { label: "필름발주", keywords: ["필름"], shopLines: ["필름"] },
  { label: "싱크가구발주", keywords: ["싱크", "싱크대"] },
];

function getOrderCategory(item: EstimateItem): string {
  const processGroup = String(item.processGroup ?? "").trim();
  const category = String(item.category ?? "").trim();
  const combined = `${processGroup} ${category}`;
  for (const { label, keywords } of ORDER_CATEGORIES) {
    if (keywords.some((kw) => combined.includes(kw))) return label;
  }
  return "기타";
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type PicItem = { id: number; name: string; phone: string };

/** 사용자가 추가한 발주 행 (직접 입력) */
type AddedOrderRow = {
  id: string;
  processGroup: string;
  category: string;
  spec: string;
  unit: string;
  qty: string;
  materialUnitPrice: string;
  note: string;
};

type ShopProduct = {
  id: number;
  sku: string;
  name: string;
  shopLine?: string;
  category?: string;
  spec?: string;
  productUrl?: string;
  isActive?: boolean;
};

function createEmptyAddedRow(): AddedOrderRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    processGroup: "",
    category: "",
    spec: "",
    unit: "",
    qty: "",
    materialUnitPrice: "",
    note: "",
  };
}

export function MaterialOrderPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [picList, setPicList] = useState<PicItem[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orderSaving, setOrderSaving] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [templateLoadType, setTemplateLoadType] = useState<null | "default" | "company">(null);

  /** 필수 기입란 - 발주일은 오늘 고정, 담당자/연락처는 마스터(관리) 담당자에서 선택 */
  const [requiredOrderDate] = useState(() => getTodayDate());
  const [requiredSiteName, setRequiredSiteName] = useState("");
  /** 발주 유형별 입하 예정일 (키: label, 발주별 한 개) */
  const [deliveryDateByLabel, setDeliveryDateByLabel] = useState<Record<string, string>>({});
  /** 발주 유형·행별 비고 (발주서에서 직접 입력, 키: "estimateId-label-rowIdx") */
  const [memoByKey, setMemoByKey] = useState<Record<string, string>>({});
  /** 발주 유형별 접기 상태 (true = 접힘) */
  const [collapsedByLabel, setCollapsedByLabel] = useState<Record<string, boolean>>({});
  /** 발주 유형별 사용자 추가 행 */
  const [addedRowsByLabel, setAddedRowsByLabel] = useState<Record<string, AddedOrderRow[]>>({});
  const [requiredContactName, setRequiredContactName] = useState("");
  const [requiredContactPhone, setRequiredContactPhone] = useState("");
  const [requiredDeliveryAddress, setRequiredDeliveryAddress] = useState("");
  /** 이미지 저장 중인 발주 유형 (label) */
  const [savingImageLabel, setSavingImageLabel] = useState<string | null>(null);
  /** 로그인한 업체명 (담당업체에 표시) */
  const [companyName, setCompanyName] = useState("");
  /** 발주서 미리보기 모달에 표시할 발주 유형 (null이면 모달 숨김) */
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  /** 발주 유형별 화면/출력 제목 커스텀(키는 내부 label, 값은 표시용 제목) */
  const [displayTitleByLabel, setDisplayTitleByLabel] = useState<Record<string, string>>({});
  /** 화면에 표시할 발주 유형 목록 (추가/삭제 가능) */
  const [visibleOrderLabels, setVisibleOrderLabels] = useState<string[]>(() => [
    ...ORDER_CATEGORIES.map((c) => c.label),
    "기타",
  ]);
  /** 비밀몰 상품 목록(품목별 링크 선택용) */
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  /** 행별 선택된 비밀몰 SKU */
  const [shopSkuByRowKey, setShopSkuByRowKey] = useState<Record<string, string>>({});
  /** 방향키로 발주 테이블 셀 이동 (견적서와 동일). 같은 열에서 위/아래, 같은 행에서 좌/우 */
  const handleOrderTableKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") return;
    const label = target.getAttribute("data-order-label");
    const row = target.getAttribute("data-order-row");
    const col = target.getAttribute("data-order-col");
    if (label == null || row == null || col == null) return;

    const selector = `[data-order-label="${label}"][data-order-row][data-order-col]`;
    const gridRows = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);
    const byRow = new Map<number, Map<number, HTMLInputElement | HTMLTextAreaElement>>();
    gridRows.forEach((el) => {
      if (el.offsetParent == null || el.disabled) return;
      const r = parseInt(el.getAttribute("data-order-row") ?? "", 10);
      const c = parseInt(el.getAttribute("data-order-col") ?? "", 10);
      if (Number.isNaN(r) || Number.isNaN(c)) return;
      if (!byRow.has(r)) byRow.set(r, new Map());
      byRow.get(r)!.set(c, el);
    });
    const sortedRows = Array.from(byRow.keys()).sort((a, b) => a - b);
    const ri = sortedRows.indexOf(parseInt(row, 10));
    const ci = parseInt(col, 10);
    if (ri !== -1 && e.key === "ArrowDown") {
      e.preventDefault();
      const nextRow = sortedRows[ri + 1];
      if (nextRow != null) byRow.get(nextRow)?.get(ci)?.focus();
    } else if (ri !== -1 && e.key === "ArrowUp") {
      e.preventDefault();
      const prevRow = sortedRows[ri - 1];
      if (prevRow != null) byRow.get(prevRow)?.get(ci)?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const rowMap = byRow.get(parseInt(row, 10));
      if (rowMap) {
        const nextCol = Array.from(rowMap.keys()).sort((a, b) => a - b).find((k) => k > ci);
        if (nextCol != null) rowMap.get(nextCol)?.focus();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const rowMap = byRow.get(parseInt(row, 10));
      if (rowMap) {
        const prevCol = Array.from(rowMap.keys()).sort((a, b) => b - a).find((k) => k < ci);
        if (prevCol != null) rowMap.get(prevCol)?.focus();
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch("/api/company/cleanup-orphan-estimates", { method: "POST", credentials: "include" });
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      Promise.allSettled([
        fetch("/api/estimates").then((r) => r.json()),
        fetch("/api/consultations").then((r) => r.json()),
        fetch("/api/company/pics").then((r) => r.json()),
        fetch("/api/company/me").then((r) => r.json()),
        fetch("/api/company/order-default-items").then((r) => r.json()),
        fetch("/api/company/shop-products?limit=500").then((r) => (r.ok ? r.json() : { products: [] })),
      ]).then(([estRes, consRes, picsRes, meRes, defaultRes, shopRes]) => {
      if (cancelled) return;
      const est = estRes.status === "fulfilled" ? estRes.value : [];
      const cons = consRes.status === "fulfilled" ? consRes.value : [];
      const pics = picsRes.status === "fulfilled" ? picsRes.value : [];
      const me = meRes.status === "fulfilled" ? meRes.value : null;
      const defaultData = defaultRes.status === "fulfilled" ? defaultRes.value : { itemsByLabel: {} };
      const shopData = shopRes.status === "fulfilled" ? shopRes.value : { products: [] };
      setEstimates(Array.isArray(est) ? est : []);
      setConsultations(Array.isArray(cons) ? cons : []);
      setPicList(Array.isArray(pics) ? pics : []);
      setShopProducts(Array.isArray((shopData as { products?: unknown[] }).products) ? ((shopData as { products: ShopProduct[] }).products) : []);
      const company = (me as { company?: { name?: string; code?: string } } | null)?.company;
      setCompanyName(company?.name ?? company?.code ?? "");
      if (defaultData?.itemsByLabel && typeof defaultData.itemsByLabel === "object" && Object.keys(defaultData.itemsByLabel).length > 0) {
        const byLabel = defaultData.itemsByLabel as Record<string, AddedOrderRow[]>;
        setAddedRowsByLabel((prev) => {
          const next = { ...prev };
          Object.entries(byLabel).forEach(([label, rows]) => {
            if (Array.isArray(rows) && rows.length > 0) {
              next[label] = rows.map((r, i) => ({
                id: r.id && String(r.id).trim() ? r.id : `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
                processGroup: String(r.processGroup ?? "").trim(),
                category: String(r.category ?? "").trim(),
                spec: String(r.spec ?? "").trim(),
                unit: String(r.unit ?? "").trim(),
                qty: String(r.qty ?? "").trim(),
                materialUnitPrice: String(r.materialUnitPrice ?? "").trim(),
                note: String(r.note ?? "").trim(),
              }));
            }
          });
          return next;
        });
      }
      // 기본은 선택 없음 (완료된 항목 보기 체크 후 선택하도록)
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEstimate = useMemo(
    () => estimates.find((e) => e.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId]
  );

  /** 프로젝트 선택 목록: 상담이 남아 있는 견적만. 완료 건 보기 꺼짐이면 완료 상담 제외 */
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

  const estimatesForSelect = useMemo(() => {
    if (selectedEstimateId == null) return filteredEstimates;
    if (filteredEstimates.some((e) => e.id === selectedEstimateId)) return filteredEstimates;
    const selected = estimates.find((e) => e.id === selectedEstimateId);
    return selected ? [selected, ...filteredEstimates] : filteredEstimates;
  }, [filteredEstimates, estimates, selectedEstimateId]);

  const selectedConsultation = useMemo(() => {
    if (!selectedEstimate?.consultationId) return null;
    return consultations.find((c) => c.id === selectedEstimate.consultationId) ?? null;
  }, [consultations, selectedEstimate]);

  /** 견적 선택 시 현장명(프로젝트 제목)·배송지 주소를 선택한 프로젝트 정보로 자동 채움 */
  useEffect(() => {
    if (!selectedEstimate) return;
    setRequiredSiteName(selectedEstimate.title ?? "");
    setRequiredDeliveryAddress(selectedEstimate.address ?? "");
  }, [selectedEstimate?.id]);

  /** 견적 선택 시 저장된 자재 발주 초안 불러오기 */
  useEffect(() => {
    if (selectedEstimateId == null) return;
    setDraftLoading(true);
    fetch(`/api/company/material-order?estimateId=${selectedEstimateId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const draft = (data as { draft?: Record<string, unknown> }).draft;
        if (!draft || typeof draft !== "object") {
          setDraftLoading(false);
          return;
        }
        if (typeof draft.requiredSiteName === "string") setRequiredSiteName(draft.requiredSiteName);
        if (typeof draft.requiredDeliveryAddress === "string") setRequiredDeliveryAddress(draft.requiredDeliveryAddress);
        if (typeof draft.requiredContactName === "string") setRequiredContactName(draft.requiredContactName);
        if (typeof draft.requiredContactPhone === "string") setRequiredContactPhone(draft.requiredContactPhone);
        if (draft.deliveryDateByLabel && typeof draft.deliveryDateByLabel === "object") {
          setDeliveryDateByLabel(draft.deliveryDateByLabel as Record<string, string>);
        }
        if (draft.memoByKey && typeof draft.memoByKey === "object") {
          setMemoByKey(draft.memoByKey as Record<string, string>);
        }
        if (Array.isArray(draft.visibleOrderLabels) && draft.visibleOrderLabels.length > 0) {
          setVisibleOrderLabels(draft.visibleOrderLabels as string[]);
        }
        if (draft.displayTitleByLabel && typeof draft.displayTitleByLabel === "object") {
          setDisplayTitleByLabel(draft.displayTitleByLabel as Record<string, string>);
        }
        if (draft.addedRowsByLabel && typeof draft.addedRowsByLabel === "object") {
          const raw = draft.addedRowsByLabel as Record<string, unknown[]>;
          setAddedRowsByLabel((prev) => {
            const normalized: Record<string, AddedOrderRow[]> = {};
            Object.entries(raw).forEach(([label, rows]) => {
              if (!Array.isArray(rows)) return;
              normalized[label] = rows.map((r: unknown, i: number) => {
                const x = r as Record<string, unknown>;
                return {
                  id: (x.id && String(x.id).trim()) ? String(x.id) : `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
                  processGroup: String(x.processGroup ?? "").trim(),
                  category: String(x.category ?? "").trim(),
                  spec: String(x.spec ?? "").trim(),
                  unit: String(x.unit ?? "").trim(),
                  qty: String(x.qty ?? "").trim(),
                  materialUnitPrice: String(x.materialUnitPrice ?? "").trim(),
                  note: String(x.note ?? "").trim(),
                };
              });
            });
            return { ...prev, ...normalized };
          });
        }
      })
      .catch(() => {})
      .finally(() => setDraftLoading(false));
  }, [selectedEstimateId]);

  /** 발주 유형별로 그룹. 현재는 견적 항목 없이 빈 목록만 사용 */
  const itemsByCategory = useMemo(
    () => visibleOrderLabels.map((label) => ({ label, items: [] as EstimateItem[] })),
    [visibleOrderLabels]
  );

  /** 발주 유형별·전체 자재 금액 합계 (입력 화면만, 미리보기 양식은 변경 없음) */
  const orderAmountByLabel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { label, items: catItems } of itemsByCategory) {
      map[label] = sumCategoryAmount(catItems, addedRowsByLabel[label] ?? []);
    }
    return map;
  }, [itemsByCategory, addedRowsByLabel]);

  const orderGrandTotal = useMemo(
    () => Object.values(orderAmountByLabel).reduce((acc, n) => acc + n, 0),
    [orderAmountByLabel]
  );

  const getOrderDisplayTitle = useCallback(
    (label: string) => {
      const custom = (displayTitleByLabel[label] ?? "").trim();
      return custom || label;
    },
    [displayTitleByLabel]
  );

  const getOrderSheetTitle = useCallback(
    (label: string) => {
      const title = getOrderDisplayTitle(label);
      return title.endsWith("발주") ? title.replace(/발주$/, " 발주서") : `${title} 발주서`;
    },
    [getOrderDisplayTitle]
  );

  const getShopCandidates = useCallback((orderLabel: string, itemName: string, spec: string) => {
    const catEntry = ORDER_CATEGORIES.find((c) => c.label === orderLabel);
    const allowedLines = catEntry?.shopLines;
    const name = itemName.trim().toLowerCase();
    const specText = spec.trim().toLowerCase();
    const scored = shopProducts
      .filter((p) => p.isActive !== false)
      .filter((p) => {
        const sl = String(p.shopLine ?? "").trim();
        if (!sl) return true;
        if (!allowedLines || allowedLines.length === 0) return true;
        return allowedLines.includes(sl);
      })
      .map((p) => {
        let score = 0;
        const n = String(p.name || "").toLowerCase();
        const c = String(p.category || "").toLowerCase();
        const s = String(p.spec || "").toLowerCase();
        if (name && n.includes(name)) score += 3;
        if (name && c.includes(name)) score += 2;
        if (specText && s.includes(specText)) score += 2;
        if (specText && n.includes(specText)) score += 1;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name), "ko"));
    return scored.slice(0, 12).map((x) => x.p);
  }, [shopProducts]);

  /** 견적 선택·발주 유형 목록 변경 시에만 빈 유형에 기본 행 1개 보장. `addedRowsByLabel`에 의존하면 행 전체 삭제 직후 다시 채워져 삭제가 안 되는 것처럼 보임 */
  useEffect(() => {
    if (!selectedEstimateId) return;
    setAddedRowsByLabel((prev) => {
      const next = { ...prev };
      let changed = false;
      visibleOrderLabels.forEach((label) => {
        const current = prev[label] ?? [];
        if (current.length === 0) {
          next[label] = [createEmptyAddedRow()];
          changed = true;
        }
      });
      return changed ? { ...prev, ...next } : prev;
    });
  }, [selectedEstimateId, visibleOrderLabels]);

  /** 발주 유형 추가 */
  const handleAddOrderType = () => {
    const name = window.prompt("발주 유형 이름을 입력하세요 (예: 소방발주)", "새 발주");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (visibleOrderLabels.includes(trimmed)) {
      alert("이미 있는 유형명입니다.");
      return;
    }
    setVisibleOrderLabels((prev) => [...prev, trimmed]);
    setAddedRowsByLabel((prev) => ({ ...prev, [trimmed]: [createEmptyAddedRow()] }));
    setDeliveryDateByLabel((prev) => ({ ...prev, [trimmed]: "" }));
  };

  /** 발주 유형 삭제 */
  const handleRemoveOrderType = (label: string) => {
    if (visibleOrderLabels.length <= 1) {
      alert("최소 하나의 발주 유형은 필요합니다.");
      return;
    }
    if (!window.confirm(`"${label}" 발주를 삭제할까요? 해당 유형의 항목도 모두 삭제됩니다.`)) return;
    setVisibleOrderLabels((prev) => prev.filter((l) => l !== label));
    setAddedRowsByLabel((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
    setDeliveryDateByLabel((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
    setCollapsedByLabel((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
    setDisplayTitleByLabel((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
    if (previewLabel === label) setPreviewLabel(null);
  };

  /** 발주 유형 제목 수정(내부 키는 유지, 화면/출력 제목만 변경) */
  const handleRenameOrderType = (label: string) => {
    const current = getOrderDisplayTitle(label);
    const next = window.prompt("수정할 발주 제목을 입력하세요.", current);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      alert("제목은 비워둘 수 없습니다.");
      return;
    }
    setDisplayTitleByLabel((prev) => ({ ...prev, [label]: trimmed }));
  };

  /** 템플릿 불러오기: 기본서식(마스터) */
  const loadDefaultTemplate = useCallback(() => {
    setTemplateLoadType("default");
    fetch("/api/company/order-default-items", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const defaultData = data as { itemsByLabel?: Record<string, AddedOrderRow[]> };
        setVisibleOrderLabels([...ORDER_CATEGORIES.map((c) => c.label), "기타"]);
        setDisplayTitleByLabel({});
        if (defaultData?.itemsByLabel && typeof defaultData.itemsByLabel === "object" && Object.keys(defaultData.itemsByLabel).length > 0) {
          const byLabel = defaultData.itemsByLabel as Record<string, AddedOrderRow[]>;
          setAddedRowsByLabel((prev) => {
            const next = { ...prev };
            Object.entries(byLabel).forEach(([label, rows]) => {
              if (Array.isArray(rows) && rows.length > 0) {
                next[label] = rows.map((r, i) => ({
                  id: r.id && String(r.id).trim() ? r.id : `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
                  processGroup: String(r.processGroup ?? "").trim(),
                  category: String(r.category ?? "").trim(),
                  spec: String(r.spec ?? "").trim(),
                  unit: String(r.unit ?? "").trim(),
                  qty: String(r.qty ?? "").trim(),
                  materialUnitPrice: String(r.materialUnitPrice ?? "").trim(),
                  note: String(r.note ?? "").trim(),
                }));
              }
            });
            return next;
          });
        }
        alert("기본서식을 불러왔습니다.");
      })
      .catch(() => alert("기본서식 불러오기에 실패했습니다."))
      .finally(() => setTemplateLoadType(null));
  }, []);

  /** 템플릿 불러오기: 우리회사 템플릿 */
  const loadCompanyTemplate = useCallback(() => {
    setTemplateLoadType("company");
    fetch("/api/company/order-template", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const t = (data as { template?: { visibleOrderLabels?: string[]; displayTitleByLabel?: Record<string, string>; addedRowsByLabel?: Record<string, unknown[]> } }).template;
        if (!t) {
          alert("저장된 우리회사 템플릿이 없습니다. 관리 → 자재발주 서식관리에서 먼저 저장해 주세요.");
          return;
        }
        if (Array.isArray(t.visibleOrderLabels) && t.visibleOrderLabels.length > 0) {
          setVisibleOrderLabels(t.visibleOrderLabels);
        }
        if (t.displayTitleByLabel && typeof t.displayTitleByLabel === "object") {
          setDisplayTitleByLabel(t.displayTitleByLabel);
        } else {
          setDisplayTitleByLabel({});
        }
        if (t.addedRowsByLabel && typeof t.addedRowsByLabel === "object") {
          const raw = t.addedRowsByLabel as Record<string, unknown[]>;
          const normalized: Record<string, AddedOrderRow[]> = {};
          Object.entries(raw).forEach(([label, rows]) => {
            if (!Array.isArray(rows)) return;
            normalized[label] = rows.map((r: unknown, i: number) => {
              const x = r as Record<string, unknown>;
              return {
                id: (x.id && String(x.id).trim()) ? String(x.id) : `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
                processGroup: String(x.processGroup ?? "").trim(),
                category: String(x.category ?? "").trim(),
                spec: String(x.spec ?? "").trim(),
                unit: String(x.unit ?? "").trim(),
                qty: String(x.qty ?? "").trim(),
                materialUnitPrice: String(x.materialUnitPrice ?? "").trim(),
                note: String(x.note ?? "").trim(),
              };
            });
          });
          setAddedRowsByLabel(normalized);
        }
        alert("우리회사 템플릿을 불러왔습니다.");
      })
      .catch(() => alert("우리회사 템플릿 불러오기에 실패했습니다."))
      .finally(() => setTemplateLoadType(null));
  }, []);

  /** 템플릿 불러오기: 빈 서식(기본 발주 유형만, 행은 비움) */
  const loadEmptyTemplate = useCallback(() => {
    const labels = [...ORDER_CATEGORIES.map((c) => c.label), "기타"];
    const rows: Record<string, AddedOrderRow[]> = {};
    labels.forEach((label) => {
      rows[label] = [createEmptyAddedRow()];
    });
    setVisibleOrderLabels(labels);
    setAddedRowsByLabel(rows);
    setDeliveryDateByLabel(Object.fromEntries(labels.map((l) => [l, ""])));
    setCollapsedByLabel({});
    setDisplayTitleByLabel({});
    setPreviewLabel(null);
    setMemoByKey((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith("added-")) delete next[k];
      }
      return next;
    });
    setShopSkuByRowKey({});
    alert("빈 템플릿을 불러왔습니다.");
  }, []);

  const totalMaterialAmount = useMemo(() => {
    return itemsByCategory.reduce((sum, { label }) => {
      const rows = addedRowsByLabel[label] ?? [];
      const rowSum = rows.reduce(
        (s, r) => s + (Number(r.qty) || 0) * (Number(r.materialUnitPrice) || 0),
        0
      );
      return sum + rowSum;
    }, 0);
  }, [itemsByCategory, addedRowsByLabel]);

  /** 발주 유형별로 항목이 하나라도 있으면 해당 유형 입하 예정일 필수 */
  const allDeliveryDatesFilled = useMemo(() => {
    return itemsByCategory.every(({ label, items: catItems }) => {
      const hasAdded = (addedRowsByLabel[label] ?? []).length > 0;
      if (catItems.length === 0 && !hasAdded) return true;
      return (deliveryDateByLabel[label] ?? "").trim() !== "";
    });
  }, [itemsByCategory, deliveryDateByLabel, addedRowsByLabel]);

  const requiredFilled =
    allDeliveryDatesFilled &&
    requiredSiteName.trim() !== "" &&
    requiredContactName.trim() !== "" &&
    requiredContactPhone.trim() !== "" &&
    requiredDeliveryAddress.trim() !== "";

  const exportToExcel = useCallback(async () => {
    if (!requiredFilled) {
      alert("위 필수 기입란을 모두 입력한 뒤 엑셀 내보내기를 해 주세요.");
      return;
    }
    const hasAddedRows = itemsByCategory.some(({ label }) => (addedRowsByLabel[label] ?? []).length > 0);
    if (!selectedEstimate || !hasAddedRows) {
      alert("견적을 선택하고 발주 항목을 입력한 뒤 엑셀 내보내기를 해 주세요.");
      return;
    }
    try {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("자재 발주", { views: [{ rightToLeft: false }] });
      ws.addRow(["발주일", requiredOrderDate]);
      ws.addRow(["현장명(프로젝트명)", requiredSiteName]);
      ws.addRow(["담당자", requiredContactName, "연락처", requiredContactPhone]);
      ws.addRow(["배송지 주소", requiredDeliveryAddress]);
      ws.addRow([]);
      const headers = [
        "발주 유형",
        "입하 예정일",
        "프로젝트명",
        "고객",
        "주소",
        "품목",
        "규격",
        "단위",
        "수량",
        "자재 단가",
        "자재 금액",
        "비고",
      ];
      ws.addRow(headers);
      const title = selectedEstimate.title ?? "";
      const customerName = selectedEstimate.customerName ?? "";
      const address = selectedEstimate.address ?? "";
      const eid = selectedEstimate.id;
      itemsByCategory.forEach(({ label }) => {
        const deliveryDate = deliveryDateByLabel[label] ?? "";
        (addedRowsByLabel[label] ?? []).forEach((row) => {
          const qty = Number(row.qty) || 0;
          const unitPrice = Number(row.materialUnitPrice) || 0;
          const amount = qty * unitPrice;
          const rowMemo = memoByKey[`added-${label}-${row.id}`] ?? row.note ?? "";
          ws.addRow([
            label,
            deliveryDate,
            title,
            customerName,
            address,
            row.category ?? "",
            row.spec ?? "",
            row.unit ?? "",
            qty,
            unitPrice,
            amount,
            rowMemo,
          ]);
        });
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `자재발주_${(selectedEstimate.title ?? "일정").replace(/[/\\?%*:|"]/g, "_")}_${selectedEstimate.id}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("엑셀 내보내기 실패:", err);
      alert("엑셀 내보내기에 실패했습니다.");
    }
  }, [
    selectedEstimate,
    itemsByCategory,
    requiredFilled,
    requiredOrderDate,
    requiredSiteName,
    requiredContactName,
    requiredContactPhone,
    requiredDeliveryAddress,
    deliveryDateByLabel,
    memoByKey,
    addedRowsByLabel,
  ]);

  const markOrderDone = useCallback(async () => {
    if (!requiredFilled) {
      alert("위 필수 기입란을 모두 입력한 뒤 발주 완료를 눌러 주세요.");
      return;
    }
    if (!selectedConsultation) {
      alert("선택한 견적에 연결된 상담이 없습니다. 발주 완료는 상담이 연결된 견적에서만 가능합니다.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setOrderSaving(true);
    try {
      const res = await fetch(`/api/consultations/${selectedConsultation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialOrderedAt: today }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "저장 실패");
      alert("발주 완료로 저장했습니다.");
      const consRes = await fetch("/api/consultations");
      const cons = await consRes.json();
      setConsultations(Array.isArray(cons) ? cons : []);
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setOrderSaving(false);
    }
  }, [selectedConsultation, requiredFilled]);

  /** 자재 발주 초안 저장 (현장명·배송지·담당자·발주 유형별 항목·입하예정일 등) */
  const saveDraft = useCallback(async () => {
    if (selectedEstimateId == null) {
      alert("프로젝트(견적)를 선택해 주세요.");
      return;
    }
    setSaveDraftLoading(true);
    try {
      const res = await fetch("/api/company/material-order", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimateId: selectedEstimateId,
          requiredSiteName,
          requiredDeliveryAddress,
          requiredContactName,
          requiredContactPhone,
          deliveryDateByLabel,
          addedRowsByLabel,
          memoByKey,
          visibleOrderLabels,
          displayTitleByLabel,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "저장 실패");
      alert("저장되었습니다.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setSaveDraftLoading(false);
    }
  }, [
    selectedEstimateId,
    requiredSiteName,
    requiredDeliveryAddress,
    requiredContactName,
    requiredContactPhone,
    deliveryDateByLabel,
    addedRowsByLabel,
    memoByKey,
    visibleOrderLabels,
    displayTitleByLabel,
  ]);

  /** 해당 발주 섹션을 이미지(PNG)로 저장 — 사용자가 준 표 양식 그대로(삭제 열 없음) */
  const saveOrderSectionAsImage = useCallback(
    async (label: string) => {
      setCollapsedByLabel((prev) => ({ ...prev, [label]: false }));
      setSavingImageLabel(label);
      await new Promise((r) => setTimeout(r, 350));
      const el = document.querySelector<HTMLElement>(`[data-order-print="${label}"]`);
      if (!el) {
        setSavingImageLabel(null);
        alert("해당 발주 섹션을 찾을 수 없습니다.");
        return;
      }
      try {
        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          cacheBust: true,
        });
        const link = document.createElement("a");
        link.href = dataUrl;
        const safeLabel = getOrderDisplayTitle(label).replace(/[/\\?%*:|"]/g, "_");
        link.download = `${safeLabel}_${selectedEstimate?.title ?? "발주"}_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      } catch (e) {
        console.error(e);
        alert("이미지 저장에 실패했습니다.");
      } finally {
        setSavingImageLabel(null);
      }
    },
    [selectedEstimate?.title, getOrderDisplayTitle]
  );

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="mb-4 text-xl font-semibold text-gray-900">자재 발주</h1>
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">자재 발주</h1>
      <p className="mb-6 text-sm text-gray-600">견적을 선택하면 자재 항목만 필터해 표시합니다. 엑셀 내보내기 후 발주에 활용하세요.</p>

      {selectedEstimateId == null ? (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3">
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
            <table className="w-full min-w-[680px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="row-actions-sticky w-44 p-2 sm:hidden">제목</th>
                  <th className="p-2 sm:p-3">견적일자</th>
                  <th className="p-2 sm:p-3">고객명</th>
                  <th className="p-2 sm:p-3">연락처</th>
                  <th className="hidden p-2 sm:table-cell sm:p-3">제목</th>
                  <th className="p-2 sm:p-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEstimates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      {estimates.length === 0
                        ? "저장된 견적이 없습니다."
                        : "표시할 견적이 없습니다. '완료된 항목 보기'를 켜 보세요."}
                    </td>
                  </tr>
                ) : (
                  filteredEstimates.map((est) => {
                    const subtotal = (est.items || []).reduce(
                      (s, itm) => s + materialAmount(itm), 0
                    );
                    const titleSpan = (
                      <span className="text-blue-600 hover:underline">{est.title || "-"}</span>
                    );
                    return (
                      <tr
                        key={est.id}
                        onClick={() => setSelectedEstimateId(est.id)}
                        className="text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="row-actions-sticky p-2 align-middle sm:hidden">
                          <div className="max-w-[12rem] truncate" title={est.title || ""}>{titleSpan}</div>
                        </td>
                        <td className="p-2 sm:p-3">{est.estimateDate ? est.estimateDate.slice(0, 10) : "-"}</td>
                        <td className="p-2 sm:p-3 font-medium">{est.customerName || "-"}</td>
                        <td className="p-2 sm:p-3">{est.contact || "-"}</td>
                        <td className="hidden p-2 sm:table-cell sm:p-3">
                          <div className="max-w-[18rem] truncate" title={est.title || ""}>{titleSpan}</div>
                        </td>
                        <td className="p-2 sm:p-3 text-right tabular-nums">{formatNum(subtotal)}원</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setSelectedEstimateId(null)}
            className="mb-4 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← 목록으로
          </button>

        {selectedEstimate && (
          <>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
              <div className="font-medium text-gray-800">{selectedEstimate.title || "제목 없음"}</div>
              <div className="mt-1 text-gray-600">고객: {selectedEstimate.customerName || "-"}</div>
              <div className="text-gray-600">주소: {selectedEstimate.address || "-"}</div>
              {selectedConsultation && (
                <>
                  <div className="mt-1 text-gray-600">자재 미팅일: {selectedConsultation.materialMeetingAt || "-"}</div>
                  <div className="text-gray-600">
                    발주 완료: {selectedConsultation.materialOrderedAt ? selectedConsultation.materialOrderedAt : "미완료"}
                  </div>
                </>
              )}
            </div>

            {/* 필수 기입란 */}
            <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <span className="rounded bg-amber-400 px-1.5 py-0.5 text-xs text-white">필수</span>
                필수 기입란
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    발주일 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={requiredOrderDate}
                    readOnly
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
                    title="오늘 날짜로 고정됩니다. 발주별로 따로 기록됩니다."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">담당업체</label>
                  <input
                    type="text"
                    value={companyName}
                    readOnly
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
                    placeholder="로그인한 업체명이 표시됩니다"
                    title="로그인한 업체명 (발주서 저장 시 자동 포함)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    현장명(프로젝트명) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={requiredSiteName}
                    onChange={(e) => setRequiredSiteName(e.target.value)}
                    placeholder="예: OO아파트 101동 605호"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    담당자 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={requiredContactName}
                    onChange={(e) => {
                      const name = e.target.value;
                      const pic = picList.find((p) => p.name === name);
                      setRequiredContactName(name);
                      setRequiredContactPhone(pic?.phone ?? "");
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">마스터 관리 담당자 선택</option>
                    {picList.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name}
                        {p.phone ? ` (${p.phone})` : ""}
                      </option>
                    ))}
                  </select>
                  {picList.length === 0 && (
                    <p className="mt-1 text-xs text-amber-700">관리 → 담당자 설정에서 담당자를 등록해 주세요.</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    연락처 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={requiredContactPhone}
                    readOnly
                    className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700"
                    placeholder="담당자 선택 시 자동 입력"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    배송지 주소 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={requiredDeliveryAddress}
                    onChange={(e) => setRequiredDeliveryAddress(e.target.value)}
                    placeholder="자재 배송 받을 주소"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {!requiredFilled && (
                <p className="mt-2 text-xs text-amber-700">
                  * 표시된 항목을 모두 입력해 주세요. 각 발주별로 입하 예정일을 위에서 선택해 주세요.
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-600">템플릿 불러오기:</span>
                    <button
                      type="button"
                      onClick={loadDefaultTemplate}
                      disabled={templateLoadType !== null}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      title="마스터 관리에서 등록한 기본서식"
                    >
                      {templateLoadType === "default" ? "불러오는 중…" : "기본서식"}
                    </button>
                    <button
                      type="button"
                      onClick={loadCompanyTemplate}
                      disabled={templateLoadType !== null}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      title="관리 → 자재발주 서식관리에서 저장한 우리회사 템플릿"
                    >
                      {templateLoadType === "company" ? "불러오는 중…" : "우리회사 템플릿"}
                    </button>
                    <button
                      type="button"
                      onClick={loadEmptyTemplate}
                      disabled={templateLoadType !== null}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      title="마스터/우리회사에 저장된 품목 없이, 기본 발주 유형만 두고 빈 행으로 시작합니다."
                    >
                      빈 템플릿
                    </button>
                    <span className="text-gray-400">|</span>
                    <button
                      type="button"
                      onClick={handleAddOrderType}
                      className="rounded-lg border-2 border-blue-400 bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                    >
                      + 발주 유형 추가
                    </button>
                    <span className="text-gray-400">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedByLabel(
                          Object.fromEntries(itemsByCategory.map(({ label }) => [label, true]))
                        )
                      }
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      전체 접기
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollapsedByLabel({})}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      전체 펼치기
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-2.5 text-sm">
                  <span className="font-medium text-gray-700">발주 금액 합계 (모든 유형)</span>
                  <span className="text-base font-semibold tabular-nums text-blue-900">
                    {formatNum(orderGrandTotal)}원
                  </span>
                </div>
                <div className="mt-4 space-y-6">
                  {itemsByCategory.map(({ label, items: catItems }) => {
                    const isCollapsed = collapsedByLabel[label] ?? false;
                    const labelTotal = orderAmountByLabel[label] ?? 0;
                    return (
                      <div key={label} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex w-full items-center gap-2 border-b border-gray-200 bg-gray-100 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedByLabel((prev) => ({ ...prev, [label]: !(prev[label] ?? false) }))
                            }
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left font-medium text-gray-800 hover:bg-gray-200 rounded -m-2 p-2"
                          >
                            <span className="truncate">{getOrderDisplayTitle(label)}</span>
                            <span className="shrink-0 text-gray-500">
                              {(() => {
                                const added = addedRowsByLabel[label] ?? [];
                                const total = catItems.length + added.length;
                                return total > 0 ? `${total}개 항목` : "해당 항목 없음";
                              })()}
                            </span>
                            {labelTotal > 0 && (
                              <span className="shrink-0 font-semibold tabular-nums text-blue-800">
                                {formatNum(labelTotal)}원
                              </span>
                            )}
                            <span className="text-gray-500 shrink-0" aria-hidden>
                              {isCollapsed ? "▶" : "▼"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRenameOrderType(label); }}
                            className="shrink-0 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            title="이 발주 제목 수정"
                          >
                            제목 수정
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveOrderType(label); }}
                            className="shrink-0 rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                            title="이 발주 유형 삭제"
                          >
                            발주 삭제
                          </button>
                        </div>
                        {!isCollapsed && (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="text-sm font-medium text-gray-700">
                                    입하 예정일 <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={deliveryDateByLabel[label] ?? ""}
                                    onChange={(e) =>
                                      setDeliveryDateByLabel((prev) => ({ ...prev, [label]: e.target.value }))
                                    }
                                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewLabel(label)}
                                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    발주서 미리보기
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveOrderSectionAsImage(label)}
                                    disabled={savingImageLabel !== null}
                                    className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    {savingImageLabel === label ? "저장 중…" : "발주서 저장"}
                                  </button>
                                </div>
                              </div>
                              {/* 화면(1번): 위 필수 기입란에 내용이 있으므로 발주 표에는 요약(2번 양식) 표시 안 함. 2번 양식은 발주서 저장 시에만 사용 */}
                              <div data-order-label={label} className="px-4 py-2">
                                {(catItems.length === 0 && (addedRowsByLabel[label] ?? []).length === 0) ? (
                                  <p className="py-4 text-center text-sm text-gray-500">해당 항목 없음</p>
                                ) : (
                                <div className="material-order-edit-table-wrap overflow-x-auto">
                          <table
                            className="material-order-edit-table w-full min-w-[980px] border-collapse text-left text-sm"
                            style={{ border: "1px solid #374151" }}
                          >
                            <thead>
                              <tr className="bg-gray-200 text-gray-800">
                                <th className="w-56 whitespace-nowrap border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>품목</th>
                                <th className="w-48 whitespace-nowrap border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>규격</th>
                                <th className="w-12 whitespace-nowrap border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>단위</th>
                                <th className="w-16 whitespace-nowrap border border-gray-500 px-2 py-1.5 text-right font-medium" style={{ border: "1px solid #374151" }}>수량</th>
                                <th className="w-24 whitespace-nowrap border border-gray-500 px-2 py-1.5 text-right font-medium" style={{ border: "1px solid #374151" }}>단가</th>
                                <th className="w-24 whitespace-nowrap border border-gray-500 px-2 py-1.5 text-right font-medium" style={{ border: "1px solid #374151" }}>자재 금액</th>
                                <th className="min-w-[140px] whitespace-nowrap border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>비고</th>
                                <th className="material-order-link-col hidden md:table-cell min-w-[220px] whitespace-nowrap border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>비밀몰 링크</th>
                                <th className="w-14 whitespace-nowrap border border-gray-500 px-1 py-1.5 text-center font-medium" style={{ border: "1px solid #374151" }}>삭제</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catItems.map((it, idx) => {
                                const rowKey = selectedEstimateId != null ? `${selectedEstimateId}-${label}-${idx}` : "";
                                const candidates = getShopCandidates(label, String(it.category ?? ""), String(it.spec ?? ""));
                                const selectedSku = shopSkuByRowKey[rowKey] ?? (candidates[0]?.sku ?? "");
                                return (
                                  <tr key={`est-${idx}`} className="bg-white hover:bg-gray-50/80">
                                    <td className="min-w-[220px] border border-gray-300 px-2 py-1 text-gray-800">{it.category ?? ""}</td>
                                    <td className="min-w-[180px] border border-gray-300 px-2 py-1 text-gray-700">{it.spec ?? ""}</td>
                                    <td className="border border-gray-300 px-2 py-1 text-gray-700">{it.unit ?? ""}</td>
                                    <td className="border border-gray-300 px-2 py-1 text-right text-gray-800">{formatNum(Number(it.qty) || 0)}</td>
                                    <td className="border border-gray-300 px-2 py-1 text-right text-gray-800">
                                      {formatNum(Number(it.materialUnitPrice ?? it.unitPrice ?? 0) || 0)}
                                    </td>
                                    <td className="border border-gray-300 px-2 py-1 text-right font-medium text-gray-900">
                                      {formatNum(materialAmount(it))}
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        value={memoByKey[rowKey] ?? it.note ?? ""}
                                        onChange={(e) =>
                                          setMemoByKey((prev) => ({ ...prev, [rowKey]: e.target.value }))
                                        }
                                        placeholder="발주 시 메모"
                                        data-order-label={label}
                                        data-order-row={idx}
                                        data-order-col={6}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full min-w-[120px] border-0 bg-transparent px-2 py-1 text-sm text-gray-700 focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="material-order-link-col hidden md:table-cell border border-gray-300 px-2 py-1">
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={selectedSku}
                                          onChange={(e) => setShopSkuByRowKey((prev) => ({ ...prev, [rowKey]: e.target.value }))}
                                          className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 text-xs"
                                        >
                                          <option value="">선택 없음</option>
                                          {candidates.map((p) => (
                                            <option key={p.sku} value={p.sku}>
                                              {p.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => window.open(`/shop-secret/products/${encodeURIComponent(selectedSku)}`, "_blank")}
                                          disabled={!selectedSku}
                                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50"
                                        >
                                          이동
                                        </button>
                                      </div>
                                    </td>
                                    <td className="border border-gray-300 px-1 py-1" />
                                  </tr>
                                );
                              })}
                              {(addedRowsByLabel[label] ?? []).map((row, idx) => {
                                const rowKey = `added-${label}-${row.id}`;
                                const candidates = getShopCandidates(label, row.category, row.spec);
                                const selectedSku = shopSkuByRowKey[rowKey] ?? (candidates[0]?.sku ?? "");
                                const qtyNum = Number(row.qty) || 0;
                                const unitNum = Number(row.materialUnitPrice) || 0;
                                const amount = qtyNum * unitNum;
                                const addedRowIndex = catItems.length + idx;
                                return (
                                  <tr key={`added-${idx}`} className="bg-white hover:bg-gray-50/80">
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        value={row.category}
                                        onChange={(e) =>
                                          setAddedRowsByLabel((prev) => {
                                            const list = [...(prev[label] ?? [])];
                                            list[idx] = { ...list[idx], category: e.target.value };
                                            return { ...prev, [label]: list };
                                          })
                                        }
                                        placeholder="품목 선택 또는 입력"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={0}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full min-w-[220px] border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                                        title="마스터관리에서 등록한 품목 목록에서 선택하거나 직접 입력할 수 있습니다."
                                      />
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        value={row.spec}
                                        onChange={(e) =>
                                          setAddedRowsByLabel((prev) => {
                                            const list = [...(prev[label] ?? [])];
                                            list[idx] = { ...list[idx], spec: e.target.value };
                                            return { ...prev, [label]: list };
                                          })
                                        }
                                        placeholder="규격"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={1}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full min-w-[180px] border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        value={row.unit}
                                        onChange={(e) =>
                                          setAddedRowsByLabel((prev) => {
                                            const list = [...(prev[label] ?? [])];
                                            list[idx] = { ...list[idx], unit: e.target.value };
                                            return { ...prev, [label]: list };
                                          })
                                        }
                                        placeholder="단위"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={2}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={row.qty}
                                        onChange={(e) =>
                                          setAddedRowsByLabel((prev) => {
                                            const list = [...(prev[label] ?? [])];
                                            list[idx] = { ...list[idx], qty: e.target.value };
                                            return { ...prev, [label]: list };
                                          })
                                        }
                                        placeholder="수량"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={3}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-right text-sm focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={row.materialUnitPrice}
                                        onChange={(e) =>
                                          setAddedRowsByLabel((prev) => {
                                            const list = [...(prev[label] ?? [])];
                                            list[idx] = { ...list[idx], materialUnitPrice: e.target.value };
                                            return { ...prev, [label]: list };
                                          })
                                        }
                                        placeholder="단가"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={4}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-right text-sm focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="border border-gray-300 px-2 py-1 text-right font-medium text-gray-900">
                                      {formatNum(amount)}
                                    </td>
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        value={memoByKey[rowKey] ?? row.note ?? ""}
                                        onChange={(e) =>
                                          setMemoByKey((prev) => ({ ...prev, [rowKey]: e.target.value }))
                                        }
                                        placeholder="비고"
                                        data-order-label={label}
                                        data-order-row={addedRowIndex}
                                        data-order-col={6}
                                        onKeyDown={handleOrderTableKeyDown}
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                                      />
                                    </td>
                                    <td className="material-order-link-col hidden md:table-cell border border-gray-300 px-2 py-1">
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={selectedSku}
                                          onChange={(e) => setShopSkuByRowKey((prev) => ({ ...prev, [rowKey]: e.target.value }))}
                                          className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 text-xs"
                                        >
                                          <option value="">선택 없음</option>
                                          {candidates.map((p) => (
                                            <option key={p.sku} value={p.sku}>
                                              {p.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => window.open(`/shop-secret/products/${encodeURIComponent(selectedSku)}`, "_blank")}
                                          disabled={!selectedSku}
                                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 disabled:opacity-50"
                                        >
                                          이동
                                        </button>
                                      </div>
                                    </td>
                                    <td className="border border-gray-300 px-1 py-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setAddedRowsByLabel((prev) => ({
                                            ...prev,
                                            [label]: (prev[label] ?? []).filter((r) => r.id !== row.id),
                                          }))
                                        }
                                        className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            {(catItems.length > 0 || (addedRowsByLabel[label] ?? []).length > 0) && (
                              <tfoot>
                                <tr className="bg-amber-50/90 font-semibold text-gray-900">
                                  <td
                                    colSpan={5}
                                    className="border border-gray-300 px-2 py-2 text-right text-sm"
                                    style={{ border: "1px solid #374151" }}
                                  >
                                    소계
                                  </td>
                                  <td
                                    className="border border-gray-300 px-2 py-2 text-right tabular-nums"
                                    style={{ border: "1px solid #374151" }}
                                  >
                                    {formatNum(labelTotal)}
                                  </td>
                                  <td colSpan={3} className="border border-gray-300" style={{ border: "1px solid #374151" }} />
                                </tr>
                              </tfoot>
                            )}
                          </table>
                                </div>
                                )}
                              </div>
                              <div className="border-t border-gray-200 bg-gray-50 px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAddedRowsByLabel((prev) => ({
                                      ...prev,
                                      [label]: [...(prev[label] ?? []), createEmptyAddedRow()],
                                    }))
                                  }
                                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                                >
                                  + 행 추가
                                </button>
                              </div>
                            </>
                          )}
                      </div>
                    );
                  })}
                </div>
                {/* 발주서 미리보기 모달 — 저장 시 나갈 2번 양식 그대로 표시 */}
                {previewLabel && (() => {
                  const allCatItems = itemsByCategory.find((c) => c.label === previewLabel)?.items ?? [];
                  const allAddedRows = addedRowsByLabel[previewLabel] ?? [];
                  const catItems = allCatItems.filter((it) => (Number(it.qty) || 0) > 0);
                  const addedRows = allAddedRows.filter((row) => (Number(row.qty) || 0) > 0);
                  const hasItems = catItems.length > 0 || addedRows.length > 0;
                  const borderStyle = { border: "1px solid #374151" } as const;
                  return (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                      onClick={() => setPreviewLabel(null)}
                      role="dialog"
                      aria-modal="true"
                      aria-label="발주서 미리보기"
                    >
                      <div
                        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
                          <span className="font-medium text-gray-800">발주서 미리보기</span>
                          <button
                            type="button"
                            onClick={() => setPreviewLabel(null)}
                            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            닫기
                          </button>
                        </div>
                        <div className="border border-gray-300 bg-white px-4 py-4" style={{ minWidth: 560 }}>
                          <div className="mb-4 text-center text-xl font-semibold text-gray-900">
                            {getOrderSheetTitle(previewLabel)}
                          </div>
                          <table className="mb-4 w-full border-collapse text-sm" style={borderStyle}>
                            <tbody>
                              <tr>
                                <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>현장명</th>
                                <td colSpan={3} className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredSiteName || ""}</td>
                              </tr>
                              <tr>
                                <th className="border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>주소</th>
                                <td colSpan={3} className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredDeliveryAddress || ""}</td>
                              </tr>
                              <tr>
                                <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>담당업체</th>
                                <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{companyName || ""}</td>
                                <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>입하예정일</th>
                                <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{deliveryDateByLabel[previewLabel] || ""}</td>
                              </tr>
                              <tr>
                                <th className="border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>담당자</th>
                                <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredContactName || ""}</td>
                                <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>연락처</th>
                                <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredContactPhone || ""}</td>
                              </tr>
                            </tbody>
                          </table>
                          {!hasItems ? (
                            <p className="py-4 text-center text-sm text-gray-500">해당 항목 없음</p>
                          ) : (
                            <table className="w-full border-collapse text-left text-sm" style={borderStyle}>
                              <thead>
                                <tr className="bg-gray-200 text-gray-800">
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium" style={borderStyle}>품목</th>
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium" style={borderStyle}>규격</th>
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium w-12" style={borderStyle}>단위</th>
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-16" style={borderStyle}>수량</th>
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium min-w-[100px]" style={borderStyle}>비고</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catItems.map((it, idx) => {
                                  const rowKey = selectedEstimateId != null ? `${selectedEstimateId}-${previewLabel}-${idx}` : "";
                                  return (
                                    <tr key={`pv-est-${idx}`} className="bg-white">
                                      <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{it.category ?? ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{it.spec ?? ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{it.unit ?? ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(Number(it.qty) || 0)}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? it.note ?? ""}</td>
                                    </tr>
                                  );
                                })}
                                {addedRows.map((row, idx) => {
                                  const rowKey = `added-${previewLabel}-${row.id}`;
                                  const qtyNum = Number(row.qty) || 0;
                                  return (
                                    <tr key={`pv-added-${idx}`} className="bg-white">
                                      <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{row.category || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.spec || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.unit || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(qtyNum)}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? row.note ?? ""}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* 발주서 저장 시 캡처용 — 사용자가 준 표 그대로(삭제 열 없음, 7열만). 화면 밖에 렌더 */}
                <div className="fixed left-[-9999px] top-0 z-[-1] w-[600px]" aria-hidden>
                  {itemsByCategory.map(({ label, items: allCatItems }) => {
                    const allAddedRows = addedRowsByLabel[label] ?? [];
                    const catItems = allCatItems.filter((it) => (Number(it.qty) || 0) > 0);
                    const addedRows = allAddedRows.filter((row) => (Number(row.qty) || 0) > 0);
                    const hasItems = catItems.length > 0 || addedRows.length > 0;
                    const borderStyle = { border: "1px solid #374151" } as const;
                    return (
                      <div
                        key={label}
                        data-order-print={label}
                        className="border border-gray-300 bg-white px-4 py-4"
                        style={{ minWidth: 560 }}
                      >
                        <div className="mb-4 text-center text-xl font-semibold text-gray-900">
                          {getOrderSheetTitle(label)}
                        </div>
                        <table className="mb-4 w-full border-collapse text-sm" style={borderStyle}>
                          <tbody>
                            <tr>
                              <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>현장명</th>
                              <td colSpan={3} className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredSiteName || ""}</td>
                            </tr>
                            <tr>
                              <th className="border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>주소</th>
                              <td colSpan={3} className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredDeliveryAddress || ""}</td>
                            </tr>
                            <tr>
                              <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>담당업체</th>
                              <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{companyName || ""}</td>
                              <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>입하예정일</th>
                              <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{deliveryDateByLabel[label] || ""}</td>
                            </tr>
                            <tr>
                              <th className="border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>담당자</th>
                              <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredContactName || ""}</td>
                              <th className="w-24 border border-gray-500 bg-gray-100 px-2 py-2 text-left font-medium text-gray-800" style={borderStyle}>연락처</th>
                              <td className="border border-gray-500 px-2 py-2 text-gray-900" style={borderStyle}>{requiredContactPhone || ""}</td>
                            </tr>
                          </tbody>
                        </table>
                        {!hasItems ? (
                          <p className="py-4 text-center text-sm text-gray-500">해당 항목 없음</p>
                        ) : (
                          <table className="w-full border-collapse text-left text-sm" style={borderStyle}>
                            <thead>
                              <tr className="bg-gray-200 text-gray-800">
                                <th className="border border-gray-500 px-2 py-1.5 font-medium" style={borderStyle}>품목</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium" style={borderStyle}>규격</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium w-12" style={borderStyle}>단위</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-16" style={borderStyle}>수량</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium min-w-[100px]" style={borderStyle}>비고</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catItems.map((it, idx) => {
                                const rowKey = selectedEstimateId != null ? `${selectedEstimateId}-${label}-${idx}` : "";
                                return (
                                  <tr key={`p-est-${idx}`} className="bg-white">
                                    <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{it.category ?? ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{it.spec ?? ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{it.unit ?? ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(Number(it.qty) || 0)}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? it.note ?? ""}</td>
                                  </tr>
                                );
                              })}
                              {addedRows.map((row, idx) => {
                                const rowKey = `added-${label}-${row.id}`;
                                const qtyNum = Number(row.qty) || 0;
                                return (
                                  <tr key={`p-added-${idx}`} className="bg-white">
                                    <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{row.category || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.spec || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.unit || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(qtyNum)}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? row.note ?? ""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <div className="mb-4 text-right text-sm font-medium text-gray-800">
                    자재 합계: {formatNum(totalMaterialAmount)}원
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={saveDraftLoading || selectedEstimateId == null}
                      className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saveDraftLoading ? "저장 중…" : "저장"}
                    </button>
                    <button
                      type="button"
                      onClick={exportToExcel}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      엑셀 내보내기
                    </button>
                    {selectedConsultation && (
                      <button
                        type="button"
                        onClick={markOrderDone}
                        disabled={orderSaving}
                        className="rounded-lg border border-emerald-600 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {orderSaving ? "저장 중…" : selectedConsultation.materialOrderedAt ? "발주 완료일 갱신" : "발주 완료"}
                      </button>
                    )}
                  </div>
                </div>
          </>
        )}
        </div>
      )}
    </div>
  );
}

export default MaterialOrderPage;
