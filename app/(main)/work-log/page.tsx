"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type EstimateItem = { id: number; consultationId?: number; title: string | null; customerName?: string; processOrder?: string[] };
type EstimateDetailItem = {
  processGroup?: string;
  category?: string;
  spec?: string;
  unit?: string;
  qty?: number | string;
  materialUnitPrice?: number | string;
  laborUnitPrice?: number | string;
  unitPrice?: number;
  note?: string;
};
type EstimateDetail = {
  id: number;
  items?: EstimateDetailItem[];
  processOrder?: string[];
};
type PicItem = { id: number; name: string; phone?: string };
type Consultation = { id: number; status?: string };
type WorkLogItem = {
  id: number;
  logDate: string;
  estimateId: number | null;
  picId: number | null;
  content: string;
  expenses?: { label: string; content: string; amount: number }[];
  createdAt: string;
  estimateTitle: string | null;
  picName: string | null;
};

const EXPENSE_DIRECT_INPUT_VALUE = "__direct__"; // 직접입력

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function itemAmount(item: EstimateDetailItem): number {
  const q = Number(item.qty) || 0;
  const mat = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) || 0;
  const labor = Number(item.laborUnitPrice ?? 0) || 0;
  return q * (mat + labor);
}

/** 견적 상세에서 공정별 금액이 0보다 큰 공정 이름만 (processOrder 순서) */
function getPhaseNamesWithAmount(est: EstimateDetail): string[] {
  const order = est.processOrder?.length
    ? est.processOrder.filter((n) => !String(n).startsWith("\u200B"))
    : [];
  const sumByGroup = new Map<string, number>();
  (est.items || []).forEach((item) => {
    const g = (item.processGroup ?? "").trim();
    if (!g || String(g).startsWith("\u200B")) return;
    const amt = itemAmount(item);
    sumByGroup.set(g, (sumByGroup.get(g) ?? 0) + amt);
  });
  if (order.length > 0) {
    return order.filter((name) => (sumByGroup.get(name) ?? 0) > 0);
  }
  return Array.from(sumByGroup.entries())
    .filter(([, amt]) => amt > 0)
    .map(([name]) => name);
}

