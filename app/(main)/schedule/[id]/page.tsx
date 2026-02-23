"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isKoreanHoliday } from "@/lib/koreanHolidays";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 공사 기간 위에 나열할 공정 버튼 기본 목록 (드래그하여 캘린더에 놓기) */
const DEFAULT_PHASE_BUTTONS = [
  "기본",
  "철거",
  "설비",
  "전기",
  "목공",
  "금속",
  "도장",
  "타일",
  "간판",
  "마감",
  "오픈",
];

/** 공정 이름 추천 목록 */
const PHASE_SUGGESTIONS = [
  "철거",
  "설비",
  "전기",
  "목공",
  "금속",
  "도장",
  "타일",
  "간판",
  "마감",
  "오픈",
];

/** 공정별 선택 가능한 색상 (캘린더 표시용) */
const PHASE_COLORS = [
  "#3B82F6", "#22C55E", "#EAB308", "#EF4444", "#8B5CF6",
  "#06B6D4", "#F97316", "#EC4899", "#64748B", "#14B8A6",
];

/** 리사이즈 드래그 시 브라우저 기본 금지/가이드 UI 숨기기용 투명 이미지 */
let emptyDragImage: HTMLImageElement | null = null;
function getEmptyDragImage(): HTMLImageElement | null {
  if (typeof document === "undefined") return null;
  if (emptyDragImage) return emptyDragImage;
  emptyDragImage = document.createElement("img");
  emptyDragImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return emptyDragImage;
}

type SchedulePhase = { name: string; start: string; end: string; color?: string };

type Consultation = {
  id: number;
  customerName: string;
  contact: string;
  address: string;
  status: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: SchedulePhase[];
};

