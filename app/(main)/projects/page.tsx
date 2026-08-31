"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, Image } from "lucide-react";
import { getHolidayName, isKoreanHoliday } from "@/lib/koreanHolidays";
import { displayProjectTitle } from "@/lib/projectTitle";
import { compareImportantFirst } from "@/lib/importantSort";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 프로젝트별 캘린더 바 색상 */
const PROJECT_COLORS = [
  "#3B82F6", "#22C55E", "#EAB308", "#EF4444", "#8B5CF6",
  "#06B6D4", "#F97316", "#EC4899", "#64748B", "#14B8A6",
];

type Consultation = {
  id: number;
  title?: string;
  customerName: string;
  contact: string;
  address: string;
  status: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { name: string; start: string; end: string }[];
  isImportant?: boolean;
};

type Estimate = {
  id: number;
  consultationId?: number;
  title: string;
};

type ProjectRow = {
  consultation: Consultation;
  title: string;
};

function formatDate(v: string | undefined): string {
  if (!v || !v.trim()) return "—";
  const s = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "—";
}

function toDateValue(value: string | undefined): string {
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

function isDateInRange(day: string, start?: string, end?: string): boolean {
  if (!start) return false;
  const e = end && end >= start ? end : start;
  return day >= start && day <= e;
}

function isLightBg(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

export default function ProjectsPage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [savingJpg, setSavingJpg] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

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

  /** 일정이 하나라도 저장된 상담 = 진행 중인 프로젝트 */
  const projects = useMemo(() => {
    return consultations
      .filter(
        (c) =>
          (c.constructionStartAt && c.constructionStartAt.trim()) ||
          (Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0)
      )
      .sort((a, b) => {
        const imp = compareImportantFirst(a.isImportant, b.isImportant);
        if (imp !== 0) return imp;
        return b.id - a.id;
      });
  }, [consultations]);

  const rows = useMemo((): ProjectRow[] => {
    return projects.map((c) => {
      const est = estimates.find((e) => e.consultationId === c.id);
      return {
        consultation: c,
        title: displayProjectTitle({
          estimateTitle: est?.title,
          consultationTitle: c.title,
          customerName: c.customerName,
        }),
      };
    });
  }, [projects, estimates]);

  const calendarDays = useMemo(() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const startWeekday = first.getDay();
    const totalDays = last.getDate();
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const prevLast = new Date(y, m - 1, 0).getDate();
    const days: { date: string; isCurrentMonth: boolean; dayNum: number }[] = [];
    for (let i = 0; i < startWeekday; i++) {
      const d = prevLast - startWeekday + i + 1;
      days.push({
        date: `${prevY}-${String(prevM).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isCurrentMonth: false,
        dayNum: d,
      });
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        isCurrentMonth: true,
        dayNum: d,
      });
    }
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    let nextDay = 1;
    while (days.length < 42) {
      days.push({
        date: `${nextY}-${String(nextM).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`,
        isCurrentMonth: false,
        dayNum: nextDay,
      });
      nextDay += 1;
    }
    return days.slice(0, 42);
  }, [currentMonth]);

  const itemsByDay = useCallback(
    (day: string): ProjectRow[] =>
      rows.filter(({ consultation }) =>
        isDateInRange(
          day,
          toDateValue(consultation.constructionStartAt),
          toDateValue(consultation.moveInAt || consultation.constructionStartAt)
        )
      ),
    [rows]
  );

  const prevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    if (m === 1) setCurrentMonth(`${y - 1}-12`);
    else setCurrentMonth(`${y}-${String(m - 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    if (m === 12) setCurrentMonth(`${y + 1}-01`);
    else setCurrentMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
  };

  const saveCalendarAsJpg = useCallback(async () => {
    const el = calendarRef.current;
    if (!el) return;
    setSavingJpg(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `캘린더_${currentMonth.replace("-", "년")}월.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.92);
      link.click();
    } catch (err) {
      console.error("캘린더 저장 실패:", err);
      alert("이미지 저장에 실패했습니다.");
    } finally {
      setSavingJpg(false);
    }
  }, [currentMonth]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">프로젝트</h1>
      <p className="mb-6 text-sm text-gray-500">
        일정이 등록된 상담이 캘린더에 색으로 표시됩니다. 색 안에 공정이 한 줄로 나옵니다. 클릭하면 일정 상세로 이동합니다.
      </p>

      {/* 캘린더 메인 */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              이전 달
            </button>
            <span className="font-semibold text-gray-900">
              {currentMonth.slice(0, 4)}년 {Number(currentMonth.slice(5, 7))}월
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              다음 달
            </button>
          </div>
          <button
            type="button"
            onClick={saveCalendarAsJpg}
            disabled={savingJpg}
            className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Image className="h-4 w-4" />
            {savingJpg ? "저장 중…" : "JPG 저장"}
          </button>
        </div>

        <div ref={calendarRef} className="overflow-x-auto rounded-lg" style={{ border: "2px solid #d1d5db", backgroundColor: "#ffffff" }}>
          <div className="grid grid-cols-7 text-center text-xs font-medium" style={{ borderBottom: "2px solid #d1d5db", color: "#4b5563" }}>
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className="p-2 border-r last:border-r-0"
                style={{
                  borderColor: "#d1d5db",
                  backgroundColor: i === 0 || i === 6 ? "#fdf2f8" : "#f9fafb",
                }}
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" style={{ borderTop: "1px solid #d1d5db" }}>
            {calendarDays.map(({ date, isCurrentMonth, dayNum }) => {
              const dayOfWeek = new Date(date + "T12:00:00").getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const holidayName = getHolidayName(date);
              const isHoliday = isKoreanHoliday(date);
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;
              const cellBg = !isCurrentMonth
                ? "#f9fafb"
                : isSunday || (isHoliday && !isSaturday)
                  ? "#fef2f2"
                  : isSaturday
                    ? "#eff6ff"
                    : isHoliday
                      ? "#fef2f2"
                      : "#ffffff";
              const dayColor = !isCurrentMonth
                ? "#9ca3af"
                : dayOfWeek === 0 || isHoliday
                  ? "#ef4444"
                  : dayOfWeek === 6
                    ? "#3b82f6"
                    : "#374151";
              const items = itemsByDay(date);
              return (
                <div
                  key={date}
                  className="min-h-[56px] border-b border-r p-1 last:border-r-0 sm:min-h-[88px] sm:p-1.5"
                  style={{ borderColor: "#d1d5db", backgroundColor: cellBg }}
                >
                  <div className="text-right text-[11px] sm:text-xs" style={{ color: dayColor }}>
                    {dayNum}
                    {holidayName && isCurrentMonth && (
                      <span className="ml-1 text-[10px] font-normal" style={{ color: "#f87171" }}>
                        {holidayName}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {items.map((item) => {
                      const phasesOnThisDay = Array.isArray(item.consultation.schedulePhases)
                        ? item.consultation.schedulePhases.filter((p) => {
                            const start = (p.start ?? "").trim().slice(0, 10);
                            const end = (p.end ?? p.start ?? "").trim().slice(0, 10) || start;
                            return isDateInRange(date, start, end);
                          })
                        : [];
                      if (phasesOnThisDay.length === 0) return null;
                      const projectIndex = rows.findIndex((r) => r.consultation.id === item.consultation.id);
                      const bg = PROJECT_COLORS[projectIndex % PROJECT_COLORS.length];
                      const phaseLine = phasesOnThisDay.map((p) => p.name).filter(Boolean).join(" · ");
                      const textColor = isLightBg(bg) ? "#111827" : "#ffffff";
                      return (
                        <Link
                          key={item.consultation.id}
                          href={`/schedule/${item.consultation.id}`}
                          className="block rounded px-1 py-0.5 text-[10px] truncate hover:opacity-90"
                          style={{ backgroundColor: bg, color: textColor }}
                          title={`${item.title} — ${phaseLine}`}
                        >
                          {phaseLine}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 목록: 캘린더 아래 항상 표시 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">목록</h2>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center text-gray-500">
            <Calendar className="mx-auto mb-2 h-10 w-10 text-gray-400" />
            <p>일정이 저장된 프로젝트가 없습니다.</p>
            <p className="mt-1 text-sm">
              <Link href="/schedule" className="text-blue-600 hover:underline">
                일정
              </Link>
              에서 공사 시작일을 입력하고 저장하면 캘린더와 목록에 나타납니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[760px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="row-actions-sticky w-32 p-2 text-left font-medium text-gray-700 sm:hidden">일정</th>
                  <th className="hidden p-3 text-left font-medium text-gray-700 sm:table-cell sm:w-8" />
                  <th className="p-3 text-left font-medium text-gray-700">프로젝트 제목</th>
                  <th className="p-3 text-left font-medium text-gray-700">공정</th>
                  <th className="p-3 text-left font-medium text-gray-700">고객명</th>
                  <th className="p-3 text-left font-medium text-gray-700 w-32">공사 시작일</th>
                  <th className="p-3 text-left font-medium text-gray-700 w-32">입주일</th>
                  <th className="hidden p-3 text-left font-medium text-gray-700 sm:table-cell sm:w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ consultation, title }, idx) => {
                  const bg = PROJECT_COLORS[idx % PROJECT_COLORS.length];
                  const phaseLine =
                    Array.isArray(consultation.schedulePhases) && consultation.schedulePhases.length > 0
                      ? consultation.schedulePhases.map((p) => p.name).filter(Boolean).join(" · ")
                      : "—";
                  const scheduleLink = (
                    <Link
                      href={`/schedule/${consultation.id}`}
                      className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      일정 보기
                    </Link>
                  );
                  return (
                    <tr key={consultation.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="row-actions-sticky p-2 align-middle sm:hidden">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-4 w-4 shrink-0 rounded border border-gray-300"
                            style={{ backgroundColor: bg }}
                            title={phaseLine}
                          />
                          {scheduleLink}
                        </div>
                      </td>
                      <td className="hidden p-2 sm:table-cell">
                        <span
                          className="inline-block h-5 w-5 rounded border border-gray-300"
                          style={{ backgroundColor: bg }}
                          title={phaseLine}
                        />
                      </td>
                      <td className="p-3 font-medium text-gray-900">
                        <div className="max-w-[16rem] truncate" title={title}>{title}</div>
                      </td>
                      <td className="p-3 text-gray-600">
                        <div className="max-w-[14rem] truncate" title={phaseLine}>{phaseLine}</div>
                      </td>
                      <td className="p-3 text-gray-700">{consultation.customerName || "—"}</td>
                      <td className="p-3 text-gray-600">{formatDate(consultation.constructionStartAt)}</td>
                      <td className="p-3 text-gray-600">{formatDate(consultation.moveInAt)}</td>
                      <td className="hidden p-3 sm:table-cell">{scheduleLink}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
