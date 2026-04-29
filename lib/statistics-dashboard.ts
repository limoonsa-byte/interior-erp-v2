export type ConsultationStat = {
  id: number;
  status?: string;
  pic?: string;
  consultedAt?: string;
};

export type EstimateItemStat = {
  processGroup?: string;
  qty?: number | string;
  materialUnitPrice?: number | string;
  laborUnitPrice?: number | string;
  unitPrice?: number;
};

export type EstimateStat = {
  id: number;
  consultationId?: number;
  title?: string;
  customerName?: string;
  estimateDate?: string;
  picName?: string;
  overheadPercent?: number;
  profitPercent?: number;
  items?: EstimateItemStat[];
};

export type StatsFilters = {
  period: "thisMonth" | "lastMonth" | "custom";
  startDate: string;
  endDate: string;
  pic: string;
  status: string;
  includeCompleted: boolean;
  selectedEstimateIds: number[];
};

export type ProjectSettlementRow = {
  estimateId: number;
  siteName: string;
  customerName: string;
  totalAmount: number;
  usedAmount: number;
  remainingAmount: number;
  paidAmount: number;
  receivableAmount: number;
};

export type CashflowPoint = {
  monthKey: string;
  approvalAmount: number;
  paidAmount: number;
};

export type StatusPoint = {
  status: string;
  count: number;
};

export type StatisticsResult = {
  consultationCount: number;
  estimateCount: number;
  completedCount: number;
  approvalTotal: number;
  paidTotal: number;
  receivableTotal: number;
  completionRate: number;
  statusPoints: StatusPoint[];
  cashflowPoints: CashflowPoint[];
  projects: ProjectSettlementRow[];
  filteredEstimateIds: Set<number>;
};

const COMPLETED_STATUSES = new Set(["완료", "완료및정산"]);
const STATUS_ALIAS: Record<string, string> = {
  공사진행: "진행중",
  "진행 중": "진행중",
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(v?: string): string {
  if (!v) return "";
  return v.trim().slice(0, 10);
}

function inRange(date: string, startDate: string, endDate: string): boolean {
  if (!date) return false;
  if (!startDate || !endDate) return true;
  return date >= startDate && date <= endDate;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function estimateAmount(items: EstimateItemStat[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = num(item.qty);
    const mat = num(item.materialUnitPrice ?? item.unitPrice ?? 0);
    const labor = num(item.laborUnitPrice ?? 0);
    return sum + qty * (mat + labor);
  }, 0);
}

function settlementTotalAmountFromEstimate(est: EstimateStat): number {
  const subtotal = estimateAmount(est.items);
  const overheadRate = num(est.overheadPercent ?? 5) / 100;
  const profitRate = num(est.profitPercent ?? 10) / 100;
  const overhead = Math.floor(subtotal * overheadRate);
  const profit = Math.floor(subtotal * profitRate);
  return Math.floor((subtotal + overhead + profit) / 10000) * 10000;
}

function normalizeStatus(status?: string): string {
  const s = (status || "").trim();
  if (!s) return "미분류";
  return STATUS_ALIAS[s] || s;
}

export function buildStatistics(
  consultations: ConsultationStat[],
  estimates: EstimateStat[],
  summaries: Record<string, number>,
  _approvalSummaries: Record<string, number>,
  usedSummaries: Record<string, number>,
  filters: StatsFilters
): StatisticsResult {
  const consultationById = new Map<number, ConsultationStat>();
  consultations.forEach((c) => consultationById.set(c.id, c));

  const filteredEstimates = estimates.filter((est) => {
    if (filters.selectedEstimateIds.length > 0 && !filters.selectedEstimateIds.includes(est.id)) {
      return false;
    }
    const c = est.consultationId ? consultationById.get(est.consultationId) : undefined;
    const status = normalizeStatus(c?.status);
    if (!filters.includeCompleted && COMPLETED_STATUSES.has(status)) return false;
    if (filters.status && status !== normalizeStatus(filters.status)) return false;
    const pic = (c?.pic || est.picName || "").trim();
    if (filters.pic && pic !== filters.pic) return false;
    const date = dateOnly(est.estimateDate || c?.consultedAt);
    if (!inRange(date, filters.startDate, filters.endDate)) return false;
    return true;
  });

  const filteredEstimateIds = new Set(filteredEstimates.map((e) => e.id));
  const filteredConsultationIds = new Set(
    filteredEstimates
      .map((e) => e.consultationId)
      .filter((id): id is number => typeof id === "number")
  );

  const filteredConsultations = consultations.filter((c) => {
    if (filteredConsultationIds.has(c.id)) return true;
    const date = dateOnly(c.consultedAt);
    if (!inRange(date, filters.startDate, filters.endDate)) return false;
    const status = normalizeStatus(c.status);
    if (!filters.includeCompleted && COMPLETED_STATUSES.has(status)) return false;
    if (filters.status && status !== normalizeStatus(filters.status)) return false;
    if (filters.pic && (c.pic || "").trim() !== filters.pic) return false;
    return true;
  });

  const statusMap = new Map<string, number>();
  filteredConsultations.forEach((c) => {
    const status = normalizeStatus(c.status);
    statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
  });

  const projects: ProjectSettlementRow[] = filteredEstimates.map((est) => {
    const key = String(est.id);
    const totalAmount = settlementTotalAmountFromEstimate(est);
    const usedAmount = num(usedSummaries[key]);
    const paidAmount = num(summaries[key]);
    return {
      estimateId: est.id,
      siteName: (est.title || "").trim() || `프로젝트 #${est.id}`,
      customerName: (est.customerName || "").trim() || "-",
      totalAmount,
      usedAmount,
      remainingAmount: Math.max(0, totalAmount - usedAmount),
      paidAmount,
      receivableAmount: Math.max(0, totalAmount - paidAmount),
    };
  });

  const cashflowMap = new Map<string, { approval: number; paid: number }>();
  filteredEstimates.forEach((est) => {
    const c = est.consultationId ? consultationById.get(est.consultationId) : undefined;
    const date = dateOnly(est.estimateDate || c?.consultedAt);
    if (!date) return;
    const key = monthKey(date);
    const prev = cashflowMap.get(key) ?? { approval: 0, paid: 0 };
    const sid = String(est.id);
    prev.approval += settlementTotalAmountFromEstimate(est);
    prev.paid += num(summaries[sid]);
    cashflowMap.set(key, prev);
  });

  const approvalTotal = projects.reduce((s, p) => s + p.totalAmount, 0);
  const paidTotal = projects.reduce((s, p) => s + p.paidAmount, 0);
  const completedCount = filteredConsultations.filter((c) =>
    COMPLETED_STATUSES.has(normalizeStatus(c.status))
  ).length;
  const completionRate =
    filteredConsultations.length > 0 ? (completedCount / filteredConsultations.length) * 100 : 0;

  return {
    consultationCount: filteredConsultations.length,
    estimateCount: filteredEstimates.length,
    completedCount,
    approvalTotal,
    paidTotal,
    receivableTotal: Math.max(0, approvalTotal - paidTotal),
    completionRate,
    statusPoints: Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    cashflowPoints: Array.from(cashflowMap.entries())
      .map(([month, value]) => ({
        monthKey: month,
        approvalAmount: value.approval,
        paidAmount: value.paid,
      }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    projects: projects
      .map((p) => ({ ...p, estimateAmount: estimateAmount(estimates.find((e) => e.id === p.estimateId)?.items) }))
      .sort((a, b) => b.receivableAmount - a.receivableAmount)
      .map(({ estimateAmount: _drop, ...rest }) => rest),
    filteredEstimateIds,
  };
}
