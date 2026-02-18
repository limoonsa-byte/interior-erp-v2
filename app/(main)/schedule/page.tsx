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
  const [savingId, setSavingId] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [modalItem, setModalItem] = useState<ScheduleItem | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editMoveIn, setEditMoveIn] = useState("");

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

  const saveConsultationDate = async (
    id: number,
    payload: { constructionStartAt?: string; moveInAt?: string }
  ) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/consultations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "저장에 실패했습니다.");
        return;
      }
      setConsultations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                constructionStartAt: payload.constructionStartAt ?? c.constructionStartAt,
                moveInAt: payload.moveInAt ?? c.moveInAt,
              }
            : c
        )
      );
      setModalItem(null);
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSavingId(null);
    }
  };

  const openModal = (item: ScheduleItem) => {
    setModalItem(item);
    setEditStart(toDateValue(item.consultation.constructionStartAt));
    setEditMoveIn(toDateValue(item.consultation.moveInAt));
  };

  const handleModalSave = () => {
    if (!modalItem) return;
    saveConsultationDate(modalItem.consultation.id, {
      constructionStartAt: editStart || undefined,
      moveInAt: editMoveIn || undefined,
    });
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
      <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">일정</h1>
      <p className="text-sm text-gray-600 mb-4">
        견적완료 이상 상담이 캘린더에 표시됩니다. 카드를 클릭하면 공사 시작일·입주일을 편집할 수 있습니다.
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
                      <button
                        key={item.consultation.id}
                        type="button"
                        onClick={() => openModal(item)}
                        className="w-full rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-left text-xs hover:bg-blue-100"
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
                      </button>
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
          <h2 className="mb-2 text-sm font-semibold text-gray-700">일정 미정 (클릭하여 날짜 설정)</h2>
          <div className="flex flex-wrap gap-2">
            {noDateItems.map((item) => (
              <button
                key={item.consultation.id}
                type="button"
                onClick={() => openModal(item)}
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm hover:bg-amber-100"
              >
                <span className="font-medium text-amber-900">{item.estimateTitle}</span>
                <span className="ml-2 text-gray-600">{item.consultation.customerName}</span>
                <span className="ml-2 text-gray-500">{item.consultation.contact}</span>
              </button>
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

      {/* 일정 편집 모달 */}
      {modalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">공사 일정</h3>
            <div className="mb-3 text-sm text-gray-600">
              <p><strong>견적서 제목:</strong> {modalItem.estimateTitle}</p>
              <p><strong>이름:</strong> {modalItem.consultation.customerName}</p>
              <p><strong>연락처:</strong> {modalItem.consultation.contact}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  공사 시작일
                </label>
                <input
                  type="date"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  입주일자
                </label>
                <input
                  type="date"
                  value={editMoveIn}
                  onChange={(e) => setEditMoveIn(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalItem(null)}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleModalSave}
                disabled={savingId === modalItem.consultation.id}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingId === modalItem.consultation.id ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
