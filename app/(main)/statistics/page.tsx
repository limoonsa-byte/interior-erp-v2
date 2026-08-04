"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildStatistics,
  type ConsultationStat,
  type EstimateStat,
  type StatsFilters,
} from "@/lib/statistics-dashboard";

type SummaryResponse = {
  summaries?: Record<string, number>;
  approvalSummaries?: Record<string, number>;
  usedSummaries?: Record<string, number>;
};

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function toDate(val: Date): string {
  return val.toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: toDate(start), endDate: toDate(end) };
}

function prevMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { startDate: toDate(start), endDate: toDate(end) };
}

function dateOnly(v?: string): string {
  if (!v) return "";
  return v.trim().slice(0, 10);
}

function isInRange(date: string, startDate: string, endDate: string): boolean {
  if (!date) return false;
  if (!startDate || !endDate) return true;
  return date >= startDate && date <= endDate;
}

function normalizeStatusLabel(status?: string): string {
  const s = (status || "").trim();
  if (!s) return "";
  if (s === "공사진행" || s === "진행 중") return "진행중";
  return s;
}

export default function StatisticsPage() {
  const [consultations, setConsultations] = useState<ConsultationStat[]>([]);
  const [estimates, setEstimates] = useState<EstimateStat[]>([]);
  const [summaries, setSummaries] = useState<Record<string, number>>({});
  const [approvalSummaries, setApprovalSummaries] = useState<Record<string, number>>({});
  const [usedSummaries, setUsedSummaries] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const thisMonth = defaultRange();
  const [filters, setFilters] = useState<StatsFilters>({
    period: "thisMonth",
    startDate: thisMonth.startDate,
    endDate: thisMonth.endDate,
    pic: "",
    status: "",
    includeCompleted: true,
    selectedEstimateIds: [],
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/consultations", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/estimates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/company/settlement-summaries", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : {}
      ),
    ])
      .then(([consultData, estimateData, summaryData]) => {
        setConsultations(Array.isArray(consultData) ? (consultData as ConsultationStat[]) : []);
        setEstimates(Array.isArray(estimateData) ? (estimateData as EstimateStat[]) : []);
        const sum = (summaryData as SummaryResponse).summaries;
        const appr = (summaryData as SummaryResponse).approvalSummaries;
        const used = (summaryData as SummaryResponse).usedSummaries;
        setSummaries(sum && typeof sum === "object" ? sum : {});
        setApprovalSummaries(appr && typeof appr === "object" ? appr : {});
        setUsedSummaries(used && typeof used === "object" ? used : {});
      })
      .catch(() => setError("통계 데이터를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(
    () => buildStatistics(consultations, estimates, summaries, approvalSummaries, usedSummaries, filters),
    [consultations, estimates, summaries, approvalSummaries, usedSummaries, filters]
  );

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    consultations.forEach((c) => {
      const s = normalizeStatusLabel(c.status);
      if (s) set.add(s);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [consultations]);

  const picOptions = useMemo(() => {
    const set = new Set<string>();
    consultations.forEach((c) => {
      const p = (c.pic || "").trim();
      if (p) set.add(p);
    });
    estimates.forEach((e) => {
      const p = (e.picName || "").trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [consultations, estimates]);

  const consultationDateById = useMemo(() => {
    const map = new Map<number, string>();
    consultations.forEach((c) => {
      map.set(c.id, dateOnly(c.consultedAt));
    });
    return map;
  }, [consultations]);

  const consultationMetaById = useMemo(() => {
    const map = new Map<number, { status: string; pic: string }>();
    consultations.forEach((c) => {
      map.set(c.id, {
        status: normalizeStatusLabel(c.status),
        pic: (c.pic || "").trim(),
      });
    });
    return map;
  }, [consultations]);

  const siteOptions = useMemo(
    () =>
      estimates
        .filter((e) => {
          const meta = consultationMetaById.get(e.consultationId ?? -1);
          const baseDate = dateOnly(e.estimateDate) || consultationDateById.get(e.consultationId ?? -1) || "";
          if (!isInRange(baseDate, filters.startDate, filters.endDate)) return false;
          const status = normalizeStatusLabel(meta?.status);
          if (!filters.includeCompleted && (status === "완료" || status === "완료및정산")) return false;
          if (filters.status && status !== normalizeStatusLabel(filters.status)) return false;
          const pic = (meta?.pic || e.picName || "").trim();
          if (filters.pic && pic !== filters.pic) return false;
          return true;
        })
        .map((e) => ({
          id: e.id,
          label: (e.displayTitle || e.title || "").trim() || `프로젝트 #${e.id}`,
        })),
    [
      estimates,
      consultationDateById,
      consultationMetaById,
      filters.startDate,
      filters.endDate,
      filters.includeCompleted,
      filters.status,
      filters.pic,
    ]
  );

  useEffect(() => {
    const allowed = new Set(siteOptions.map((s) => s.id));
    setFilters((prev) => {
      if (prev.selectedEstimateIds.length === 0) return prev;
      const next = prev.selectedEstimateIds.filter((id) => allowed.has(id));
      if (next.length === prev.selectedEstimateIds.length) return prev;
      return { ...prev, selectedEstimateIds: next };
    });
  }, [siteOptions]);

  const totalsConsistent = useMemo(() => {
    let expectedPaid = 0;
    stats.filteredEstimateIds.forEach((id) => {
      expectedPaid += Number(summaries[String(id)]) || 0;
    });
    return expectedPaid === stats.paidTotal;
  }, [stats.filteredEstimateIds, stats.paidTotal, summaries]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-xl font-semibold text-gray-900">통계 대시보드</h1>
        <p className="mt-1 text-sm text-gray-600">
          결제승인/고객결제 합계는 정산 데이터 기준으로 계산됩니다.
        </p>
        <p className={`mt-1 text-xs ${totalsConsistent ? "text-emerald-700" : "text-amber-700"}`}>
          {totalsConsistent
            ? "합계 검증 완료: 고객입금 합계가 정산 데이터와 일치합니다."
            : "합계 불일치: 필터 또는 원본 데이터 상태를 확인해 주세요."}
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-5">
        <select
          value={filters.period}
          onChange={(e) => {
            const v = e.target.value as StatsFilters["period"];
            if (v === "thisMonth") {
              const range = defaultRange();
              setFilters((prev) => ({ ...prev, period: v, ...range }));
              return;
            }
            if (v === "lastMonth") {
              const range = prevMonthRange();
              setFilters((prev) => ({ ...prev, period: v, ...range }));
              return;
            }
            setFilters((prev) => ({ ...prev, period: v }));
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="thisMonth">이번 달</option>
          <option value="lastMonth">지난 달</option>
          <option value="custom">직접 선택</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, period: "custom", startDate: e.target.value }))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters((prev) => ({ ...prev, period: "custom", endDate: e.target.value }))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.pic}
          onChange={(e) => setFilters((prev) => ({ ...prev, pic: e.target.value }))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">담당자 전체</option>
          {picOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">상태 전체</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="md:col-span-5 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filters.includeCompleted}
            onChange={(e) => setFilters((prev) => ({ ...prev, includeCompleted: e.target.checked }))}
          />
          완료 건 포함
        </label>
        <div className="md:col-span-5 rounded border border-gray-200 bg-gray-50 p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">현장 선택(체크, 선택 기간 기준)</p>
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, selectedEstimateIds: [] }))}
              className="text-xs text-gray-600 underline underline-offset-2 hover:text-gray-800"
            >
              전체 해제
            </button>
          </div>
          <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
            {siteOptions.length === 0 ? (
              <p className="text-xs text-gray-500">현장 데이터가 없습니다.</p>
            ) : (
              siteOptions.map((site) => {
                const checked = filters.selectedEstimateIds.includes(site.id);
                return (
                  <label key={site.id} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setFilters((prev) => {
                          const next = new Set(prev.selectedEstimateIds);
                          if (e.target.checked) next.add(site.id);
                          else next.delete(site.id);
                          return { ...prev, selectedEstimateIds: Array.from(next) };
                        });
                      }}
                    />
                    <span className="truncate">{site.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white xl:col-span-2">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">현장별 고객 입금상황</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">프로젝트 제목</th>
                  <th className="px-3 py-2 text-left">고객</th>
                  <th className="px-3 py-2 text-right">전체금액</th>
                  <th className="px-3 py-2 text-right">정산금</th>
                  <th className="px-3 py-2 text-right">남는금액</th>
                  <th className="px-3 py-2 text-right">고객입금</th>
                  <th className="px-3 py-2 text-right">입금률</th>
                  <th className="px-3 py-2 text-right">미수</th>
                  <th className="px-3 py-2 text-left">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.projects.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                      표시할 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  stats.projects.slice(0, 30).map((row) => {
                    const rate =
                      row.totalAmount > 0
                        ? Math.min(100, (row.paidAmount / row.totalAmount) * 100)
                        : 0;
                    const status =
                      row.totalAmount === 0
                        ? "금액없음"
                        : rate >= 100
                          ? "입금완료"
                          : rate > 0
                            ? "부분입금"
                            : "미입금";
                    return (
                      <tr key={`payment-${row.estimateId}`}>
                        <td className="px-3 py-2">{row.siteName}</td>
                        <td className="px-3 py-2">{row.customerName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNum(row.totalAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNum(row.usedAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">
                          {formatNum(row.remainingAmount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNum(row.paidAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-red-600">
                          {formatNum(row.receivableAmount)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                              status === "입금완료"
                                ? "bg-emerald-100 text-emerald-700"
                                : status === "부분입금"
                                  ? "bg-amber-100 text-amber-700"
                                  : status === "금액없음"
                                    ? "bg-gray-100 text-gray-700"
                                    : "bg-red-100 text-red-700"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white xl:col-span-2">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">현장별 금액 그래프</h2>
          </div>
          <div className="p-4">
            {stats.projects.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">표시할 데이터가 없습니다.</p>
            ) : (
              (() => {
                const rows = stats.projects.slice(0, 10);
                const maxVal = Math.max(1, ...rows.flatMap((r) => [r.totalAmount, r.usedAmount, r.paidAmount]));
                const chartH = 260;
                const padTop = 20;
                const padBottom = 56;
                const padLeft = 96;
                const usableH = chartH - padTop - padBottom;
                const groupW = 72;
                const chartW = Math.max(980, padLeft + 24 + rows.length * groupW);
                const toY = (v: number) => padTop + usableH - (Math.max(0, v) / maxVal) * usableH;
                const ticks = [0, 0.25, 0.5, 0.75, 1];
                return (
                  <div className="overflow-x-auto">
                    <svg width={chartW} height={chartH} role="img" aria-label="현장별 금액 막대 그래프">
                      <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + usableH} stroke="#9ca3af" strokeWidth="1" />
                      <line x1={padLeft} y1={padTop + usableH} x2={chartW - 12} y2={padTop + usableH} stroke="#9ca3af" strokeWidth="1" />
                      {ticks.map((t) => {
                        const y = padTop + usableH - usableH * t;
                        return (
                          <g key={`tick-${t}`}>
                            <line x1={padLeft} y1={y} x2={chartW - 12} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                            <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">
                              {formatNum(Math.round(maxVal * t))}
                            </text>
                          </g>
                        );
                      })}
                      {rows.map((row, i) => {
                        const gx = padLeft + 10 + i * groupW;
                        const totalY = toY(row.totalAmount);
                        const usedY = toY(row.usedAmount);
                        const paidY = toY(row.paidAmount);
                        return (
                          <g key={`bar-${row.estimateId}`}>
                            <rect x={gx} y={totalY} width={12} height={padTop + usableH - totalY} fill="#9ca3af">
                              <title>{`전체금액 ${formatNum(row.totalAmount)}`}</title>
                            </rect>
                            <rect x={gx + 16} y={usedY} width={12} height={padTop + usableH - usedY} fill="#3b82f6">
                              <title>{`정산금 ${formatNum(row.usedAmount)}`}</title>
                            </rect>
                            <rect x={gx + 32} y={paidY} width={12} height={padTop + usableH - paidY} fill="#10b981">
                              <title>{`고객입금 ${formatNum(row.paidAmount)}`}</title>
                            </rect>
                            <text x={gx + 22} y={chartH - 22} textAnchor="middle" fontSize="10" fill="#374151">
                              {row.siteName.length > 8 ? `${row.siteName.slice(0, 8)}…` : row.siteName}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-gray-400" />전체금액</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500" />정산금</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500" />고객입금</span>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </section>

      </div>

      {(loading || error) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {loading ? "통계 데이터를 불러오는 중..." : error}
        </div>
      )}
    </div>
  );
}
