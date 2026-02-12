"use client";

import React, { useEffect, useState } from "react";

/** 도면 보관함 API에서 한 행 형식 (ERP에서 목록 불러올 때) */
type DrawingListRow = {
  siteName?: string;
  savedAt?: string;
  summary?: string;
  data?: { zones?: { name?: string; area?: string }[]; doors?: unknown[]; height?: number };
  현장명?: string;
  저장시각?: string;
  요약?: string;
  데이터?: { zones?: { name?: string; area?: string }[]; doors?: unknown[]; height?: number };
};

/** 도면 JSON → 견적용 payload (ERP에서 불러온 도면 데이터 변환) */
function drawingDataToPayload(
  drawingData: DrawingListRow["data"],
  summary?: string
): SmartFieldEstimatePayload {
  if (!drawingData) return {};
  const zones = drawingData.zones || [];
  const doors = drawingData.doors || [];
  const height = drawingData.height;
  const roomAreas = zones.map((z) => ({ name: z.name || "", area: parseFloat(String(z.area)) || 0 }));
  let totalArea = 0;
  roomAreas.forEach((r) => (totalArea += r.area));
  const dimensions: string[] = [];
  if (height) dimensions.push("천장고 " + (height / 1000).toFixed(1) + "m");
  if (summary) dimensions.push(summary);
  return {
    doorCount: doors.length,
    roomAreas,
    totalArea,
    dimensions: dimensions.join(", "),
  };
}

function getTodayDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

type EstimateItem = {
  processGroup?: string;
  category: string;
  spec: string;
  unit: string;
  qty: number;
  /** 재료비 단가 (기존 unitPrice 호환: 없으면 unitPrice 사용) */
  materialUnitPrice?: number;
  /** 노무비 단가 */
  laborUnitPrice?: number;
  unitPrice?: number;
  note: string;
};

/** 스마트 현장관리에서 보내는 데이터 형식 (해당 앱에서 postMessage로 전달 시 사용) */
export type SmartFieldEstimatePayload = {
  doorCount?: number;
  roomAreas?: { name: string; area: number }[];
  totalArea?: number;
  dimensions?: string;
  items?: EstimateItem[];
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName: string;
  contact: string;
  address: string;
  title: string;
  estimateDate?: string;
  note: string;
  items: EstimateItem[];
  createdAt?: string;
};

const emptyItem: EstimateItem = {
  processGroup: "",
  category: "",
  spec: "",
  unit: "식",
  qty: 1,
  materialUnitPrice: 0,
  laborUnitPrice: 0,
  note: "",
};

function materialAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const p = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) || 0;
  return q * p;
}
function laborAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const p = Number(item.laborUnitPrice ?? 0) || 0;
  return q * p;
}
function amount(item: EstimateItem): number {
  return materialAmount(item) + laborAmount(item);
}

/** 스마트 현장관리 페이로드 → 견적 항목으로 변환 (치수/문 개수/방면적 등) */
function smartFieldPayloadToItems(payload: SmartFieldEstimatePayload): EstimateItem[] {
  const result: EstimateItem[] = [];
  if (payload.items && payload.items.length > 0) {
    payload.items.forEach((it) =>
      result.push({
        processGroup: (it as EstimateItem).processGroup ?? "",
        category: it.category || "",
        spec: it.spec || "",
        unit: it.unit || "식",
        qty: Number(it.qty) || 0,
        materialUnitPrice: Number((it as EstimateItem).materialUnitPrice ?? it.unitPrice ?? 0) || 0,
        laborUnitPrice: Number((it as EstimateItem).laborUnitPrice ?? 0) || 0,
        note: it.note || "",
      })
    );
    return result;
  }
  if (payload.doorCount != null && payload.doorCount > 0) {
    result.push({
      processGroup: "",
      category: "문",
      spec: "문 개수",
      unit: "개",
      qty: Number(payload.doorCount),
      materialUnitPrice: 0,
      laborUnitPrice: 0,
      note: "",
    });
  }
  if (payload.roomAreas && payload.roomAreas.length > 0) {
    payload.roomAreas.forEach((r) => {
      result.push({
        processGroup: "",
        category: "방면적",
        spec: r.name || "",
        unit: "m²",
        qty: Number(r.area) || 0,
        materialUnitPrice: 0,
        laborUnitPrice: 0,
        note: "",
      });
    });
  }
  if (payload.totalArea != null && payload.totalArea > 0 && result.every((i) => i.category !== "전체면적")) {
    result.unshift({
      processGroup: "",
      category: "전체면적",
      spec: "계",
      unit: "m²",
      qty: Number(payload.totalArea),
      materialUnitPrice: 0,
      laborUnitPrice: 0,
      note: payload.dimensions || "",
    });
  } else if (payload.dimensions) {
    if (result.length > 0) result[0].note = payload.dimensions;
  }
  return result;
}

