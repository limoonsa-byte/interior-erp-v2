"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type Consultation = {
  id: number;
  status?: string;
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

function customerPaymentRowsFromStoredJson(raw: string): CustomerPaymentRow[] {
  const oneEmpty = (): CustomerPaymentRow[] => [{ item: "", date: "", amount: 0, memo: "" }];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return oneEmpty();
      return (parsed as { item?: unknown; date?: unknown; amount?: unknown; memo?: unknown }[]).map((r) => ({
        item: typeof r?.item === "string" ? r.item : "",
        date: typeof r?.date === "string" ? r.date.trim().slice(0, 10) : "",
        amount: Number(r?.amount) || 0,
        memo: typeof r?.memo === "string" ? r.memo : "",
      }));
    }
    /** 결제 승인서(approval_v1)는 별도 컬럼으로 분리됨 — 여기서는 배열만 처리 */
  } catch {
    /* ignore */
  }
  return oneEmpty();
}

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 직접 입력 하부항목 — 내용·날짜·금액이 모두 비었으면 저장 시 제외 */
function isManualSubItemEmpty(s: PhaseSubItem): boolean {
  if (s.fromWorkLog === true) return false;
  return (Number(s.amount) || 0) === 0 && !(s.dateUsed || "").trim() && !(s.content || "").trim();
}

