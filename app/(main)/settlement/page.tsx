"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

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
  contact: string;
  address: string;
  title: string;
  estimateDate?: string;
  note: string;
  items: EstimateItem[];
  processOrder?: string[];
};

type PhaseRow = {
  phaseName: string;
  estimateAmount: number;
  usedAmount: number;
  memo: string;
};

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function itemAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const mat = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) || 0;
  const labor = Number(item.laborUnitPrice ?? 0) || 0;
  return q * (mat + labor);
}

/** 견적 항목에서 공정별 금액 계산 (processOrder 순서 유지) */
function buildPhasesFromEstimate(estimate: Estimate): { phaseName: string; estimateAmount: number }[] {
  const order = estimate.processOrder && estimate.processOrder.length > 0
    ? estimate.processOrder.filter((n) => !String(n).startsWith("\u200B"))
    : [];
  const sumByGroup = new Map<string, number>();
  (estimate.items || []).forEach((item) => {
    const g = (item.processGroup ?? "").trim();
    if (!g || String(g).startsWith("\u200B")) return;
    const amt = itemAmount(item);
    sumByGroup.set(g, (sumByGroup.get(g) ?? 0) + amt);
  });
  if (order.length > 0) {
    return order.map((name) => ({
      phaseName: name,
      estimateAmount: sumByGroup.get(name) ?? 0,
    }));
  }
  return Array.from(sumByGroup.entries()).map(([phaseName, estimateAmount]) => ({
    phaseName,
    estimateAmount,
  }));
}

