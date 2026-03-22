"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  Calendar,
  FolderKanban,
} from "lucide-react";
import { useRightPanel } from "./RightPanelContext";

type Consultation = {
  id: number;
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

/**
 * 공정(schedulePhases) 구간이 이번 주(월~일)와 하루라도 겹치면 true.
 * 캘린더는 공정이 있는 날만 표시하므로, 카운트도 공사기간만이 아니라 이 기준으로 맞춤.
 */
function consultationHasSchedulePhaseOverlappingWeek(
  c: Consultation,
  weekStart: string,
  weekEnd: string
): boolean {
  const phases = c.schedulePhases;
  if (!Array.isArray(phases) || phases.length === 0) return false;
  return phases.some((p) => {
    const start = schedulePhaseToDateValue(p.start);
    const end = schedulePhaseToDateValue(p.end);
    if (!start) return false;
    const endVal = end && end >= start ? end : start;
    return start <= weekEnd && endVal >= weekStart;
  });
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

export function ProgressPanel() {
  const { open, setOpen } = useRightPanel();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
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
  }, []);

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
  /** 전체일정 기본 규칙과 동일: 완료 제외, 견적 연결된 상담만, 공정 일정이 이번 주에 겹치는 건만 */
  const thisWeekCount = useMemo(() => {
    const consultationIdsWithEstimate = new Set(
      estimates.filter((e) => e.consultationId != null).map((e) => e.consultationId as number)
    );
    return consultations.filter((c) => {
      if (normalizeConsultationStatus(c.status) === "완료및정산") return false;
      if (!consultationIdsWithEstimate.has(c.id)) return false;
      return consultationHasSchedulePhaseOverlappingWeek(c, thisWeek.start, thisWeek.end);
    }).length;
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
            className="flex h-10 w-10 flex-col items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="진행상황 패널 펼치기"
            title="진행상황"
          >
            <ChevronLeft className="h-5 w-5" />
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
                    title="전체일정에 공정(일정 막대)이 이번 주(월~일)에 있는 현장 수입니다. 공사 시작일만 있고 공정이 없으면 집계되지 않습니다."
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
                        {c.customerName || `상담 #${c.id}`}
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
                        {e.title || e.customerName || `견적 #${e.id}`}
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
          </div>
        </div>
      )}
    </aside>
  );
}
