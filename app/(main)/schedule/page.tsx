"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/** 견적완료 이후만 공사 일정 관리 대상 */
const SCHEDULE_TARGET_STATUSES = [
  "견적완료",
  "자재미팅",
  "계약서 작성 미팅",
  "디자인미팅",
  "계약완료",
  "취소/보류",
  "완료",
] as const;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Consultation = {
  id: number;
  customerName: string;
  contact: string;
  address: string;
  status: string;
  pic: string;
  constructionStartAt?: string;
  moveInAt?: string;
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

/** 해당 날짜(YYYY-MM-DD)가 공사 기간(시작일~입주일)에 포함되는지 */
function isDateInRange(day: string, start?: string, end?: string): boolean {
  if (!start) return false;
  const d = day;
  if (!end || end < start) return d === start;
  return d >= start && d <= end;
}

export default function SchedulePage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });

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
    const list = consultations.filter((c) =>
      SCHEDULE_TARGET_STATUSES.includes(c.status as (typeof SCHEDULE_TARGET_STATUSES)[number])
    );
    return list.map((consultation) => {
      const est = estimates.find((e) => e.consultationId === consultation.id);
      return {
        consultation,
        estimateTitle: est?.title?.trim() || "제목 없음",
      };
    });
  }, [consultations, estimates]);

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
    (day: string) =>
      scheduleList.filter(({ consultation }) =>
        isDateInRange(day, toDateValue(consultation.constructionStartAt), toDateValue(consultation.moveInAt))
      ),
    [scheduleList]
  );

  const noDateItems = useMemo(
    () => scheduleList.filter(({ consultation }) => !toDateValue(consultation.constructionStartAt)),
    [scheduleList]
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900">일정</h1>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {viewMode === "list" ? "캘린더 보기" : "목록 보기"}
        </button>
      </div>

      {viewMode === "list" ? (
        <>
          <p className="text-sm text-gray-500 mb-3">
            저장된 공사 일정 목록입니다. <strong>제목</strong>을 클릭하면 새 화면에서 공사 일정(목공사, 전기, 도장 등)을 짤 수 있습니다.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="p-2 sm:p-3">제목</th>
                  <th className="p-2 sm:p-3">공사시작일</th>
                  <th className="p-2 sm:p-3">입주일</th>
                  <th className="p-2 sm:p-3">고객명</th>
                  <th className="p-2 sm:p-3">연락처</th>
                  <th className="w-20 sm:w-24 p-2 sm:p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      견적완료 이상인 상담이 없습니다.{" "}
                      <Link href="/consulting" className="text-blue-600 hover:underline">
                        상담 및 미팅관리
                      </Link>
                      에서 진행상태를 견적완료로 변경한 상담이 여기에 표시됩니다.
                    </td>
                  </tr>
                ) : (
                  scheduleList.map((item) => (
                    <tr key={item.consultation.id} className="text-gray-700 hover:bg-gray-50">
                      <td className="p-2 sm:p-3 font-medium">
                        <Link
                          href={`/schedule/${item.consultation.id}`}
                          className="text-blue-600 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.estimateTitle || "-"}
                        </Link>
                      </td>
                      <td className="p-2 sm:p-3">{formatDateDisplay(item.consultation.constructionStartAt)}</td>
                      <td className="p-2 sm:p-3">{formatDateDisplay(item.consultation.moveInAt)}</td>
                      <td className="p-2 sm:p-3">{item.consultation.customerName || "-"}</td>
                      <td className="p-2 sm:p-3">{item.consultation.contact || "-"}</td>
                      <td className="whitespace-nowrap p-2 sm:p-3 align-middle">
                        <Link
                          href={`/schedule/${item.consultation.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded px-2 py-1 text-blue-600 hover:underline"
                        >
                          일정
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">
            견적완료 이상 상담이 캘린더에 표시됩니다. <strong>제목을 클릭</strong>하면 공사 일정(목공사, 전기, 도장 등 공정별 일정)을 짤 수 있습니다.
          </p>

          {/* 월 이동 */}
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

      {/* 캘린더 */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px] rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {WEEKDAYS.map((wd) => (
              <div
                key={wd}
                className="p-2 text-center text-xs font-medium text-gray-600"
              >
                {wd}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, isCurrentMonth, dayNum }) => {
              const items = itemsByDay(date);
              return (
                <div
                  key={date}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-1 last:border-r-0 ${!isCurrentMonth ? "bg-gray-50" : ""}`}
                >
                  <div
                    className={`text-right text-sm ${isCurrentMonth ? "text-gray-900" : "text-gray-400"}`}
                  >
                    {dayNum}
                  </div>
                  <div className="mt-1 space-y-1">
                    {items.map((item) => (
                      <Link
                        key={item.consultation.id}
                        href={`/schedule/${item.consultation.id}`}
                        className="block w-full rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-left text-xs hover:bg-blue-100"
                      >
                        <div className="truncate font-medium text-blue-900">
                          {item.estimateTitle}
                        </div>
                        <div className="truncate text-gray-600">
                          {item.consultation.customerName}
                        </div>
                        <div className="truncate text-gray-500">
                          {item.consultation.contact}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 일정 미정 목록 */}
      {noDateItems.length > 0 && (
        <div className="mt-6">
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

          <p className="mt-4 text-sm text-gray-500">
            <Link href="/consulting" className="text-blue-600 hover:underline">
              상담 및 미팅관리
            </Link>
            에서 견적완료로 변경한 상담이 여기에 표시됩니다.
          </p>
        </>
      )}
    </div>
  );
}