function EstimateForm({
  estimate,
  consultationPreFill,
  onSave,
  onCancel,
}: {
  estimate: Estimate | null;
  consultationPreFill: { customerName: string; contact: string; address: string; consultationId: number } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = estimate !== null;
  const [customerName, setCustomerName] = useState(estimate?.customerName ?? consultationPreFill?.customerName ?? "");
  const [contact, setContact] = useState(estimate?.contact ?? consultationPreFill?.contact ?? "");
  const [address, setAddress] = useState(estimate?.address ?? consultationPreFill?.address ?? "");
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [estimateDate, setEstimateDate] = useState(estimate?.estimateDate ?? getTodayDateLocal());
  const [note, setNote] = useState(estimate?.note ?? "");
  const [items, setItems] = useState<EstimateItem[]>(
    estimate?.items?.length
      ? estimate.items.map((i) => ({
          ...emptyItem,
          ...i,
          processGroup: i.processGroup ?? "",
          qty: Number(i.qty) || 0,
          materialUnitPrice: Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0,
          laborUnitPrice: Number(i.laborUnitPrice ?? 0) || 0,
        }))
      : [{ ...emptyItem }]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (consultationPreFill && !isEdit) {
      setCustomerName(consultationPreFill.customerName);
      setContact(consultationPreFill.contact);
      setAddress(consultationPreFill.address);
    }
  }, [consultationPreFill, isEdit]);

  const [smartFieldModalOpen, setSmartFieldModalOpen] = useState(false);
  const [smartFieldListUrl, setSmartFieldListUrl] = useState("");
  const [smartFieldList, setSmartFieldList] = useState<DrawingListRow[] | null>(null);
  const [smartFieldLoading, setSmartFieldLoading] = useState(false);
  /** 도면에서 불러온 참조값 (항목에 넣지 않고 상단 표로만 표시) */
  const [drawingReference, setDrawingReference] = useState<SmartFieldEstimatePayload | null>(null);

  // 회사 정보에서 API URL 가져오기
  useEffect(() => {
    fetch("/api/company")
      .then((res) => res.json())
      .then((data) => {
        if (data?.drawingListApiUrl) {
          setSmartFieldListUrl(data.drawingListApiUrl);
        }
      })
      .catch(() => {});
  }, []);

  const addRow = () =>
    setItems((prev) => [
      ...prev,
      { ...emptyItem, processGroup: prev.length > 0 ? prev[prev.length - 1].processGroup ?? "" : "" },
    ]);
  const addNewSection = () =>
    setItems((prev) => [...prev, { ...emptyItem, processGroup: `\u200B${Date.now()}` }]);
  
  const loadSmartFieldList = () => {
    const url = smartFieldListUrl.trim();
    if (!url) {
      alert("도면 목록 API URL을 입력해 주세요. 관리 페이지에서 설정할 수 있습니다.");
      return;
    }
    setSmartFieldLoading(true);
    setSmartFieldList(null);
    fetch(url)
      .then((res) => res.json())
      .then((raw) => {
        let arr: unknown[] = [];
        if (Array.isArray(raw)) arr = raw;
        else if (raw && typeof raw === "object") arr = (raw as { items?: unknown[] }).items ?? (raw as { data?: unknown[] }).data ?? (raw as { rows?: unknown[] }).rows ?? [];
        const list = arr as DrawingListRow[];
        setSmartFieldList(list);
        if (list.length === 0) alert("불러온 목록이 비어 있습니다. 스크립트에서 시트/열 구성을 확인해 주세요.");
      })
      .catch(() => {
        alert("목록을 불러오지 못했습니다. URL과 CORS 설정을 확인해 주세요.");
        setSmartFieldList([]);
      })
      .finally(() => setSmartFieldLoading(false));
  };

  const openSmartFieldModal = () => {
    setSmartFieldModalOpen(true);
    setSmartFieldList(null);
    // URL이 있으면 자동으로 목록 불러오기
    if (smartFieldListUrl.trim()) {
      loadSmartFieldList();
    }
  };
  const selectDrawing = (row: DrawingListRow) => {
    const data = row.data ?? row.데이터;
    const summary = row.summary ?? row.요약 ?? "";
    const payload = drawingDataToPayload(data, summary);
    const hasRef = payload.doorCount != null || (payload.roomAreas && payload.roomAreas.length > 0) || payload.totalArea != null || payload.dimensions;
    if (hasRef) {
      setDrawingReference(payload);
      setSmartFieldModalOpen(false);
    } else {
      alert("선택한 도면에 사용할 수 있는 참조 데이터가 없습니다.");
    }
  };
  const removeRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof EstimateItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      (next[idx] as Record<string, unknown>)[field] = value;
      if (field === "qty" || field === "materialUnitPrice" || field === "laborUnitPrice") {
        next[idx].qty = Number(next[idx].qty) || 0;
        next[idx].materialUnitPrice = Number(next[idx].materialUnitPrice ?? 0) || 0;
        next[idx].laborUnitPrice = Number(next[idx].laborUnitPrice ?? 0) || 0;
      }
      return next;
    });
  };

  /** 같은 공정의 모든 항목 processGroup 일괄 변경 (섹션 제목 수정 시) */
  const updateProcessGroupForIndices = (indices: number[], newName: string) => {
    setItems((prev) => {
      const next = [...prev];
      indices.forEach((i) => {
        next[i] = { ...next[i], processGroup: newName };
      });
      return next;
    });
  };

  const subtotal = items.reduce((sum, it) => sum + amount(it), 0);
  const vat = Math.floor(subtotal * 0.1);
  const total = subtotal + vat;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        consultationId: estimate?.consultationId ?? consultationPreFill?.consultationId ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("consultationId") : null),
        customerName: customerName.trim(),
        contact: contact.trim(),
        address: address.trim(),
        title: title.trim(),
        estimateDate: estimateDate || undefined,
        note: note.trim(),
        items: items.map((it) => ({
          processGroup: it.processGroup ?? "",
          category: it.category,
          spec: it.spec,
          unit: it.unit,
          qty: Number(it.qty) || 0,
          materialUnitPrice: Number(it.materialUnitPrice ?? 0) || 0,
          laborUnitPrice: Number(it.laborUnitPrice ?? 0) || 0,
          note: it.note,
        })),
      };
      const url = isEdit ? `/api/estimates/${estimate.id}` : "/api/estimates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "저장에 실패했습니다.");
        return;
      }
      alert(isEdit ? "수정되었습니다." : "저장되었습니다.");
      onSave();
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">고객명</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="고객명"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">연락처</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="연락처"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">주소</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="주소"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">견적 제목</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 거실 리모델링 견적"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">견적일자</label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={estimateDate}
            onChange={(e) => setEstimateDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">비고</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="비고"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">견적 항목</h3>
        <p className="mb-2 text-xs text-gray-500">공정명을 입력하면 섹션으로 묶이고, 프린트 시 &quot;가설철거 1. 항목 2. 항목 … 목공사 1. 항목&quot; 형태로 보입니다.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={openSmartFieldModal}
            className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            도면 보관함에서 불러오기
          </button>
          <button type="button" onClick={addRow} className="rounded-lg border border-blue-500 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50">
            + 항목 추가
          </button>
          <button type="button" onClick={addNewSection} className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            + 공정 추가
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        &quot;도면 보관함에서 불러오기&quot;로 한 건을 선택하면 방·거실·방면적·문 개수 등이 상단 참조 표에만 표시됩니다. (항목에는 자동 입력되지 않습니다.)
      </p>
      <p className="mb-4 text-xs text-amber-700">
        ※스마트현장관리 앱설치필수
      </p>

      {/* 도면에서 불러온 참조값 표 (항목에 넣지 않고 참고용) */}
      {drawingReference && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">도면 참조값</p>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl border-collapse text-sm">
              <tbody className="divide-y divide-gray-200">
                {drawingReference.roomAreas && drawingReference.roomAreas.length > 0 && (
                  <>
                    {drawingReference.roomAreas.filter((r) => !(r.name || "").includes("거실")).length > 0 && (
                      <tr>
                        <td className="py-1 pr-4 font-medium text-gray-700">방</td>
                        <td className="py-1 text-gray-800">
                          {drawingReference.roomAreas.filter((r) => !(r.name || "").includes("거실")).length}개
                        </td>
                      </tr>
                    )}
                    {drawingReference.roomAreas.filter((r) => (r.name || "").includes("거실")).length > 0 && (
                      <tr>
                        <td className="py-1 pr-4 font-medium text-gray-700">거실</td>
                        <td className="py-1 text-gray-800">
                          {drawingReference.roomAreas.filter((r) => (r.name || "").includes("거실")).length}개
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pr-4 font-medium text-gray-700">방면적</td>
                      <td className="py-1 text-gray-800">
                        {drawingReference.roomAreas.map((r) => `${r.name || "방"} ${r.area}m²`).join(", ")}
                      </td>
                    </tr>
                  </>
                )}
                {drawingReference.doorCount != null && drawingReference.doorCount > 0 && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">문</td>
                    <td className="py-1 text-gray-800">{drawingReference.doorCount}개</td>
                  </tr>
                )}
                {drawingReference.totalArea != null && drawingReference.totalArea > 0 && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">전체면적</td>
                    <td className="py-1 text-gray-800">{drawingReference.totalArea}m²</td>
                  </tr>
                )}
                {drawingReference.dimensions && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">비고</td>
                    <td className="py-1 text-gray-800">{drawingReference.dimensions}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setDrawingReference(null)}
            className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
          >
            참조값 지우기
          </button>
        </div>
      )}

      {smartFieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">도면 보관함에서 불러오기</h3>
              <button type="button" onClick={() => setSmartFieldModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4">
              {smartFieldLoading ? (
                <p className="text-center text-sm text-gray-500 py-8">목록을 불러오는 중...</p>
              ) : !smartFieldList ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-3">도면 API URL이 설정되지 않았습니다.</p>
                  <p className="text-xs text-gray-400">관리 페이지에서 도면 보관함 API URL을 먼저 설정해 주세요.</p>
                </div>
              ) : smartFieldList.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">저장된 도면이 없습니다.</p>
              ) : (
                <div className="overflow-auto max-h-[60vh] rounded-lg border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2">현장명</th>
                        <th className="p-2">저장시각</th>
                        <th className="p-2">요약</th>
                        <th className="w-20 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {smartFieldList.map((row, idx) => (
                        <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2">{row.siteName ?? row.현장명 ?? "-"}</td>
                          <td className="p-2 text-gray-600">{row.savedAt ?? row.저장시각 ?? "-"}</td>
                          <td className="p-2 text-gray-600 truncate max-w-[120px]" title={row.summary ?? row.요약 ?? ""}>{row.summary ?? row.요약 ?? "-"}</td>
                          <td className="p-2">
                            <button type="button" onClick={() => selectDrawing(row)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">선택</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
              <th className="p-2 w-14">No</th>
              <th className="p-2">품목</th>
              <th className="p-2">규격</th>
              <th className="p-2 w-16">단위</th>
              <th className="p-2 w-20">수량</th>
              <th className="p-2 w-24">재료비단가</th>
              <th className="p-2 w-24">재료비금액</th>
              <th className="p-2 w-24">노무비단가</th>
              <th className="p-2 w-24">노무비금액</th>
              <th className="p-2 w-24">금액</th>
              <th className="p-2">비고</th>
              <th className="w-10 p-2" />
            </tr>
          </thead>
          <tbody>
            {(() => {
              const sortedIndices = items
                .map((_, i) => i)
                .sort((a, b) => {
                  const pa = items[a].processGroup ?? "";
                  const pb = items[b].processGroup ?? "";
                  if (pa !== pb) return pa.localeCompare(pb, "ko");
                  return a - b;
                });
              const groups: { name: string; indices: number[] }[] = [];
              let currentName = "";
              let currentIndices: number[] = [];
              sortedIndices.forEach((idx) => {
                const name = items[idx].processGroup ?? "";
                if (name !== currentName) {
                  if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });
                  currentName = name;
                  currentIndices = [idx];
                } else {
                  currentIndices.push(idx);
                }
              });
              if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });

              const rows: React.ReactNode[] = [];
              groups.forEach((grp) => {
                const isNewSection = /^\u200B/.test(grp.name);
                rows.push(
                  <tr key={`h-${grp.name}-${grp.indices[0]}`} className="border-b border-gray-200 bg-gray-100">
                    <td colSpan={12} className="p-2">
                      <input
                        type="text"
                        className="w-full max-w-xs rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800"
                        value={isNewSection ? "" : grp.name}
                        onChange={(e) => updateProcessGroupForIndices(grp.indices, e.target.value)}
                        placeholder="가설철거, 목공사 등"
                      />
                    </td>
                  </tr>
                );
                grp.indices.forEach((origIdx, subNo) => {
                  const item = items[origIdx];
                  const noLabel = `${subNo + 1}.`;
                  rows.push(
                    <tr key={origIdx} className="border-b border-gray-100">
                      <td className="p-2 font-mono text-gray-600">{noLabel}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.category}
                          onChange={(e) => updateItem(origIdx, "category", e.target.value)}
                          placeholder="도배, 바닥 등"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.spec}
                          onChange={(e) => updateItem(origIdx, "spec", e.target.value)}
                          placeholder="규격"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.unit}
                          onChange={(e) => updateItem(origIdx, "unit", e.target.value)}
                          placeholder="식, m²"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.qty || ""}
                          onChange={(e) => updateItem(origIdx, "qty", e.target.value.replace(/\D/g, "") || 0)}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.materialUnitPrice ?? ""}
                          onChange={(e) => updateItem(origIdx, "materialUnitPrice", e.target.value.replace(/\D/g, "") || 0)}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2 text-right font-medium">{formatNumber(materialAmount(item))}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.laborUnitPrice ?? ""}
                          onChange={(e) => updateItem(origIdx, "laborUnitPrice", e.target.value.replace(/\D/g, "") || 0)}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2 text-right font-medium">{formatNumber(laborAmount(item))}</td>
                      <td className="p-2 text-right font-medium">{formatNumber(amount(item))}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.note}
                          onChange={(e) => updateItem(origIdx, "note", e.target.value)}
                          placeholder="비고"
                        />
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removeRow(origIdx)} className="text-red-500 hover:underline" disabled={items.length <= 1}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                });
              });
              return rows;
            })()}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-4 border-t border-gray-200 pt-4">
        <div className="text-sm text-gray-600">
          소계: <strong>{formatNumber(subtotal)}</strong>원 · 부가세(10%): <strong>{formatNumber(vat)}</strong>원 · 합계: <strong>{formatNumber(total)}</strong>원
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

