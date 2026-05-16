"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHolidayName } from "@/lib/koreanHolidays";
import { printScheduleCalendarContent } from "@/lib/print-schedule-calendar";
import { chunkDaysForPrint, padChunkToWeekRows } from "@/lib/schedule-print-chunk";

/** 완료 상태값 (체크박스로 보기/숨기기) */
const COMPLETED_STATUS = "완료및정산";


const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const LIST_PAGE_SIZE = 10;
/**
 * 현장(상담) 제목·캘린더 막대 색상 — 색상환을 넓게 돌려 파랑/보라만 몰리지 않게 함.
 * 배정은 견적 제목이 아니라 상담 ID 기준(비슷한 제목이어도 현장마다 색이 갈리기 쉬움).
 */
const TITLE_COLORS = [
  "#B91C1C", // red
  "#C2410C", // orange
  "#A16207", // amber/brown
  "#4D7C0F", // lime
  "#166534", // green
  "#0F766E", // teal
  "#0E7490", // cyan
  "#0369A1", // sky
  "#1D4ED8", // blue
  "#3730A3", // indigo
  "#6B21A8", // purple
  "#A21CAF", // fuchsia
];

/** 상담 ID → 일관된 색 인덱스 (연속 ID도 골든비율로 잘 섞임) */
function getColorIndexForConsultation(consultationId: number): number {
  if (!consultationId || consultationId < 1) return 0;
  const u = (consultationId * 0x9e3779b9) >>> 0;
  return u % TITLE_COLORS.length;
}

/** 지정색이 있으면 사용, 없으면 자동 팔레트 */
function resolveScheduleAccent(consultation: { id: number; scheduleListColor?: string }): string {
  const c = consultation.scheduleListColor?.trim();
  if (c && /^#[0-9A-Fa-f]{6}$/.test(c)) return c;
  return TITLE_COLORS[getColorIndexForConsultation(consultation.id)];
}

type Consultation = {
  id: number;
  customerName: string;
  contact: string;
  address: string;
  status: string;
  pic: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { name: string; start: string; end: string; color?: string }[];
  /** 일정 목록·캘린더 막대 표시색 (#RRGGBB), 없으면 상담 ID 기준 자동색 */
  scheduleListColor?: string;
};

type Estimate = {
  id: number;
  consultationId?: number;
  title: string;
  customerName: string;
  contact: string;
};

type ScheduleItem = {
  consultation: Consultation;
  estimateTitle: string;
  hasEstimate?: boolean;
};

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

function formatDateDisplay(value: string | undefined): string {
  const v = toDateValue(value);
  if (!v) return "-";
  return v;
}

/** 해당 날짜에 공사 일정(공정)이 실제로 있는지: schedulePhases 중 하나라도 그 날을 포함하면 true */
function isDayInSchedulePhases(day: string, consultation: Consultation): boolean {
  const phases = consultation.schedulePhases;
  if (!Array.isArray(phases) || phases.length === 0) return false;
  return phases.some((p) => {
    const start = toDateValue(p.start);
    const end = toDateValue(p.end);
    if (!start) return false;
    const endVal = end && end >= start ? end : start;
    return day >= start && day <= endVal;
  });
}

/** 현장별 한 줄 막대: 해당 날짜에 그 현장의 공정들을 한 줄로 표시 */
type SiteBar = {
  consultationId: number;
  estimateTitle: string;
  phaseNames: string[];
  color: string;
};

/** 해당 날짜에 현장별로 한 줄씩 표시할 데이터 (공정명은 " · "로 연결) */
function getSiteBarsOnDay(day: string, scheduleList: ScheduleItem[]): SiteBar[] {
  const siteMap = new Map<number, { estimateTitle: string; phaseNames: string[]; consultation: Consultation }>();
  scheduleList.forEach(({ consultation, estimateTitle }) => {
    const phases = consultation.schedulePhases;
    if (!Array.isArray(phases)) return;
    const names: string[] = [];
    phases.forEach((p) => {
      const start = toDateValue(p.start);
      const end = toDateValue(p.end);
      if (!start) return;
      const endVal = end && end >= start ? end : start;
      if (day >= start && day <= endVal) {
        const name = (p.name || "").trim() || "공정";
        if (name && !names.includes(name)) names.push(name);
      }
    });
    if (names.length > 0) {
      const existing = siteMap.get(consultation.id);
      if (existing) {
        names.forEach((n) => { if (!existing.phaseNames.includes(n)) existing.phaseNames.push(n); });
      } else {
        siteMap.set(consultation.id, { estimateTitle, phaseNames: names, consultation });
      }
    }
  });
  return Array.from(siteMap.entries()).map(([consultationId, { estimateTitle, phaseNames, consultation }]) => ({
    consultationId,
    estimateTitle,
    phaseNames,
    color: resolveScheduleAccent(consultation),
  }));
}

function getCalendarDaysForMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
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
    days.push({ date: `${prevY}-${String(prevM).padStart(2, "0")}-${String(d).padStart(2, "0")}`, isCurrentMonth: false, dayNum: d });
  }
  for (let d = 1; d <= totalDays; d++) {
    days.push({ date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, isCurrentMonth: true, dayNum: d });
  }
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  let nextDay = 1;
  while (days.length < 42) {
    days.push({ date: `${nextY}-${String(nextM).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`, isCurrentMonth: false, dayNum: nextDay });
    nextDay += 1;
  }
  return days.slice(0, 42);
}

