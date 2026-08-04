"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image } from "lucide-react";
import { getHolidayName, isKoreanHoliday } from "@/lib/koreanHolidays";
import { sortByKoreanDisplayName } from "@/lib/sortKoreanDisplayName";
import { canShareJpegFiles, shareJpgViaMessage, toShareableJpegFile } from "@/lib/shareJpgViaMessage";

type WorkerItem = {
  id: number;
  name: string;
  phone: string;
  role: string;
  memo: string;
  rating: number | null;
  bankAccount: string;
  createdAt: string | null;
};

type ConsultationSchedule = {
  id: number;
  customerName: string;
  status?: string;
  address?: string;
  constructionStartAt?: string;
  moveInAt?: string;
  schedulePhases?: { name: string; start: string; end: string }[];
  scheduleMemo?: string;
};

/** 일정 공유 선택 목록에서 제외할 종료 상태 */
function isCompletedForScheduleShare(status?: string): boolean {
  const s = (status ?? "").trim();
  return s === "완료" || s === "완료및정산" || s === "취소" || s === "취소/보류";
}

/** 전화번호 → 숫자만 (문자앱 수신자용) */
function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** 일정 → 문자/카카오 붙여넣기용 텍스트 (무료: 기기 문자·카톡 수동 발송) */
function buildScheduleShareText(
  consultation: ConsultationSchedule,
  title: string
): string {
  const site = (consultation.customerName || "").trim() || "현장";
  const address = (consultation.address || "").trim();
  const start = (consultation.constructionStartAt || "").trim().slice(0, 10);
  const end = (consultation.moveInAt || "").trim().slice(0, 10);
  const phases = Array.isArray(consultation.schedulePhases) ? consultation.schedulePhases : [];
  const lines: string[] = [
    `[공사 일정] ${title}`,
    `현장: ${site}`,
  ];
  if (address) lines.push(`주소: ${address}`);
  if (start || end) lines.push(`기간: ${start || "?"} ~ ${end || "?"}`);
  if (phases.length > 0) {
    lines.push("공정:");
    phases.forEach((p) => {
      const name = (p.name || "공정").trim();
      const ps = (p.start || "").trim().slice(0, 10);
      const pe = (p.end || p.start || "").trim().slice(0, 10);
      lines.push(`· ${name}: ${ps || "?"}${pe && pe !== ps ? ` ~ ${pe}` : ""}`);
    });
  }
  const memo = (consultation.scheduleMemo || "").trim();
  if (memo) {
    lines.push("메모:");
    lines.push(memo);
  }
  return lines.join("\n");
}

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
  const [bankAccount, setBankAccount] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editing, setEditing] = useState<WorkerItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [editBankAccount, setEditBankAccount] = useState("");
  const [editRating, setEditRating] = useState<number | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [ratingUpdatingId, setRatingUpdatingId] = useState<number | null>(null);

  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set());
  const [shareTargets, setShareTargets] = useState<WorkerItem[]>([]);
  const [shareSchedules, setShareSchedules] = useState<{ consultation: ConsultationSchedule; title: string }[]>([]);
  const [shareSelectedId, setShareSelectedId] = useState<number | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSavingJpg, setShareSavingJpg] = useState(false);
  /** 일정 선택 시 미리 만들어 둔 JPG — 클릭 직후 share() 호출용(iOS 제스처 유지) */
  const [readyJpgFile, setReadyJpgFile] = useState<File | null>(null);
  const [jpgPreparing, setJpgPreparing] = useState(false);
  const shareCalendarRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(() => {
    setLoading(true);
    fetch("/api/workers")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setList(
            data.map((row: { id: number; name: string; phone?: string; role?: string; memo?: string; bankAccount?: string; rating?: number | null; createdAt?: string | null }) => {
              const r = row.rating != null ? Math.min(5, Math.max(1, Math.round(Number(row.rating)))) : null;
              return {
                id: row.id,
                name: row.name,
                phone: row.phone ?? "",
                role: row.role ?? "",
                memo: row.memo ?? "",
                bankAccount: row.bankAccount ?? "",
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

  const sortedList = useMemo(
    () => sortByKoreanDisplayName(list, (item) => item.name),
    [list]
  );

  const allSelected =
    sortedList.length > 0 && sortedList.every((w) => selectedWorkerIds.has(w.id));
  const selectedWorkers = useMemo(
    () => sortedList.filter((w) => selectedWorkerIds.has(w.id)),
    [sortedList, selectedWorkerIds]
  );

  const toggleWorkerSelect = (id: number) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedWorkerIds(new Set());
    else setSelectedWorkerIds(new Set(sortedList.map((w) => w.id)));
  };

  const loadShareSchedules = useCallback(() => {
    setShareLoading(true);
    setShareSelectedId(null);
    Promise.all([
      fetch("/api/consultations").then((r) => r.json()),
      fetch("/api/estimates").then((r) => r.json()),
    ])
      .then(([cons, est]) => {
        const consultations = Array.isArray(cons) ? (cons as ConsultationSchedule[]) : [];
        const estimates = Array.isArray(est) ? (est as EstimateItem[]) : [];
        const withSchedule = consultations.filter((c: ConsultationSchedule) => {
          if (isCompletedForScheduleShare(c.status)) return false;
          return (
            (c.constructionStartAt && String(c.constructionStartAt).trim()) ||
            (Array.isArray(c.schedulePhases) && c.schedulePhases.length > 0)
          );
        });
        const scheduleList = withSchedule.map((c: ConsultationSchedule) => {
          const e = estimates.find((x: EstimateItem) => x.consultationId === c.id);
          return { consultation: c, title: e?.title?.trim() || "제목 없음" };
        });
        setShareSchedules(scheduleList);
        if (scheduleList.length > 0) setShareSelectedId(scheduleList[0].consultation.id);
      })
      .catch(() => setShareSchedules([]))
      .finally(() => setShareLoading(false));
  }, []);

  const openShareSchedule = (workers: WorkerItem | WorkerItem[]) => {
    const targets = Array.isArray(workers) ? workers : [workers];
    if (targets.length === 0) return;
    setShareTargets(targets);
    loadShareSchedules();
  };

  const closeShareModal = () => {
    setShareTargets([]);
  };

  const selectedShareItem = useMemo(
    () => shareSchedules.find((s) => s.consultation.id === shareSelectedId),
    [shareSchedules, shareSelectedId]
  );

  const shareMessageText = useMemo(() => {
    if (!selectedShareItem) return "";
    return buildScheduleShareText(selectedShareItem.consultation, selectedShareItem.title);
  }, [selectedShareItem]);

  const sharePhones = useMemo(() => {
    return shareTargets
      .map((w) => normalizePhoneDigits(w.phone))
      .filter((p) => p.length >= 10);
  }, [shareTargets]);

  /** 휴대폰 문자 앱으로 텍스트만 열기(수신자·본문 미리 채움). */
  const handleOpenSms = useCallback(() => {
    if (!shareMessageText) return;
    if (sharePhones.length === 0) {
      alert("선택한 인부 중 전화번호가 있는 사람이 없습니다. 전화번호를 등록해 주세요.");
      return;
    }
    const body = encodeURIComponent(shareMessageText);
    const phonesJoined = sharePhones.join(",");
    const isIOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);
    const href = isIOS
      ? `sms:/open?addresses=${phonesJoined}&body=${body}`
      : `sms:${phonesJoined}?body=${body}`;
    window.location.href = href;
  }, [shareMessageText, sharePhones]);

  /** 카카오톡 공유(친구 선택 후 바로 전송). 붙여넣기 없음. JS 키가 필요. */
  const handleKakaoShareSend = useCallback(async () => {
    if (!shareMessageText || !selectedShareItem) return;
    const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim();
    if (!jsKey) {
      alert(
        "카카오톡으로 바로 보내려면 카카오 개발자 앱의 JavaScript 키가 필요합니다.\n\n" +
          "1) developers.kakao.com 에서 앱 생성\n" +
          "2) JavaScript 키 발급 + 사이트 도메인 등록\n" +
          "3) .env 에 NEXT_PUBLIC_KAKAO_JS_KEY=키값 추가\n\n" +
          "당장은 「문자로 보내기」를 쓰면 휴대폰 문자앱에서 보내기만 누르면 됩니다."
      );
      return;
    }
    try {
      const { ensureKakaoReady, shareScheduleViaKakao } = await import("@/lib/kakaoShare");
      await ensureKakaoReady(jsKey);
      await shareScheduleViaKakao({
        title: selectedShareItem.title || "공사 일정",
        description: shareMessageText.slice(0, 200),
        fullText: shareMessageText,
      });
    } catch (err) {
      console.error("카카오 공유 실패:", err);
      alert(
        err instanceof Error
          ? err.message
          : "카카오톡 공유를 열 수 없습니다. 문자로 보내기를 이용해 주세요."
      );
    }
  }, [shareMessageText, selectedShareItem]);

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
        bankAccount: bankAccount.trim(),
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
          setBankAccount("");
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
    setEditBankAccount(item.bankAccount);
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
        bankAccount: item.bankAccount,
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
        bankAccount: editBankAccount.trim(),
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

  const calendarJpgFileName = useMemo(() => {
    const title = selectedShareItem?.title?.replace(/[/\\?%*:|"]/g, "_") || "일정";
    return shareCalendarRange
      ? `일정_${title}_${shareCalendarRange.firstDate}_${shareCalendarRange.lastDate}.jpg`
      : `일정_${title}.jpg`;
  }, [selectedShareItem?.title, shareCalendarRange]);

  /** 캘린더 DOM → JPG File (문자 MMS용으로 용량도 맞춤) */
  const makeCalendarJpgFile = useCallback(async (): Promise<File | null> => {
    const el = shareCalendarRef.current;
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 50));

    const { toJpeg } = await import("html-to-image");
    // MMS 첨부가 되도록 해상도·품질을 단계적으로 줄임
    const attempts: { pixelRatio: number; quality: number }[] = [
      { pixelRatio: 2, quality: 0.85 },
      { pixelRatio: 1.5, quality: 0.8 },
      { pixelRatio: 1.25, quality: 0.72 },
      { pixelRatio: 1, quality: 0.65 },
    ];
    const maxBytes = 900 * 1024;
    let best: Blob | null = null;

    for (const opt of attempts) {
      const dataUrl = await toJpeg(el, {
        backgroundColor: "#ffffff",
        pixelRatio: opt.pixelRatio,
        quality: opt.quality,
        cacheBust: true,
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) {
        return toShareableJpegFile(blob, "schedule.jpg");
      }
    }
    return best ? toShareableJpegFile(best, "schedule.jpg") : null;
  }, []);

  // 일정/캘린더가 바뀌면 JPG를 미리 만들어 두어, 버튼 클릭 시 바로 공유 시트(첨부)로 넘김
  useEffect(() => {
    let cancelled = false;
    setReadyJpgFile(null);
    if (!selectedShareItem || !shareCalendarRange || shareCalendarDays.length === 0) {
      setJpgPreparing(false);
      return;
    }
    setJpgPreparing(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const file = await makeCalendarJpgFile();
          if (!cancelled) setReadyJpgFile(file);
        } catch (err) {
          console.error("JPG 미리 생성 실패:", err);
          if (!cancelled) setReadyJpgFile(null);
        } finally {
          if (!cancelled) setJpgPreparing(false);
        }
      })();
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedShareItem, shareCalendarRange, shareCalendarDays.length, makeCalendarJpgFile]);

  /**
   * 문자로 JPG 보내기: OS 공유 시트에 JPG 파일 첨부 → 「메시지/문자」선택 시 MMS로 전송.
   * sms: 스킴은 이미지 첨부가 불가능하므로 Web Share files 만 사용 (텍스트 문자로 폴백하지 않음).
   */
  const handleShareJpgViaMessage = useCallback(async () => {
    if (!selectedShareItem) return;
    try {
      let file = readyJpgFile;
      const hadCache = Boolean(file);
      if (!file) {
        setShareSavingJpg(true);
        file = await makeCalendarJpgFile();
        setShareSavingJpg(false);
        if (!file) {
          alert("캘린더 JPG를 만들 수 없습니다. 일정을 다시 선택해 주세요.");
          return;
        }
        setReadyJpgFile(file);
      }

      if (!canShareJpegFiles()) {
        const dataUrl = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.download = calendarJpgFileName;
        link.href = dataUrl;
        link.click();
        URL.revokeObjectURL(dataUrl);
        alert(
          "이 브라우저에서는 문자에 JPG를 바로 붙일 수 없어 이미지를 저장했습니다.\n\n" +
            "휴대폰 크롬/사파리에서 이 페이지를 연 뒤 「문자로 JPG 보내기」를 다시 눌러 주세요.\n" +
            "공유 시트가 뜨면 「메시지」또는 「문자」를 선택하면 JPG가 첨부됩니다."
        );
        return;
      }

      const result = await shareJpgViaMessage({
        file,
        fileName: "schedule.jpg",
        title: selectedShareItem.title || "공사 일정",
        text: shareMessageText.slice(0, 80),
      });

      if (result === "aborted") return;
      if (result === "unsupported") {
        // 비동기 JPG 생성 직후면 iOS 등에서 제스처가 끊길 수 있음 → 캐시 후 재탭 유도
        if (!hadCache) {
          alert(
            "JPG가 준비되었습니다.\n\n「문자로 JPG 보내기」를 한 번 더 눌러 주세요.\n" +
              "공유 시트에서 「메시지/문자」를 선택하면 JPG가 첨부됩니다."
          );
          return;
        }
        const dataUrl = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.download = calendarJpgFileName;
        link.href = dataUrl;
        link.click();
        URL.revokeObjectURL(dataUrl);
        alert(
          "문자 앱으로 JPG 첨부를 열 수 없어 이미지를 저장했습니다.\n\n" +
            "휴대폰 기본 브라우저(크롬/사파리)에서 다시 시도하거나,\n" +
            "저장한 JPG를 문자 작성 화면에서 직접 첨부해 주세요."
        );
      }
    } catch (err) {
      console.error("JPG 문자 공유 실패:", err);
      alert("JPG 공유에 실패했습니다. 「JPG 저장」 후 문자에 직접 첨부해 주세요.");
    } finally {
      setShareSavingJpg(false);
    }
  }, [
    selectedShareItem,
    readyJpgFile,
    makeCalendarJpgFile,
    shareMessageText,
    calendarJpgFileName,
  ]);

  const saveShareCalendarAsJpg = useCallback(async () => {
    setShareSavingJpg(true);
    try {
      const file = readyJpgFile || (await makeCalendarJpgFile());
      if (!file) {
        alert("이미지 저장에 실패했습니다.");
        return;
      }
      const dataUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.download = calendarJpgFileName;
      link.href = dataUrl;
      link.click();
      URL.revokeObjectURL(dataUrl);
    } catch (err) {
      console.error("캘린더 이미지 저장 실패:", err);
      alert("이미지 저장에 실패했습니다.");
    } finally {
      setShareSavingJpg(false);
    }
  }, [readyJpgFile, makeCalendarJpgFile, calendarJpgFileName]);


  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-semibold text-gray-900">현장 인부 DB</h1>
      <p className="mb-4 text-sm text-gray-600">
        회사별로 등록한 현장 인부를 저장·관리합니다. 여러 명을 체크한 뒤 「일정 보내기」로 문자·카카오톡 전송 화면을 엽니다.
        (붙여넣기 없이, 문자/카톡에서 보내기만 누르면 됩니다. 서버에서 자동 발송은 유료 API가 필요합니다.)
      </p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-gray-700">인부 추가</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="계좌 (예: 국민 123-456-789012)"
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
      ) : sortedList.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          등록된 인부가 없습니다. 위에서 추가해 주세요.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {selectedWorkers.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-slate-50 px-4 py-2.5">
              <span className="text-sm text-gray-700">
                <strong>{selectedWorkers.length}</strong>명 선택됨
                {selectedWorkers.filter((w) => !normalizePhoneDigits(w.phone)).length > 0 && (
                  <span className="ml-2 text-amber-700">
                    (전화 없는 인부 {selectedWorkers.filter((w) => !normalizePhoneDigits(w.phone)).length}명 제외됨)
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => openShareSchedule(selectedWorkers)}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                선택 인부에게 일정 보내기
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="전체 선택"
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="row-actions-sticky min-w-[160px] whitespace-nowrap px-3 py-3 font-medium text-gray-700 sm:hidden">관리</th>
                  <th className="px-4 py-3 font-medium text-gray-700">이름</th>
                  <th className="px-4 py-3 font-medium text-gray-700">별점</th>
                  <th className="px-4 py-3 font-medium text-gray-700">전화번호</th>
                  <th className="px-4 py-3 font-medium text-gray-700">계좌</th>
                  <th className="px-4 py-3 font-medium text-gray-700">직종/역할</th>
                  <th className="px-4 py-3 font-medium text-gray-700">비고</th>
                  <th className="hidden min-w-[180px] whitespace-nowrap px-4 py-3 font-medium text-gray-700 sm:table-cell">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((item) => {
                  const actions = (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => openShareSchedule(item)}
                        className="whitespace-nowrap rounded px-2 py-1 text-green-600 hover:bg-green-50"
                        title="일정 선택 후 문자·카카오로 보내기"
                      >
                        일정 보내기
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
                  );
                  return (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedWorkerIds.has(item.id)}
                          onChange={() => toggleWorkerSelect(item.id)}
                          aria-label={`${item.name} 선택`}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="row-actions-sticky whitespace-nowrap px-3 py-3 sm:hidden">{actions}</td>
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
                      <td className="max-w-[180px] truncate px-4 py-3 text-gray-600" title={item.bankAccount}>
                        {item.bankAccount || "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.role || "-"}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-gray-600" title={item.memo}>
                        {item.memo || "-"}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">{actions}</td>
                    </tr>
                  );
                })}
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
                value={editBankAccount}
                onChange={(e) => setEditBankAccount(e.target.value)}
                placeholder="계좌 (예: 국민 123-456-789012)"
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

      {/* 일정 보내기 모달 */}
      {shareTargets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">일정 보내기</h2>
              <button
                type="button"
                onClick={closeShareModal}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-2 text-sm text-gray-600">
              {shareTargets.length === 1 ? (
                <>
                  <strong>{shareTargets[0].name}</strong>
                  {shareTargets[0].phone ? ` (${shareTargets[0].phone})` : ""} 님에게 보낼 일정을 고른 뒤,{" "}
                  <strong>문자로 보내기</strong> 또는 <strong>카카오로 보내기</strong>를 누르세요.
                </>
              ) : (
                <>
                  <strong>{shareTargets.length}명</strong> (
                  {shareTargets
                    .slice(0, 3)
                    .map((w) => w.name)
                    .join(", ")}
                  {shareTargets.length > 3 ? ` 외 ${shareTargets.length - 3}명` : ""}
                  )에게 보낼 일정을 고른 뒤 보내세요.
                </>
              )}
            </p>
            <p className="mb-3 text-[11px] text-gray-500">
              <strong>문자로 JPG 보내기</strong>: 휴대폰에서 공유 시트가 열리면 「메시지」를 고르면 캘린더 JPG가 첨부됩니다.
              텍스트만 보낼 때는 「문자(텍스트)」를 쓰세요.
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
                    <p className="mb-1.5 text-xs font-medium text-gray-500">캘린더 미리보기 (JPG로 첨부)</p>
                    <p className="mb-1.5 text-[11px] text-gray-500">
                      「문자로 JPG 보내기」를 누르면 공유 시트가 열립니다. 거기서{" "}
                      <span className="font-medium text-gray-700">메시지/문자</span>를 고르면 JPG가 첨부됩니다.
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
                          const holidayName = getHolidayName(date);
                          const isHoliday = isKoreanHoliday(date);
                          const isSunday = dayOfWeek === 0;
                          const isSaturday = dayOfWeek === 6;
                          const cellBg = !isInRange
                            ? "#f3f4f6"
                            : isSunday || (isHoliday && !isSaturday)
                              ? "#fef2f2"
                              : isSaturday
                                ? "#eff6ff"
                                : isHoliday
                                  ? "#fef2f2"
                                  : "#ffffff";
                          const dayColor = !isInRange
                            ? "#9ca3af"
                            : dayOfWeek === 0 || isHoliday
                              ? "#ef4444"
                              : dayOfWeek === 6
                                ? "#3b82f6"
                                : "#374151";
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
                                  color: dayColor,
                                  lineHeight: 1.2,
                                }}
                              >
                                {dayNum}
                                {holidayName && isInRange && (
                                  <span style={{ marginLeft: 4, fontSize: 9, color: "#f87171" }}>{holidayName}</span>
                                )}
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
                      {selectedShareItem.consultation.scheduleMemo?.trim() && (
                        <div
                          style={{
                            marginTop: "8px",
                            borderTop: "1px solid #e5e7eb",
                            paddingTop: "6px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: "#374151",
                              marginBottom: "2px",
                            }}
                          >
                            메모
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              lineHeight: 1.4,
                              color: "#1f2937",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedShareItem.consultation.scheduleMemo.trim()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleShareJpgViaMessage()}
                    disabled={!selectedShareItem || shareSavingJpg || jpgPreparing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Image className="h-4 w-4" />
                    {jpgPreparing || shareSavingJpg ? "JPG 준비 중…" : "문자로 JPG 보내기"}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenSms}
                    disabled={!selectedShareItem || sharePhones.length === 0}
                    className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    문자(텍스트만){sharePhones.length > 1 ? ` ${sharePhones.length}명` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={handleKakaoShareSend}
                    disabled={!selectedShareItem}
                    className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-medium text-[#191919] hover:bg-[#FDD835] disabled:opacity-50"
                  >
                    카카오로 보내기
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveShareCalendarAsJpg()}
                    disabled={!selectedShareItem || shareSavingJpg}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Image className="h-4 w-4" />
                    {shareSavingJpg ? "저장 중…" : "JPG 저장"}
                  </button>
                  <button
                    type="button"
                    onClick={closeShareModal}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    닫기
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  JPG 첨부는 휴대폰에서 공유 시트의 <span className="font-medium">메시지/문자</span>를 선택해야
                  합니다. (문자 URL만으로는 이미지 첨부가 불가합니다.)
                </p>
                {sharePhones.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    문자(텍스트만)은 인부 전화번호가 필요합니다. JPG 첨부는 공유 시트에서 수신자를 고르면 됩니다.
                  </p>
                )}
                {readyJpgFile && (
                  <p className="mt-1 text-xs text-emerald-700">
                    JPG 준비됨 ({Math.max(1, Math.round(readyJpgFile.size / 1024))}KB) — 버튼을 눌러 메시지 앱으로
                    첨부하세요.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