export default function SettlementPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateListLoading, setEstimateListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [settledAt, setSettledAt] = useState("");
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phasesFromEstimate = useMemo(() => {
    if (!estimate) return [];
    return buildPhasesFromEstimate(estimate);
  }, [estimate]);

  useEffect(() => {
    setEstimateListLoading(true);
    setError(null);
    fetch("/api/estimates", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEstimates(data as Estimate[]);
          if (data.length > 0 && !selectedId) setSelectedId((data[0] as Estimate).id);
        } else {
          setError((data as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
        }
      })
      .catch(() => setError("견적 목록을 불러올 수 없습니다."))
      .finally(() => setEstimateListLoading(false));
  }, []);

  const loadDetail = useCallback(() => {
    if (selectedId == null) return;
    setDetailLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/estimates/${selectedId}`, { credentials: "include" }).then(async (r) => {
        const data = await r.json().catch(() => ({ error: "응답을 읽을 수 없습니다." }));
        if (!r.ok) return data as { error?: string };
        return data;
      }),
      fetch(`/api/company/settlements/${selectedId}`, { credentials: "include" }).then(async (r) => {
        const data = await r.json().catch(() => null);
        return data;
      }),
    ])
      .then(([estData, setData]) => {
        if ((estData as { error?: string }).error) {
          setError((estData as { error: string }).error);
          setEstimate(null);
          setPhaseRows([]);
          return;
        }
        const est = estData as Estimate;
        setEstimate(est);
        const phases = buildPhasesFromEstimate(est);
        const savedItems = (setData != null && typeof setData === "object" && "items" in setData && Array.isArray((setData as { items: { amount?: number; memo?: string }[] }).items))
          ? (setData as { items: { amount?: number; memo?: string }[] }).items
          : [];
        setSettledAt(
          typeof (setData as { settledAt?: string }).settledAt === "string"
            ? (setData as { settledAt: string }).settledAt
            : ""
        );
        setPhaseRows(
          phases.map((p, i) => {
            const saved = savedItems[i];
            return {
              phaseName: p.phaseName,
              estimateAmount: p.estimateAmount,
              usedAmount: saved != null ? Number(saved.amount) || 0 : 0,
              memo: saved != null && typeof saved.memo === "string" ? saved.memo : "",
            };
          })
        );
      })
      .catch(() => {
        setError("견적/정산 정보를 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        setEstimate(null);
        setPhaseRows([]);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (selectedId == null) {
      setEstimate(null);
      setPhaseRows([]);
      setSettledAt("");
      return;
    }
    loadDetail();
  }, [selectedId, loadDetail]);

  const setPhaseRow = useCallback((index: number, field: keyof PhaseRow, value: number | string) => {
    setPhaseRows((prev) => {
      const next = [...prev];
      if (index < 0 || index >= next.length) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    if (selectedId == null) return;
    setSaveLoading(true);
    setError(null);
    const items = phaseRows.map((r) => ({ amount: r.usedAmount, memo: r.memo }));
    const payload = {
      items,
      settledAt: settledAt?.trim() || null,
    };
    fetch(`/api/company/settlements/${selectedId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          alert("저장되었습니다.");
        } else {
          setError((data as { error?: string }).error || "저장에 실패했습니다.");
        }
      })
      .catch(() => setError("저장 중 오류가 발생했습니다."))
      .finally(() => setSaveLoading(false));
  }, [selectedId, phaseRows, settledAt]);

  const totalEstimate = phaseRows.reduce((s, r) => s + r.estimateAmount, 0);
  const totalUsed = phaseRows.reduce((s, r) => s + r.usedAmount, 0);

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">정산</h1>
      <p className="text-sm text-gray-600 mb-4">
        프로젝트(견적)를 선택하면 공정별 견적 금액이 나옵니다. 각 공정마다 실제 사용한 금액(내가 쓴 금액)을 입력하고 저장하세요.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">프로젝트(견적) 선택</label>
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(Number(e.target.value) || null)}
          disabled={estimateListLoading}
          className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
        >
          {estimates.length === 0 && (
            <option value="">{estimateListLoading ? "불러오는 중…" : "견적이 없습니다."}</option>
          )}
          {estimates.map((est) => (
            <option key={est.id} value={est.id}>
              {est.customerName || "고객"} / {est.title} ({est.estimateDate || "-"})
            </option>
          ))}
        </select>
      </div>

      {detailLoading && (
        <p className="py-6 text-sm text-gray-500">견적·정산 정보를 불러오는 중…</p>
      )}

      {!detailLoading && estimate && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {estimate.customerName && <span>고객: {estimate.customerName}</span>}
            {estimate.address && <span className="ml-3">주소: {estimate.address}</span>}
          </p>

          <div className="max-w-xl">
            <label className="block text-sm font-medium text-gray-700 mb-1">정산일</label>
            <input
              type="date"
              value={settledAt}
              onChange={(e) => setSettledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {phasesFromEstimate.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              이 견적에는 공정별 항목이 없습니다. 견적서 작성에서 공정(공종)을 넣고 저장한 뒤 다시 선택해 주세요.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                  <tr>
                    <th className="p-3 font-medium">공정</th>
                    <th className="p-3 text-right font-medium w-32">견적 금액</th>
                    <th className="p-3 text-right font-medium w-36">내가 쓴 금액</th>
                    <th className="p-3 font-medium min-w-[120px]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {phaseRows.map((row, i) => (
                    <tr key={i} className="text-gray-800 hover:bg-gray-50/50">
                      <td className="p-3 font-medium">{row.phaseName}</td>
                      <td className="p-3 text-right tabular-nums">{formatNum(row.estimateAmount)}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={row.usedAmount || ""}
                          onChange={(e) => setPhaseRow(i, "usedAmount", Number(e.target.value) || 0)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-right text-sm"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          value={row.memo}
                          onChange={(e) => setPhaseRow(i, "memo", e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          placeholder="비고"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                  <tr>
                    <td className="p-3">합계</td>
                    <td className="p-3 text-right tabular-nums">{formatNum(totalEstimate)}</td>
                    <td className="p-3 text-right tabular-nums">{formatNum(totalUsed)}</td>
                    <td className="p-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saveLoading || phasesFromEstimate.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saveLoading ? "저장 중…" : "저장"}
            </button>
            {totalUsed > 0 && (
              <span className="text-sm text-gray-600">
                내가 쓴 금액 합계 {formatNum(totalUsed)}원
              </span>
            )}
          </div>
        </div>
      )}

      {!detailLoading && !estimate && estimates.length > 0 && selectedId != null && (
        <div className="py-6 flex flex-col items-start gap-3">
          <p className="text-sm text-gray-500">선택한 견적을 불러올 수 없습니다.</p>
          <button
            type="button"
            onClick={() => loadDetail()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            다시 불러오기
          </button>
        </div>
      )}
    </div>
  );
}
