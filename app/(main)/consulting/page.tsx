"use client";

import React, { useEffect, useRef, useState } from "react";

/** 오늘 날짜 00:00 기준 (datetime-local 형식). 오늘·이후만 선택 가능하게 min에 사용 */
function getTodayDatetimeLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00`;
}

/** 오늘 날짜 (type="date"용 YYYY-MM-DD). 기준날짜/기본값용 */
function getTodayDateLocal(): string {
  return getTodayDatetimeLocal().slice(0, 10);
}

type Consultation = {
  id: number;
  customerName: string;
  contact: string;
  address: string;
  pyung: number;
  status: string;
  pic: string;
  note?: string;
  consultedAt?: string;
  siteMeasurementAt?: string;
  estimateMeetingAt?: string;
  materialMeetingAt?: string;
  contractMeetingAt?: string;
  designMeetingAt?: string;
  constructionStartAt?: string;
  moveInAt?: string;
  scope?: string[];
  budget?: string;
  completionYear?: string;
  date: string;
  consultedDone?: boolean;
  siteMeasurementDone?: boolean;
  estimateMeetingDone?: boolean;
  materialMeetingDone?: boolean;
  contractMeetingDone?: boolean;
  designMeetingDone?: boolean;
};

/** 시공예산 숫자 → 콤마 포맷 (예: 33000000 → "33,000,000") */
function formatBudgetDisplay(value: string | number | undefined): string {
  const num = typeof value === "string" ? value.replace(/\D/g, "") : String(value ?? "").replace(/\D/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("ko-KR");
}

/** 시공예산 입력(콤마 포함) → 저장용 숫자 문자열 */
function parseBudgetToSave(display: string): string {
  const num = display.replace(/\D/g, "");
  return num;
}

type PicItem = { id: number; name: string };

/** 진행상태 옵션 (상담종료 제거) */
const STATUS_OPTIONS = ["접수", "현장실측", "견적미팅", "견적완료", "자재미팅", "계약서 작성 미팅", "디자인미팅", "계약완료", "취소/보류", "완료"] as const;

/** 견적완료 이상이면 접수/현장실측/견적미팅 선택 비활성화 */
const STATUS_LOCKED_AFTER = ["견적완료", "자재미팅", "계약서 작성 미팅", "디자인미팅", "계약완료", "취소/보류", "완료"] as const;
function isStatusLockedEarly(savedStatus: string): boolean {
  return (STATUS_LOCKED_AFTER as readonly string[]).includes(savedStatus);
}

/** DB 저장값 → 화면 표시용 (구 라벨 호환) */
function normalizeStatusDisplay(status: string | undefined): string {
  if (!status) return "접수";
  const map: Record<string, string> = { 상담종단: "상담종료", 계약: "계약완료", 취소: "취소/보류" };
  return map[status] || status;
}

function DetailModal({
  data,
  editId,
  picList,
  onClose,
  onSaved,
}: {
  data: Consultation;
  editId: number | null;
  /** 관리에서 설정한 담당자 목록 */
  picList: PicItem[];
  onClose: () => void;
  /** 저장 후 목록 갱신. Promise를 반환하면 완료 후 모달을 닫음 */
  onSaved: () => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const siteMeasurementInputRef = useRef<HTMLInputElement | null>(null);
  const estimateMeetingInputRef = useRef<HTMLInputElement | null>(null);
  const materialMeetingInputRef = useRef<HTMLInputElement | null>(null);
  const contractMeetingInputRef = useRef<HTMLInputElement | null>(null);
  const designMeetingInputRef = useRef<HTMLInputElement | null>(null);
  const [statusSelection, setStatusSelection] = useState(normalizeStatusDisplay(data.status) || "접수");
  const defaultScopeItems = [
    "샤시제외", "전체시공", "도배", "바닥", "거실욕실", "안방욕실", "싱크대", "전기조명",
    "중문", "확장", "방수", "신발장", "붙박이장", "화장대", "문교체",
  ];
  const [scopeItems, setScopeItems] = useState<string[]>(() =>
    data.scope?.length
      ? [...new Set([...defaultScopeItems, ...data.scope])]
      : defaultScopeItems
  );
  const [scopeEditOpen, setScopeEditOpen] = useState(false);
  const [scopeNewItem, setScopeNewItem] = useState("");
  const [postcode, setPostcode] = useState(() => {
    if (!data.address?.trim()) return "";
    return data.address.slice(0, 5).replace(/\D/g, "") || "";
  });
  const [roadAddress, setRoadAddress] = useState(() => {
    const rest = data.address?.replace(/^\d+\s*/, "").trim();
    if (!rest) return "";
    const parts = rest.split(/\s+/);
    const last = parts.pop() ?? "";
    return last ? parts.join(" ") || rest : rest;
  });
  const [detailAddress, setDetailAddress] = useState(() => {
    const rest = data.address?.replace(/^\d+\s*/, "").trim();
    if (!rest) return "";
    const parts = rest.split(/\s+/);
    const last = parts.pop() ?? "";
    return last || "";
  });
  const [budgetDisplay, setBudgetDisplay] = useState(() =>
    formatBudgetDisplay(data.budget ?? "33000000")
  );
  const [consultedDone, setConsultedDone] = useState(!!data.consultedDone);
  const [siteMeasurementDone, setSiteMeasurementDone] = useState(!!data.siteMeasurementDone);
  const [estimateMeetingDone, setEstimateMeetingDone] = useState(!!data.estimateMeetingDone);
  const [materialMeetingDone, setMaterialMeetingDone] = useState(!!data.materialMeetingDone);
  const [contractMeetingDone, setContractMeetingDone] = useState(!!data.contractMeetingDone);
  const [designMeetingDone, setDesignMeetingDone] = useState(!!data.designMeetingDone);

  const handleSearchAddress = () => {
    if (typeof window === "undefined") return;

    const openPostcode = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { daum } = window as any;
      if (!daum || !daum.Postcode) return;

      new daum.Postcode({
        oncomplete: (result: {
          zonecode: string;
          roadAddress: string;
          buildingName?: string;
        }) => {
          setPostcode(result.zonecode);
          const road = result.roadAddress || "";
          setRoadAddress(
            result.buildingName ? `${road} ${result.buildingName}` : road
          );
          setDetailAddress("");
        },
      }).open();
    };

    // 스크립트가 없으면 먼저 로드
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (!w.daum || !w.daum.Postcode) {
      const script = document.createElement("script");
      script.src =
        "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.async = true;
      script.onload = openPostcode;
      document.body.appendChild(script);
    } else {
      openPostcode();
    }
  };

  const buildPayload = () => {
    if (!formRef.current) return null;
    const fd = new FormData(formRef.current);
    const road = roadAddress.trim();
    const detail = detailAddress.trim();
    // 상세주소가 이미 도로명 주소 끝에 있으면 중복으로 붙이지 않음
    const fullRoad = detail && road.endsWith(detail) ? road : [road, detail].filter(Boolean).join(" ");
    const address = `${postcode} ${fullRoad}`.trim();
    const scope = scopeItems.filter((label) => fd.get(`scope_${label}`) === "on");
    const budget = parseBudgetToSave(budgetDisplay);
    return {
      customerName: (fd.get("customerName") as string) ?? data.customerName,
      contact: (fd.get("contact") as string) ?? data.contact,
      address,
      pyung: Number(fd.get("pyung")) || data.pyung,
      status: statusSelection,
      pic: (fd.get("pic") as string) ?? data.pic,
      note: (fd.get("note") as string) ?? "",
      consultedAt: consultedDone ? (data.consultedAt ?? undefined) : ((fd.get("consultedAt") as string) || undefined),
      siteMeasurementAt: siteMeasurementDone ? (data.siteMeasurementAt ?? undefined) : ((fd.get("siteMeasurementAt") as string)?.trim() || undefined),
      estimateMeetingAt: estimateMeetingDone ? (data.estimateMeetingAt ?? undefined) : ((fd.get("estimateMeetingAt") as string)?.trim() || undefined),
      materialMeetingAt: materialMeetingDone ? (data.materialMeetingAt ?? undefined) : ((fd.get("materialMeetingAt") as string)?.trim() || undefined),
      contractMeetingAt: contractMeetingDone ? (data.contractMeetingAt ?? undefined) : ((fd.get("contractMeetingAt") as string)?.trim() || undefined),
      designMeetingAt: designMeetingDone ? (data.designMeetingAt ?? undefined) : ((fd.get("designMeetingAt") as string)?.trim() || undefined),
      constructionStartAt: (fd.get("constructionStartAt") as string)?.trim() || undefined,
      moveInAt: (fd.get("moveInAt") as string)?.trim() || undefined,
      scope,
      budget: budget || undefined,
      completionYear: (fd.get("completionYear") as string)?.trim() || undefined,
      ...(editId !== null && editId > 0
        ? {
            consultedDone,
            siteMeasurementDone,
            estimateMeetingDone,
            materialMeetingDone,
            contractMeetingDone,
            designMeetingDone,
          }
        : {}),
    };
  };

  const handleAction = (mode: "save" | "estimate") => {
    if (!formRef.current) return;
    const payload = buildPayload();
    if (!payload) return;

    if (mode === "save") {
      // editId가 있으면 무조건 수정(PATCH), 없으면 신규(POST)
      const isEdit = editId !== null && editId > 0;
      const url = isEdit
        ? `/api/consultations/${editId}`
        : "/api/consultations";
      const method = isEdit ? "PATCH" : "POST";

      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error((data as { error?: string }).error || "저장 실패");
          alert(isEdit ? "상담이 수정되었습니다." : "상담이 등록되었습니다.");
          const saved = onSaved();
          if (saved && typeof (saved as Promise<unknown>).then === "function") await saved;
          onClose();
        })
        .catch((e) => {
          alert(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
        });
      return;
    }

    const q = data.id > 0 ? `?consultationId=${data.id}` : "";
    window.location.href = `/estimate${q}`;
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            handleAction("save");
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
            e.preventDefault();
            handleAction("save");
          }}
        >
          {/* 상단 제목/닫기 */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">상담 상세</h2>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

        {/* 진행상태 */}
        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            진행상태
          </h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {STATUS_OPTIONS.map((label) => {
              const disabled = ["접수", "현장실측", "견적미팅"].includes(label) && isStatusLockedEarly(normalizeStatusDisplay(data.status));
              return (
                <label
                  key={label}
                  htmlFor={`status-${label}`}
                  className={`flex items-center gap-1 ${disabled ? "cursor-not-allowed text-gray-400" : "cursor-pointer"}`}
                  onClick={() => !disabled && setStatusSelection(label)}
                >
                  <input
                    id={`status-${label}`}
                    type="radio"
                    name="status"
                    value={label}
                    checked={statusSelection === label}
                    disabled={disabled}
                    onChange={() => !disabled && setStatusSelection(label)}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </section>

        {/* 자재미팅날짜 (자재미팅 선택 시 또는 저장된 자재미팅날짜가 있으면 표시, 위쪽) */}
        {(statusSelection === "자재미팅" || data.materialMeetingAt) && (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold text-gray-700">자재미팅날짜</p>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
              <span className="whitespace-nowrap text-gray-700">자재미팅날짜</span>
              <input
                ref={materialMeetingInputRef}
                name="materialMeetingAt"
                type="datetime-local"
                className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${materialMeetingDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
                defaultValue={data.materialMeetingAt ? data.materialMeetingAt.slice(0, 16) : getTodayDatetimeLocal()}
                disabled={materialMeetingDone}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={materialMeetingDone} onChange={() => setMaterialMeetingDone((v) => !v)} className="rounded border-gray-300" />
                <span className="text-gray-700">완료</span>
              </label>
            </div>
          </section>
        )}

        {/* 견적미팅날짜 (견적미팅 선택 시 또는 저장된 견적미팅날짜가 있으면 표시) */}
        {(statusSelection === "견적미팅" || data.estimateMeetingAt) && (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold text-gray-700">견적미팅날짜</p>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
              <span className="whitespace-nowrap text-gray-700">견적미팅날짜</span>
              <input
                ref={estimateMeetingInputRef}
                name="estimateMeetingAt"
                type="datetime-local"
                className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${estimateMeetingDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
                defaultValue={data.estimateMeetingAt ? data.estimateMeetingAt.slice(0, 16) : getTodayDatetimeLocal()}
                disabled={estimateMeetingDone}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={estimateMeetingDone} onChange={() => setEstimateMeetingDone((v) => !v)} className="rounded border-gray-300" />
                <span className="text-gray-700">완료</span>
              </label>
            </div>
          </section>
        )}

        {/* 계약서 작성 미팅날짜 (계약서 작성 미팅 선택 시 또는 저장된 날짜가 있으면 표시) */}
        {(statusSelection === "계약서 작성 미팅" || data.contractMeetingAt) && (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold text-gray-700">계약서 작성 미팅날짜</p>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
              <span className="whitespace-nowrap text-gray-700">계약서 작성 미팅날짜</span>
              <input
                ref={contractMeetingInputRef}
                name="contractMeetingAt"
                type="datetime-local"
                className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${contractMeetingDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
                defaultValue={data.contractMeetingAt ? data.contractMeetingAt.slice(0, 16) : getTodayDatetimeLocal()}
                disabled={contractMeetingDone}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={contractMeetingDone} onChange={() => setContractMeetingDone((v) => !v)} className="rounded border-gray-300" />
                <span className="text-gray-700">완료</span>
              </label>
            </div>
          </section>
        )}

        {/* 디자인미팅날짜 (디자인미팅 선택 시 또는 저장된 날짜가 있으면 표시) */}
        {(statusSelection === "디자인미팅" || data.designMeetingAt) && (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold text-gray-700">디자인미팅날짜</p>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
              <span className="whitespace-nowrap text-gray-700">디자인미팅날짜</span>
              <input
                ref={designMeetingInputRef}
                name="designMeetingAt"
                type="datetime-local"
                className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${designMeetingDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
                defaultValue={data.designMeetingAt ? data.designMeetingAt.slice(0, 16) : getTodayDatetimeLocal()}
                disabled={designMeetingDone}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={designMeetingDone} onChange={() => setDesignMeetingDone((v) => !v)} className="rounded border-gray-300" />
                <span className="text-gray-700">완료</span>
              </label>
            </div>
          </section>
        )}

        {/* 현장실측날짜 (진행상태가 현장실측일 때 또는 저장된 현장실측날짜가 있으면 표시 유지) */}
        {(statusSelection === "현장실측" || data.siteMeasurementAt) && (
          <section className="mb-5">
            <p className="mb-2 text-sm font-semibold text-gray-700">현장실측날짜</p>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
              <span className="whitespace-nowrap text-gray-700">현장실측날짜</span>
              <input
                ref={siteMeasurementInputRef}
                name="siteMeasurementAt"
                type="datetime-local"
                className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${siteMeasurementDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
                defaultValue={data.siteMeasurementAt ? data.siteMeasurementAt.slice(0, 16) : getTodayDatetimeLocal()}
                disabled={siteMeasurementDone}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={siteMeasurementDone} onChange={() => setSiteMeasurementDone((v) => !v)} className="rounded border-gray-300" />
                <span className="text-gray-700">완료</span>
              </label>
            </div>
          </section>
        )}

        {/* 상담 예약날짜 */}
        <section className="mb-5">
          <p className="mb-2 text-sm font-semibold text-gray-700">상담 예약날짜</p>
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:flex-row md:items-center md:gap-4">
            <span className="whitespace-nowrap text-gray-700">상담 예약날짜</span>
            <input
              ref={dateInputRef}
              id="consulting-datetime"
              name="consultedAt"
              type="datetime-local"
              className={`w-72 max-w-[330px] rounded-lg border border-gray-300 px-3 py-2 text-sm ${consultedDone ? "cursor-not-allowed bg-gray-100 text-gray-500" : "cursor-pointer bg-white"}`}
              defaultValue={data.consultedAt ? data.consultedAt.slice(0, 16) : getTodayDatetimeLocal()}
              disabled={consultedDone}
              onClick={(e) => e.stopPropagation()}
            />
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={consultedDone} onChange={() => setConsultedDone((v) => !v)} className="rounded border-gray-300" />
              <span className="text-gray-700">완료</span>
            </label>
          </div>
        </section>

        {/* 기본 정보 */}
        <section className="mb-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                고객이름
              </label>
              <input
                type="text"
                name="customerName"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue={data.customerName}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                연락처
              </label>
              <input
                type="text"
                name="contact"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue={data.contact}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              주소
            </label>
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSearchAddress}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-white"
              >
                검색
              </button>
            </div>
            <input
              type="text"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={roadAddress}
              onChange={(e) => setRoadAddress(e.target.value)}
              placeholder="도로명 주소"
            />
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              아파트명, 상세주소
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={detailAddress}
              onChange={(e) => setDetailAddress(e.target.value)}
              placeholder="예: L앞산아파트 202호"
            />
          </div>
        </section>

        {/* 평수, 준공연도, 공사 시작 날짜, 입주일자 */}
        <section className="mb-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                평수
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  name="pyung"
                  min={1}
                  max={999}
                  defaultValue={data.pyung || 0}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="text-sm text-gray-600">평</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                공사 시작 날짜
              </label>
              <input
                type="date"
                name="constructionStartAt"
                className="w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue={data.constructionStartAt?.slice(0, 10) || getTodayDateLocal()}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                준공년도
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  name="completionYear"
                  inputMode="numeric"
                  maxLength={4}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  defaultValue={data.completionYear ?? ""}
                  placeholder="2002"
                />
                <span className="text-sm text-gray-600">년</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                입주일자
              </label>
              <input
                type="date"
                name="moveInAt"
                className="w-full cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue={data.moveInAt?.slice(0, 10) || getTodayDateLocal()}
              />
            </div>
          </div>
        </section>

        {/* 시공범위 / 예산 / 담당자 / 요청사항 */}
        <section className="mb-5 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">
                시공범위
              </label>
              <button
                type="button"
                onClick={() => setScopeEditOpen(true)}
                className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                수정/추가
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {scopeItems.map((label, idx) => (
                <label
                  key={`${label}-${idx}`}
                  className="flex cursor-pointer items-center gap-1"
                >
                  <input
                    type="checkbox"
                    name={`scope_${label}`}
                    defaultChecked={
                      data.scope
                        ? data.scope.includes(label)
                        : idx < 2 || label === "중문" || label === "확장"
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {scopeEditOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
                <h3 className="mb-4 text-base font-semibold text-gray-900">
                  시공범위 수정/추가
                </h3>
                <div className="mb-4 flex gap-2">
                  <input
                    type="text"
                    value={scopeNewItem}
                    onChange={(e) => setScopeNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (scopeNewItem.trim()) {
                          setScopeItems([...scopeItems, scopeNewItem.trim()]);
                          setScopeNewItem("");
                        }
                      }
                    }}
                    placeholder="새 항목 입력 후 추가"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (scopeNewItem.trim()) {
                        setScopeItems([...scopeItems, scopeNewItem.trim()]);
                        setScopeNewItem("");
                      }
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    추가
                  </button>
                </div>
                <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm">
                  {scopeItems.map((item, idx) => (
                    <li
                      key={`${item}-${idx}`}
                      className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-100"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setScopeItems(scopeItems.filter((_, i) => i !== idx))
                        }
                        className="rounded px-2 py-0.5 text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setScopeEditOpen(false);
                      setScopeNewItem("");
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                시공예산
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={budgetDisplay}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setBudgetDisplay(raw ? Number(raw).toLocaleString("ko-KR") : "");
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-right tabular-nums"
                  placeholder="0"
                />
                <span className="text-sm text-gray-700">원</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                담당자
              </label>
              <select
                name="pic"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                defaultValue={data.pic}
              >
                <option value="">선택</option>
                {picList.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              요청사항
            </label>
            <textarea
              name="note"
              className="h-24 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
              defaultValue={data.note ?? "빠른시공"}
            />
          </div>
        </section>

          {/* 하단 버튼 */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => handleAction("estimate")}
              className="rounded-lg border border-gray-400 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              견적작성
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 진행상태에 맞는 진행날짜 값 선택 (목록 표시용) */
function getProgressDateDisplay(item: Consultation): string {
  // 계약완료, 취소/보류, 완료는 진행날짜 표기 없음
  if (["계약완료", "취소/보류", "완료"].includes(item.status)) return "-";
  const raw =
    item.status === "자재미팅" && item.materialMeetingAt
      ? item.materialMeetingAt
      : item.status === "견적미팅" && item.estimateMeetingAt
        ? item.estimateMeetingAt
        : item.status === "계약서 작성 미팅" && item.contractMeetingAt
          ? item.contractMeetingAt
          : item.status === "디자인미팅" && item.designMeetingAt
            ? item.designMeetingAt
            : item.status === "현장실측" && item.siteMeasurementAt
              ? item.siteMeasurementAt
              : item.consultedAt || item.date || "";
  if (!raw) return "-";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "-";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, "0");
    const ampm = h < 12 ? "AM" : "PM";
    const hour = h % 12 || 12;
    return `${y}.${m}.${day} ${ampm}${String(hour).padStart(2, "0")}:${min}`;
  } catch {
    return "-";
  }
}

const emptyConsultation: Consultation = {
  id: 0,
  customerName: "",
  contact: "",
  address: "",
  pyung: 0,
  status: "접수",
  pic: "",
  budget: undefined,
  completionYear: undefined,
  siteMeasurementAt: undefined,
  estimateMeetingAt: undefined,
  materialMeetingAt: undefined,
  contractMeetingAt: undefined,
  designMeetingAt: undefined,
  date: "",
};

/** 접수기간 프리셋: 금일/작일/당월 날짜 범위 */
function getDatePresetRange(preset: "금일" | "작일" | "당월"): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  if (preset === "금일") return { from: todayStr, to: todayStr };
  if (preset === "작일") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yd = String(yesterday.getDate()).padStart(2, "0");
    const ym = String(yesterday.getMonth() + 1).padStart(2, "0");
    return { from: `${yesterday.getFullYear()}-${ym}-${yd}`, to: `${yesterday.getFullYear()}-${ym}-${yd}` };
  }
  const first = `${y}-${m}-01`;
  const last = new Date(y, today.getMonth() + 1, 0);
  const lastStr = `${y}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return { from: first, to: lastStr };
}

