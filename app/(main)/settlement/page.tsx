"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  overheadPercent?: number;
  profitPercent?: number;
};

type PhaseSubItem = {
  amount: number;
  dateUsed: string;
  content: string;
  fromWorkLog?: boolean;
};

type PhaseRow = {
  phaseName: string;
  estimateAmount: number;
  usedAmount: number;
  memo: string;
  subItems: PhaseSubItem[];
};

type CustomerPaymentRow = {
  item: string;
  date: string;
  amount: number;
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
  const searchParams = useSearchParams();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateListLoading, setEstimateListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [settledAt, setSettledAt] = useState("");
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>([]);
  const [customerPaymentRows, setCustomerPaymentRows] = useState<CustomerPaymentRow[]>([{ item: "", date: "", amount: 0, memo: "" }]);
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
          const list = data as Estimate[];
          const fromUrl = searchParams.get("estimateId");
          const idFromUrl = fromUrl ? parseInt(fromUrl, 10) : NaN;
          const inList = list.some((e) => e.id === idFromUrl);
          if (list.length > 0) {
            if (inList) setSelectedId(idFromUrl);
            else setSelectedId(list[0].id);
          }
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
        if (!r.ok) return { error: (data as { error?: string }).error || "견적을 불러올 수 없습니다." };
        return data;
      }),
      fetch(`/api/company/settlements/${selectedId}`, { credentials: "include" }).then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          return { error: (data as { error?: string }).error || "정산 정보를 불러올 수 없습니다." };
        }
        return r.json().catch(() => null);
      }),
      fetch(`/api/company/work-logs?estimateId=${selectedId}`, { credentials: "include" }).then(
        async (r) => (r.ok ? r.json().catch(() => []) : [])
      ),
    ])
      .then(([estData, setData, workLogs]) => {
        if ((estData as { error?: string }).error) {
          setError((estData as { error: string }).error);
          setEstimate(null);
          setPhaseRows([]);
          return;
        }
        if (setData != null && typeof setData === "object" && "error" in setData && (setData as { error?: string }).error) {
          setError((setData as { error: string }).error);
          setEstimate(null);
          setPhaseRows([]);
          return;
        }
        const est = estData as Estimate;
        setEstimate(est);
        const phases = buildPhasesFromEstimate(est);
        const phasesWithAmount = phases.filter((p) => p.estimateAmount > 0);
        const savedItems = (setData != null && typeof setData === "object" && "items" in setData && Array.isArray((setData as { items: { amount?: number; memo?: string; subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }[] }).items))
          ? (setData as { items: { amount?: number; memo?: string; subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }[] }).items
          : [];
        const workLogSubItemsByPhase: Record<string, PhaseSubItem[]> = {};
        (Array.isArray(workLogs) ? workLogs : []).forEach((log: { logDate?: string; expenses?: { label?: string; content?: string; amount?: number }[] }) => {
          const logDate = typeof log.logDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.logDate.trim().slice(0, 10)) ? log.logDate.trim().slice(0, 10) : "";
          (log.expenses || []).forEach((e) => {
            const label = (e.label || "").trim();
            const amount = Number(e.amount) || 0;
            const content = typeof e.content === "string" ? e.content : "";
            if (label && (amount > 0 || content)) {
              if (!workLogSubItemsByPhase[label]) workLogSubItemsByPhase[label] = [];
              workLogSubItemsByPhase[label].push({ amount, dateUsed: logDate, content });
            }
          });
        });
        setSettledAt(
          typeof (setData as { settledAt?: string })?.settledAt === "string"
            ? (setData as { settledAt: string }).settledAt
            : ""
        );
        (() => {
          const raw = (setData as { customerPayment?: string })?.customerPayment;
          if (typeof raw !== "string" || !raw.trim()) {
            setCustomerPaymentRows([{ item: "", date: "", amount: 0, memo: "" }]);
            return;
          }
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed) && parsed.length > 0) {
              const rows = (parsed as { item?: string; date?: string; amount?: number; memo?: string }[]).map((r) => ({
                item: typeof r?.item === "string" ? r.item : "",
                date: typeof r?.date === "string" ? r.date.trim().slice(0, 10) : "",
                amount: Number(r?.amount) || 0,
                memo: typeof r?.memo === "string" ? r.memo : "",
              }));
              setCustomerPaymentRows(rows);
            } else {
              setCustomerPaymentRows([{ item: "", date: "", amount: 0, memo: "" }]);
            }
          } catch {
            setCustomerPaymentRows([{ item: "", date: "", amount: 0, memo: "" }]);
          }
        })();
        setPhaseRows(
          phasesWithAmount.map((p, i) => {
            const originalIndex = phases.findIndex((ph) => ph.phaseName === p.phaseName);
            const saved =
              savedItems.length === phasesWithAmount.length ? savedItems[i] : savedItems[originalIndex];
            const savedSub = saved != null && Array.isArray((saved as { subItems?: PhaseSubItem[] }).subItems) && (saved as { subItems: PhaseSubItem[] }).subItems.length > 0
              ? (saved as { subItems: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[] }).subItems.map((s) => ({
                  amount: Number(s?.amount) || 0,
                  dateUsed: typeof s?.dateUsed === "string" ? s.dateUsed.trim().slice(0, 10) : "",
                  content: typeof s?.content === "string" ? s.content : "",
                  fromWorkLog: typeof (s as { fromWorkLog?: boolean }).fromWorkLog === "boolean" ? (s as { fromWorkLog: boolean }).fromWorkLog : undefined,
                }))
              : [];
            const workLogItems = workLogSubItemsByPhase[p.phaseName] ?? [];
            const workLogKeys = new Set(workLogItems.map((wl) => `${wl.amount}|${wl.dateUsed}|${wl.content}`));
            const mergedSub: PhaseSubItem[] = workLogItems.map((wl) => ({ ...wl, fromWorkLog: true }));
            (savedSub as PhaseSubItem[]).forEach((s) => {
              const key = `${s.amount}|${s.dateUsed}|${s.content}`;
              if (workLogKeys.has(key)) return;
              if (s.fromWorkLog === true) return;
              mergedSub.push(s);
            });
            const subItems = mergedSub;
            const usedAmount = subItems.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) || (saved != null ? Number((saved as { amount?: number }).amount) || 0 : 0);
            return {
              phaseName: p.phaseName,
              estimateAmount: p.estimateAmount,
              usedAmount,
              memo: saved != null && typeof (saved as { memo?: string }).memo === "string" ? (saved as { memo: string }).memo : "",
              subItems,
            };
          })
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg && msg !== "Failed to fetch" ? msg : "견적/정산 정보를 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
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
      setCustomerPaymentRows([]);
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

  const setPhaseSubItem = useCallback((phaseIndex: number, subIndex: number, field: keyof PhaseSubItem, value: number | string) => {
    setPhaseRows((prev) => {
      const next = prev.map((row, i) => {
        if (i !== phaseIndex || !row.subItems || subIndex < 0 || subIndex >= row.subItems.length) return row;
        const sub = [...row.subItems];
        sub[subIndex] = { ...sub[subIndex], [field]: value };
        const usedAmount = sub.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return { ...row, subItems: sub, usedAmount };
      });
      return next;
    });
  }, []);

  const addPhaseSubItem = useCallback((phaseIndex: number) => {
    setPhaseRows((prev) => {
      const next = prev.map((row, i) => {
        if (i !== phaseIndex) return row;
        const sub = [...(row.subItems || []), { amount: 0, dateUsed: "", content: "" }];
        return { ...row, subItems: sub, usedAmount: sub.reduce((s, x) => s + (Number(x.amount) || 0), 0) };
      });
      return next;
    });
  }, []);

  const removePhaseSubItem = useCallback((phaseIndex: number, subIndex: number) => {
    setPhaseRows((prev) => {
      const next = prev.map((row, i) => {
        if (i !== phaseIndex || !row.subItems) return row;
        const sub = row.subItems.filter((_, j) => j !== subIndex);
        const usedAmount = sub.reduce((s, x) => s + (Number(x.amount) || 0), 0);
        return { ...row, subItems: sub, usedAmount };
      });
      return next;
    });
  }, []);

  const setCustomerPaymentRow = useCallback((index: number, field: keyof CustomerPaymentRow, value: string | number) => {
    setCustomerPaymentRows((prev) => {
      const next = [...prev];
      if (index < 0 || index >= next.length) return prev;
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const addCustomerPaymentRow = useCallback(() => {
    setCustomerPaymentRows((prev) => [...prev, { item: "", date: "", amount: 0, memo: "" }]);
  }, []);

  const removeCustomerPaymentRow = useCallback((index: number) => {
    setCustomerPaymentRows((prev) => {
      if (prev.length <= 1) return [{ item: "", date: "", amount: 0, memo: "" }];
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSave = useCallback(() => {
    if (selectedId == null) return;
    setSaveLoading(true);
    setError(null);
    const items = phaseRows.map((r) => {
      const subItems = r.subItems && r.subItems.length > 0 ? r.subItems : undefined;
      const amount = subItems ? subItems.reduce((s, x) => s + (Number(x.amount) || 0), 0) : r.usedAmount;
      return { amount, memo: r.memo, ...(subItems ? { subItems } : {}) };
    });
    const payload = {
      items,
      settledAt: settledAt?.trim() || null,
      customerPayment: JSON.stringify(customerPaymentRows),
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
  }, [selectedId, phaseRows, settledAt, customerPaymentRows]);

  const totalEstimate = phaseRows.reduce((s, r) => s + r.estimateAmount, 0);
  const estWithRates = estimate as (Estimate & { overheadPercent?: number; profitPercent?: number }) | null;
  const overheadPercent = estWithRates?.overheadPercent != null ? Number(estWithRates.overheadPercent) : 5;
  const profitPercent = estWithRates?.profitPercent != null ? Number(estWithRates.profitPercent) : 10;
  const overhead = Math.floor(totalEstimate * (overheadPercent / 100));
  const profit = Math.floor(totalEstimate * (profitPercent / 100));
  const settlementTotalAmount = Math.floor((totalEstimate + overhead + profit) / 10000) * 10000;
  const totalUsed = phaseRows.reduce((s, r) => {
    const subSum = (r.subItems || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    return s + (r.subItems?.length ? subSum : r.usedAmount);
  }, 0);
  const remainingAmount = Math.max(0, settlementTotalAmount - totalUsed);
  const remainingPercent = settlementTotalAmount > 0 ? (remainingAmount / settlementTotalAmount) * 100 : 0;

  const handlePrint = useCallback(() => {
    const prevTitle = document.title;
    const siteName = (estimate?.title ?? "").trim() || "정산";
    const safeName = siteName.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "정산";
    document.title = `정산 ${safeName}`;

    const styleId = "settlement-print-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      styleEl.textContent = "@page { size: portrait; margin: 0.5in; }";
      document.head.appendChild(styleEl);
    }
    document.body.classList.add("settlement-print");
    window.print();

    const onAfterPrint = () => {
      document.title = prevTitle;
      document.body.classList.remove("settlement-print");
      const el = document.getElementById("settlement-print-style");
      if (el) el.remove();
    };
    window.addEventListener("afterprint", onAfterPrint, { once: true });
  }, [estimate?.title]);

  useEffect(() => {
    const onAfterPrint = () => {
      document.body.classList.remove("settlement-print");
      const styleEl = document.getElementById("settlement-print-style");
      if (styleEl) styleEl.remove();
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  return (
    <div className="p-4 sm:p-6" id="settlement-print-root">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">정산</h1>
      <p className="text-sm text-gray-600 mb-4 no-print">
        프로젝트(견적)를 선택하면 공정별 견적 금액이 나옵니다. 각 공정마다 실제 사용한 금액(내가 쓴 금액)을 입력하고 저장하세요.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="mb-4 no-print">
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

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">고객결제 상황</h3>
            <p className="text-sm text-gray-600 mb-3">
              정산 총금액 (VAT 별도) <span className="font-semibold text-gray-900 tabular-nums">{formatNum(settlementTotalAmount)}</span>원
            </p>
            <table className="w-full text-sm border-collapse table-fixed border border-gray-300 settlement-customer-payment-table">
              <colgroup>
                <col style={{ width: "32%" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "110px" }} />
                <col />
                <col style={{ width: "56px" }} />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gray-300 bg-gray-100 text-gray-800">
                  <th className="text-left py-1.5 pr-2 font-medium border-r border-gray-200">항목</th>
                  <th className="text-left py-1.5 pr-2 font-medium border-r border-gray-200">날짜</th>
                  <th className="text-right py-1.5 pr-2 font-medium border-r border-gray-200">금액</th>
                  <th className="text-left py-1.5 pr-2 font-medium border-r border-gray-200">비고</th>
                  <th className="w-14 py-1.5 no-print" />
                </tr>
              </thead>
              <tbody>
                {customerPaymentRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="py-1 pr-2 border-r border-gray-200">
                      <input
                        type="text"
                        value={row.item}
                        onChange={(e) => setCustomerPaymentRow(i, "item", e.target.value)}
                        placeholder="예: 선금, 중도금, 잔금"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm min-h-0"
                      />
                    </td>
                    <td className="py-1 pr-2 border-r border-gray-200">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => setCustomerPaymentRow(i, "date", e.target.value.slice(0, 10))}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm min-w-0 min-h-0"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right border-r border-gray-200">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={row.amount === 0 ? "" : row.amount.toLocaleString("ko-KR")}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          const num = raw === "" ? 0 : parseInt(raw, 10);
                          if (!Number.isNaN(num)) setCustomerPaymentRow(i, "amount", num);
                        }}
                        placeholder="0"
                        className="w-full min-w-0 rounded border border-gray-200 px-2 py-1 text-right text-sm min-h-0"
                      />
                    </td>
                    <td className="py-1 pr-2 border-r border-gray-200">
                      <input
                        type="text"
                        value={row.memo}
                        onChange={(e) => setCustomerPaymentRow(i, "memo", e.target.value)}
                        placeholder="비고"
                        className="w-full rounded border border-gray-200 px-2 py-1 text-sm min-w-0 min-h-0"
                      />
                    </td>
                    <td className="py-1 text-center no-print">
                      <button
                        type="button"
                        onClick={() => removeCustomerPaymentRow(i)}
                        className="text-red-600 hover:text-red-700 text-xs font-medium"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <button
                type="button"
                onClick={addCustomerPaymentRow}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 no-print"
              >
                + 행 추가
              </button>
            </div>
          </div>

          {phaseRows.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              이 견적에는 공정별 항목이 없습니다. 견적서 작성에서 공정(공종)을 넣고 저장한 뒤 다시 선택해 주세요.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm border-collapse border border-gray-300 min-w-[520px]">
                <colgroup>
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col />
                </colgroup>
                <thead className="border-b-2 border-gray-300 bg-gray-100 text-gray-800">
                  <tr>
                    <th className="p-3 font-medium border-b border-gray-300">공정</th>
                    <th className="p-3 text-right font-medium border-b border-gray-300">견적 금액</th>
                    <th className="p-3 text-right font-medium border-b border-gray-300">내가 쓴 금액</th>
                    <th className="p-3 font-medium border-b border-gray-300 min-w-[120px]">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {phaseRows.map((row, i) => {
                    const subSum = (row.subItems || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
                    const usedDisplay = row.subItems?.length ? subSum : row.usedAmount;
                    return (
                      <React.Fragment key={i}>
                        <tr className="text-gray-800 hover:bg-gray-50/50 border-b border-gray-200">
                          <td className="p-3 font-medium border-b border-gray-200">{row.phaseName}</td>
                          <td className="p-3 text-right tabular-nums border-b border-gray-200">{formatNum(row.estimateAmount)}</td>
                          <td className="p-3 text-right tabular-nums border-b border-gray-200">{formatNum(usedDisplay)}</td>
                          <td className="p-3 border-b border-gray-200">
                            <input
                              type="text"
                              value={row.memo}
                              onChange={(e) => setPhaseRow(i, "memo", e.target.value)}
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              placeholder="비고"
                            />
                          </td>
                        </tr>
                        <tr className="border-b border-gray-200">
                          <td colSpan={4} className="bg-gray-50/70 align-top p-0 border-b border-gray-200">
                            <p className="pt-2 pb-1 text-xs font-medium text-gray-500 no-print" style={{ paddingLeft: "32%", paddingRight: "12px" }}>
                              하부항목 (금액 · 쓴날짜 · 내용)
                            </p>
                            <table className="w-full text-sm border-collapse border border-gray-200 m-2" style={{ tableLayout: "fixed" }}>
                              <colgroup>
                                <col style={{ width: "18%" }} />
                                <col style={{ width: "14%" }} />
                                <col style={{ width: "14%" }} />
                                <col style={{ width: "14%" }} />
                                <col />
                                <col style={{ width: "72px" }} />
                              </colgroup>
                              <thead>
                                <tr className="bg-gray-100 border-b border-gray-200 text-gray-600">
                                  <th className="py-1.5 pl-3 font-normal text-left text-xs border-r border-gray-200">출처</th>
                                  <th className="py-1.5 font-normal text-left text-xs border-r border-gray-200" />
                                  <th className="py-1.5 pr-2 text-right font-normal text-xs border-r border-gray-200">금액</th>
                                  <th className="py-1.5 pr-2 font-normal text-xs border-r border-gray-200">쓴날짜</th>
                                  <th className="py-1.5 px-2 font-normal text-left text-xs border-r border-gray-200">내용</th>
                                  <th className="py-1.5 pr-3 text-center font-normal text-xs no-print">삭제</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(row.subItems || [])
                                  .map((sub, origIndex) => ({ sub, origIndex }))
                                  .sort((a, b) => (a.sub.dateUsed || "").localeCompare(b.sub.dateUsed || ""))
                                  .map(({ sub, origIndex }) => (
                                  <tr key={origIndex} className="border-t border-gray-200">
                                    <td className="py-1.5 pl-3 align-top">
                                      {sub.fromWorkLog ? (
                                        <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">
                                          작업일지
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="py-1.5 align-top" />
                                    <td className="py-1.5 pr-2 align-top">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={sub.amount === 0 ? "" : sub.amount.toLocaleString("ko-KR")}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/\D/g, "");
                                          const num = raw === "" ? 0 : parseInt(raw, 10);
                                          if (!Number.isNaN(num)) setPhaseSubItem(i, origIndex, "amount", num);
                                        }}
                                        placeholder="0"
                                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-right"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 align-top">
                                      <input
                                        type="date"
                                        value={sub.dateUsed}
                                        onChange={(e) => setPhaseSubItem(i, origIndex, "dateUsed", e.target.value.slice(0, 10))}
                                        className="w-full rounded border border-gray-200 px-2 py-1.5"
                                      />
                                    </td>
                                    <td className="py-1.5 px-2 align-top min-w-0">
                                      <input
                                        type="text"
                                        value={sub.content}
                                        onChange={(e) => setPhaseSubItem(i, origIndex, "content", e.target.value)}
                                        placeholder="내용"
                                        className="w-full rounded border border-gray-200 px-2 py-1.5"
                                      />
                                    </td>
                                    <td className="py-1.5 pr-3 align-top text-center whitespace-nowrap no-print">
                                      <button
                                        type="button"
                                        onClick={() => removePhaseSubItem(i, origIndex)}
                                        className="text-red-600 hover:text-red-700 text-xs font-medium no-print"
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="pb-3 pt-1" style={{ paddingLeft: "32%", paddingRight: "12px" }}>
                              <button
                                type="button"
                                onClick={() => addPhaseSubItem(i)}
                                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 no-print"
                              >
                                + 하부항목 추가
                              </button>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-100 font-semibold text-gray-900">
                  <tr>
                    <td className="p-3 border-b border-r border-gray-300">견적 금액 합계</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(totalEstimate)}</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(totalUsed)}</td>
                    <td className="p-3 border-b border-gray-300" />
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-r border-gray-300">이윤</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(profit)}</td>
                    <td className="p-3 border-b border-r border-gray-300" />
                    <td className="p-3 border-b border-gray-300" />
                  </tr>
                  <tr>
                    <td className="p-3 border-b border-r border-gray-300">공과잡비</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(overhead)}</td>
                    <td className="p-3 border-b border-r border-gray-300" />
                    <td className="p-3 border-b border-gray-300" />
                  </tr>
                  <tr className="border-t-2 border-gray-400 bg-gray-200">
                    <td className="p-3 border-b border-r border-gray-300 whitespace-nowrap">합계금액 (이윤+공과잡비 포함)</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(settlementTotalAmount)}</td>
                    <td className="p-3 text-right tabular-nums border-b border-r border-gray-300">{formatNum(totalUsed)}</td>
                    <td className="p-3 border-b border-gray-300" />
                  </tr>
                  <tr className="bg-amber-100 border-b border-gray-300">
                    <td className="p-3 border-r border-gray-300 whitespace-nowrap">공사 남은금액 (뺀금액)</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-gray-900 border-r border-gray-300">
                      {formatNum(remainingAmount)}원
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-gray-900 border-r border-gray-300">
                      {settlementTotalAmount > 0 ? `${remainingPercent.toFixed(1)}%` : "-"}
                    </td>
                    <td className="p-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap no-print">
            {phaseRows.length > 0 && (
              <div className="flex items-center gap-4 py-2 px-3 rounded-lg bg-gray-100 border border-gray-200 text-sm">
                <span><strong>합계금액</strong> {formatNum(settlementTotalAmount)}원</span>
                <span><strong>쓴금액</strong> {formatNum(totalUsed)}원</span>
                <span><strong>공사 남은금액</strong> <span className="text-gray-900 font-semibold">{formatNum(Math.max(0, settlementTotalAmount - totalUsed))}원</span></span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saveLoading || phaseRows.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 no-print"
            >
              {saveLoading ? "저장 중…" : "저장"}
            </button>
            {estimate && phaseRows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 no-print"
                >
                  인쇄
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  title="인쇄 대화상자에서 대상을 'PDF로 저장'으로 선택하면 PDF 저장 가능"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 no-print"
                >
                  PDF 저장
                </button>
              </>
            )}
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