/** logDate(YYYY-MM-DD 또는 ISO 문자열) → YYYY-MM-DD */
function toLogDateKey(logDate: string): string {
  const s = (logDate || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

export default function WorkLogPage() {
  const [estimates, setEstimates] = useState<EstimateItem[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [pics, setPics] = useState<PicItem[]>([]);
  const [logs, setLogs] = useState<WorkLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompletedForProject, setShowCompletedForProject] = useState(false);

  const [formLogDate, setFormLogDate] = useState("");
  const [formEstimateId, setFormEstimateId] = useState<string>("");
  const [formPicId, setFormPicId] = useState<string>("");
  const [formContent, setFormContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formExpenses, setFormExpenses] = useState<{ label: string; content: string; amount: number }[]>([{ label: "", content: "", amount: 0 }]);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedEstimatePhases, setSelectedEstimatePhases] = useState<string[]>([]);
  const editingIdRef = useRef<number | null>(null);
  editingIdRef.current = editingId;

  useEffect(() => {
    if (!formEstimateId) {
      setSelectedEstimatePhases([]);
      return;
    }
    fetch(`/api/estimates/${formEstimateId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EstimateDetail | null) => {
        if (data) setSelectedEstimatePhases(getPhaseNamesWithAmount(data));
        else setSelectedEstimatePhases([]);
      })
      .catch(() => setSelectedEstimatePhases([]));
  }, [formEstimateId]);

  const expenseLabelOptions = useMemo(() => [...selectedEstimatePhases], [selectedEstimatePhases]);

  /** 프로젝트(견적) 선택 목록: 완료된 목록 보기 꺼짐이면 연결 상담이 완료인 견적 제외 */
  const filteredEstimatesForProject = useMemo(() => {
    if (showCompletedForProject) return estimates;
    return estimates.filter((est) => {
      if (est.consultationId == null) return true;
      const c = consultations.find((x) => x.id === est.consultationId);
      const status = c?.status ?? "";
      return status !== "완료및정산" && status !== "완료";
    });
  }, [estimates, consultations, showCompletedForProject]);

  /** 선택된 견적이 필터 목록에 없으면 목록에 포함 (드롭다운 표시용) */
  const estimatesForProjectSelect = useMemo(() => {
    if (!formEstimateId) return filteredEstimatesForProject;
    const id = Number(formEstimateId);
    if (filteredEstimatesForProject.some((e) => e.id === id)) return filteredEstimatesForProject;
    const selected = estimates.find((e) => e.id === id);
    return selected ? [selected, ...filteredEstimatesForProject] : filteredEstimatesForProject;
  }, [filteredEstimatesForProject, estimates, formEstimateId]);

  const getExpenseSelectValue = (rowLabel: string) => {
    if (!rowLabel) return "";
    if (expenseLabelOptions.includes(rowLabel)) return rowLabel;
    return EXPENSE_DIRECT_INPUT_VALUE;
  };

  const fetchLogs = useCallback((from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    params.set("_t", String(Date.now()));
    return fetch(`/api/company/work-logs?${params}`)
      .then((r) => {
        if (!r.ok) return r.json().then(() => ({}));
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setLogs(data);
          setError(null);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/estimates").then((r) => r.json()),
      fetch("/api/company/pics").then((r) => r.json()),
      fetch("/api/consultations").then((r) => r.json()),
    ])
      .then(([est, picList, consList]) => {
        setEstimates(Array.isArray(est) ? est : []);
        setPics(Array.isArray(picList) ? picList : []);
        setConsultations(Array.isArray(consList) ? consList : []);
      })
      .catch(() => {
        setEstimates([]);
        setPics([]);
        setConsultations([]);
      })
      .finally(() => setLoading(false));
  }, []);

  /** 목록 보기일 때 전체 작업일지 로드 */
  useEffect(() => {
    if (viewMode !== "list") return;
    setLoading(true);
    fetchLogs().finally(() => setLoading(false));
  }, [viewMode]);

  /** 캘린더 보기일 때 해당 월 로드 (수정 중에는 리패치하지 않음 → 작업일 등 폼 덮어쓰기 방지, ref 사용으로 의존 배열 길이 고정) */
  useEffect(() => {
    if (viewMode !== "calendar") return;
    if (editingIdRef.current != null) return;
    const [y, m] = currentMonth.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setLoading(true);
    fetchLogs(first, last).finally(() => setLoading(false));
  }, [viewMode, currentMonth]);

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

  const logsByDay = useCallback(
    (day: string) => logs.filter((log) => toLogDateKey(log.logDate) === day),
    [logs]
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

  const resetForm = () => {
    setFormLogDate(new Date().toISOString().slice(0, 10));
    setFormEstimateId("");
    setFormPicId("");
    setFormContent("");
    setFormExpenses([{ label: "", content: "", amount: 0 }]);
    setEditingId(null);
  };

  const handleSave = () => {
    const logDate = formLogDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      setError("작업일을 선택해 주세요.");
      return;
    }
    setError(null);
    setSaving(true);
    if (editingId != null) {
      fetch(`/api/company/work-logs/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log_date: logDate,
          estimate_id: formEstimateId || null,
          pic_id: formPicId || null,
          content: formContent.trim(),
          expenses: formExpenses.filter((e) => e.label !== "" || e.content !== "" || e.amount !== 0),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            return;
          }
          const id = editingId;
          resetForm();
          // 낙관적 업데이트: 서버에 보낸 logDate로 즉시 반영 (날짜 변경 시 해당 날짜 칸으로 이동)
          setLogs((prev) =>
            prev.map((log) =>
              log.id === id
                ? {
                    ...log,
                    logDate,
                    content: formContent.trim(),
                    expenses: formExpenses.filter((e) => e.label !== "" || e.content !== "" || e.amount !== 0),
                    estimateId: formEstimateId ? Number(formEstimateId) : null,
                    picId: formPicId ? Number(formPicId) : null,
                    estimateTitle: formEstimateId ? (estimates.find((e) => e.id === Number(formEstimateId))?.title ?? null) : null,
                    picName: formPicId ? (pics.find((p) => p.id === Number(formPicId))?.name ?? null) : null,
                  }
                : log
            )
          );
          // 저장 후 refetch 하지 않음 → API/타임존으로 인해 날짜가 다시 덮어써지는 것 방지 (다른 탭/새로고침 시에는 서버 데이터로 로드됨)
        })
        .catch(() => setError("저장에 실패했습니다."))
        .finally(() => setSaving(false));
    } else {
      fetch("/api/company/work-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log_date: logDate,
          estimate_id: formEstimateId || null,
          pic_id: formPicId || null,
          content: formContent.trim(),
          expenses: formExpenses.filter((e) => e.label !== "" || e.content !== "" || e.amount !== 0),
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setError(data.error);
            return;
          }
          resetForm();
          setFormLogDate(new Date().toISOString().slice(0, 10));
          if (viewMode === "calendar") {
            const [y, m] = currentMonth.split("-").map(Number);
            const first = `${y}-${String(m).padStart(2, "0")}-01`;
            const lastDay = new Date(y, m, 0).getDate();
            const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            return fetchLogs(first, last);
          }
          return fetchLogs();
        })
        .then(() => {})
        .catch(() => setError("저장에 실패했습니다."))
        .finally(() => setSaving(false));
    }
  };

  const handleEdit = (log: WorkLogItem) => {
    if (editingId === log.id) return;
    setEditingId(log.id);
    setFormLogDate(toLogDateKey(log.logDate) || log.logDate);
    setFormEstimateId(log.estimateId != null ? String(log.estimateId) : "");
    setFormPicId(log.picId != null ? String(log.picId) : "");
    setFormContent(log.content);
    const ex = log.expenses && log.expenses.length > 0 ? log.expenses : [{ label: "", content: "", amount: 0 }];
    setFormExpenses(ex);
  };

  const handleDelete = (id: number) => {
    if (!confirm("이 작업일지를 삭제할까요?")) return;
    fetch(`/api/company/work-logs/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) alert(data.error);
        else {
          resetForm();
          if (viewMode === "calendar") {
            const [y, m] = currentMonth.split("-").map(Number);
            const first = `${y}-${String(m).padStart(2, "0")}-01`;
            const lastDay = new Date(y, m, 0).getDate();
            const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            fetchLogs(first, last);
          } else fetchLogs();
        }
      })
      .catch(() => alert("삭제에 실패했습니다."));
  };

  useEffect(() => {
    if (editingId != null) return;
    if (!formLogDate) {
      setFormLogDate(new Date().toISOString().slice(0, 10));
    }
  }, [editingId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">작업일지</h1>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {viewMode === "list" ? "캘린더 보기" : "목록 보기"}
        </button>
      </div>

      {/* 추가/수정 폼 (목록·캘린더 공통) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">
          {editingId != null ? "작업일지 수정" : "작업일지 추가"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">작업일</label>
            <input
              type="date"
              value={formLogDate}
              onChange={(e) => setFormLogDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-gray-600">프로젝트(견적)</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={showCompletedForProject}
                  onChange={(e) => setShowCompletedForProject(e.target.checked)}
                  className="rounded border-gray-300"
                />
                완료된 목록 보기
              </label>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={formEstimateId}
                onChange={(e) => setFormEstimateId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">선택 안 함</option>
                {estimatesForProjectSelect.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title || `견적 #${e.id}`} {e.customerName ? ` (${e.customerName})` : ""}
                  </option>
                ))}
              </select>
              {formEstimateId && (
                <Link
                  href={`/settlement?estimateId=${formEstimateId}`}
                  className="no-print shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  정산에서 보기
                </Link>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">담당자</label>
            <select
              value={formPicId}
              onChange={(e) => setFormPicId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">선택 안 함</option>
              {pics.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {pics.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">관리 → 담당자 설정에서 담당자를 등록하세요.</p>
            )}
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">내용</label>
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="작업 내용을 입력하세요"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">지출 금액</span>
            <button
              type="button"
              onClick={() => setFormExpenses((prev) => [...prev, { label: "", content: "", amount: 0 }])}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              + 행 추가
            </button>
          </div>
          <p className="mb-2 text-xs text-gray-500">나중에 정산에서 정리하기 위해 기록합니다. 달력에는 표시되지 않습니다.</p>
          <div className="space-y-2">
            {formExpenses.map((row, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2">
                <select
                  value={getExpenseSelectValue(row.label)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormExpenses((prev) =>
                      prev.map((r, i) =>
                        i === idx
                          ? { ...r, label: v === EXPENSE_DIRECT_INPUT_VALUE ? "" : v }
                          : r
                      )
                    );
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm min-w-[100px]"
                >
                  <option value="">선택 안 함</option>
                  {expenseLabelOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                  <option value={EXPENSE_DIRECT_INPUT_VALUE}>직접입력</option>
                </select>
                {getExpenseSelectValue(row.label) === EXPENSE_DIRECT_INPUT_VALUE && (
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      setFormExpenses((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r))
                      )
                    }
                    placeholder="항목명 입력"
                    className="min-w-[100px] rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                )}
                <input
                  type="text"
                  value={row.content}
                  onChange={(e) =>
                    setFormExpenses((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, content: e.target.value } : r))
                    )
                  }
                  placeholder="내용"
                  className="min-w-[120px] flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={row.amount === 0 ? "" : row.amount.toLocaleString("ko-KR")}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    const num = raw === "" ? 0 : parseInt(raw, 10);
                    if (Number.isNaN(num)) return;
                    setFormExpenses((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, amount: num } : r))
                    );
                  }}
                  placeholder="금액"
                  className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                <span className="text-sm text-gray-500">원</span>
                <button
                  type="button"
                  onClick={() =>
                    setFormExpenses((prev) => (prev.length <= 1 ? [{ label: "", content: "", amount: 0 }] : prev.filter((_, i) => i !== idx)))
                  }
                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : editingId != null ? "수정 저장" : "저장"}
          </button>
          {editingId != null && (
            <>
              <button
                type="button"
                onClick={() => editingId != null && handleDelete(editingId)}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === "list" ? (
        <>
      {/* 목록 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800">작업일지 목록</h2>
        {loading ? (
          <p className="p-6 text-center text-sm text-gray-500">불러오는 중…</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">작성된 작업일지가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100 text-gray-700">
                  <th className="px-4 py-2 font-medium">작업일</th>
                  <th className="px-4 py-2 font-medium">프로젝트</th>
                  <th className="px-4 py-2 font-medium">담당자</th>
                  <th className="px-4 py-2 font-medium">내용</th>
                  <th className="w-24 px-4 py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="px-4 py-2 text-gray-800">{log.logDate}</td>
                    <td className="px-4 py-2 text-gray-700">{log.estimateTitle ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{log.picName ?? "—"}</td>
                    <td className="max-w-xs px-4 py-2 text-gray-700">
                      <span className="line-clamp-2">{log.content || "—"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(log)}
                        className="mr-2 text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(log.id)}
                        className="text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      ) : (
        <>
          {/* 캘린더 뷰 */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              이전 달
            </button>
            <span className="font-semibold text-gray-900">
              {currentMonth.slice(0, 4)}년 {Number(currentMonth.slice(5, 7))}월
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              다음 달
            </button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[600px] rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className="p-2 text-center text-xs font-medium text-gray-600">
                    {wd}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map(({ date, isCurrentMonth, dayNum }) => {
                  const dayLogs = logsByDay(date);
                  return (
                    <div
                      key={date}
                      className={`min-h-[120px] flex flex-col border-b border-r border-gray-100 p-1 last:border-r-0 ${!isCurrentMonth ? "bg-gray-50" : ""}`}
                    >
                      <div
                        className={`shrink-0 text-right text-sm ${isCurrentMonth ? "text-gray-900" : "text-gray-400"}`}
                      >
                        {dayNum}
                      </div>
                      <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto max-h-[200px]">
                        {dayLogs.map((log) => (
                          <button
                            key={log.id}
                            type="button"
                            onClick={() => handleEdit(log)}
                            className="block w-full rounded border border-blue-200 bg-blue-50 px-1.5 py-1 text-left text-xs hover:bg-blue-100"
                          >
                            <div className="truncate font-medium text-blue-900">
                              {log.estimateTitle || "—"}
                            </div>
                            <div className="truncate text-gray-600">{log.picName || "—"}</div>
                            <div className="truncate text-gray-500">{log.content || "—"}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {loading && (
            <p className="text-center text-sm text-gray-500">해당 월 작업일지를 불러오는 중…</p>
          )}
        </>
      )}
    </div>
  );
}