type Consultation = {
  id: number;
  customerName?: string;
  contact?: string;
  address?: string;
  estimateMeetingAt?: string;
};

export default function EstimatePage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [formOpen, setFormOpen] = useState<"new" | number | null>(null);
  const [consultationPreFill, setConsultationPreFill] = useState<{ customerName: string; contact: string; address: string; consultationId: number } | null>(null);
  const [consultationModalOpen, setConsultationModalOpen] = useState(false);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingConsultations, setLoadingConsultations] = useState(false);

  const load = () => {
    fetch("/api/estimates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setEstimates(data);
      })
      .catch(() => setEstimates([]));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const cId = q.get("consultationId");
    if (cId) {
      fetch("/api/consultations")
        .then((res) => res.json())
        .then((list) => {
          const c = Array.isArray(list) ? list.find((x: { id: number }) => String(x.id) === cId) : null;
          if (c) {
            setConsultationPreFill({ 
              customerName: c.customerName ?? "", 
              contact: c.contact ?? "", 
              address: c.address ?? "",
              consultationId: c.id
            });
            setFormOpen("new");
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleNewEstimateClick = () => {
    setLoadingConsultations(true);
    setConsultationModalOpen(true);
    fetch("/api/consultations")
      .then((res) => res.json())
      .then((list) => {
        if (Array.isArray(list)) {
          // 견적미팅이 체크된 항목만 필터링
          const filtered = list.filter((c: Consultation) => c.estimateMeetingAt);
          setConsultations(filtered);
        }
      })
      .catch(() => setConsultations([]))
      .finally(() => setLoadingConsultations(false));
  };

  const handleSelectConsultation = (c: Consultation) => {
    setConsultationPreFill({
      customerName: c.customerName ?? "",
      contact: c.contact ?? "",
      address: c.address ?? "",
      consultationId: c.id,
    });
    setConsultationModalOpen(false);
    setFormOpen("new");
  };

  const editingEstimate = formOpen !== null && formOpen !== "new" ? estimates.find((e) => e.id === formOpen) ?? null : null;
  const showForm = formOpen !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">견적서 작성</h1>
        <button
          type="button"
          onClick={handleNewEstimateClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          신규 견적
        </button>
      </div>

      {/* 상담 선택 모달 */}
      {consultationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">상담 선택 (견적미팅 예정)</h3>
              <button 
                type="button" 
                onClick={() => setConsultationModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {loadingConsultations ? (
                <p className="text-center text-sm text-gray-500 py-8">불러오는 중...</p>
              ) : consultations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">견적미팅이 예정된 상담이 없습니다.</p>
                  <p className="text-xs text-gray-400">상담 및 미팅관리에서 견적미팅 일시를 먼저 입력해 주세요.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2">고객명</th>
                        <th className="p-2">연락처</th>
                        <th className="p-2">주소</th>
                        <th className="p-2">견적미팅</th>
                        <th className="w-20 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {consultations.map((c) => (
                        <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2 font-medium">{c.customerName || "-"}</td>
                          <td className="p-2">{c.contact || "-"}</td>
                          <td className="p-2 text-gray-600 truncate max-w-[200px]" title={c.address}>{c.address || "-"}</td>
                          <td className="p-2 text-gray-600">{c.estimateMeetingAt || "-"}</td>
                          <td className="p-2">
                            <button 
                              type="button" 
                              onClick={() => handleSelectConsultation(c)} 
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              선택
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm ? (
        <EstimateForm
          estimate={editingEstimate ?? null}
          consultationPreFill={formOpen === "new" ? consultationPreFill : null}
          onSave={() => {
            setFormOpen(null);
            load();
          }}
          onCancel={() => setFormOpen(null)}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">저장된 견적 목록입니다. 수정·삭제하거나 신규 견적을 작성할 수 있습니다.</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="p-3">견적일자</th>
                  <th className="p-3">고객명</th>
                  <th className="p-3">연락처</th>
                  <th className="p-3">제목</th>
                  <th className="p-3 text-right">합계</th>
                  <th className="w-24 p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estimates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      저장된 견적이 없습니다. &quot;신규 견적&quot;으로 작성해 보세요.
                    </td>
                  </tr>
                ) : (
                  estimates.map((est) => {
                    const subtotal = (est.items || []).reduce(
                      (s, i) =>
                        s +
                        (Number(i.qty) || 0) * (Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0) +
                        (Number(i.qty) || 0) * (Number(i.laborUnitPrice ?? 0) || 0),
                      0
                    );
                    const total = subtotal + Math.floor(subtotal * 0.1);
                    return (
                      <tr key={est.id} className="text-gray-700 hover:bg-gray-50">
                        <td className="p-3">{est.estimateDate ?? "-"}</td>
                        <td className="p-3 font-medium">{est.customerName || "-"}</td>
                        <td className="p-3">{est.contact || "-"}</td>
                        <td className="p-3">{est.title || "-"}</td>
                        <td className="p-3 text-right">{formatNumber(total)}원</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setFormOpen(est.id)}
                              className="text-blue-600 hover:underline"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!confirm("이 견적을 삭제할까요?")) return;
                                fetch(`/api/estimates/${est.id}`, { method: "DELETE" })
                                  .then((res) => res.ok && load())
                                  .catch(() => alert("삭제 실패"));
                              }}
                              className="text-red-500 hover:underline"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
