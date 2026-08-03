"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, Copy, Link2, MessageSquare, RefreshCw, Trash2 } from "lucide-react";

type Estimate = {
  id: number;
  title?: string;
  customerName?: string;
  address?: string;
  contact?: string;
};

type Worker = {
  id: number;
  name: string;
  phone?: string;
  role?: string;
};

type LaborPayAttachmentMeta = {
  kind: "photo" | "file";
  name: string;
  mime: string;
  index: number;
};

type LaborPayRequest = {
  id: number;
  estimateId: number;
  workerId: number | null;
  workerName: string;
  accessToken: string;
  status: string;
  amount: number | null;
  content: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  linkUrl?: string;
  attachments?: LaborPayAttachmentMeta[];
};

function formatNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function linkForToken(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/labor-pay/f/${token}`;
  }
  return `/labor-pay/f/${token}`;
}

function normalizePhoneDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function openDeviceSms(phoneDigits: string, bodyText: string) {
  const body = encodeURIComponent(bodyText);
  const isIOS =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const href = isIOS
    ? `sms:/open?addresses=${phoneDigits}&body=${body}`
    : `sms:${phoneDigits}?body=${body}`;
  window.location.href = href;
}

export default function LaborPayDetailPage() {
  const params = useParams();
  const estimateId = Number(params?.estimateId);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [requests, setRequests] = useState<LaborPayRequest[]>([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const workerPhoneById = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of workers) {
      const digits = normalizePhoneDigits(w.phone ?? "");
      if (digits.length >= 10) map.set(w.id, digits);
    }
    return map;
  }, [workers]);

  const load = useCallback(async () => {
    if (!Number.isFinite(estimateId) || estimateId < 1) {
      setError("잘못된 현장입니다.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [estRes, workersRes, reqRes] = await Promise.all([
        fetch("/api/estimates", { credentials: "include" }),
        fetch("/api/workers", { credentials: "include" }),
        fetch(`/api/company/labor-pay?estimateId=${estimateId}`, { credentials: "include" }),
      ]);
      const estData = await estRes.json();
      const workersData = await workersRes.json();
      const reqData = await reqRes.json();

      if (Array.isArray(estData)) {
        const found = (estData as Estimate[]).find((e) => e.id === estimateId) ?? null;
        setEstimate(found);
        if (!found) setError("견적을 찾을 수 없습니다.");
      } else {
        setError((estData as { error?: string }).error || "견적 목록을 불러올 수 없습니다.");
      }

      if (Array.isArray(workersData)) setWorkers(workersData as Worker[]);
      else if (Array.isArray((workersData as { workers?: Worker[] }).workers)) {
        setWorkers((workersData as { workers: Worker[] }).workers);
      } else setWorkers([]);

      if (!reqRes.ok) {
        setError((reqData as { error?: string }).error || "인건비 요청을 불러올 수 없습니다.");
        setRequests([]);
      } else {
        setRequests(Array.isArray(reqData.requests) ? (reqData.requests as LaborPayRequest[]) : []);
      }
    } catch {
      setError("불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    load();
  }, [load]);

  const assignedWorkerIds = useMemo(
    () => new Set(requests.map((r) => r.workerId).filter((id): id is number => id != null)),
    [requests]
  );

  const toggleWorker = (id: number) => {
    setSelectedWorkerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createLinks = async () => {
    if (selectedWorkerIds.length === 0) {
      alert("인부를 선택해 주세요.");
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/company/labor-pay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimateId, workerIds: selectedWorkerIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "링크 생성 실패");
      setMessage("링크를 생성했습니다. 「문자」버튼으로 인부에게 보낼 수 있습니다.");
      setSelectedWorkerIds([]);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "링크 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (token: string) => {
    const url = linkForToken(token);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했습니다.");
    } catch {
      window.prompt("링크를 복사하세요", url);
    }
  };

  const sendSms = (r: LaborPayRequest) => {
    const phone =
      (r.workerId != null ? workerPhoneById.get(r.workerId) : undefined) ?? "";
    if (!phone) {
      alert(
        "인부 전화번호가 없습니다. 현장 인부 DB에 전화번호를 등록한 뒤 다시 시도해 주세요."
      );
      return;
    }
    const site = estimate?.title?.trim() || estimate?.customerName?.trim() || "현장";
    const url = linkForToken(r.accessToken);
    const bodyText = `[인건비 입력 요청] ${site}\n아래 링크로 금액과 내용을 입력해 주세요.\n${url}`;
    openDeviceSms(phone, bodyText);
    setMessage("문자앱을 열었습니다. 보내기를 눌러 주세요.");
  };

  const reissue = async (id: number) => {
    if (!confirm("재발급하면 기존 제출 내용이 지워지고 새 링크가 만들어집니다. 계속할까요?")) return;
    try {
      const res = await fetch(`/api/company/labor-pay/${id}/reissue`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "재발급 실패");
      setMessage("재발급했습니다. 「문자」버튼으로 새 링크를 보내 주세요.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "재발급에 실패했습니다.");
    }
  };

  const removeRequest = async (id: number) => {
    if (!confirm("이 요청(링크)을 삭제할까요?")) return;
    try {
      const res = await fetch(`/api/company/labor-pay/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "삭제 실패");
      setMessage("삭제했습니다.");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/labor-pay"
          className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          목록
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <Banknote className="h-6 w-6 text-slate-600" />
          인건비 지급
        </h1>
      </div>

      {estimate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <div className="font-medium text-gray-900">{estimate.title?.trim() || "제목 없음"}</div>
          <div className="mt-1 text-gray-600">고객: {estimate.customerName || "-"}</div>
          <div className="text-gray-600">주소: {estimate.address || "-"}</div>
          <div className="text-gray-600">연락처: {estimate.contact || "-"}</div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">1. 인부 지정 후 링크 생성</h2>
        <p className="mb-3 text-xs text-gray-500">
          현장 인부 DB에 등록된 인부를 선택합니다. 이미 대기 중인 링크가 있으면 그대로 사용합니다.
          문자 발송은 인부 DB에 전화번호가 있어야 합니다.
        </p>
        {workers.length === 0 ? (
          <p className="text-sm text-gray-500">
            등록된 인부가 없습니다.{" "}
            <Link href="/workers" className="text-blue-600 hover:underline">
              현장 인부 DB
            </Link>
            에서 먼저 등록해 주세요.
          </p>
        ) : (
          <>
            <div className="mb-3 max-h-56 space-y-1 overflow-y-auto rounded border border-gray-100 p-2">
              {workers.map((w) => {
                const checked = selectedWorkerIds.includes(w.id);
                const hasOpen = assignedWorkerIds.has(w.id) && requests.some((r) => r.workerId === w.id && r.status === "open");
                const hasPhone = workerPhoneById.has(w.id);
                return (
                  <label
                    key={w.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWorker(w.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="font-medium text-gray-800">{w.name}</span>
                    {w.role ? <span className="text-xs text-gray-500">{w.role}</span> : null}
                    {!hasPhone ? <span className="text-xs text-amber-700">전화 없음</span> : null}
                    {hasOpen ? <span className="text-xs text-amber-700">대기 링크 있음</span> : null}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              onClick={createLinks}
              disabled={creating || selectedWorkerIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {creating ? "생성 중…" : "선택한 인부 링크 생성"}
            </button>
          </>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">2. 링크 · 회신 현황</h2>
        {requests.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">아직 생성된 링크가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-700">
                  <th className="px-2 py-2 font-medium">인부</th>
                  <th className="px-2 py-2 font-medium">상태</th>
                  <th className="px-2 py-2 text-right font-medium">금액</th>
                  <th className="px-2 py-2 font-medium">내용</th>
                  <th className="px-2 py-2 font-medium">첨부</th>
                  <th className="px-2 py-2 font-medium">링크</th>
                  <th className="px-2 py-2 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((r) => {
                  const submitted = r.status === "submitted";
                  const hasPhone = r.workerId != null && workerPhoneById.has(r.workerId);
                  return (
                    <tr key={r.id} className={submitted ? "bg-emerald-50/40" : ""}>
                      <td className="px-2 py-2 font-medium text-gray-900">{r.workerName || "-"}</td>
                      <td className="px-2 py-2">
                        {submitted ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                            제출완료
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                            대기
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {r.amount != null ? `${formatNum(r.amount)}원` : "—"}
                      </td>
                      <td className="max-w-[220px] px-2 py-2">
                        <div className="truncate text-gray-700" title={r.content || ""}>
                          {r.content?.trim() || "—"}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {Array.isArray(r.attachments) && r.attachments.length > 0 ? (
                          <ul className="space-y-1 text-xs">
                            {r.attachments.map((a) => (
                              <li key={`${r.id}-${a.index}`}>
                                <a
                                  href={`/api/company/labor-pay/${r.id}/attachment?index=${a.index}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {a.kind === "photo" ? "사진" : "파일"} · {a.name}
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => copyLink(r.accessToken)}
                            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            복사
                          </button>
                          <button
                            type="button"
                            onClick={() => sendSms(r)}
                            disabled={!hasPhone}
                            title={hasPhone ? "문자앱 열기" : "인부 DB에 전화번호가 필요합니다"}
                            className="inline-flex items-center gap-1 rounded border border-green-300 bg-white px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            문자
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {submitted && (
                            <button
                              type="button"
                              onClick={() => reissue(r.id)}
                              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                              title="재발급"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              재발급
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeRequest(r.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
