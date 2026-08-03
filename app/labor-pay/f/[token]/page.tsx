"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PublicLaborPay = {
  workerName: string;
  status: string;
  amount: number | null;
  content: string | null;
  siteTitle: string;
  customerName: string;
  address: string;
};

export default function LaborPayPublicFormPage() {
  const params = useParams();
  const token = String(params?.token ?? "").trim();
  const [data, setData] = useState<PublicLaborPay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("잘못된 링크입니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/labor-pay/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error || "링크를 불러올 수 없습니다.");
        setData(json as PublicLaborPay);
        if ((json as PublicLaborPay).status === "submitted") {
          setDone(true);
          if ((json as PublicLaborPay).amount != null) setAmount(String((json as PublicLaborPay).amount));
          if ((json as PublicLaborPay).content) setContent(String((json as PublicLaborPay).content));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/labor-pay/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, content }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "제출에 실패했습니다.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 px-4 py-10">
        <p className="text-center text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh bg-slate-50 px-4 py-10">
        <div className="mx-auto max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">인건비 지급 입력</h1>
        <p className="mt-1 text-sm text-gray-500">회사에서 보낸 링크입니다. 금액과 내용을 입력해 주세요.</p>

        <div className="mt-4 space-y-1 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-700">
          <div>
            <span className="text-gray-500">현장</span> · {data?.siteTitle || "-"}
          </div>
          <div>
            <span className="text-gray-500">고객</span> · {data?.customerName || "-"}
          </div>
          {data?.address ? (
            <div>
              <span className="text-gray-500">주소</span> · {data.address}
            </div>
          ) : null}
          <div>
            <span className="text-gray-500">인부</span> · {data?.workerName || "-"}
          </div>
        </div>

        {done ? (
          <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
            <p className="font-medium">제출이 완료되었습니다. 감사합니다.</p>
            {amount ? <p className="mt-2">금액: {Number(amount).toLocaleString("ko-KR")}원</p> : null}
            {content ? <p className="mt-1 whitespace-pre-wrap">내용: {content}</p> : null}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">금액 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="예: 150000"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="작업 내용, 기간 등을 적어 주세요"
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "제출 중…" : "제출하기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
