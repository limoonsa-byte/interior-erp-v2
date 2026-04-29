"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CreditCard, Eye, Plus, Printer, Save, Trash2, X } from "lucide-react";

type Estimate = {
  id: number;
  customerName?: string;
  contact?: string;
  title?: string;
  estimateDate?: string;
};

type SettlementApiItem = {
  amount?: number;
  memo?: string;
  subItems?: { amount?: number; dateUsed?: string; content?: string; fromWorkLog?: boolean }[];
};

type SettlementApiResponse = {
  items?: SettlementApiItem[];
  settledAt?: string;
  customerPayment?: string;
};

type PaymentApprovalApiResponse = {
  data?: string;
};

type PaymentApprovalRow = {
  item: string;
  date: string;
  amount: number;
  memo: string;
};

type ApprovalEntry = {
  id: string;
  item: string;
  memo: string;
  amount: number;
};

type ApprovalDateSection = {
  id: string;
  date: string;
  entries: ApprovalEntry[];
};

type ApprovalStoredPayload = {
  schema?: string;
  sections?: { date?: unknown; entries?: { item?: unknown; memo?: unknown; amount?: unknown }[] }[];
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

function toDateKey(dateStr: string | undefined): string {
  const s = (dateStr || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyEntry(): ApprovalEntry {
  return { id: newClientId(), item: "", memo: "", amount: 0 };
}

function createEmptySection(date = ""): ApprovalDateSection {
  return { id: newClientId(), date, entries: [createEmptyEntry()] };
}

function parseApprovalSections(raw: unknown): ApprovalDateSection[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed != null &&
      typeof parsed === "object" &&
      (parsed as ApprovalStoredPayload).schema === "approval_v1" &&
      Array.isArray((parsed as ApprovalStoredPayload).sections)
    ) {
      const payload = parsed as ApprovalStoredPayload;
      const sections = (payload.sections ?? []).map((section) => ({
        id: newClientId(),
        date: typeof section?.date === "string" ? String(section.date).slice(0, 10) : "",
        entries: Array.isArray(section?.entries)
          ? section.entries.map((entry) => ({
              id: newClientId(),
              item: typeof entry?.item === "string" ? entry.item : "",
              memo: typeof entry?.memo === "string" ? entry.memo : "",
              amount: Number(entry?.amount) || 0,
            }))
          : [],
      }));
      const normalized = sections.map((section) => ({
        ...section,
        entries: section.entries.length > 0 ? section.entries : [createEmptyEntry()],
      }));
      return normalized.length > 0 ? normalized : [createEmptySection("")];
    }
    /** 정산 페이지에서 저장한 [{ item, date, amount, memo }, …] 배열 */
    if (Array.isArray(parsed)) {
      const rows = parsed as { item?: unknown; date?: unknown; amount?: unknown; memo?: unknown }[];
      if (rows.length === 0) return [createEmptySection("")];
      const byDate = new Map<string, ApprovalEntry[]>();
      for (const r of rows) {
        const d = typeof r?.date === "string" ? r.date.trim().slice(0, 10) : "";
        const key = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
        const entry: ApprovalEntry = {
          id: newClientId(),
          item: typeof r?.item === "string" ? r.item : "",
          memo: typeof r?.memo === "string" ? r.memo : "",
          amount: Number(r?.amount) || 0,
        };
        const list = byDate.get(key);
        if (list) list.push(entry);
        else byDate.set(key, [entry]);
      }
      const out: ApprovalDateSection[] = [];
      for (const [date, entries] of byDate) {
        out.push({
          id: newClientId(),
          date,
          entries: entries.length > 0 ? entries : [createEmptyEntry()],
        });
      }
      return out.length > 0 ? out : [createEmptySection("")];
    }
    return null;
  } catch {
    return null;
  }
}

export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const estimateId = Number(params?.id);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [sections, setSections] = useState<ApprovalDateSection[]>([createEmptySection("")]);
  const [settlementItems, setSettlementItems] = useState<SettlementApiItem[]>([]);
  const [settledAt, setSettledAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 견적은 됐는데 정산·결제분 GET만 실패한 경우(저장은 가능) */
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printSectionId, setPrintSectionId] = useState<string>("all");

  const load = useCallback(() => {
    if (!Number.isFinite(estimateId) || estimateId <= 0) {
      setError("잘못된 접근입니다. 결제 승인 관리 목록에서 다시 선택해 주세요.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setLoadWarning(null);

    const estP = fetch(`/api/estimates/${estimateId}`, { credentials: "include" }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data as { error?: string }).error || "견적 정보를 불러올 수 없습니다.");
      return data as Estimate;
    });

    const setP = fetch(`/api/company/settlements/${estimateId}`, { credentials: "include" }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error((data as { error?: string }).error || `정산(공정) 정보를 불러올 수 없습니다. (${r.status})`);
      }
      return data as SettlementApiResponse | null;
    });

    const apprP = fetch(`/api/company/payment-approvals/${estimateId}`, { credentials: "include" }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error((data as { error?: string }).error || `결제 승인서를 불러올 수 없습니다. (${r.status})`);
      }
      return data as PaymentApprovalApiResponse;
    });

    Promise.allSettled([estP, setP, apprP]).then((results) => {
      const [estR, setR, apprR] = results;
      const warnings: string[] = [];

      if (estR.status === "fulfilled") {
        setEstimate(estR.value);
      } else {
        setEstimate(null);
        const msg =
          estR.reason instanceof Error ? estR.reason.message : "견적 정보를 불러올 수 없습니다.";
        setError(msg);
      }

      if (setR.status === "fulfilled") {
        const settlementData = setR.value;
        setSettlementItems(Array.isArray(settlementData?.items) ? settlementData.items : []);
        setSettledAt(typeof settlementData?.settledAt === "string" ? settlementData.settledAt : "");
      } else {
        setSettlementItems([]);
        setSettledAt("");
        if (estR.status === "fulfilled") {
          warnings.push(
            setR.reason instanceof Error ? setR.reason.message : "정산(공정) 정보를 불러올 수 없습니다."
          );
        }
      }

      if (apprR.status === "fulfilled") {
        const raw = typeof apprR.value?.data === "string" ? apprR.value.data : "";
        const parsedSections = parseApprovalSections(raw.trim() ? raw : "");
        setSections(parsedSections ?? [createEmptySection("")]);
      } else {
        setSections([createEmptySection("")]);
        if (estR.status === "fulfilled") {
          warnings.push(
            `${apprR.reason instanceof Error ? apprR.reason.message : "결제 승인서를 불러올 수 없습니다."} (승인서는 정산과 별도 테이블에 저장됩니다.)`
          );
        }
      }

      setLoadWarning(warnings.length > 0 ? warnings.join(" ") : null);
    }).finally(() => setLoading(false));
  }, [estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 인쇄 시 사이드바·메인 영역까지 포함되지 않도록 (자재리스트 material-list-print-open 과 동일 패턴) */
  useEffect(() => {
    if (!showPrintPreview) {
      document.body.classList.remove("payment-approval-print-open");
      return;
    }
    document.body.classList.add("payment-approval-print-open");
    return () => {
      document.body.classList.remove("payment-approval-print-open");
    };
  }, [showPrintPreview]);

  const allRows = useMemo(
    () =>
      sections.flatMap((section) =>
        section.entries.map((entry) => ({
          date: toDateKey(section.date) || section.date.trim(),
          amount: Number(entry.amount) || 0,
        }))
      ),
    [sections]
  );
  const totalAmount = useMemo(
    () => allRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [allRows]
  );

  useEffect(() => {
    if (printSectionId === "all") return;
    if (!sections.some((section) => section.id === printSectionId)) {
      setPrintSectionId("all");
    }
  }, [sections, printSectionId]);

  const sectionsForPrint = useMemo(() => {
    const target = printSectionId === "all" ? sections : sections.filter((section) => section.id === printSectionId);

    return target
      .map((section) => {
        const entries = section.entries.filter(
          (entry) => entry.item.trim() || entry.memo.trim() || Number(entry.amount) > 0
        );
        if (entries.length === 0) return null;
        return {
          date: toDateKey(section.date) || section.date.trim() || "-",
          entries: entries.map((entry) => ({
            item: entry.item || "-",
            memo: entry.memo || "-",
            amount: Number(entry.amount) || 0,
          })),
        };
      })
      .filter((x): x is { date: string; entries: { item: string; memo: string; amount: number }[] } => x != null);
  }, [sections, printSectionId]);

  const printableTotalAmount = useMemo(
    () =>
      sectionsForPrint.reduce(
        (sum, section) =>
          sum + section.entries.reduce((sub, entry) => sub + (Number(entry.amount) || 0), 0),
        0
      ),
    [sectionsForPrint]
  );

  const setSectionDate = useCallback((sectionId: string, date: string) => {
    setSections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, date: date.slice(0, 10) } : section))
    );
  }, []);

  const addSection = useCallback(() => {
    setSections((prev) => [...prev, createEmptySection("")]);
  }, []);

  const removeSection = useCallback((sectionId: string) => {
    setSections((prev) => {
      const next = prev.filter((section) => section.id !== sectionId);
      return next.length > 0 ? next : [createEmptySection("")];
    });
  }, []);

  const setEntry = useCallback(
    (sectionId: string, entryId: string, key: keyof Omit<ApprovalEntry, "id">, value: string | number) => {
      setSections((prev) =>
        prev.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            entries: section.entries.map((entry) =>
              entry.id === entryId ? { ...entry, [key]: value } : entry
            ),
          };
        })
      );
    },
    []
  );

  const addEntry = useCallback((sectionId: string) => {
    setSections((prev) =>
      prev.map((section) =>
        section.id === sectionId ? { ...section, entries: [...section.entries, createEmptyEntry()] } : section
      )
    );
  }, []);

  const removeEntry = useCallback((sectionId: string, entryId: string) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const nextEntries = section.entries.filter((entry) => entry.id !== entryId);
        return { ...section, entries: nextEntries.length > 0 ? nextEntries : [createEmptyEntry()] };
      })
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!Number.isFinite(estimateId) || estimateId <= 0) return;
    setSaving(true);
    setError(null);
    const approvalJson = JSON.stringify({
      schema: "approval_v1",
      sections: sections.map((section) => ({
        date: toDateKey(section.date) || section.date.trim(),
        entries: section.entries.map((entry) => ({
          item: entry.item?.trim() || "",
          memo: entry.memo?.trim() || "",
          amount: Number(entry.amount) || 0,
        })),
      })),
    });
    const settlementBody = JSON.stringify({
      items: settlementItems,
      settledAt: settledAt?.trim() || null,
    });
    Promise.all([
      fetch(`/api/company/payment-approvals/${estimateId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: approvalJson }),
      }),
      fetch(`/api/company/settlements/${estimateId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: settlementBody,
      }),
    ])
      .then(async ([r1, r2]) => {
        const d1 = await r1.json().catch(() => ({}));
        const d2 = await r2.json().catch(() => ({}));
        if (!r1.ok) throw new Error((d1 as { error?: string }).error || "결제 승인서 저장에 실패했습니다.");
        if (!r2.ok) throw new Error((d2 as { error?: string }).error || "정산 공정 정보 저장에 실패했습니다.");
        alert("저장되었습니다.");
        setLoadWarning(null);
        load();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "저장에 실패했습니다."))
      .finally(() => setSaving(false));
  }, [estimateId, sections, settlementItems, settledAt, load]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">결제 승인 정보를 불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <CreditCard className="h-6 w-6 text-slate-600" />
          결제 승인서 작성
        </h1>
        <Link
          href="/payment"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          목록으로
        </Link>
      </div>

      {estimate && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{estimate.title?.trim() ? estimate.title : "제목 없음"}</p>
          <p className="mt-1 text-xs text-gray-500">
            고객명: {estimate.customerName || "-"} / 연락처: {estimate.contact?.trim() ? estimate.contact : "-"}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}
      {loadWarning && !error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">{loadWarning}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-gray-400 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-blue-500 hover:bg-blue-50/50"
        >
          <Plus className="h-4 w-4" />
          날짜 항목 추가
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPrintSectionId("all");
            setShowPrintPreview(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Eye className="h-4 w-4" />
          결제서 미리보기
        </button>
      </div>

      <p className="text-xs text-gray-500">
        결제 나가기 전 승인용 서류를 작성합니다. 자재리스트처럼 날짜를 큰 항목으로 두고 하위에 항목/비고/금액을 입력하세요.
      </p>

      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <div key={section.id} className="overflow-hidden rounded-lg border-2 border-gray-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
              <label className="text-sm font-semibold text-gray-700">날짜</label>
              <input
                type="date"
                value={section.date}
                onChange={(e) => setSectionDate(section.id, e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                className="ml-auto rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="날짜 항목 삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-100 text-gray-700">
                  <tr>
                    <th className="p-2 sm:p-3 font-semibold">항목</th>
                    <th className="p-2 sm:p-3 font-semibold">비고</th>
                    <th className="p-2 sm:p-3 text-right font-semibold">금액</th>
                    <th className="p-2 sm:p-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {section.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="p-2 sm:p-3">
                        <input
                          type="text"
                          value={entry.item}
                          onChange={(e) => setEntry(section.id, entry.id, "item", e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5"
                          placeholder="예: 타일 선결제, 조명 자재 결제"
                        />
                      </td>
                      <td className="p-2 sm:p-3">
                        <input
                          type="text"
                          value={entry.memo}
                          onChange={(e) => setEntry(section.id, entry.id, "memo", e.target.value)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5"
                          placeholder="비고"
                        />
                      </td>
                      <td className="p-2 sm:p-3">
                        <input
                          type="number"
                          value={entry.amount}
                          onChange={(e) => setEntry(section.id, entry.id, "amount", Number(e.target.value) || 0)}
                          className="w-full rounded border border-gray-300 px-2 py-1.5 text-right"
                          min={0}
                        />
                      </td>
                      <td className="p-2 sm:p-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeEntry(section.id, entry.id)}
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

            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addEntry(section.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="h-4 w-4" />
                  행 추가
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintSectionId(section.id);
                    setShowPrintPreview(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" />
                  이 큰항목 인쇄/PDF
                </button>
              </div>
              <p className="text-sm font-semibold text-gray-700">
                날짜 합계{" "}
                {formatNumber(section.entries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0))}
                원
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-right text-sm font-semibold text-gray-900">
        전체 합계 {formatNumber(totalAmount)}원
      </div>

      {showPrintPreview &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="payment-approval-print-area"
            className="payment-print-modal fixed inset-0 z-[9999] overflow-auto bg-white p-6"
          >
            <div className="no-print mb-6 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-4">
              <p className="w-full text-xs text-gray-500">
                인쇄 창에서 프린터를 <strong>PDF로 저장</strong>으로 선택하면 결제 승인서를 날짜별로 저장할 수 있습니다.
              </p>
              <p className="text-sm text-gray-700">
                출력 기준: {printSectionId === "all" ? "전체 큰항목" : "선택한 큰항목 1건"}
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" />
                인쇄 / PDF 저장
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

            <div className="payment-approval-print-content mx-auto w-full max-w-4xl">
              <h1 className="mb-2 text-2xl font-bold text-gray-900">결제 승인서</h1>
              <p className="mb-1 text-sm text-gray-700">현장명: {estimate?.title?.trim() ? estimate.title : "-"}</p>
              <p className="mb-1 text-sm text-gray-700">고객명: {estimate?.customerName?.trim() ? estimate.customerName : "-"}</p>
              <p className="mb-1 text-sm text-gray-700">연락처: {estimate?.contact?.trim() ? estimate.contact : "-"}</p>
              <p className="mb-1 text-sm text-gray-700">견적일자: {formatDateYMD(estimate?.estimateDate)}</p>
              <p className="mb-4 text-sm text-gray-700">
                출력 기준: {printSectionId === "all" ? "전체 큰항목" : "선택한 큰항목"}
              </p>

              {sectionsForPrint.length === 0 ? (
                <p className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  출력할 항목이 없습니다.
                </p>
              ) : (
                sectionsForPrint.map((section, idx) => (
                  <div key={`${section.date}-${idx}`} className="mb-5">
                    <h2 className="mb-2 text-base font-semibold text-gray-800">날짜: {section.date}</h2>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 p-2 text-left font-semibold">항목</th>
                          <th className="border border-gray-300 p-2 text-left font-semibold">비고</th>
                          <th className="border border-gray-300 p-2 text-right font-semibold">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.entries.map((entry, entryIndex) => (
                          <tr key={`${section.date}-${entryIndex}`}>
                            <td className="border border-gray-300 p-2">{entry.item}</td>
                            <td className="border border-gray-300 p-2 whitespace-pre-wrap">{entry.memo}</td>
                            <td className="border border-gray-300 p-2 text-right tabular-nums">{formatNumber(entry.amount)}원</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50">
                          <td colSpan={2} className="border border-gray-300 p-2 text-right font-semibold">
                            날짜 합계
                          </td>
                          <td className="border border-gray-300 p-2 text-right font-semibold tabular-nums">
                            {formatNumber(section.entries.reduce((sum, entry) => sum + entry.amount, 0))}원
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))
              )}

              <div className="mt-3 rounded border border-gray-300 bg-gray-50 p-3 text-right font-semibold text-gray-900">
                {printSectionId === "all" ? "전체 출력 합계" : "이 큰항목 합계"}{" "}
                {formatNumber(printableTotalAmount)}원
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
