"use client";

import { useEffect, useState } from "react";
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
  schedulePhases?: { start?: string; end?: string }[];
};

type Estimate = {
  id: number;
  customerName?: string;
  title?: string;
};

function getThisWeekRange() {
  const now = new Date();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const y = mon.getFullYear();
  const m = String(mon.getMonth() + 1).padStart(2, "0");
  const d = String(mon.getDate()).padStart(2, "0");
  const y2 = sun.getFullYear();
  const m2 = String(sun.getMonth() + 1).padStart(2, "0");
  const d2 = String(sun.getDate()).padStart(2, "0");
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

  const projectCount = consultations.filter(
    (c) =>
      (c.constructionStartAt && c.constructionStartAt.trim()) ||
      (Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0)
  ).length;

  const thisWeek = getThisWeekRange();
  const thisWeekCount = consultations.filter((c) => {
    const start = c.constructionStartAt?.trim().slice(0, 10);
    const end = (c.moveInAt || c.constructionStartAt)?.trim().slice(0, 10);
    if (!start) return false;
    const e = end && end >= start ? end : start;
    return start <= thisWeek.end && e >= thisWeek.start;
  }).length;

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
                      진행 중인 상담
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : consultations.length}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/estimate"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      진행 중인 견적
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : estimates.length}
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
                      진행 중인 프로젝트
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
                      {loading ? "—" : projectCount}
                    </span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/schedule"
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50/50"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-slate-600" />
                    <span className="flex-1 truncate text-gray-700">
                      이번 주 일정
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
