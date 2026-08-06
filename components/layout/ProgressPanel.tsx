"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  Calendar,
  FolderKanban,
  ClipboardList,
} from "lucide-react";
import { useRightPanel } from "./RightPanelContext";

const LABOR_PAY_SEEN_KEY = "labor-pay-last-seen-submitted-id";

type LaborPayRecent = {
  id: number;
  estimateId: number;
  workerName: string;
  amount: number | null;
  submittedAt: string | null;
  siteTitle: string;
};

type Consultation = {
  id: number;
  title?: string;
  customerName?: string;
  status?: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { name?: string; start?: string; end?: string }[];
};

/** DB·구라벨 → 상담 페이지와 동일한 진행상태 */
function normalizeConsultationStatus(status: string | undefined): string {
  if (!status) return "접수";
  const map: Record<string, string> = {
    상담종단: "접수",
    현장실측: "현장상담실측",
    견적미팅: "견적서작성",
    견적완료: "견적서작성",
    자재미팅: "자재리스트",
    "계약서 작성": "계약서작성",
    디자인미팅: "디자인",
    계약완료: "계약",
    취소: "완료및정산",
    "취소/보류": "완료및정산",
    완료: "완료및정산",
  };
  return map[status] || status;
}

/** (접수, 상담): 접수 ~ 견적 단계 */
const STATUS_RECEPTION_AND_CONSULT = new Set(["접수", "현장상담실측", "견적서작성"]);
/** (자재, 디자인, 계약) */
const STATUS_MATERIAL_DESIGN_CONTRACT = new Set(["자재리스트", "계약서작성", "디자인", "계약"]);
/** (공사, 진행) */
const STATUS_CONSTRUCTION = new Set(["공사진행"]);

type Estimate = {
  id: number;
  consultationId?: number;
  customerName?: string;
  title?: string;
  displayTitle?: string;
};