/** 미리보기/인쇄: 일정이 없는 앞·뒤 주는 제거 */
function trimPreviewCalendarWeeks(
  days: { date: string; isCurrentMonth: boolean; dayNum: number }[],
  hasSchedule: (date: string) => boolean
) {
  const cols = 7;
  const n = days.length;
  const rows = Math.ceil(n / cols);
  let firstRow = 0;
  let lastRow = rows - 1;
  for (let r = 0; r < rows; r++) {
    let found = false;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i < n && hasSchedule(days[i].date)) {
        found = true;
        break;
      }
    }
    if (found) {
      firstRow = r;
      break;
    }
  }
  for (let r = rows - 1; r >= firstRow; r--) {
    let found = false;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (i < n && hasSchedule(days[i].date)) {
        found = true;
        break;
      }
    }
    if (found) {
      lastRow = r;
      break;
    }
  }
  const out = days.slice(firstRow * cols, (lastRow + 1) * cols);
  return out.length >= cols ? out : days;
}

export default function SchedulePage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [listPage, setListPage] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  /** 완료 건 보기: 기본 꺼짐(완료 건 숨김) */
  const [showCompleted, setShowCompleted] = useState(false);

  /** 일정 목록 제목 왼쪽 색 선택 팝업 */
  const [scheduleColorMenu, setScheduleColorMenu] = useState<{
    consultationId: number;
    left: number;
    top: number;
  } | null>(null);
  const scheduleColorInputRef = useRef<HTMLInputElement>(null);

  const patchScheduleListColor = useCallback(async (consultationId: number, color: string | null) => {
    const res = await fetch(`/api/consultations/${consultationId}/schedule-list-color`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ color }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { error?: string }).error || "색상 저장에 실패했습니다.");
      return;
    }
    setConsultations((prev) =>
      prev.map((c) =>
        c.id === consultationId
          ? {
              ...c,
              scheduleListColor:
                color != null && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : undefined,
            }
          : c
      )
    );
    setScheduleColorMenu(null);
  }, []);

  useEffect(() => {
    if (!scheduleColorMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setScheduleColorMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scheduleColorMenu]);

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

  const scheduleList = useMemo(() => {
    return consultations
      .filter((c) => {
        if (!showCompleted && c.status === COMPLETED_STATUS) return false;
        return true;
      })
      .map((consultation) => {
        const est = estimates.find((e) => e.consultationId === consultation.id);
        return {
          consultation,
          estimateTitle: (est?.title?.trim() || "제목 없음"),
          hasEstimate: !!est,
        };
      })
      .filter((item) => item.hasEstimate);
  }, [consultations, estimates, showCompleted]);

  const totalListPages = Math.max(1, Math.ceil(scheduleList.length / LIST_PAGE_SIZE));
  const paginatedList = useMemo(
    () => scheduleList.slice((listPage - 1) * LIST_PAGE_SIZE, listPage * LIST_PAGE_SIZE),
    [scheduleList, listPage]
  );

  useEffect(() => {
    if (listPage > totalListPages) setListPage(1);
  }, [listPage, totalListPages]);

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

  /** 날짜별 현장별 한 줄 막대 (캘린더 셀용, 현장 색상 적용) */
  const siteBarsByDay = useCallback(
    (day: string) => getSiteBarsOnDay(day, scheduleList),
    [scheduleList]
  );

  const noDateItems = useMemo(
    () => scheduleList.filter(({ consultation }) => !toDateValue(consultation.constructionStartAt)),
    [scheduleList]
  );

  const [showPreview, setShowPreview] = useState(false);

  const previewMonths = useMemo(() => {
    const monthSet = new Set<string>();
    scheduleList.forEach(({ consultation }) => {
      const sp = consultation.schedulePhases;
      if (!Array.isArray(sp)) return;
      sp.forEach((p) => {
        const start = toDateValue(p.start);
        const end = toDateValue(p.end) || start;
        if (!start) return;
        let [sy, sm] = start.slice(0, 7).split("-").map(Number);
        const [ey, em] = end.slice(0, 7).split("-").map(Number);
        while (sy < ey || (sy === ey && sm <= em)) {
          monthSet.add(`${sy}-${String(sm).padStart(2, "0")}`);
          sm++;
          if (sm > 12) { sm = 1; sy++; }
        }
      });
    });
    const candidates = [...monthSet].sort();
    const withSchedule = candidates.filter((month) => {
      const days = getCalendarDaysForMonth(month);
      return days.some((d) => getSiteBarsOnDay(d.date, scheduleList).length > 0);
    });
    if (withSchedule.length > 0) return withSchedule;
    if (candidates.length > 0) return candidates;
    return [currentMonth];
  }, [scheduleList, currentMonth]);

  const handlePrint = () => {
    printScheduleCalendarContent(document.getElementById("schedule-print-content"));
  };

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

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">일정</h1>
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">일정</h1>
        <button type="button" onClick={() => setShowPreview(true)} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          인쇄 / 미리보기
        </button>
      </div>

      <p className="text-sm text-gray-500 mb-3 no-print">
        저장된 공사 일정 목록입니다. <strong>견적서를 작성한 상담</strong>만 표시됩니다. 제목을 클릭하면 공사 일정(목공사, 전기, 도장 등)을 짤 수 있습니다.{" "}
        <strong>제목 왼쪽 색 막대</strong>를 누르면 목록·캘린더 막대에 쓰는 표시 색을 고를 수 있습니다(미지정 시 자동 색).
      </p>
      <label className="mb-4 flex cursor-pointer items-center gap-2 no-print">
        <input
          type="checkbox"
          checked={showCompleted}
          onChange={(e) => setShowCompleted(e.target.checked)}
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">완료 건 보기</span>
      </label>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white mb-8">
        <table className="w-full min-w-[640px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
            <tr>
              <th className="row-actions-sticky w-16 p-2 text-center sm:hidden no-print" aria-label="작업" />
              <th className="p-2 sm:p-3">제목</th>
              <th className="p-2 sm:p-3">공사시작일</th>
              <th className="p-2 sm:p-3">입주일</th>
              <th className="p-2 sm:p-3">고객명</th>
              <th className="p-2 sm:p-3">연락처</th>
              <th className="hidden w-20 p-2 sm:table-cell sm:w-24 sm:p-3 no-print" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {scheduleList.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  견적서가 연결된 상담이 없습니다.{" "}
                  <Link href="/consulting" className="text-blue-600 hover:underline">
                    상담 및 미팅관리
                  </Link>
                  에서 진행상태를 견적완료로 변경한 뒤,{" "}
                  <Link href="/estimate" className="text-blue-600 hover:underline">
                    견적서 작성
                  </Link>
                  에서 해당 상담으로 견적을 저장하면 여기에 표시됩니다.
                </td>
              </tr>
            ) : (
              paginatedList.map((item) => {
                const accent = resolveScheduleAccent(item.consultation);
                const actions = (
                  <Link
                    href={`/schedule/${item.consultation.id}`}
                    className="rounded px-2 py-1 text-blue-600 hover:underline"
                  >
                    일정
                  </Link>
                );
                return (
                <tr key={item.consultation.id} className="text-gray-700 hover:bg-gray-50">
                  <td className="row-actions-sticky whitespace-nowrap p-2 align-middle no-print sm:hidden">{actions}</td>
                  <td className="p-2 sm:p-3 font-medium max-w-[18rem]">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        title="표시 색 바꾸기 (목록·캘린더)"
                        aria-label="표시 색 바꾸기"
                        className="shrink-0 w-1.5 self-stretch min-h-[2.25rem] rounded-sm border border-black/15 shadow-sm hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 no-print"
                        style={{ backgroundColor: accent }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const id = item.consultation.id;
                          setScheduleColorMenu((prev) => {
                            if (prev?.consultationId === id) return null;
                            const vw = typeof window !== "undefined" ? window.innerWidth : 800;
                            const vh = typeof window !== "undefined" ? window.innerHeight : 600;
                            const panelW = 236;
                            const panelH = 260;
                            const left = Math.max(8, Math.min(e.clientX - 8, vw - panelW - 8));
                            const top = Math.max(8, Math.min(e.clientY + 8, vh - panelH - 8));
                            return { consultationId: id, left, top };
                          });
                        }}
                      />
                      <Link
                        href={`/schedule/${item.consultation.id}`}
                        className="min-w-0 truncate text-gray-900 hover:underline font-medium"
                      >
                        {item.estimateTitle || "-"}
                      </Link>
                    </div>
                  </td>
                  <td className="p-2 sm:p-3">{formatDateDisplay(item.consultation.constructionStartAt)}</td>
                  <td className="p-2 sm:p-3">{formatDateDisplay(item.consultation.moveInAt)}</td>
                  <td className="p-2 sm:p-3">{item.consultation.customerName || "-"}</td>
                  <td className="p-2 sm:p-3">{item.consultation.contact || "-"}</td>
                  <td className="hidden whitespace-nowrap p-2 align-middle no-print sm:table-cell sm:p-3">{actions}</td>
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalListPages > 1 && (
        <div className="mb-8 flex items-center justify-center gap-2 no-print">
          <button
            type="button"
            onClick={() => setListPage((p) => Math.max(1, p - 1))}
            disabled={listPage <= 1}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 hover:enabled:bg-gray-50"
          >
            이전
          </button>
          <span className="text-sm text-gray-700">
            {listPage} / {totalListPages}
          </span>
          <button
            type="button"
            onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
            disabled={listPage >= totalListPages}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 hover:enabled:bg-gray-50"
          >
            다음
          </button>
        </div>
      )}

      {/* 전체일정 캘린더 */}
      <h2 className="text-base font-semibold text-gray-900 mb-2">전체일정</h2>
      <p className="text-sm text-gray-600 mb-4 no-print">
        <strong>공사 일정을 넣은 날만</strong> 캘린더에 표시됩니다. 제목을 클릭하면 해당 현장의 공사 일정을 짤 수 있습니다.
      </p>

      <div className="mb-4 flex items-center justify-between">
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

      <div className="overflow-x-auto">
        <div className="rounded-lg border border-gray-200 bg-white sm:min-w-[600px]">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`p-1.5 text-center text-[11px] font-medium sm:p-2 sm:text-xs ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"}`}
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, isCurrentMonth, dayNum }, idx) => {
              const siteBars = siteBarsByDay(date);
              const dow = idx % 7;
              const isSunday = dow === 0;
              const isSaturday = dow === 6;
              const holiday = getHolidayName(date);
              const isHoliday = !!holiday;
              const isOff = isSunday || isSaturday || isHoliday;
              const cellBg = !isCurrentMonth
                ? "bg-gray-50"
                : isOff
                  ? "bg-red-50/50"
                  : "";
              const dayColor = !isCurrentMonth
                ? "text-gray-400"
                : (isSunday || isHoliday)
                  ? "text-red-500"
                  : isSaturday
                    ? "text-blue-500"
                    : "text-gray-900";
              return (
                <div
                  key={date}
                  className={`min-h-[60px] border-b border-r border-gray-100 p-1 last:border-r-0 sm:min-h-[100px] ${cellBg}`}
                >
                  <div className={`text-right text-[11px] sm:text-sm ${dayColor}`}>
                    {dayNum}
                    {holiday && isCurrentMonth && (
                      <span className="ml-1 hidden text-[10px] text-red-400 sm:inline">{holiday}</span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {siteBars.map((bar) => {
                      const isLight = (hex: string) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return (r * 299 + g * 587 + b * 114) / 1000 > 180;
                      };
                      const textClass = isLight(bar.color) ? "text-gray-900" : "text-white";
                      const phaseLabel = bar.phaseNames.join(" · ");
                      return (
                        <Link
                          key={bar.consultationId}
                          href={`/schedule/${bar.consultationId}`}
                          className="block w-full rounded overflow-hidden border border-black/10"
                          style={{ backgroundColor: bar.color }}
                          title={`${bar.estimateTitle} · ${phaseLabel}`}
                        >
                          <span className={`block px-1 py-0.5 text-[10px] font-medium truncate ${textClass}`}>
                            {phaseLabel}
                          </span>
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

      {noDateItems.length > 0 && (
        <div className="mt-6 no-print">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">일정 미정 (제목 클릭하여 공사 일정 짜기)</h2>
          <div className="flex flex-wrap gap-2">
            {noDateItems.map((item) => (
              <Link
                key={item.consultation.id}
                href={`/schedule/${item.consultation.id}`}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100"
              >
                <span className="font-medium text-amber-900">{item.estimateTitle}</span>
                <span className="ml-2 text-gray-600">{item.consultation.customerName}</span>
                <span className="ml-2 text-gray-500">{item.consultation.contact}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-gray-500 no-print">
        <Link href="/consulting" className="text-blue-600 hover:underline">
          상담 및 미팅관리
        </Link>
        에서 견적완료로 변경한 뒤,{" "}
        <Link href="/estimate" className="text-blue-600 hover:underline">
          견적서 작성
        </Link>
        에서 해당 상담으로 견적을 저장하면 일정 목록에 표시됩니다.
      </p>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onClick={() => setShowPreview(false)}>
          <div className="w-full max-w-5xl my-4 rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-lg border-b border-gray-200 bg-white px-6 py-4 no-print">
              <h2 className="text-lg font-semibold text-gray-900">전체 일정 미리보기</h2>
              <div className="flex gap-2">
                <button type="button" onClick={handlePrint} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">인쇄 / PDF 저장</button>
                <button type="button" onClick={() => setShowPreview(false)} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">닫기</button>
              </div>
            </div>
            <div id="schedule-print-content" className="p-6">
              {previewMonths.map((month, mIdx) => {
                const mDays = trimPreviewCalendarWeeks(
                  getCalendarDaysForMonth(month),
                  (d) => siteBarsByDay(d).length > 0
                );
                const pages = chunkDaysForPrint(mDays);
                return (
                  <React.Fragment key={month}>
                    {pages.map((chunk, pageIdx) => {
                      const padded = padChunkToWeekRows(chunk);
                      const totalP = pages.length;
                      const isFirstOverall = mIdx === 0 && pageIdx === 0;
                      return (
                        <div
                          key={`${month}-${pageIdx}`}
                          className="mb-6"
                          style={
                            isFirstOverall
                              ? undefined
                              : { pageBreakBefore: "always", breakBefore: "page" }
                          }
                        >
                          <h2 className="text-base font-bold text-gray-900 mb-1 text-center">
                            전체 일정 &mdash; {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월
                            {totalP > 1 && (
                              <span className="mt-0.5 block text-sm font-normal text-gray-600">
                                {pageIdx + 1} / {totalP}쪽
                              </span>
                            )}
                          </h2>
                          <div className="rounded border border-gray-300 overflow-hidden">
                            <div className="grid grid-cols-7 border-b-2 border-gray-300 text-center text-xs font-semibold">
                              {WEEKDAYS.map((wd, i) => (
                                <div key={wd} className={`py-2 border-r border-gray-300 last:border-r-0 ${i === 0 ? "bg-red-50 text-red-500" : i === 6 ? "bg-blue-50 text-blue-500" : "bg-gray-100 text-gray-700"}`}>{wd}</div>
                              ))}
                            </div>
                            <div className="grid grid-cols-7">
                              {padded.map((cell, ci) => {
                                if (cell == null) {
                                  return (
                                    <div
                                      key={`pad-${month}-${pageIdx}-${ci}`}
                                      className="min-h-[90px] border-b border-r border-gray-100 bg-gray-50/50 last:border-r-0"
                                      aria-hidden
                                    />
                                  );
                                }
                                const { date, isCurrentMonth, dayNum } = cell;
                                const siteBars = siteBarsByDay(date);
                                const dow = new Date(date + "T12:00:00").getDay();
                                const holiday = getHolidayName(date);
                                const isOff = dow === 0 || dow === 6 || !!holiday;
                                const cellBg = !isCurrentMonth ? "bg-gray-50" : isOff ? "bg-red-50/40" : "";
                                const dayClr = !isCurrentMonth ? "text-gray-300" : (dow === 0 || !!holiday) ? "text-red-500 font-semibold" : dow === 6 ? "text-blue-500 font-semibold" : "text-gray-800";
                                return (
                                  <div key={date} className={`min-h-[90px] border-b border-r border-gray-200 p-1.5 last:border-r-0 ${cellBg}`}>
                                    <div className={`text-right text-xs ${dayClr}`}>
                                      {dayNum}
                                      {holiday && isCurrentMonth && <span className="ml-1 text-[9px] text-red-400 font-normal">{holiday}</span>}
                                    </div>
                                    <div className="mt-1 space-y-0.5">
                                      {siteBars.map((bar) => {
                                        const r = parseInt(bar.color.slice(1, 3), 16), g = parseInt(bar.color.slice(3, 5), 16), b = parseInt(bar.color.slice(5, 7), 16);
                                        const tc = (r * 299 + g * 587 + b * 114) / 1000 > 180 ? "text-gray-900" : "text-white";
                                        return (
                                          <div key={bar.consultationId} className={`rounded px-1.5 py-0.5 text-[11px] font-medium truncate ${tc}`} style={{ backgroundColor: bar.color }} title={`${bar.estimateTitle} · ${bar.phaseNames.join(" · ")}`}>
                                            {bar.phaseNames.join(" · ")}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {scheduleColorMenu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            aria-hidden
            onClick={() => setScheduleColorMenu(null)}
          />
          <div
            role="dialog"
            aria-label="일정 표시 색상"
            className="fixed z-[70] w-[228px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl no-print"
            style={{ left: scheduleColorMenu.left, top: scheduleColorMenu.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-medium text-gray-700">표시 색상</p>
            <p className="mb-2 text-[11px] leading-snug text-gray-500">
              아래 색을 누르거나 직접 고른 뒤 적용하세요. 캘린더 막대에도 같은 색이 쓰입니다.
            </p>
            <div className="mb-3 grid grid-cols-6 gap-1.5">
              {TITLE_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  className="h-7 w-full rounded border border-gray-200 shadow-sm transition-transform hover:z-10 hover:scale-110"
                  style={{ backgroundColor: hex }}
                  onClick={() => void patchScheduleListColor(scheduleColorMenu.consultationId, hex)}
                />
              ))}
            </div>
            <label className="mb-1 block text-[11px] font-medium text-gray-600">직접 선택</label>
            <input
              ref={scheduleColorInputRef}
              key={scheduleColorMenu.consultationId}
              type="color"
              className="mb-2 h-9 w-full cursor-pointer rounded border border-gray-300 bg-white"
              defaultValue={resolveScheduleAccent(
                consultations.find((c) => c.id === scheduleColorMenu.consultationId) ?? {
                  id: scheduleColorMenu.consultationId,
                }
              )}
            />
            <button
              type="button"
              className="mb-2 w-full rounded-md border border-gray-300 bg-white py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => {
                const v = scheduleColorInputRef.current?.value;
                if (v && /^#[0-9A-Fa-f]{6}$/.test(v)) {
                  void patchScheduleListColor(scheduleColorMenu.consultationId, v);
                }
              }}
            >
              이 색으로 저장
            </button>
            <button
              type="button"
              className="w-full rounded-md border border-dashed border-gray-300 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => void patchScheduleListColor(scheduleColorMenu.consultationId, null)}
            >
              자동 색으로 초기화
            </button>
          </div>
        </>
      )}
    </div>
  );
}