export default function ConsultingPage() {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [active, setActive] = useState<Consultation | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [picList, setPicList] = useState<PicItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [filterCustomerName, setFilterCustomerName] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPic, setFilterPic] = useState("");
  const [filterPyungMin, setFilterPyungMin] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterDatePreset, setFilterDatePreset] = useState<"" | "금일" | "작일" | "당월">("");

  const filteredConsultations = React.useMemo(() => {
    return consultations.filter((item) => {
      if (filterCustomerName.trim()) {
        if (!item.customerName?.toLowerCase().includes(filterCustomerName.trim().toLowerCase())) return false;
      }
      if (filterStatus) {
        if (item.status !== filterStatus) return false;
      }
      if (filterPic) {
        if (item.pic !== filterPic) return false;
      }
      const pyungMin = filterPyungMin.replace(/\D/g, "");
      if (pyungMin && item.pyung < Number(pyungMin)) return false;
      if (filterDateFrom || filterDateTo) {
        const consultDate = item.consultedAt?.slice(0, 10) ?? item.date?.slice(0, 10) ?? "";
        if (filterDateFrom && consultDate < filterDateFrom) return false;
        if (filterDateTo && consultDate > filterDateTo) return false;
      }
      return true;
    });
  }, [consultations, filterCustomerName, filterStatus, filterPic, filterPyungMin, filterDateFrom, filterDateTo]);

  const loadFromDb = (): Promise<void> => {
    return fetch("/api/consultations")
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        setConsultations(
          data.map((item: Record<string, unknown>) => ({
            id: Number(item.id),
            customerName: String(item.customerName ?? item.customer_name ?? ""),
            contact: String(item.contact ?? ""),
            address: String(item.address ?? ""),
            pyung: Number(item.pyung ?? 0),
            status: normalizeStatusDisplay(String(item.status ?? "")),
            pic: String(item.pic ?? ""),
            note: item.note != null ? String(item.note) : undefined,
            consultedAt: item.consultedAt != null ? String(item.consultedAt) : undefined,
            siteMeasurementAt: item.siteMeasurementAt != null ? String(item.siteMeasurementAt) : undefined,
            estimateMeetingAt: item.estimateMeetingAt != null ? String(item.estimateMeetingAt) : undefined,
            materialMeetingAt: item.materialMeetingAt != null ? String(item.materialMeetingAt) : undefined,
            contractMeetingAt: item.contractMeetingAt != null ? String(item.contractMeetingAt) : undefined,
            designMeetingAt: item.designMeetingAt != null ? String(item.designMeetingAt) : undefined,
            scope: Array.isArray(item.scope) ? (item.scope as string[]) : undefined,
            budget: item.budget != null ? String(item.budget) : undefined,
            completionYear: item.completionYear != null ? String(item.completionYear) : undefined,
            date: "",
            consultedDone: Boolean(item.consultedDone),
            siteMeasurementDone: Boolean(item.siteMeasurementDone),
            estimateMeetingDone: Boolean(item.estimateMeetingDone),
            materialMeetingDone: Boolean(item.materialMeetingDone),
            contractMeetingDone: Boolean(item.contractMeetingDone),
            designMeetingDone: Boolean(item.designMeetingDone),
          }))
        );
      })
      .catch((err) => {
        console.error("consultations load error", err);
      });
  };

  useEffect(() => {
    loadFromDb();
  }, []);

  useEffect(() => {
    fetch("/api/company/pics")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setPicList(data);
      })
      .catch(() => {});
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredConsultations.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSearch = () => {
    loadFromDb();
  };

  const handleDownload = () => {
    const rows = filteredConsultations.map((c) => ({
      No: c.id,
      진행상태: c.status,
      진행날짜: getProgressDateDisplay(c),
      고객명: c.customerName,
      연락처: c.contact,
      주소: c.address,
      평수: c.pyung,
    }));
    const header = "No,진행상태,진행날짜,고객명,연락처,주소,평수\n";
    const csv = header + rows.map((r) => `"${r.No}","${(r.진행상태 ?? "").replace(/"/g, '""')}","${(r.진행날짜 ?? "").replace(/"/g, '""')}","${(r.고객명 ?? "").replace(/"/g, '""')}","${(r.연락처 ?? "").replace(/"/g, '""')}","${(r.주소 ?? "").replace(/"/g, '""')}","${r.평수 ?? ""}"`).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `상담목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      alert("삭제할 상담을 선택해 주세요.");
      return;
    }
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요?`)) return;
    const ids = Array.from(selectedIds);
    Promise.all(
      ids.map((id) =>
        fetch(`/api/consultations/${id}`, { method: "DELETE" })
      )
    )
      .then((responses) => {
        const failed = responses.filter((r) => !r.ok);
        if (failed.length > 0) {
          alert(`일부 삭제에 실패했습니다. (${failed.length}건)`);
        } else {
          alert(`${ids.length}건 삭제되었습니다.`);
        }
        setSelectedIds(new Set());
        loadFromDb();
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  return (
    <div className="min-h-screen bg-white p-3 sm:p-6">
      <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl font-bold text-gray-800">
        상담 <span className="text-blue-600">({filteredConsultations.length})</span>건
      </h2>

      <div className="mb-4 sm:mb-6 rounded-lg border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-sm font-bold text-gray-600">고객명</label>
            <input
              type="text"
              value={filterCustomerName}
              onChange={(e) => setFilterCustomerName(e.target.value)}
              placeholder="고객명 입력"
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-sm font-bold text-gray-600">
              진행상태
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">선택</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-20 shrink-0 text-sm font-bold text-gray-600">
              담당자명
            </label>
            <select
              value={filterPic}
              onChange={(e) => setFilterPic(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">전체</option>
              {picList.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <label className="w-20 shrink-0 text-sm font-bold text-gray-600">
                평수
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={filterPyungMin}
                  onChange={(e) => setFilterPyungMin(e.target.value.replace(/\D/g, ""))}
                  className="w-20 rounded border border-gray-300 px-2 py-1.5 text-right text-sm"
                />
                <span className="text-sm text-gray-600">평 이상</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="w-20 shrink-0 text-sm font-bold text-gray-600">
                접수기간
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="radio"
                  name="datePreset"
                  checked={filterDatePreset === "금일"}
                  onChange={() => {
                    setFilterDatePreset("금일");
                    const { from, to } = getDatePresetRange("금일");
                    setFilterDateFrom(from);
                    setFilterDateTo(to);
                  }}
                />
                금일
              </label>
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="radio"
                  name="datePreset"
                  checked={filterDatePreset === "작일"}
                  onChange={() => {
                    setFilterDatePreset("작일");
                    const { from, to } = getDatePresetRange("작일");
                    setFilterDateFrom(from);
                    setFilterDateTo(to);
                  }}
                />
                작일
              </label>
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="radio"
                  name="datePreset"
                  checked={filterDatePreset === "당월"}
                  onChange={() => {
                    setFilterDatePreset("당월");
                    const { from, to } = getDatePresetRange("당월");
                    setFilterDateFrom(from);
                    setFilterDateTo(to);
                  }}
                />
                당월
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] shrink-0 rounded border border-green-500 bg-white px-4 py-2 text-sm font-bold text-green-600 hover:bg-green-50 active:bg-green-100"
            >
              다운로드
            </button>
            <button
              type="button"
              onClick={handleSearch}
              className="min-h-[44px] shrink-0 rounded bg-blue-600 px-6 py-2 text-sm font-bold text-white hover:bg-blue-700 active:bg-blue-800"
            >
              검색
            </button>
          </div>
        </div>
      </div>

      <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[640px] text-center text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
            <tr>
              <th className="w-10 shrink-0 p-2 sm:p-3 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={filteredConsultations.length > 0 && selectedIds.size === filteredConsultations.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="cursor-pointer"
                />
              </th>
              <th className="w-14 shrink-0 p-2 sm:p-3 whitespace-nowrap">No.</th>
              <th className="min-w-[72px] shrink-0 p-2 sm:p-3 whitespace-nowrap">진행상태</th>
              <th className="min-w-[100px] shrink-0 p-2 sm:p-3 whitespace-nowrap">진행날짜</th>
              <th className="min-w-[72px] shrink-0 p-2 sm:p-3 whitespace-nowrap">고객명</th>
              <th className="min-w-[90px] shrink-0 p-2 sm:p-3 whitespace-nowrap">연락처</th>
              <th className="min-w-[120px] p-2 sm:p-3 text-left">주소</th>
              <th className="w-14 shrink-0 p-2 sm:p-3 whitespace-nowrap">평수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredConsultations.map((item, idx) => (
              <tr key={item.id} className="text-gray-700 hover:bg-gray-50">
                <td className="p-2 sm:p-3 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => handleToggleSelect(item.id)}
                    className="cursor-pointer"
                  />
                </td>
                <td className="p-2 sm:p-3 whitespace-nowrap">{idx + 1}</td>
                <td className="p-2 sm:p-3 whitespace-nowrap">{item.status || "-"}</td>
                <td className="p-2 sm:p-3 whitespace-nowrap">{getProgressDateDisplay(item)}</td>
                <td className="min-w-[72px] p-2 sm:p-3 font-medium whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActive(item);
                      setEditId(item.id);
                    }}
                    className="text-blue-600 underline-offset-2 hover:underline"
                  >
                    {item.customerName}
                  </button>
                </td>
                <td className="p-2 sm:p-3 whitespace-nowrap">{item.contact}</td>
                <td className="min-w-[120px] max-w-[200px] sm:max-w-none p-2 sm:p-3 truncate text-left">{item.address}</td>
                <td className="p-2 sm:p-3 whitespace-nowrap">{item.pyung}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="w-20">
          <input
            type="text"
            value="20"
            readOnly
            className="w-full rounded border border-gray-300 px-2 py-1 text-center text-sm"
          />
        </div>

        <div className="flex gap-1">
          <button type="button" className="h-9 w-9 min-w-[36px] rounded border text-gray-500 hover:bg-gray-50 active:bg-gray-100" aria-label="처음">
            «
          </button>
          <button type="button" className="h-9 w-9 min-w-[36px] rounded border text-gray-500 hover:bg-gray-50 active:bg-gray-100" aria-label="이전">
            ‹
          </button>
          <button type="button" className="h-9 w-9 min-w-[36px] rounded border border-blue-200 bg-white font-bold text-blue-600">
            01
          </button>
          <button type="button" className="h-9 w-9 min-w-[36px] rounded border text-gray-500 hover:bg-gray-50 active:bg-gray-100" aria-label="다음">
            ›
          </button>
          <button type="button" className="h-9 w-9 min-w-[36px] rounded border text-gray-500 hover:bg-gray-50 active:bg-gray-100" aria-label="마지막">
            »
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-[44px] rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100">
            고객평가 전송
          </button>
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="min-h-[44px] rounded border border-red-400 bg-white px-4 py-2 text-sm text-red-500 hover:bg-red-50 active:bg-red-100"
          >
            선택삭제
          </button>
          <button
            type="button"
            onClick={() => {
              setActive(emptyConsultation);
              setEditId(null);
            }}
            className="min-h-[44px] rounded border border-blue-500 bg-white px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50 active:bg-blue-100"
          >
            신규등록
          </button>
        </div>
      </div>
      {active && (
        <DetailModal
          key={editId === null ? "new" : `edit-${editId}`}
          data={active}
          editId={editId}
          picList={picList}
          onClose={() => {
            setActive(null);
            setEditId(null);
          }}
          onSaved={loadFromDb}
        />
      )}
    </div>
  );
}
