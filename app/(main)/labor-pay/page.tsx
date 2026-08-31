"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { compareImportantFirst } from "@/lib/importantSort";

type Estimate = {
  id: number;
  consultationId?: number;
  customerName?: string;
  contact?: string;
  title?: string;
  displayTitle?: string;
  estimateDate?: string;
};

type Consultation = {
  id: number;
  status?: string;
  isImportant?: boolean;
};

function formatDateYMD(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function LaborPayListPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/estimates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/consultations", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([estData, consData]) => {
        if (Array.isArray(estData)) setEstimates(estData as Estimate[]);
        else setError((estData as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
        if (Array.isArray(consData)) setConsultations(consData as Consultation[]);
        else setConsultations([]);
      })
      .catch(() => setError("내역서 요청 목록을 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  const filteredEstimates = useMemo(() => {
    return estimates
      .filter((est) => {
        if (est.consultationId == null) return false;
        const c = consultations.find((x) => x.id === est.consultationId);
        if (!c) return false;
        if (showCompleted) return true;
        const status = c.status ?? "";
        return status !== "완료및정산" && status !== "완료";
      })
      .sort((a, b) => {
        const aImp = consultations.find((c) => c.id === a.consultationId)?.isImportant;
        const bImp = consultations.find((c) => c.id === b.consultationId)?.isImportant;
        const imp = compareImportantFirst(aImp, bImp);
        if (imp !== 0) return imp;
        return (b.id ?? 0) - (a.id ?? 0);
      });
  }, [estimates, consultations, showCompleted]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
        <Banknote className="h-6 w-6 text-slate-600" />
        내역서 요청
      </h1>
      <p className="text-sm text-gray-500">
        현장을 선택한 뒤 인부를 지정하고 링크를 보내면, 인부가 금액·내용을 적어 회신합니다.
      </p>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="text-sm font-medium text-gray-700">현장(견적) 선택</label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-gray-300"
            />
            완료된 항목 보기
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
              <tr>
                <th className="row-actions-sticky min-w-[10rem] p-2 font-semibold sm:p-3">프로젝트 제목</th>
                <th className="p-2 sm:p-3 font-semibold">견적일자</th>
                <th className="p-2 sm:p-3 font-semibold">고객명</th>
                <th className="p-2 sm:p-3 font-semibold">연락처</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : estimates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    저장된 견적이 없습니다. 견적서 작성에서 먼저 견적을 저장해 주세요.
                  </td>
                </tr>
              ) : filteredEstimates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    표시할 견적이 없습니다. &apos;완료된 항목 보기&apos;를 켜 보세요.
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((est) => {
                  const shownTitle = (est.displayTitle || est.title || "").trim() || "제목 없음";
                  const titleLink = (
                    <Link href={`/labor-pay/${est.id}`} className="font-medium text-blue-600 hover:underline">
                      {shownTitle}
                    </Link>
                  );
                  return (
                    <tr key={est.id} className="text-gray-700 hover:bg-gray-50">
                      <td className="row-actions-sticky p-2 align-middle font-medium sm:p-3">
                        <div className="max-w-[18rem] truncate" title={shownTitle}>
                          {titleLink}
                        </div>
                      </td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">{formatDateYMD(est.estimateDate)}</td>
                      <td className="p-2 sm:p-3">{est.customerName || "-"}</td>
                      <td className="p-2 sm:p-3">{est.contact?.trim() ? est.contact : "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">프로젝트 제목을 눌러 인부 지정·링크 발송·회신 확인 화면으로 이동합니다.</p>
      </div>
    </div>
  );
}