/** 전체일정 `/schedule` 과 동일한 날짜 파싱 */
function schedulePhaseToDateValue(value: string | undefined): string {
  if (!value || !value.trim()) return "";
  const s = value.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 공정 막대(phase) 개수를 주간 기준으로 카운트 */
function countSchedulePhasesOverlappingWeek(c: Consultation, weekStart: string, weekEnd: string): number {
  const phases = c.schedulePhases;
  if (!Array.isArray(phases) || phases.length === 0) return 0;
  return phases.reduce((count, p) => {
    const start = schedulePhaseToDateValue(p.start);
    const end = schedulePhaseToDateValue(p.end);
    if (!start) return count;
    const endVal = end && end >= start ? end : start;
    if (start <= weekEnd && endVal >= weekStart) return count + 1;
    return count;
  }, 0);
}

/**
 * 로컬 달력 기준 "이번 주": 월요일 ~ 일요일 (ISO/한국 흔한 주간 정의).
 * 구간은 YYYY-MM-DD 문자열로 비교.
 */
function getThisWeekMondayThroughSundayRange(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=일, 1=월, … 6=토
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 월요일이면 0, 일요일이면 6
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  const y2 = sunday.getFullYear();
  const m2 = String(sunday.getMonth() + 1).padStart(2, "0");
  const d2 = String(sunday.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}`, end: `${y2}-${m2}-${d2}` };
}

function readLastSeenSubmittedId(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = parseInt(window.localStorage.getItem(LABOR_PAY_SEEN_KEY) || "0", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function formatLaborPayAmount(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "";
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export function ProgressPanel() {
  const { open, setOpen } = useRightPanel();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [laborPaySubmittedCount, setLaborPaySubmittedCount] = useState(0);
  const [laborPayLatestId, setLaborPayLatestId] = useState(0);
  const [laborPayRecent, setLaborPayRecent] = useState<LaborPayRecent[]>([]);
  const [lastSeenSubmittedId, setLastSeenSubmittedId] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadLaborPaySummary = useCallback(() => {
    return fetch("/api/company/labor-pay/summary")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && !data.error) {
          setLaborPaySubmittedCount(Number(data.submittedCount) || 0);
          setLaborPayLatestId(Number(data.latestSubmittedId) || 0);
          setLaborPayRecent(Array.isArray(data.recent) ? (data.recent as LaborPayRecent[]) : []);
        }
      })
      .catch(() => {
        /* 테이블 미적용 등은 조용히 무시 */
      });
  }, []);

  const markLaborPaySeen = useCallback(() => {
    const maxId = Math.max(
      laborPayLatestId,
      laborPayRecent.reduce((m, r) => Math.max(m, r.id || 0), 0)
    );
    if (maxId <= 0) return;
    try {
      window.localStorage.setItem(LABOR_PAY_SEEN_KEY, String(maxId));
    } catch {
      /* ignore */
    }
    setLastSeenSubmittedId(maxId);
  }, [laborPayLatestId, laborPayRecent]);

  useEffect(() => {
    setLastSeenSubmittedId(readLastSeenSubmittedId());
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
      loadLaborPaySummary(),
    ])
      .then(([cons, est]) => {
        setConsultations(Array.isArray(cons) ? cons : []);
        setEstimates(Array.isArray(est) ? est : []);
      })
      .catch(() => {
        setConsultations([]);
        setEstimates([]);
      })
      .finally(() => setLoading(false));
  }, [loadLaborPaySummary]);

  // 패널이 열려 있을 때 주기적으로 제출 현황 갱신
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => {
      void loadLaborPaySummary();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [open, loadLaborPaySummary]);

  /** 확인하지 않은 제출 건수(최근 목록 기준 + 최신 id 비교) */
  const laborPayNewCount = useMemo(() => {
    if (laborPayLatestId <= lastSeenSubmittedId) return 0;
    const fromRecent = laborPayRecent.filter((r) => r.id > lastSeenSubmittedId).length;
    // 최근 목록에 안 잡힌 신규가 더 있으면 최소 1로 표시
    if (fromRecent > 0) return fromRecent;
    return laborPaySubmittedCount > 0 ? 1 : 0;
  }, [laborPayLatestId, lastSeenSubmittedId, laborPayRecent, laborPaySubmittedCount]);

  const receptionConsultCount = consultations.filter((c) => {
    const s = normalizeConsultationStatus(c.status);
    if (s === "완료및정산") return false;
    return STATUS_RECEPTION_AND_CONSULT.has(s);
  }).length;

  const materialDesignContractCount = consultations.filter((c) => {
    const s = normalizeConsultationStatus(c.status);
    if (s === "완료및정산") return false;
    return STATUS_MATERIAL_DESIGN_CONTRACT.has(s);
  }).length;

  const constructionCount = consultations.filter((c) => {
    const s = normalizeConsultationStatus(c.status);
    if (s === "완료및정산") return false;
    return STATUS_CONSTRUCTION.has(s);
  }).length;

  const thisWeek = getThisWeekMondayThroughSundayRange();
  /** 전체일정 기본 규칙과 동일: 완료 제외, 견적 연결된 상담만, 공정 일정 "건수"를 주간 기준 합산 */
  const thisWeekCount = useMemo(() => {
    const consultationIdsWithEstimate = new Set(
      estimates.filter((e) => e.consultationId != null).map((e) => e.consultationId as number)
    );
    return consultations.reduce((sum, c) => {
      if (normalizeConsultationStatus(c.status) === "완료및정산") return sum;
      if (!consultationIdsWithEstimate.has(c.id)) return sum;
      return sum + countSchedulePhasesOverlappingWeek(c, thisWeek.start, thisWeek.end);
    }, 0);
  }, [consultations, estimates, thisWeek.start, thisWeek.end]);

  return (
    <aside
      className={clsx(
        "fixed right-0 top-0 z-20 flex h-screen flex-col border-l border-gray-200 bg-white shadow-sm transition-[width] duration-200",
        open ? "w-72" : "w-12"
      )}
    >
      {/* 접기/펼치기 버튼 */}
      <div className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-gray-50 px-2">
        {open ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex flex-1 items-center justify-between gap-2 rounded-lg py-2 px-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100"
            aria-label="진행상황 패널 접기"
          >
            <span className="truncate">진행상황</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gray-500" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex h-10 w-10 flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="진행상황 패널 펼치기"
            title={
              laborPayNewCount > 0
                ? `진행상황 · 내역서 제출 ${laborPayNewCount}건`
                : "진행상황"
            }
          >
            <ChevronLeft className="h-5 w-5" />
            {laborPayNewCount > 0 ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" aria-hidden />
            ) : null}
          </button>
        )}
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-3">
          <div className="space-y-4 px-3">
            {/* 요약 카드 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                현재 진행
              </p>
              <ul className="space-y-1.5">
                <li>
                  <Link
                    href="/consulting"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      (접수,상담)
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : receptionConsultCount}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/consulting"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      (자재,디자인,계약)
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : materialDesignContractCount}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/projects"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <FolderKanban className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      (공사,진행)
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : constructionCount}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/schedule"
                    title="전체일정의 이번 주(월~일) 공정 막대(일정) 건수입니다. 같은 현장에 일정이 여러 개면 각각 집계됩니다."
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      (이번주 일정)
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : thisWeekCount}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/labor-pay"
                    onClick={markLaborPaySeen}
                    title="인부가 내역서 요청 링크로 작성·제출한 건수입니다. 클릭하면 확인한 것으로 표시됩니다."
                    className={clsx(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      laborPayNewCount > 0
                        ? "border-rose-200 bg-rose-50 hover:border-rose-300 hover:bg-rose-50/80"
                        : "border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/50"
                    )}
                  >
                    <ClipboardList
                      className={clsx(
                        "h-4 w-4 shrink-0",
                        laborPayNewCount > 0 ? "text-rose-600" : "text-slate-600"
                      )}
                    />
                    <span className="flex-1 truncate text-gray-700">(내역서 제출)</span>
                    <span
                      className={clsx(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        laborPayNewCount > 0 ? "text-rose-700" : "text-gray-900"
                      )}
                    >
                      {loading ? "—" : laborPaySubmittedCount}
                    </span>
                    {laborPayNewCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                        NEW {laborPayNewCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              </ul>
            </div>

            {/* 최근 상담 3개 */}
            {consultations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  최근 상담
                </p>
                <ul className="space-y-1">
                  {consultations.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/consulting?detail=${c.id}`}
                        className="block truncate rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        {(c.title ?? "").trim() || c.customerName || `상담 #${c.id}`}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 최근 견적 3개 */}
            {estimates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  최근 견적
                </p>
                <ul className="space-y-1">
                  {estimates.slice(0, 3).map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-1">
                      <Link
                        href={`/estimate?estimateId=${e.id}`}
                        className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        {e.displayTitle || e.title || e.customerName || `견적 #${e.id}`}
                      </Link>
                      <Link
                        href={`/chat?estimateId=${e.id}`}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        채팅
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 최근 내역서 제출 */}
            {laborPayRecent.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  최근 내역서 제출
                </p>
                <ul className="space-y-1">
                  {laborPayRecent.slice(0, 3).map((r) => {
                    const isNew = r.id > lastSeenSubmittedId;
                    const amountLabel = formatLaborPayAmount(r.amount);
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/labor-pay/${r.estimateId}`}
                          onClick={markLaborPaySeen}
                          className={clsx(
                            "block rounded-lg px-2 py-1.5 text-sm hover:bg-gray-100",
                            isNew ? "bg-rose-50/70" : ""
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {isNew ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" aria-hidden />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate text-gray-800">
                              {(r.workerName || "인부").trim()}
                              {r.siteTitle ? ` · ${r.siteTitle}` : ""}
                            </span>
                          </span>
                          {amountLabel ? (
                            <span className="mt-0.5 block pl-3 text-xs tabular-nums text-gray-500">
                              {amountLabel}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
