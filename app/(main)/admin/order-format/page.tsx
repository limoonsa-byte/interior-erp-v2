"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const ORDER_CATEGORIES = [
  "목재발주",
  "중문발주",
  "조명",
  "전기부자재 발주",
  "타일(화장실용품)발주",
  "목공방재발주",
  "도배발주",
  "바닥재발주",
  "필름발주",
  "싱크가구발주",
  "기타",
];

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

function createEmptyRow(): AddedOrderRow {
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

function normalizeRow(r: Record<string, unknown>): AddedOrderRow {
  return {
    id: (r.id && String(r.id).trim()) ? String(r.id) : `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    processGroup: String(r.processGroup ?? "").trim(),
    category: String(r.category ?? "").trim(),
    spec: String(r.spec ?? "").trim(),
    unit: String(r.unit ?? "").trim(),
    qty: String(r.qty ?? "").trim(),
    materialUnitPrice: String(r.materialUnitPrice ?? "").trim(),
    note: String(r.note ?? "").trim(),
  };
}

export default function AdminOrderFormatPage() {
  const [visibleOrderLabels, setVisibleOrderLabels] = useState<string[]>(() => [...ORDER_CATEGORIES]);
  const [addedRowsByLabel, setAddedRowsByLabel] = useState<Record<string, AddedOrderRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/company/order-template", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const t = (data as { template?: { visibleOrderLabels?: string[]; addedRowsByLabel?: Record<string, unknown[]> } }).template;
        if (t?.visibleOrderLabels && Array.isArray(t.visibleOrderLabels) && t.visibleOrderLabels.length > 0) {
          setVisibleOrderLabels(t.visibleOrderLabels);
        }
        if (t?.addedRowsByLabel && typeof t.addedRowsByLabel === "object") {
          const next: Record<string, AddedOrderRow[]> = {};
          Object.entries(t.addedRowsByLabel).forEach(([label, rows]) => {
            if (Array.isArray(rows)) {
              next[label] = rows.map((r) => normalizeRow(r as Record<string, unknown>));
            }
          });
          setAddedRowsByLabel(next);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadDefaultTemplate = useCallback(() => {
    setLoadingDefault(true);
    setMessage("");
    fetch("/api/company/order-default-items", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const itemsByLabel = (data as { itemsByLabel?: Record<string, unknown[]> }).itemsByLabel;
        setVisibleOrderLabels([...ORDER_CATEGORIES]);
        if (itemsByLabel && typeof itemsByLabel === "object") {
          const next: Record<string, AddedOrderRow[]> = {};
          Object.entries(itemsByLabel).forEach(([label, rows]) => {
            if (Array.isArray(rows) && rows.length > 0) {
              next[label] = rows.map((r) => normalizeRow(r as Record<string, unknown>));
            }
          });
          setAddedRowsByLabel(next);
          setMessage("기본서식(마스터)을 불러왔습니다. 필요하면 수정 후 아래에서 저장하세요.");
        } else {
          setMessage("마스터에 등록된 기본서식이 없습니다. 마스터 관리에서 먼저 등록해 주세요.");
        }
      })
      .catch(() => setMessage("기본서식 불러오기에 실패했습니다."))
      .finally(() => setLoadingDefault(false));
  }, []);

  const saveCompanyTemplate = useCallback(() => {
    setSaving(true);
    setMessage("");
    fetch("/api/company/order-template", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleOrderLabels, addedRowsByLabel }),
    })
      .then((r) => r.json())
      .then((data) => {
        if ((data as { error?: string }).error) throw new Error((data as { error?: string }).error);
        setMessage("우리회사 템플릿으로 저장되었습니다. 자재 발주 페이지에서 '우리회사 템플릿' 불러오기로 사용할 수 있습니다.");
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : "저장에 실패했습니다."))
      .finally(() => setSaving(false));
  }, [visibleOrderLabels, addedRowsByLabel]);

  const addOrderType = useCallback(() => {
    const name = window.prompt("발주 유형 이름 (예: 소방발주)", "새 발주");
    const trimmed = name?.trim();
    if (!trimmed) return;
    if (visibleOrderLabels.includes(trimmed)) {
      setMessage("이미 있는 유형명입니다.");
      return;
    }
    setVisibleOrderLabels((prev) => [...prev, trimmed]);
    setAddedRowsByLabel((prev) => ({ ...prev, [trimmed]: [createEmptyRow()] }));
  }, [visibleOrderLabels]);

  const removeOrderType = useCallback((label: string) => {
    if (visibleOrderLabels.length <= 1) return;
    if (!window.confirm(`"${label}" 발주 유형을 삭제할까요?`)) return;
    setVisibleOrderLabels((prev) => prev.filter((l) => l !== label));
    setAddedRowsByLabel((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
  }, [visibleOrderLabels.length]);

  const setRow = useCallback((label: string, rowIndex: number, field: keyof AddedOrderRow, value: string) => {
    setAddedRowsByLabel((prev) => {
      const list = [...(prev[label] ?? [])];
      if (rowIndex < 0 || rowIndex >= list.length) return prev;
      list[rowIndex] = { ...list[rowIndex], [field]: value };
      return { ...prev, [label]: list };
    });
  }, []);

  const addRow = useCallback((label: string) => {
    setAddedRowsByLabel((prev) => ({
      ...prev,
      [label]: [...(prev[label] ?? []), createEmptyRow()],
    }));
  }, []);

  const removeRow = useCallback((label: string, rowIndex: number) => {
    setAddedRowsByLabel((prev) => {
      const list = (prev[label] ?? []).filter((_, i) => i !== rowIndex);
      return { ...prev, [label]: list };
    });
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          ← 관리
        </Link>
      </div>
      <h1 className="mb-2 text-xl font-bold text-gray-800">자재발주 서식관리</h1>
      <p className="mb-6 text-sm text-gray-600">
        기본서식은 마스터 관리에서 등록한 내용입니다. 여기서 불러와 수정한 뒤 우리회사 템플릿으로 저장하면, 자재 발주 페이지에서 &quot;우리회사 템플릿&quot; 불러오기로 사용할 수 있습니다.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={loadDefaultTemplate}
          disabled={loadingDefault}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loadingDefault ? "불러오는 중…" : "기본서식 불러오기"}
        </button>
        <button
          type="button"
          onClick={saveCompanyTemplate}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "우리회사 템플릿으로 저장"}
        </button>
      </div>

      {message && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={addOrderType}
          className="rounded-lg border-2 border-dashed border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50/50"
        >
          + 발주 유형 추가
        </button>
      </div>

      <div className="space-y-6">
        {visibleOrderLabels.map((label) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-2.5">
              <span className="font-medium text-gray-800">{label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addRow(label)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  + 행 추가
                </button>
                {visibleOrderLabels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOrderType(label)}
                    className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                  >
                    유형 삭제
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-gray-200 text-gray-800">
                    <th className="border border-gray-400 px-2 py-1.5 font-medium">품목</th>
                    <th className="border border-gray-400 px-2 py-1.5 font-medium">규격</th>
                    <th className="border border-gray-400 px-2 py-1.5 font-medium w-12">단위</th>
                    <th className="border border-gray-400 px-2 py-1.5 font-medium w-16">수량</th>
                    <th className="border border-gray-400 px-2 py-1.5 font-medium w-24">단가</th>
                    <th className="border border-gray-400 px-2 py-1.5 font-medium min-w-[100px]">비고</th>
                    <th className="w-14 border border-gray-400 px-1 py-1.5 font-medium">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {(addedRowsByLabel[label] ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-gray-300 px-2 py-4 text-center text-gray-500 text-sm">
                        행이 없습니다. &quot;행 추가&quot;를 누르거나 위에서 &quot;기본서식 불러오기&quot;를 사용하세요.
                      </td>
                    </tr>
                  ) : (
                    (addedRowsByLabel[label] ?? []).map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50/80">
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.category}
                            onChange={(e) => setRow(label, idx, "category", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="품목"
                          />
                        </td>
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.spec}
                            onChange={(e) => setRow(label, idx, "spec", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="규격"
                          />
                        </td>
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.unit}
                            onChange={(e) => setRow(label, idx, "unit", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="단위"
                          />
                        </td>
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.qty}
                            onChange={(e) => setRow(label, idx, "qty", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-right text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="수량"
                          />
                        </td>
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.materialUnitPrice}
                            onChange={(e) => setRow(label, idx, "materialUnitPrice", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-right text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="단가"
                          />
                        </td>
                        <td className="border border-gray-300 p-0">
                          <input
                            value={row.note}
                            onChange={(e) => setRow(label, idx, "note", e.target.value)}
                            className="h-full min-h-[32px] w-full border-0 bg-transparent px-2 py-1 text-sm focus:bg-blue-50/50 focus:outline-none"
                            placeholder="비고"
                          />
                        </td>
                        <td className="border border-gray-300 px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removeRow(label, idx)}
                            className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
