"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";

type EstimateItemRow = {
  qty?: number | string;
  materialUnitPrice?: number | string;
  unitPrice?: number;
  laborUnitPrice?: number | string;
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName?: string;
  contact?: string;
  title?: string;
  displayTitle?: string;
  estimateDate?: string;
  items?: EstimateItemRow[];
  overheadPercent?: number;
  profitPercent?: number;
};

type Consultation = {
  id: number;
  status?: string;
};

type SettlementSummaryResponse = {
  summaries?: Record<string, number>;
  /** 결제 승인서 합계(견적별). 없으면 구 API 호환으로 summaries 사용 */
  approvalSummaries?: Record<string, number>;
};

function parseSummariesRecord(raw: unknown): Record<string, number> {
  const next: Record<string, number> = {};
  if (raw != null && typeof raw === "object") {
    Object.keys(raw as object).forEach((k) => {
      const n = Number((raw as Record<string, unknown>)[k]);
      if (!Number.isNaN(n)) next[k] = n;
    });
  }
  return next;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

function formatDateYMD(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function estimateTotal(est: Estimate): number {
  const subtotal = (est.items || []).reduce(
    (s, i) =>
      s +
      (Number(i.qty) || 0) * (Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0) +
      (Number(i.qty) || 0) * (Number(i.laborUnitPrice ?? 0) || 0),
    0
  );
  const ohRate = (Number(est.overheadPercent) ?? 5) / 100;
  const prRate = (Number(est.profitPercent) ?? 10) / 100;
  return subtotal + Math.floor(subtotal * ohRate) + Math.floor(subtotal * prRate);
}

export default function PaymentListPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [paymentTotalsByEstimate, setPaymentTotalsByEstimate] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/estimates", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/consultations", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/company/settlement-summaries", { credentials: "include" }).then((r) =>
        r.ok ? r.json().catch(() => ({})) : {}
      ),
    ])
      .then(([estData, consData, sumData]) => {
        if (Array.isArray(estData)) {
          setEstimates(estData as Estimate[]);
        } else {
          setError((estData as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
        }
        if (Array.isArray(consData)) {
          setConsultations(consData as Consultation[]);
        } else {
          setConsultations([]);
        }
        const typed = sumData as SettlementSummaryResponse;
        const approval = typed.approvalSummaries;
        setPaymentTotalsByEstimate(
          parseSummariesRecord(
            approval != null && typeof approval === "object" ? approval : typed.summaries
          )
        );
      })
      .catch(() => setError("결제 승인 관리 목록을 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  /** 상담이 남아 있는 견적만. 완료 건 보기 꺼짐이면 완료 상담 제외 */
  const filteredEstimates = useMemo(() => {
    return estimates.filter((est) => {
      if (est.consultationId == null) return false;
      const c = consultations.find((x) => x.id === est.consultationId);
      if (!c) return false;
      if (showCompleted) return true;
      const status = c.status ?? "";
      return status !== "완료및정산" && status !== "완료";
    });
  }, [estimates, consultations, showCompleted]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
        <CreditCard className="h-6 w-6 text-slate-600" />
        결제 승인 관리
      </h1>
      <p className="text-sm text-gray-500">
        현장(견적)을 선택한 뒤 결제 승인서(선집행 전 승인 문서)를 작성하세요. 제목을 누르면 상세 작성 화면으로 이동합니다.
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
          <table className="w-full min-w-[760px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
              <tr>
                <th className="row-actions-sticky min-w-[10rem] p-2 font-semibold sm:p-3">프로젝트 제목</th>
                <th className="p-2 sm:p-3 font-semibold">견적일자</th>
                <th className="p-2 sm:p-3 font-semibold">고객명</th>
                <th className="p-2 sm:p-3 font-semibold">연락처</th>
                <th className="p-2 sm:p-3 text-right font-semibold">견적 합계</th>
                <th className="p-2 sm:p-3 text-right font-semibold">승인 요청 합계</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : estimates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    저장된 견적이 없습니다. 견적서 작성에서 먼저 견적을 저장해 주세요.
                  </td>
                </tr>
              ) : filteredEstimates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    표시할 견적이 없습니다. &apos;완료된 항목 보기&apos;를 켜 보세요.
                  </td>
                </tr>
              ) : (
                filteredEstimates.map((est) => {
                  const total = estimateTotal(est);
                  const paid = Number(paymentTotalsByEstimate[String(est.id)] ?? 0);
                  const shownTitle = (est.displayTitle || est.title || "").trim() || "제목 없음";
                  const titleLink = (
                    <Link href={`/payment/${est.id}`} className="font-medium text-blue-600 hover:underline">
                      {shownTitle}
                    </Link>
                  );
                  return (
                    <tr key={est.id} className="text-gray-700 hover:bg-gray-50">
                      <td className="row-actions-sticky p-2 align-middle font-medium sm:p-3">
                        <div className="max-w-[18rem] truncate" title={shownTitle}>{titleLink}</div>
                      </td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">{formatDateYMD(est.estimateDate)}</td>
                      <td className="p-2 sm:p-3">{est.customerName || "-"}</td>
                      <td className="p-2 sm:p-3">{est.contact?.trim() ? est.contact : "-"}</td>
                      <td className="p-2 sm:p-3 text-right tabular-nums">{formatNumber(total)}원</td>
                      <td className="p-2 sm:p-3 text-right tabular-nums font-medium">{formatNumber(paid)}원</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">위 목록에서 프로젝트 제목을 눌러 결제관리 상세 페이지로 이동해 주세요.</p>
      </div>
    </div>
  );
}
