"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image } from "lucide-react";

type WorkerItem = {
  id: number;
  name: string;
  phone: string;
  role: string;
  memo: string;
  rating: number | null;
  createdAt: string | null;
};

type ConsultationSchedule = {
  id: number;
  customerName: string;
  address?: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { name: string; start: string; end: string }[];
};

type EstimateItem = { id: number; consultationId?: number; title: string };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PHASE_COLORS = ["#3B82F6", "#22C55E", "#EAB308", "#EF4444", "#8B5CF6", "#06B6D4", "#F97316", "#EC4899"];

function isDateInRange(day: string, start?: string, end?: string): boolean {
  if (!start) return false;
  const e = end && end >= start ? end : start;
  return day >= start && day <= e;
}

/** 한 달 기준 캘린더 날짜 배열 (42칸) */
function getCalendarDays(monthStr: string): { date: string; isCurrentMonth: boolean; dayNum: number }[] {
  const [y, m] = monthStr.split("-").map(Number);
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

/** 일정이 있는 구간만: firstDate~lastDate 포함하는 주 단위 그리드 (앞뒤 빈 칸 최소화) */
function getCalendarDaysInRange(
  firstDate: string,
  lastDate: string
): { date: string; dayNum: number; isInRange: boolean }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate) || !/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || firstDate > lastDate) {
    const t = new Date();
    const fallback = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
    return getCalendarDaysInRange(fallback, fallback);
  }
  const start = new Date(firstDate + "T12:00:00");
  const end = new Date(lastDate + "T12:00:00");
  const startWeekday = start.getDay();
  const endWeekday = end.getDay();
  const calendarStart = new Date(start);
  calendarStart.setDate(calendarStart.getDate() - startWeekday);
  const calendarEnd = new Date(end);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - endWeekday));
  const days: { date: string; dayNum: number; isInRange: boolean }[] = [];
  const cur = new Date(calendarStart);
  while (cur <= calendarEnd) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = cur.getDate();
    const dateStr = `${y}-${m}-${String(d).padStart(2, "0")}`;
    days.push({
      date: dateStr,
      dayNum: d,
      isInRange: dateStr >= firstDate && dateStr <= lastDate,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** 5점 별점 표시/선택 (1~5) */
function StarRating({
  value,
  onChange,
  readonly = false,
  size = "sm",
}: {
  value: number | null;
  onChange?: (v: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}) {
  const stars = [1, 2, 3, 4, 5];
  const sizeClass = size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={`inline-flex gap-0.5 ${sizeClass}`} role={readonly ? "img" : undefined} aria-label={value != null ? `${value}점` : "미평가"}>
        {stars.map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(n)}
          className={`${readonly ? "cursor-default" : "cursor-pointer hover:opacity-80"} transition-opacity ${value != null && n <= value ? "text-amber-500" : "text-gray-300"}`}
          aria-label={`${n}점`}
          aria-pressed={value === n}
        >
          {value != null && n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

export default function WorkersPage() {
  const [list, setList] = useState<WorkerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [memo, setMemo] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editing, setEditing] = useState<WorkerItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [ratingUpdatingId, setRatingUpdatingId] = useState<number | null>(null);

  const [shareTarget, setShareTarget] = useState<WorkerItem | null>(null);
  const [shareSchedules, setShareSchedules] = useState<{ consultation: ConsultationSchedule; title: string }[]>([]);
  const [shareSelectedId, setShareSelectedId] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSavingJpg, setShareSavingJpg] = useState(false);
  const shareCalendarRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    fetch("/api/workers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setList(
            data.map((row: { id: number; name: string; phone?: string; role?: string; memo?: string; rating?: number | null; createdAt?: string | null }) => {
              const r = row.rating != null ? Math.min(5, Math.max(1, Math.round(Number(row.rating)))) : null;
              return {
                id: row.id,
                name: row.name,
                phone: row.phone ?? "",
                role: row.role ?? "",
                memo: row.memo ?? "",
                rating: r as number | null,
                createdAt: row.createdAt ?? null,
              };
            })
          );
          setError(null);
        } else {
          setError((data as { error?: string }).error || "목록을 불러올 수 없습니다.");
        }
      })
      .catch(() => setError("목록을 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSubmitLoading(true);
    setSubmitError(null);
    fetch("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        phone: phone.trim(),
        role: role.trim(),
        memo: memo.trim(),
        rating: rating ?? undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setName("");
          setPhone("");
          setRole("");
          setMemo("");
          setRating(null);
          loadList();
        } else {
          setSubmitError((data as { error?: string }).error || "추가 실패");
        }
      })
      .catch(() => setSubmitError("추가 중 오류가 발생했습니다."))
      .finally(() => setSubmitLoading(false));
  };

  const openEdit = (item: WorkerItem) => {
    setEditing(item);
    setEditName(item.name);
    setEditPhone(item.phone);
    setEditRole(item.role);
    setEditMemo(item.memo);
    setEditRating(item.rating);
    setEditError(null);
  };

  const handleRatingChange = (item: WorkerItem, newRating: number) => {
    setRatingUpdatingId(item.id);
    fetch(`/api/workers/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        phone: item.phone,
        role: item.role,
        memo: item.memo,
        rating: newRating,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) loadList();
        else alert((data as { error?: string }).error || "별점 저장 실패");
      })
      .catch(() => alert("별점 저장 중 오류가 발생했습니다."))
      .finally(() => setRatingUpdatingId(null));
  };

  const handleEditSave = () => {
    if (!editing) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("이름을 입력해 주세요.");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    fetch(`/api/workers/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        phone: editPhone.trim(),
        role: editRole.trim(),
        memo: editMemo.trim(),
        rating: editRating ?? undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEditing(null);
          loadList();
        } else {
          setEditError((data as { error?: string }).error || "수정 실패");
        }
      })
      .catch(() => setEditError("수정 중 오류가 발생했습니다."))
      .finally(() => setEditLoading(false));
  };

  const handleDelete = (item: WorkerItem) => {
    if (!confirm(`"${item.name}"을(를) 목록에서 삭제할까요?`)) return;
    fetch(`/api/workers/${item.id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) loadList();
        else alert((data as { error?: string }).error || "삭제 실패");
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const openShareSchedule = (worker: WorkerItem) => {
    setShareTarget(worker);
    setShareSelectedId(null);
    setShareCopied(false);
    setShareLoading(true);
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
    ])
      .then(([cons, est]) => {
        const consultations = Array.isArray(cons) ? cons as ConsultationSchedule[] : [];
        const estimates = Array.isArray(est) ? est as EstimateItem[] : [];
        const withSchedule = consultations.filter(
          (c: ConsultationSchedule) =>
            (c.constructionStartAt && String(c.constructionStartAt).trim()) ||
            (Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0)
        );
        const list = withSchedule.map((c: ConsultationSchedule) => {
          const e = estimates.find((x: EstimateItem) => x.consultationId === c.id);
          return { consultation: c, title: e?.title?.trim() || "제목 없음" };
        });
        setShareSchedules(list);
        if (list.length > 0) setShareSelectedId(list[0].consultation.id);
      })
      .catch(() => setShareSchedules([]))
      .finally(() => setShareLoading(false));
  };

  const handleCopyAndOpenKakao = useCallback(async () => {
    const el = shareCalendarRef.current;
    if (!el) return;
    setShareCopied(true);
    try {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(r));
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(el, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        type: "image/png",
      });
      if (!blob) {
        alert("이미지 복사에 실패했습니다.");
        setShareCopied(false);
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setTimeout(() => setShareCopied(false), 3000);
      setTimeout(() => {
        try {
          window.open("kakaotalk://", "_blank", "noopener");
        } catch {
          // ignore
        }
      }, 150);
    } catch (err) {
      console.error("캘린더 이미지 복사 실패:", err);
      alert("클립보드에 이미지를 복사할 수 없습니다. '캘린더 JPG 저장'으로 저장한 뒤 카카오톡에서 사진 보내기를 이용해 주세요.");
      setShareCopied(false);
    }
  }, []);

  const selectedShareItem = useMemo(
    () => shareSchedules.find((s) => s.consultation.id === shareSelectedId),
    [shareSchedules, shareSelectedId]
  );

  /** 일정 공유 캘린더: 공정이 있는 구간만 표시 (앞뒤 빈 칸 최소화) */
  const shareCalendarRange = useMemo(() => {
    const c = selectedShareItem?.consultation;
    if (!c) return null;
    const phases = Array.isArray(c.schedulePhases) ? c.schedulePhases : [];
    let firstDate = (c.constructionStartAt || "").trim().slice(0, 10);
    let lastDate = (c.moveInAt || c.constructionStartAt || "").trim().slice(0, 10) || firstDate;
    if (phases.length > 0) {
      let min = "";
      let max = "";
      phases.forEach((p) => {
        const s = (p.start ?? "").trim().slice(0, 10);
        const e = (p.end ?? p.start ?? "").trim().slice(0, 10) || s;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          if (!min || s < min) min = s;
          if (!max || s > max) max = s;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
          if (!min || e < min) min = e;
          if (!max || e > max) max = e;
        }
      });
      if (min && max) {
        firstDate = min;
        lastDate = max;
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) {
      const t = new Date();
      firstDate = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-01`;
      lastDate = firstDate;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || lastDate < firstDate) {
      lastDate = firstDate;
    }
    return { firstDate, lastDate };
  }, [selectedShareItem]);

  const shareCalendarDays = useMemo(
    () =>
      shareCalendarRange
        ? getCalendarDaysInRange(shareCalendarRange.firstDate, shareCalendarRange.lastDate)
        : [],
    [shareCalendarRange]
  );

  /** 공유 캘린더 제목용 월 표시 (구간이 한 달이면 "2026년 3월", 넘치면 "2026년 2월 ~ 3월") */
  const shareCalendarMonthLabel = useMemo(() => {
    if (!shareCalendarRange) return "";
    const [y1, m1] = shareCalendarRange.firstDate.split("-").map(Number);
    const [y2, m2] = shareCalendarRange.lastDate.split("-").map(Number);
    if (y1 === y2 && m1 === m2) return `${y1}년 ${m1}월`;
    return `${y1}년 ${m1}월 ~ ${y2}년 ${m2}월`;
  }, [shareCalendarRange]);

  /** 공정 이름별 고정 색상 (캘린더에서 철거/설비 등 구분) */
  const sharePhaseColorMap = useMemo(() => {
    const phases = selectedShareItem?.consultation.schedulePhases ?? [];
    const order: string[] = [];
    phases.forEach((p) => {
      const name = p.name?.trim() || "공정";
      if (!order.includes(name)) order.push(name);
    });
    return order;
  }, [selectedShareItem?.consultation.schedulePhases]);

  const getPhaseColor = (phaseName: string): string =>
    PHASE_COLORS[sharePhaseColorMap.indexOf(phaseName?.trim() || "공정") % PHASE_COLORS.length] ?? PHASE_COLORS[0];

  const saveShareCalendarAsJpg = useCallback(async () => {
    const el = shareCalendarRef.current;
    if (!el) return;
    setShareSavingJpg(true);
    try {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(r));
      const { toJpeg } = await import("html-to-image");
      const dataUrl = await toJpeg(el, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        quality: 0.92,
      });
      const link = document.createElement("a");
      const title = selectedShareItem?.title?.replace(/[/\\?%*:|"]/g, "_") || "일정";
      link.download = shareCalendarRange
        ? `일정_${title}_${shareCalendarRange.firstDate}_${shareCalendarRange.lastDate}.jpg`
        : `일정_${title}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("캘린더 이미지 저장 실패:", err);
      alert("이미지 저장에 실패했습니다.");
    } finally {
      setShareSavingJpg(false);
    }
  }, [selectedShareItem?.title, shareCalendarRange]);


  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">현장 인부 DB</h1>
      <p className="mb-4 text-sm text-gray-600">
        회사별로 등록한 현장 인부를 저장·관리합니다. 로그인한 회사 데이터만 보입니다.
      </p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-gray-700">인부 추가</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="이름 *"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="전화번호"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="직종 / 역할"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="비고"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">별점</span>
            <StarRating value={rating} onChange={setRating} size="md" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitLoading || !name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitLoading ? "추가 중…" : "추가"}
          </button>
          {submitError && <span className="text-sm text-red-600">{submitError}</span>}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          등록된 인부가 없습니다. 위에서 추가해 주세요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 font-medium text-gray-700">이름</th>
                  <th className="px-4 py-3 font-medium text-gray-700">별점</th>
                  <th className="px-4 py-3 font-medium text-gray-700">전화번호</th>
                  <th className="px-4 py-3 font-medium text-gray-700">직종/역할</th>
                  <th className="px-4 py-3 font-medium text-gray-700">비고</th>
                  <th className="min-w-[180px] whitespace-nowrap px-4 py-3 font-medium text-gray-700">관리</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3">
                      {ratingUpdatingId === item.id ? (
                        <span className="text-gray-400">저장 중…</span>
                      ) : (
                        <StarRating
                          value={item.rating}
                          onChange={(v) => handleRatingChange(item, v)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.phone || "-"}</td>
                    <td className="px-4 py-3 text-gray-600">{item.role || "-"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-600" title={item.memo}>
                      {item.memo || "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openShareSchedule(item)}
                          className="whitespace-nowrap rounded px-2 py-1 text-green-600 hover:bg-green-50"
                          title="일정 선택 후 카카오톡으로 공유"
                        >
                          일정 공유
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="whitespace-nowrap rounded px-2 py-1 text-blue-600 hover:bg-blue-50"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="whitespace-nowrap rounded px-2 py-1 text-red-600 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">인부 수정</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="이름 *"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="전화번호"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                placeholder="직종 / 역할"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="비고"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">별점</span>
                <StarRating value={editRating} onChange={setEditRating} size="md" />
              </div>
            </div>
            {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                disabled={editLoading}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 공유 모달 */}
      {shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">일정 공유</h2>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              <strong>{shareTarget.name}</strong>
              {shareTarget.phone ? ` (${shareTarget.phone})` : ""} 님에게 보낼 일정을 선택한 뒤, 아래 버튼으로 캘린더 이미지를 복사해 카카오톡에 붙여넣어 보내세요.
            </p>
            {shareLoading ? (
              <p className="py-4 text-sm text-gray-500">일정 목록 불러오는 중…</p>
            ) : shareSchedules.length === 0 ? (
              <p className="py-4 text-sm text-gray-500">일정이 등록된 프로젝트가 없습니다. 일정 페이지에서 공사 시작일·공정을 저장해 주세요.</p>
            ) : (
              <>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">일정 선택</label>
                <select
                  value={shareSelectedId ?? ""}
                  onChange={(e) => setShareSelectedId(Number(e.target.value) || null)}
                  className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {shareSchedules.map(({ consultation, title }) => {
                    const start = (consultation.constructionStartAt || "").slice(0, 10);
                    const end = (consultation.moveInAt || consultation.constructionStartAt || "").slice(0, 10) || start;
                    return (
                      <option key={consultation.id} value={consultation.id}>
                        {consultation.customerName || "고객"} / {title} ({start} ~ {end})
                      </option>
                    );
                  })}
                </select>
                {selectedShareItem && shareCalendarRange && shareCalendarDays.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-1.5 text-xs font-medium text-gray-500">캘린더 이미지 (복사 후 카카오톡에 붙여넣기)</p>
                    <p className="mb-1.5 text-[11px] text-gray-500">
                      카카오톡 채팅창에서 <strong>입력창 길게 누르기 → 붙여넣기</strong> 또는 <strong>Ctrl+V</strong>. 붙여넣기가 안 되면 아래 &quot;캘린더 JPG 저장&quot;으로 저장 후 사진 보내기 하세요.
                    </p>
                    <div
                      ref={shareCalendarRef}
                      className="inline-block"
                      style={{
                        minWidth: "280px",
                        backgroundColor: "#ffffff",
                        border: "2px solid #d1d5db",
                        borderRadius: "8px",
                        padding: "8px",
                      }}
                    >
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#1f2937",
                          marginBottom: "2px",
                        }}
                      >
                        {shareCalendarMonthLabel} · {selectedShareItem.title}
                      </div>
                      {(selectedShareItem.consultation.customerName || selectedShareItem.consultation.address) && (
                        <div
                          style={{
                            textAlign: "center",
                            fontSize: "10px",
                            lineHeight: 1.25,
                            color: "#4b5563",
                            marginBottom: "4px",
                          }}
                        >
                          {selectedShareItem.consultation.customerName && <span>고객: {selectedShareItem.consultation.customerName}</span>}
                          {selectedShareItem.consultation.customerName && selectedShareItem.consultation.address && " · "}
                          {selectedShareItem.consultation.address && <span>주소: {selectedShareItem.consultation.address.trim()}</span>}
                        </div>
                      )}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          textAlign: "center",
                          fontSize: "10px",
                          fontWeight: 500,
                          borderBottom: "1px solid #d1d5db",
                        }}
                      >
                        {WEEKDAYS.map((wd, i) => (
                          <div
                            key={wd}
                            style={{
                              borderRight: i < 6 ? "1px solid #d1d5db" : "none",
                              padding: "2px 0",
                              backgroundColor: i === 0 || i === 6 ? "#fdf2f8" : "#f9fafb",
                              color: "#4b5563",
                            }}
                          >
                            {wd}
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          gridAutoRows: "minmax(40px, auto)",
                          borderTop: "1px solid #d1d5db",
                        }}
                      >
                        {shareCalendarDays.map(({ date, isInRange, dayNum }, cellIndex) => {
                          const dayOfWeek = new Date(date + "T12:00:00").getDay();
                          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                          const cellBg = !isInRange ? "#f3f4f6" : isWeekend ? "#fdf2f8" : "#ffffff";
                          const phasesOnDay = Array.isArray(selectedShareItem.consultation.schedulePhases)
                            ? selectedShareItem.consultation.schedulePhases.filter((p) => {
                                const s = (p.start ?? "").trim().slice(0, 10);
                                const e = (p.end ?? p.start ?? "").trim().slice(0, 10) || s;
                                return isDateInRange(date, s, e);
                              })
                            : [];
                          return (
                            <div
                              key={date}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                borderBottom: "1px solid #d1d5db",
                                borderRight: cellIndex % 7 === 6 ? "none" : "1px solid #d1d5db",
                                padding: "4px",
                                backgroundColor: cellBg,
                              }}
                            >
                              <div
                                style={{
                                  textAlign: "right",
                                  fontSize: "10px",
                                  color: isInRange ? "#374151" : "#9ca3af",
                                  lineHeight: 1.2,
                                }}
                              >
                                {dayNum}
                              </div>
                              <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                                {phasesOnDay.slice(0, 3).map((p) => (
                                  <div
                                    key={`${p.name}-${p.start}-${p.end}`}
                                    style={{
                                      borderRadius: "4px",
                                      fontSize: "9px",
                                      backgroundColor: getPhaseColor(p.name || "공정"),
                                      color: "#ffffff",
                                      height: "18px",
                                      lineHeight: "18px",
                                      textAlign: "center",
                                      padding: "0 4px",
                                      overflow: "hidden",
                                      boxSizing: "border-box",
                                    }}
                                  >
                                    {p.name || "공정"}
                                  </div>
                                ))}
                                {phasesOnDay.length > 3 && (
                                  <div style={{ fontSize: "8px", color: "#6b7280" }}>+{phasesOnDay.length - 3}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAndOpenKakao}
                    disabled={!selectedShareItem || shareCopied}
                    className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-medium text-[#191919] hover:bg-[#FDD835] disabled:opacity-50"
                  >
                    {shareCopied ? "이미지 복사됨 ✓ (카카오톡에서 붙여넣기)" : "캘린더 이미지 복사 후 카카오톡 열기"}
                  </button>
                  <button
                    type="button"
                    onClick={saveShareCalendarAsJpg}
                    disabled={!selectedShareItem || shareSavingJpg}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Image className="h-4 w-4" />
                    {shareSavingJpg ? "저장 중…" : "캘린더 JPG 저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareTarget(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    닫기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