type Estimate = {
  id: number;
  consultationId?: number;
  title: string;
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

function isDateInRange(day: string, start: string, end: string): boolean {
  if (!start) return false;
  const e = end && end >= start ? end : start;
  return day >= start && day <= e;
}

/** YYYY-MM-DD에 n일 더한 날짜 */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ScheduleDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [estimateTitle, setEstimateTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [constructionStartAt, setConstructionStartAt] = useState("");
  const [moveInAt, setMoveInAt] = useState("");
  const [phases, setPhases] = useState<SchedulePhase[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  /** 드래그용 공정 버튼 목록 (추가/삭제 가능) */
  const [phaseButtonLabels, setPhaseButtonLabels] = useState<string[]>(() => [...DEFAULT_PHASE_BUTTONS]);
  /** 리사이즈 핸들 드래그 시: 어떤 phase의 어느 쪽 끝인지 */
  const resizeDragRef = useRef<{ phaseIndex: number; edge: "left" | "right" } | null>(null);
  /** 리사이즈 중 마우스가 지나간 마지막 날짜 칸 (드래그 끝날 때 이 날짜로 기간 확장) */
  const resizeDropTargetDateRef = useRef<string | null>(null);

  useEffect(() => {
    if (Number.isNaN(id) || id <= 0) {
      setLoading(false);
      return;
    }
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
    ])
      .then(([cons, est]) => {
        const list = Array.isArray(cons) ? cons : [];
        const c = list.find((x: Consultation) => x.id === id);
        if (c) {
          setConsultation(c);
          const startVal = toDateValue(c.constructionStartAt);
          const moveVal = toDateValue(c.moveInAt);
          setConstructionStartAt(startVal);
          setMoveInAt(moveVal);
          setPhases(Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0 ? c.schedulePhases.map((p: SchedulePhase, idx: number) => {
            const hasColor = p.color && /^#[0-9A-Fa-f]{6}$/.test(p.color);
            return { name: p.name || "", start: toDateValue(p.start), end: toDateValue(p.end), color: hasColor ? p.color : PHASE_COLORS[idx % PHASE_COLORS.length] };
          }) : []);
          if (startVal) setCalendarMonth(startVal.slice(0, 7));
        }
        const estimates = Array.isArray(est) ? est : [];
        const e = estimates.find((x: Estimate) => x.consultationId === id);
        setEstimateTitle(e?.title?.trim() || "제목 없음");
      })
      .catch(() => setConsultation(null))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!consultation) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/consultations/${consultation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constructionStartAt: constructionStartAt || null,
          moveInAt: moveInAt || null,
          schedulePhases: phases.filter((p) => p.name.trim() || p.start || p.end).map((p) => ({ ...p, color: p.color || undefined })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "저장에 실패했습니다.");
        return;
      }
      setConsultation((prev) =>
        prev
          ? {
              ...prev,
              constructionStartAt: constructionStartAt || undefined,
              moveInAt: moveInAt || undefined,
              schedulePhases: phases,
            }
          : null
      );
      alert("저장되었습니다.");
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const addPhase = () => {
    setPhases((prev) => [...prev, { name: "", start: "", end: "", color: PHASE_COLORS[prev.length % PHASE_COLORS.length] }]);
  };
  const [openColorForIndex, setOpenColorForIndex] = useState<number | null>(null);

  const updatePhase = (index: number, field: keyof SchedulePhase, value: string) => {
    setPhases((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const removePhase = (index: number) => {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  };

  const calendarDays = useMemo(() => {
    const [y, m] = calendarMonth.split("-").map(Number);
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
  }, [calendarMonth]);

  const phasesOnDay = (day: string) =>
    phases.filter((p) => p.start && isDateInRange(day, p.start, p.end || p.start));

  const isInConstructionRange = (day: string) => {
    if (!constructionStartAt) return false;
    const end = moveInAt && moveInAt >= constructionStartAt ? moveInAt : constructionStartAt;
    return day >= constructionStartAt && day <= end;
  };

  const handleDropOnDay = (date: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const resize = resizeDragRef.current ?? (() => {
      const idx = e.dataTransfer.getData("resizePhaseIndex");
      const edge = e.dataTransfer.getData("resizeEdge");
      if (idx === "" || (edge !== "left" && edge !== "right")) return null;
      const phaseIndex = parseInt(idx, 10);
      return Number.isNaN(phaseIndex) ? null : { phaseIndex, edge: edge as "left" | "right" };
    })();
    if (resize) {
      resizeDragRef.current = null;
      const { phaseIndex, edge } = resize;
      setPhases((prev) => {
        if (phaseIndex < 0 || phaseIndex >= prev.length) return prev;
        const ph = prev[phaseIndex];
        const start = ph.start || ph.end || "";
        const end = ph.end || ph.start || "";
        if (!start) return prev;
        if (edge === "left") {
          const newStart = date;
          const newEnd = date > end ? date : end;
          return prev.map((p, i) => i === phaseIndex ? { ...p, start: newStart, end: newEnd } : p);
        }
        const newEnd = date;
        const newStart = date < start ? date : start;
        return prev.map((p, i) => i === phaseIndex ? { ...p, start: newStart, end: newEnd } : p);
      });
      return;
    }

    const name = e.dataTransfer.getData("phaseName");
    const color = e.dataTransfer.getData("phaseColor");
    if (!name) return;

    setPhases((prev) => {
      const sameName = prev.filter((p) => p.name === name);
      for (const p of sameName) {
        const start = p.start || p.end || "";
        const end = p.end || p.start || "";
        if (!start) continue;
        const endNext = addDays(end, 1);
        const startPrev = addDays(start, -1);
        if (date === endNext) {
          return prev.map((ph) => (ph === p ? { ...ph, end: date } : ph));
        }
        if (date === startPrev) {
          return prev.map((ph) => (ph === p ? { ...ph, start: date } : ph));
        }
      }
      return [...prev, { name, start: date, end: date, color: color || PHASE_COLORS[0] }];
    });
  };

  const handleDragOver = (e: React.DragEvent, date?: string) => {
    e.preventDefault();
    if (date != null && resizeDragRef.current != null) resizeDropTargetDateRef.current = date;
    e.dataTransfer.dropEffect = resizeDragRef.current != null ? "move" : "copy";
  };

  const applyResizeOnDragEnd = () => {
    const resize = resizeDragRef.current;
    const date = resizeDropTargetDateRef.current;
    resizeDragRef.current = null;
    resizeDropTargetDateRef.current = null;
    if (resize == null || date == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const { phaseIndex, edge } = resize;
    setPhases((prev) => {
      if (phaseIndex < 0 || phaseIndex >= prev.length) return prev;
      const ph = prev[phaseIndex];
      const start = ph.start || ph.end || "";
      const end = ph.end || ph.start || "";
      if (!start) return prev;
      if (edge === "left") {
        if (date === start) return prev;
        const newStart = date;
        const newEnd = date > end ? date : end;
        return prev.map((p, i) => (i === phaseIndex ? { ...p, start: newStart, end: newEnd } : p));
      }
      if (date === end) return prev;
      const newEnd = date;
      const newStart = date < start ? date : start;
      return prev.map((p, i) => (i === phaseIndex ? { ...p, start: newStart, end: newEnd } : p));
    });
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-gray-600">상담을 찾을 수 없습니다.</p>
        <Link href="/schedule" className="mt-2 inline-block text-blue-600 hover:underline">
          ← 일정 목록
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/schedule" className="text-sm text-blue-600 hover:underline">
          ← 일정 목록
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-2">공사 일정</h1>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-4">
        <p className="font-medium text-gray-900">{estimateTitle}</p>
        <p className="text-sm text-gray-600">{consultation.customerName} · {consultation.contact}</p>
        {consultation.address && (
          <p className="text-sm text-gray-500 truncate">{consultation.address}</p>
        )}
      </div>

      {/* 캘린더 */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">캘린더</h2>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              if (m === 1) setCalendarMonth(`${y - 1}-12`);
              else setCalendarMonth(`${y}-${String(m - 1).padStart(2, "0")}`);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
          >
            이전
          </button>
          <span className="font-medium text-gray-900">
            {calendarMonth.slice(0, 4)}년 {Number(calendarMonth.slice(5, 7))}월
          </span>
          <button
            type="button"
            onClick={() => {
              const [y, m] = calendarMonth.split("-").map(Number);
              if (m === 12) setCalendarMonth(`${y + 1}-01`);
              else setCalendarMonth(`${y}-${String(m + 1).padStart(2, "0")}`);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
          >
            다음
          </button>
        </div>
        <div className="rounded-lg border-2 border-gray-300 bg-white overflow-hidden">
          <div className="grid grid-cols-7 border-b-2 border-gray-300 text-center text-xs font-medium text-gray-600">
            {WEEKDAYS.map((wd, i) => (
              <div key={wd} className={`p-2 border-r border-gray-300 last:border-r-0 ${i === 0 || i === 6 ? "bg-pink-50" : "bg-gray-50"}`}>{wd}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-t border-gray-300">
            {calendarDays.map(({ date, isCurrentMonth, dayNum }) => {
              const onDay = phasesOnDay(date);
              const inRange = isInConstructionRange(date);
              const dayOfWeek = new Date(date + "T12:00:00").getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isHoliday = isKoreanHoliday(date);
              const cellBg = (isWeekend || isHoliday) ? "bg-pink-50" : !isCurrentMonth ? "bg-gray-50" : inRange ? "bg-blue-50/50" : "";
              return (
                <div
                  key={date}
                  onDragOver={(e) => handleDragOver(e, date)}
                  onDrop={(e) => handleDropOnDay(date, e)}
                  className={`min-h-[88px] border-b border-r border-gray-300 p-1.5 last:border-r-0 ${cellBg} border-dashed border-transparent hover:border-blue-400 hover:bg-blue-50/40 transition-colors`}
                >
                  <div
                    className="min-h-[60px]"
                    onDragOver={(e) => handleDragOver(e, date)}
                    onDrop={(e) => handleDropOnDay(date, e)}
                  >
                    <div className={`text-right text-xs ${isCurrentMonth ? "text-gray-700" : "text-gray-400"}`}>
                      {dayNum}
                    </div>
                    <div className="mt-0.5 space-y-0.5">
                    {onDay.map((p, i) => {
                      const bg = p.color && /^#[0-9A-Fa-f]{6}$/.test(p.color) ? p.color : "#93C5FD";
                      const isLight = (hex: string) => {
                        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                        return (r * 299 + g * 587 + b * 114) / 1000 > 180;
                      };
                      const textClass = isLight(bg) ? "text-gray-900" : "text-white";
                      const phaseIndex = phases.findIndex((x) => x === p);
                      const isFirstDay = date === (p.start || p.end);
                      const isLastDay = date === (p.end || p.start);
                      return (
                        <div
                          key={`${p.name}-${phaseIndex}-${date}`}
                          className="flex items-stretch rounded overflow-hidden min-w-0"
                          style={{ backgroundColor: bg }}
                          title={`${p.name} ${p.start} ~ ${p.end || p.start} (끝을 끌어서 기간 조절)`}
                        >
                          {isFirstDay && (
                            <span
                              draggable
                              onDragStart={(ev) => {
                                resizeDragRef.current = { phaseIndex, edge: "left" };
                                ev.dataTransfer.setData("resizePhaseIndex", String(phaseIndex));
                                ev.dataTransfer.setData("resizeEdge", "left");
                                ev.dataTransfer.effectAllowed = "move";
                                const img = getEmptyDragImage();
                                if (img) ev.dataTransfer.setDragImage(img, 0, 0);
                              }}
                              onDragEnd={applyResizeOnDragEnd}
                              className="w-2 shrink-0 cursor-ew-resize hover:bg-black/20"
                              title="왼쪽 끝 끌어서 시작일 변경"
                            />
                          )}
                          <span className={`flex-1 px-1 py-0.5 text-[10px] truncate ${textClass}`}>
                            {p.name}
                          </span>
                          {isLastDay && (
                            <span
                              draggable
                              onDragStart={(ev) => {
                                resizeDragRef.current = { phaseIndex, edge: "right" };
                                ev.dataTransfer.setData("resizePhaseIndex", String(phaseIndex));
                                ev.dataTransfer.setData("resizeEdge", "right");
                                ev.dataTransfer.effectAllowed = "move";
                                const img = getEmptyDragImage();
                                if (img) ev.dataTransfer.setDragImage(img, 0, 0);
                              }}
                              onDragEnd={applyResizeOnDragEnd}
                              className="w-2 shrink-0 cursor-ew-resize hover:bg-black/20"
                              title="오른쪽 끝 끌어서 종료일 변경"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 공정 버튼: 끌어다가 캘린더 날짜 칸에 놓으면 일정 추가 */}
      <section className="mb-4">
        <p className="text-xs text-gray-500 mb-2">버튼을 날짜 칸에 놓으면 한 칸 일정이 추가됩니다. 같은 공정을 바로 다음·이전 날 칸에 놓으면 기간이 늘어납니다.</p>
        <div className="flex flex-wrap items-center gap-2">
          {phaseButtonLabels.map((label, idx) => (
            <div key={idx} className="flex items-center gap-0.5 rounded-lg border border-gray-300 bg-white shadow-sm">
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("phaseName", label);
                  e.dataTransfer.setData("phaseColor", PHASE_COLORS[idx % PHASE_COLORS.length]);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="rounded-l-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:opacity-80 cursor-grab active:cursor-grabbing"
              >
                {label}
              </button>
              <button
                type="button"
                onClick={() => setPhaseButtonLabels((prev) => prev.filter((_, i) => i !== idx))}
                className="rounded-r-md px-1.5 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="버튼 삭제"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("추가할 공정 이름을 입력하세요");
              if (name != null && name.trim()) setPhaseButtonLabels((prev) => [...prev, name.trim()]);
            }}
            className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            + 추가
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">공사 기간</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-gray-600">공사 시작일</label>
            <input
              type="date"
              value={constructionStartAt}
              onChange={(e) => setConstructionStartAt(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600">입주일자</label>
            <input
              type="date"
              value={moveInAt}
              onChange={(e) => setMoveInAt(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">공정별 일정 (목공사, 전기, 도장 등)</h2>
          <button
            type="button"
            onClick={addPhase}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            + 공정 추가
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border-b border-gray-200 p-2 text-left">공정명</th>
                <th className="border-b border-gray-200 p-2 text-left w-28">색상</th>
                <th className="border-b border-gray-200 p-2 text-left">시작일</th>
                <th className="border-b border-gray-200 p-2 text-left">종료일</th>
                <th className="border-b border-gray-200 p-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {phases.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    공정을 추가한 뒤 시작일·종료일을 입력하세요.
                  </td>
                </tr>
              )}
              {phases.map((phase, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="p-2">
                    <input
                      type="text"
                      list={`phase-names-${index}`}
                      value={phase.name}
                      onChange={(e) => updatePhase(index, "name", e.target.value)}
                      placeholder="예: 목공사, 전기"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <datalist id={`phase-names-${index}`}>
                      {PHASE_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </td>
                  <td className="p-2 relative">
                    <button
                      type="button"
                      onClick={() => setOpenColorForIndex(openColorForIndex === index ? null : index)}
                      className="w-full min-w-[80px] h-8 rounded border border-gray-300 flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50"
                    >
                      <span
                        className="w-5 h-5 rounded border border-gray-300 shrink-0"
                        style={{ backgroundColor: phase.color || PHASE_COLORS[0] }}
                      />
                      <span className="text-gray-400 text-xs">▼</span>
                    </button>
                    {openColorForIndex === index && (
                      <>
                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpenColorForIndex(null)} />
                        <div className="absolute left-2 top-full mt-1 z-20 rounded-lg border border-gray-200 bg-white p-2 shadow-lg flex flex-wrap gap-1.5 min-w-[120px]">
                          {PHASE_COLORS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => {
                                updatePhase(index, "color", hex);
                                setOpenColorForIndex(null);
                              }}
                              className={`w-7 h-7 rounded border-2 shrink-0 hover:ring-2 ring-blue-400 ${phase.color === hex ? "border-gray-800" : "border-gray-200"}`}
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="p-2">
                    <input
                      type="date"
                      value={phase.start}
                      onChange={(e) => updatePhase(index, "start", e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="date"
                      value={phase.end}
                      onChange={(e) => updatePhase(index, "end", e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => removePhase(index)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <Link
          href="/consulting"
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          상담 상세에서 더 수정
        </Link>
      </div>
    </div>
  );
}