function stripEmptyManualSubItems(list: PhaseSubItem[]): PhaseSubItem[] {
  return list.filter((s) => s.fromWorkLog === true || !isManualSubItemEmpty(s));
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

function parseSettlementSummariesResponse(sumData: unknown): Record<string, number> {
  const summaries =
    sumData != null &&
    typeof sumData === "object" &&
    "summaries" in sumData &&
    typeof (sumData as { summaries?: unknown }).summaries === "object" &&
    (sumData as { summaries: Record<string, unknown> }).summaries !== null
      ? (sumData as { summaries: Record<string, unknown> }).summaries
      : {};
  const next: Record<string, number> = {};
  Object.keys(summaries).forEach((k) => {
    const n = Number((summaries as Record<string, unknown>)[k]);
    if (!Number.isNaN(n)) next[k] = n;
  });
  return next;
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
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimateListLoading, setEstimateListLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [settledAt, setSettledAt] = useState("");
  const [phaseRows, setPhaseRows] = useState<PhaseRow[]>([]);
  const [customerPaymentRows, setCustomerPaymentRows] = useState<CustomerPaymentRow[]>([{ item: "", date: "", amount: 0, memo: "" }]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 견적 ID 문자열 → 고객결제상환 합계(원). 정산 행이 없으면 키 없음. */
  const [customerPaymentTotalsByEstimate, setCustomerPaymentTotalsByEstimate] = useState<Record<string, number>>(
    {}
  );
  /** 견적 전환·재요청 시 늦게 도착한 응답이 폼을 덮어쓰지 않도록 */
  const settlementDetailRequestId = useRef(0);

  const phasesFromEstimate = useMemo(() => {
    if (!estimate) return [];
    return buildPhasesFromEstimate(estimate);
  }, [estimate]);

  /** 프로젝트 선택 목록: 완료 건 보기 꺼짐이면 연결 상담이 완료인 견적 제외 */
  const filteredEstimates = useMemo(() => {
    if (showCompleted) return estimates;
    return estimates.filter((est) => {
      if (est.consultationId == null) return true;
      const c = consultations.find((x) => x.id === est.consultationId);
      const status = c?.status ?? "";
      return status !== "완료및정산" && status !== "완료";
    });
  }, [estimates, consultations, showCompleted]);

  const isAdditionalEstimateTitle = useCallback((title?: string) => {
    const t = String(title ?? "").trim();
    if (!t) return false;
    return t.includes("추가견적") || t.includes("추가 견적");
  }, []);

  /** 같은 현장끼리 묶고, 그룹 순서는 메인 견적 날짜 기준으로 정렬 */
  const groupedEstimates = useMemo(() => {
    const groups: { key: string; items: Estimate[]; mainDate: string; mainId: number }[] = [];
    const indexByKey = new Map<string, number>();
    filteredEstimates.forEach((est) => {
      const key =
        est.consultationId != null
          ? `consult-${est.consultationId}`
          : `site-${(est.customerName || "").trim()}|${(est.address || "").trim()}`;
      const idx = indexByKey.get(key);
      if (idx == null) {
        indexByKey.set(key, groups.length);
        groups.push({ key, items: [est], mainDate: String(est.estimateDate ?? ""), mainId: est.id });
      } else {
        groups[idx].items.push(est);
      }
    });

    const sorted = groups.map((group) => {
      const ordered = [...group.items].sort((a, b) => {
        const aAdditional = isAdditionalEstimateTitle(a.title);
        const bAdditional = isAdditionalEstimateTitle(b.title);
        if (aAdditional !== bAdditional) return aAdditional ? 1 : -1; // 추가견적은 하위
        const aDate = String(a.estimateDate ?? "");
        const bDate = String(b.estimateDate ?? "");
        if (aDate !== bDate) return bDate.localeCompare(aDate);
        return (b.id ?? 0) - (a.id ?? 0);
      });
      const main = ordered.find((x) => !isAdditionalEstimateTitle(x.title)) ?? ordered[0];
      return {
        key: group.key,
        items: ordered,
        mainDate: String(main?.estimateDate ?? ""),
        mainId: main?.id ?? 0,
      };
    });

    return sorted.sort((a, b) => {
      if (a.mainDate !== b.mainDate) return b.mainDate.localeCompare(a.mainDate);
      return b.mainId - a.mainId;
    });
  }, [filteredEstimates, isAdditionalEstimateTitle]);

  /** 선택된 견적이 필터 목록에 없으면 목록에 포함 (드롭다운 표시용) */
  const estimatesForSelect = useMemo(() => {
    if (selectedId == null) return filteredEstimates;
    if (filteredEstimates.some((e) => e.id === selectedId)) return filteredEstimates;
    const selected = estimates.find((e) => e.id === selectedId);
    return selected ? [selected, ...filteredEstimates] : filteredEstimates;
  }, [filteredEstimates, estimates, selectedId]);

  useEffect(() => {
    setEstimateListLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/estimates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/consultations", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/company/settlement-summaries", { credentials: "include" }).then((r) =>
        r.ok ? r.json().catch(() => ({})) : {}
      ),
    ])
      .then(([estData, consData, sumData]) => {
        if (Array.isArray(estData)) {
          setEstimates(estData as Estimate[]);
          const list = estData as Estimate[];
          const fromUrl = searchParams.get("estimateId");
          const idFromUrl = fromUrl ? parseInt(fromUrl, 10) : NaN;
          const inList = !Number.isNaN(idFromUrl) && list.some((e) => e.id === idFromUrl);
          if (inList) setSelectedId(idFromUrl);
          // URL에 estimateId가 없으면 기본은 선택 없음 (완료된 항목 보기 체크 후 선택하도록)
        } else {
          setError((estData as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
        }
        if (Array.isArray(consData)) setConsultations(consData as Consultation[]);
        else setConsultations([]);
        setCustomerPaymentTotalsByEstimate(parseSettlementSummariesResponse(sumData));
      })
      .catch(() => setError("견적 목록을 불러올 수 없습니다."))
      .finally(() => setEstimateListLoading(false));
  }, []);

  const loadDetail = useCallback(() => {
    if (selectedId == null) return;
    const requestId = ++settlementDetailRequestId.current;
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
        if (requestId !== settlementDetailRequestId.current) return;
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
        {
          const raw = (setData as { customerPayment?: string })?.customerPayment;
          if (typeof raw !== "string" || !raw.trim()) {
            setCustomerPaymentRows([{ item: "", date: "", amount: 0, memo: "" }]);
          } else {
            setCustomerPaymentRows(customerPaymentRowsFromStoredJson(raw));
          }
        }
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
            let subItems = mergedSub;
            /** 작업일지 행만 있으면 바로 입력할 수 있도록 빈 직접입력 행 1줄 */
            if (subItems.length > 0 && subItems.every((s) => s.fromWorkLog === true)) {
              subItems = [...subItems, { amount: 0, dateUsed: "", content: "" }];
            }
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
        if (requestId !== settlementDetailRequestId.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg && msg !== "Failed to fetch" ? msg : "견적/정산 정보를 불러올 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.");
        setEstimate(null);
        setPhaseRows([]);
      })
      .finally(() => {
        if (requestId === settlementDetailRequestId.current) setDetailLoading(false);
      });
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
      const raw =
        r.subItems && r.subItems.length > 0 ? stripEmptyManualSubItems(r.subItems) : [];
      const subItems = raw.length > 0 ? raw : undefined;
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
          fetch("/api/company/settlement-summaries", { credentials: "include" })
            .then((res) => (res.ok ? res.json().catch(() => ({})) : {}))
            .then((sumData) => setCustomerPaymentTotalsByEstimate(parseSettlementSummariesResponse(sumData)))
            .catch(() => {});
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
  const totalReceived = customerPaymentRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
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
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @page { size: portrait; margin: 0.25in; }
      @media print {
        body.settlement-print > *:not(#settlement-print-body) { display: none !important; visibility: hidden !important; }
        body.settlement-print > #settlement-print-body { display: block !important; visibility: visible !important; }
      }
    `;

    const printRoot = document.getElementById("settlement-print-root");
    const printOnly = printRoot?.querySelector(".settlement-print-only");
    let wrap: HTMLDivElement | null = null;
    if (printOnly) {
      wrap = document.createElement("div");
      wrap.id = "settlement-print-body";
      wrap.className = "settlement-print-only";
      wrap.appendChild(printOnly.cloneNode(true));
      document.body.appendChild(wrap);
    }

    document.body.classList.add("settlement-print");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });

    const onAfterPrint = () => {
      document.title = prevTitle;
      document.body.classList.remove("settlement-print");
      wrap?.remove();
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
      <div className="settlement-screen-only">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">정산</h1>
      <p className="text-sm text-gray-600 mb-4 no-print">
        프로젝트(견적)를 선택하면 공정별 견적 금액이 나옵니다. 각 공정마다 실제 사용한 금액(내가 쓴 금액)을 입력하고 저장하세요.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {selectedId == null ? (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
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
            <table className="w-full min-w-[760px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="row-actions-sticky w-44 p-2 sm:hidden">제목</th>
                  <th className="p-2 sm:p-3">견적일자</th>
                  <th className="p-2 sm:p-3">고객명</th>
                  <th className="p-2 sm:p-3">연락처</th>
                  <th className="hidden p-2 sm:table-cell sm:p-3">제목</th>
                  <th className="p-2 sm:p-3 text-right">고객결제상환</th>
                  <th className="p-2 sm:p-3 text-right">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estimateListLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">불러오는 중…</td>
                  </tr>
                ) : filteredEstimates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      {estimates.length === 0
                        ? "저장된 견적이 없습니다."
                        : "표시할 견적이 없습니다. '완료된 항목 보기'를 켜 보세요."}
                    </td>
                  </tr>
                ) : (
                  groupedEstimates.map((group) => (
                    <React.Fragment key={group.key}>
                      {group.items.map((est, idxInGroup) => {
                        const subtotal = (est.items || []).reduce(
                          (s, itm) =>
                            s +
                            (Number(itm.qty) || 0) * (Number(itm.materialUnitPrice ?? itm.unitPrice ?? 0) || 0) +
                            (Number(itm.qty) || 0) * (Number(itm.laborUnitPrice ?? 0) || 0),
                          0
                        );
                        const ohRate = (est.overheadPercent != null ? Number(est.overheadPercent) : 5) / 100;
                        const prRate = (est.profitPercent != null ? Number(est.profitPercent) : 10) / 100;
                        const total = Math.floor((subtotal + Math.floor(subtotal * ohRate) + Math.floor(subtotal * prRate)) / 10000) * 10000;
                        const isChild = idxInGroup > 0 || isAdditionalEstimateTitle(est.title);
                        const displayTitle = isChild ? `ㄴ ${est.title || "추가 견적서"}` : est.title || "-";
                        const titleSpan = <span className="text-blue-600 hover:underline">{displayTitle}</span>;
                        return (
                          <tr
                            key={est.id}
                            onClick={() => setSelectedId(est.id)}
                            className={`text-gray-700 hover:bg-gray-50 cursor-pointer ${isChild ? "bg-sky-50" : ""}`}
                          >
                            <td className="row-actions-sticky p-2 align-middle sm:hidden">
                              <div className="max-w-[12rem] truncate" title={displayTitle}>{titleSpan}</div>
                            </td>
                            <td className="p-2 sm:p-3">{formatDateYMD(est.estimateDate)}</td>
                            <td className="p-2 sm:p-3 font-medium">{est.customerName || "-"}</td>
                            <td className="p-2 sm:p-3">{est.contact || "-"}</td>
                            <td className="hidden p-2 sm:table-cell sm:p-3">
                              <div className="max-w-[18rem] truncate" title={displayTitle}>{titleSpan}</div>
                            </td>
                            <td className="p-2 sm:p-3 text-right tabular-nums text-gray-700">
                              {Object.prototype.hasOwnProperty.call(customerPaymentTotalsByEstimate, String(est.id))
                                ? `${formatNum(customerPaymentTotalsByEstimate[String(est.id)] ?? 0)}원`
                                : "-"}
                            </td>
                            <td className="p-2 sm:p-3 text-right tabular-nums">{formatNum(total)}원</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mb-4 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 no-print"
          >
            ← 목록으로
          </button>

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
                                      ) : (
                                        <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700">
                                          직접입력
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 align-top" />
                                    <td className="py-1.5 pr-2 align-top">
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly={!!sub.fromWorkLog}
                                        value={sub.amount === 0 ? "" : sub.amount.toLocaleString("ko-KR")}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/\D/g, "");
                                          const num = raw === "" ? 0 : parseInt(raw, 10);
                                          if (!Number.isNaN(num)) setPhaseSubItem(i, origIndex, "amount", num);
                                        }}
                                        placeholder="0"
                                        title={sub.fromWorkLog ? "작업일지 화면에서 금액을 수정합니다." : undefined}
                                        className={`w-full rounded border px-2 py-1.5 text-right ${
                                          sub.fromWorkLog ? "border-gray-200 bg-gray-50 text-gray-700 cursor-default" : "border-gray-200"
                                        }`}
                                      />
                                    </td>
                                    <td className="py-1.5 pr-2 align-top">
                                      <input
                                        type="date"
                                        readOnly={!!sub.fromWorkLog}
                                        value={sub.dateUsed}
                                        onChange={(e) => setPhaseSubItem(i, origIndex, "dateUsed", e.target.value.slice(0, 10))}
                                        title={sub.fromWorkLog ? "작업일지 화면에서 날짜를 수정합니다." : undefined}
                                        className={`w-full rounded border px-2 py-1.5 ${
                                          sub.fromWorkLog ? "border-gray-200 bg-gray-50 cursor-default" : "border-gray-200"
                                        }`}
                                      />
                                    </td>
                                    <td className="py-1.5 px-2 align-top min-w-0">
                                      <input
                                        type="text"
                                        readOnly={!!sub.fromWorkLog}
                                        value={sub.content}
                                        onChange={(e) => setPhaseSubItem(i, origIndex, "content", e.target.value)}
                                        placeholder="내용"
                                        title={sub.fromWorkLog ? "작업일지 화면에서 내용을 수정합니다." : undefined}
                                        className={`w-full rounded border px-2 py-1.5 ${
                                          sub.fromWorkLog ? "border-gray-200 bg-gray-50 cursor-default" : "border-gray-200"
                                        }`}
                                      />
                                    </td>
                                    <td className="py-1.5 pr-3 align-top text-center whitespace-nowrap no-print">
                                      <button
                                        type="button"
                                        disabled={!!sub.fromWorkLog}
                                        onClick={() => removePhaseSubItem(i, origIndex)}
                                        title={sub.fromWorkLog ? "작업일지에서 해당 지출을 삭제하면 여기서도 빠집니다." : undefined}
                                        className={`text-xs font-medium no-print ${
                                          sub.fromWorkLog
                                            ? "cursor-not-allowed text-gray-400"
                                            : "text-red-600 hover:text-red-700"
                                        }`}
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
                <span><strong>받은금액</strong> {formatNum(totalReceived)}원</span>
                <span><strong>쓴금액</strong> {formatNum(totalUsed)}원</span>
                <span><strong>공사 남은금액</strong> <span className="text-gray-900 font-semibold">{formatNum(Math.max(0, settlementTotalAmount - totalUsed))}원</span></span>
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saveLoading}
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
        </>
      )}
      </div>

      {!detailLoading && estimate && phaseRows.length > 0 && (
        <div className="settlement-print-only">
          <header className="settlement-print-header">
            <h1 className="settlement-print-title">정산서</h1>
            <p className="settlement-print-subtitle">{estimate.title}</p>
            <table className="settlement-print-customer">
              <tbody>
                <tr>
                  <th>고객명</th>
                  <td>{estimate.customerName || "-"}</td>
                </tr>
                <tr>
                  <th>주소</th>
                  <td>{estimate.address || "-"}</td>
                </tr>
              </tbody>
            </table>
          </header>

          <section className="settlement-print-section">
            <h2 className="settlement-print-section-title">고객결제 현황</h2>
            <p className="settlement-print-total-line">
              정산 총금액 (VAT 별도) <strong>{formatNum(settlementTotalAmount)}원</strong>
            </p>
            <table className="settlement-print-table settlement-print-table-dark-header">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>날짜</th>
                  <th className="text-right">금액</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {customerPaymentRows
                  .filter((r) => r.item.trim() || r.amount > 0 || r.date)
                  .map((row, i) => (
                    <tr key={i}>
                      <td>{row.item || "-"}</td>
                      <td>{row.date || "-"}</td>
                      <td className="text-right tabular-nums">{formatNum(row.amount)}</td>
                      <td>{row.memo || ""}</td>
                    </tr>
                  ))}
                <tr className="settlement-print-row-total">
                  <td>합계</td>
                  <td />
                  <td className="text-right tabular-nums font-semibold">{formatNum(customerPaymentRows.reduce((s, r) => s + r.amount, 0))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>

          <section className="settlement-print-section">
            <h2 className="settlement-print-section-title">공정별 비용 내역</h2>
            <table className="settlement-print-table settlement-print-phase-table settlement-print-table-dark-header">
              <thead>
                <tr>
                  <th>공정</th>
                  <th className="text-right">견적 금액</th>
                  <th className="text-right">실지출 금액</th>
                  <th>날짜</th>
                  <th>내용</th>
                </tr>
              </thead>
              <tbody>
                {phaseRows.map((row, i) => {
                  const subSum = (row.subItems || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
                  const usedDisplay = row.subItems?.length ? subSum : row.usedAmount;
                  const subs = (row.subItems || [])
                    .filter((s) => s.fromWorkLog === true || !isManualSubItemEmpty(s))
                    .sort((a, b) => (a.dateUsed || "").localeCompare(b.dateUsed || ""));
                  return (
                    <React.Fragment key={i}>
                      <tr>
                        <td className="font-medium">{row.phaseName}</td>
                        <td className="text-right tabular-nums">{formatNum(row.estimateAmount)}</td>
                        <td className="text-right tabular-nums">{subs.length <= 1 ? formatNum(usedDisplay) : ""}</td>
                        <td />
                        <td />
                      </tr>
                      {subs.map((sub, j) => (
                        <tr key={`${i}-${j}`} className="settlement-print-sub-row">
                          <td />
                          <td />
                          <td className="text-right tabular-nums">{formatNum(sub.amount)}</td>
                          <td>{sub.dateUsed || "-"}</td>
                          <td>{sub.content || "-"}</td>
                        </tr>
                      ))}
                      {subs.length > 1 && (
                        <tr className="settlement-print-sub-row">
                          <td />
                          <td />
                          <td className="text-right tabular-nums font-medium">소계: {formatNum(usedDisplay)}</td>
                          <td />
                          <td />
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                <tr className="settlement-print-row-total">
                  <td className="font-semibold">합계</td>
                  <td className="text-right tabular-nums font-semibold">{formatNum(totalEstimate)}</td>
                  <td className="text-right tabular-nums font-semibold">{formatNum(totalUsed)}</td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </section>

          <section className="settlement-print-section">
            <h2 className="settlement-print-section-title">정산 요약</h2>
            <table className="settlement-print-table settlement-print-summary-table">
              <tbody>
                <tr>
                  <td>견적 금액 합계</td>
                  <td className="text-right tabular-nums">{formatNum(totalEstimate)}원</td>
                </tr>
                <tr>
                  <td>이윤</td>
                  <td className="text-right tabular-nums">{formatNum(profit)}원</td>
                </tr>
                <tr>
                  <td>공과잡비</td>
                  <td className="text-right tabular-nums">{formatNum(overhead)}원</td>
                </tr>
                <tr className="settlement-print-row-summary-total">
                  <td className="font-semibold">총금액 (이윤+공과잡비)</td>
                  <td className="text-right tabular-nums font-semibold">{formatNum(settlementTotalAmount)}원</td>
                </tr>
                <tr>
                  <td>내가 쓴 금액 합계</td>
                  <td className="text-right tabular-nums">{formatNum(totalUsed)}원</td>
                </tr>
                <tr className="settlement-print-row-remaining">
                  <td className="font-semibold">정산금액 (총금액-지출금액)</td>
                  <td className="text-right tabular-nums font-semibold">
                    {formatNum(remainingAmount)}원
                    {settlementTotalAmount > 0 && (
                      <span className="ml-1">(이윤률 {remainingPercent.toFixed(1)}%)</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
