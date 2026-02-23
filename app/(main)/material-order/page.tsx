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

/** 발주 유형 10개 (고정 순서). 공정/품목 키워드로 매칭 */
const ORDER_CATEGORIES: { label: string; keywords: string[] }[] = [
  { label: "목재발주", keywords: ["목재"] },
  { label: "중문발주", keywords: ["중문"] },
  { label: "조명", keywords: ["조명", "전기조명"] },
  { label: "전기부자재 발주", keywords: ["전기"] },
  { label: "타일(화장실용품)발주", keywords: ["타일", "도기", "화장실"] },
  { label: "목공방재발주", keywords: ["목공", "목공방재"] },
  { label: "도배발주", keywords: ["도배"] },
  { label: "바닥재발주", keywords: ["마루", "바닥", "바닥재"] },
  { label: "필름발주", keywords: ["필름"] },
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

export default function MaterialOrderPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [picList, setPicList] = useState<PicItem[]>([]);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderSaving, setOrderSaving] = useState(false);

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
  /** 품목 드롭다운용 기본 품목명 목록 (마스터에서 설정) */
  const [orderItemNames, setOrderItemNames] = useState<string[]>([]);

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
    Promise.allSettled([
      fetch("/api/estimates").then((r) => r.json()),
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/company/pics").then((r) => r.json()),
      fetch("/api/company/me").then((r) => r.json()),
      fetch("/api/company/order-item-names").then((r) => r.json()),
      fetch("/api/company/order-default-items").then((r) => r.json()),
    ]).then(([estRes, consRes, picsRes, meRes, namesRes, defaultRes]) => {
      const est = estRes.status === "fulfilled" ? estRes.value : [];
      const cons = consRes.status === "fulfilled" ? consRes.value : [];
      const pics = picsRes.status === "fulfilled" ? picsRes.value : [];
      const me = meRes.status === "fulfilled" ? meRes.value : null;
      const namesData = namesRes.status === "fulfilled" ? namesRes.value : { itemNames: [] };
      const defaultData = defaultRes.status === "fulfilled" ? defaultRes.value : { itemsByLabel: {} };
      setEstimates(Array.isArray(est) ? est : []);
      setConsultations(Array.isArray(cons) ? cons : []);
      setPicList(Array.isArray(pics) ? pics : []);
      const company = (me as { company?: { name?: string; code?: string } } | null)?.company;
      setCompanyName(company?.name ?? company?.code ?? "");
      setOrderItemNames(Array.isArray(namesData?.itemNames) ? namesData.itemNames : []);
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
      if (Array.isArray(est) && est.length > 0 && !selectedEstimateId) {
        setSelectedEstimateId((est as Estimate[])[0].id);
      }
    }).finally(() => setLoading(false));
  }, []);

  const selectedEstimate = useMemo(
    () => estimates.find((e) => e.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId]
  );

  const selectedConsultation = useMemo(() => {
    if (!selectedEstimate?.consultationId) return null;
    return consultations.find((c) => c.id === selectedEstimate.consultationId) ?? null;
  }, [consultations, selectedEstimate]);

  /** 견적 선택 시 현장명·배송지 자동 채움 */
  useEffect(() => {
    if (!selectedEstimate) return;
    setRequiredSiteName((prev) => (prev === "" ? selectedEstimate.title ?? "" : prev));
    setRequiredDeliveryAddress((prev) => (prev === "" ? selectedEstimate.address ?? "" : prev));
  }, [selectedEstimate?.id]);

  /** 발주 기본 폼: 목재발주와 동일한 구조. 견적서에서 읽어오는 건 추후 적용 */
  const ORDER_LABELS = useMemo(
    () => [...ORDER_CATEGORIES.map((c) => c.label), "기타"],
    []
  );

  /** 발주 유형별로 그룹 (순서: 10개 + 기타). 현재는 견적 항목 없이 빈 목록만 사용 */
  const itemsByCategory = useMemo(
    () => ORDER_LABELS.map((label) => ({ label, items: [] as EstimateItem[] })),
    [ORDER_LABELS]
  );

  /** 모든 발주 유형에 기본 행 1개씩 추가 (목재발주 폼과 동일) */
  useEffect(() => {
    if (!selectedEstimateId) return;
    const next: Record<string, AddedOrderRow[]> = {};
    let changed = false;
    ORDER_LABELS.forEach((label) => {
      const current = addedRowsByLabel[label] ?? [];
      if (current.length === 0) {
        next[label] = [createEmptyAddedRow()];
        changed = true;
      }
    });
    if (changed) {
      setAddedRowsByLabel((prev) => ({ ...prev, ...next }));
    }
  }, [selectedEstimateId, ORDER_LABELS, addedRowsByLabel]);

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
        const safeLabel = label.replace(/[/\\?%*:|"]/g, "_");
        link.download = `${safeLabel}_${selectedEstimate?.title ?? "발주"}_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      } catch (e) {
        console.error(e);
        alert("이미지 저장에 실패했습니다.");
      } finally {
        setSavingImageLabel(null);
      }
    },
    [selectedEstimate?.title]
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

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-gray-700">프로젝트(견적) 선택</label>
        <select
          value={selectedEstimateId ?? ""}
          onChange={(e) => setSelectedEstimateId(Number(e.target.value) || null)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">선택하세요</option>
          {estimates.map((e) => (
            <option key={e.id} value={e.id}>
              {e.customerName || "고객"} / {e.title || "제목 없음"} (견적 #{e.id})
            </option>
          ))}
        </select>

        {selectedEstimate && (
          <>
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
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

            {/* 품목 드롭다운용 목록 (마스터에서 설정한 기본 품목, 선택 또는 직접 입력 가능) */}
            <datalist id="order-item-names-datalist">
              {orderItemNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="mt-4 flex flex-wrap gap-2">
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
                <div className="mt-4 space-y-6">
                  {itemsByCategory.map(({ label, items: catItems }) => {
                    const isCollapsed = collapsedByLabel[label] ?? false;
                    return (
                      <div key={label} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedByLabel((prev) => ({ ...prev, [label]: !(prev[label] ?? false) }))
                          }
                          className="flex w-full items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-2.5 text-left font-medium text-gray-800 hover:bg-gray-200"
                        >
                          <span>{label}</span>
                          <span className="text-gray-500">
                            {(() => {
                              const added = addedRowsByLabel[label] ?? [];
                              const total = catItems.length + added.length;
                              return total > 0 ? `${total}개 항목` : "해당 항목 없음";
                            })()}
                          </span>
                          <span className="text-gray-500" aria-hidden>
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                        </button>
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
                                <div className="overflow-x-auto">
                          <table
                            className="w-full min-w-[780px] border-collapse text-left text-sm"
                            style={{ border: "1px solid #374151" }}
                          >
                            <thead>
                              <tr className="bg-gray-200 text-gray-800">
                                <th className="border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>품목</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>규격</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium w-12" style={{ border: "1px solid #374151" }}>단위</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-16" style={{ border: "1px solid #374151" }}>수량</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={{ border: "1px solid #374151" }}>단가</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={{ border: "1px solid #374151" }}>자재 금액</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium min-w-[140px]" style={{ border: "1px solid #374151" }}>비고</th>
                                <th className="w-14 border border-gray-500 px-1 py-1.5 font-medium" style={{ border: "1px solid #374151" }}>삭제</th>
                              </tr>
                            </thead>
                            <tbody>
                              {catItems.map((it, idx) => {
                                const rowKey = selectedEstimateId != null ? `${selectedEstimateId}-${label}-${idx}` : "";
                                return (
                                  <tr key={`est-${idx}`} className="bg-white hover:bg-gray-50/80">
                                    <td className="border border-gray-300 px-2 py-1 text-gray-800">{it.category ?? ""}</td>
                                    <td className="border border-gray-300 px-2 py-1 text-gray-700">{it.spec ?? ""}</td>
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
                                    <td className="border border-gray-300 px-1 py-1" />
                                  </tr>
                                );
                              })}
                              {(addedRowsByLabel[label] ?? []).map((row, idx) => {
                                const rowKey = `added-${label}-${row.id}`;
                                const qtyNum = Number(row.qty) || 0;
                                const unitNum = Number(row.materialUnitPrice) || 0;
                                const amount = qtyNum * unitNum;
                                const addedRowIndex = catItems.length + idx;
                                return (
                                  <tr key={`added-${idx}`} className="bg-white hover:bg-gray-50/80">
                                    <td className="border border-gray-300 p-0">
                                      <input
                                        type="text"
                                        list="order-item-names-datalist"
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
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
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
                                        className="h-full min-h-[28px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
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
                          </table>
                                </div>
                                )}
                              </div>
                              {!(catItems.length === 0 && (addedRowsByLabel[label] ?? []).length === 0) && (
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
                              )}
                            </>
                          )}
                      </div>
                    );
                  })}
                </div>
                {/* 발주서 미리보기 모달 — 저장 시 나갈 2번 양식 그대로 표시 */}
                {previewLabel && (() => {
                  const catItems = itemsByCategory.find((c) => c.label === previewLabel)?.items ?? [];
                  const addedRows = addedRowsByLabel[previewLabel] ?? [];
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
                            {previewLabel.endsWith("발주") ? previewLabel.replace(/발주$/, " 발주서") : `${previewLabel} 발주서`}
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
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={borderStyle}>단가</th>
                                  <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={borderStyle}>자재 금액</th>
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
                                      <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(Number(it.materialUnitPrice ?? it.unitPrice ?? 0) || 0)}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right font-medium text-gray-900" style={borderStyle}>{formatNum(materialAmount(it))}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? it.note ?? ""}</td>
                                    </tr>
                                  );
                                })}
                                {addedRows.map((row, idx) => {
                                  const rowKey = `added-${previewLabel}-${row.id}`;
                                  const qtyNum = Number(row.qty) || 0;
                                  const unitNum = Number(row.materialUnitPrice) || 0;
                                  const amount = qtyNum * unitNum;
                                  return (
                                    <tr key={`pv-added-${idx}`} className="bg-white">
                                      <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{row.category || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.spec || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.unit || ""}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(qtyNum)}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(unitNum)}</td>
                                      <td className="border border-gray-500 px-2 py-1 text-right font-medium text-gray-900" style={borderStyle}>{formatNum(amount)}</td>
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
                  {itemsByCategory.map(({ label, items: catItems }) => {
                    const addedRows = addedRowsByLabel[label] ?? [];
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
                          {label.endsWith("발주") ? label.replace(/발주$/, " 발주서") : `${label} 발주서`}
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
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={borderStyle}>단가</th>
                                <th className="border border-gray-500 px-2 py-1.5 font-medium text-right w-24" style={borderStyle}>자재 금액</th>
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
                                    <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(Number(it.materialUnitPrice ?? it.unitPrice ?? 0) || 0)}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right font-medium text-gray-900" style={borderStyle}>{formatNum(materialAmount(it))}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{memoByKey[rowKey] ?? it.note ?? ""}</td>
                                  </tr>
                                );
                              })}
                              {addedRows.map((row, idx) => {
                                const rowKey = `added-${label}-${row.id}`;
                                const qtyNum = Number(row.qty) || 0;
                                const unitNum = Number(row.materialUnitPrice) || 0;
                                const amount = qtyNum * unitNum;
                                return (
                                  <tr key={`p-added-${idx}`} className="bg-white">
                                    <td className="border border-gray-500 px-2 py-1 text-gray-800" style={borderStyle}>{row.category || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.spec || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-gray-700" style={borderStyle}>{row.unit || ""}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(qtyNum)}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right text-gray-800" style={borderStyle}>{formatNum(unitNum)}</td>
                                    <td className="border border-gray-500 px-2 py-1 text-right font-medium text-gray-900" style={borderStyle}>{formatNum(amount)}</td>
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

        {!selectedEstimate && estimates.length === 0 && (
          <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            등록된 견적이 없습니다. 견적 페이지에서 먼저 견적을 등록해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
