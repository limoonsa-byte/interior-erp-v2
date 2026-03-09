"use client";

import React, { useEffect, useMemo, useState } from "react";

type Contract = {
  id: number;
  companyId?: number;
  consultationId?: number;
  estimateId?: number;
  title: string;
  customerName: string;
  contact: string;
  signerEmail?: string;
  documentPath?: string;
  status: string;
  signToken?: string;
  signedAt?: string;
  signerName?: string;
  signatureData?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Consultation = {
  id: number;
  customerName?: string;
  contact?: string;
  address?: string;
};

type Estimate = {
  id: number;
  customerName?: string;
  contact?: string;
  address?: string;
  title?: string;
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

function statusLabel(s: string): string {
  if (s === "draft") return "초안";
  if (s === "sent") return "서명 대기";
  if (s === "signed") return "서명 완료";
  return s;
}

function ContractForm({
  contract,
  preFill,
  onSave,
  onCancel,
}: {
  contract: Contract | null;
  preFill: { customerName: string; contact: string; consultationId?: number; estimateId?: number } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = contract !== null;
  const [title, setTitle] = useState(contract?.title ?? "");
  const [customerName, setCustomerName] = useState(contract?.customerName ?? preFill?.customerName ?? "");
  const [contact, setContact] = useState(contract?.contact ?? preFill?.contact ?? "");
  const [signerEmail, setSignerEmail] = useState(contract?.signerEmail ?? "");
  const [documentPath, setDocumentPath] = useState(contract?.documentPath ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);

  useEffect(() => {
    if (preFill && !isEdit) {
      setCustomerName(preFill.customerName);
      setContact(preFill.contact);
    }
  }, [preFill, isEdit]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    fetch("/api/contracts/upload", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.documentPath) {
          setDocumentPath(data.documentPath);
          setUploadFileName(file.name);
        } else {
          alert(data.error || "업로드 실패");
        }
      })
      .catch(() => alert("업로드 실패"))
      .finally(() => setUploading(false));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("계약 제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      customerName: customerName.trim(),
      contact: contact.trim(),
      signerEmail: signerEmail.trim() || undefined,
      documentPath: documentPath || undefined,
      consultationId: preFill?.consultationId ?? contract?.consultationId,
      estimateId: preFill?.estimateId ?? contract?.estimateId,
    };
    if (isEdit && contract) {
      fetch(`/api/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (!res.ok) return res.json().then((d) => Promise.reject(d));
        })
        .then(() => onSave())
        .catch((err) => alert(err?.error || "수정 실패"))
        .finally(() => setSaving(false));
    } else {
      fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          onSave();
        })
        .catch((err) => alert(err?.message || "저장 실패"))
        .finally(() => setSaving(false));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">{isEdit ? "계약 수정" : "신규 계약"}</h2>
      <div className="grid gap-3 sm:grid-cols-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">계약 제목 *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
            placeholder="예: OO아파트 인테리어 시공 계약"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">고객명</label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">연락처</label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">서명 요청 이메일 (선택)</label>
          <input
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500"
            placeholder="링크 발송 시 사용"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">계약 문서 (PDF 등)</label>
          <input
            type="file"
            accept=".pdf,image/jpeg,image/png,image/jpg"
            onChange={handleFileChange}
            disabled={uploading}
            className="mt-1 block w-full text-sm text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-blue-700"
          />
          {uploading && <p className="mt-1 text-xs text-gray-500">업로드 중...</p>}
          {documentPath && <p className="mt-1 text-xs text-green-600">{uploadFileName || "첨부됨"}</p>}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}

export default function ContractPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [formOpen, setFormOpen] = useState<"new" | number | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"consultation" | "estimate">("consultation");
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [preFill, setPreFill] = useState<{ customerName: string; contact: string; consultationId?: number; estimateId?: number } | null>(null);
  const [sendModal, setSendModal] = useState<{ id: number; signUrl: string; title?: string } | null>(null);
  const [sendEmail, setSendEmail] = useState("");

  const load = () => {
    fetch("/api/contracts")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setContracts(data) : setContracts([])))
      .catch(() => setContracts([]));
  };

  useEffect(() => {
    load();
  }, []);

  const filteredContracts = useMemo(() => {
    if (showCompleted) return contracts;
    return contracts.filter((c) => c.status !== "signed");
  }, [contracts, showCompleted]);

  const handleNewClick = () => {
    setSourceModalOpen(true);
    setSourceType("consultation");
    setLoadingSource(true);
    setPreFill(null);
    fetch("/api/consultations")
      .then((res) => res.json())
      .then((list) => setConsultations(Array.isArray(list) ? list : []))
      .catch(() => setConsultations([]))
      .finally(() => setLoadingSource(false));
    fetch("/api/estimates")
      .then((res) => res.json())
      .then((list) => setEstimates(Array.isArray(list) ? list : []))
      .catch(() => setEstimates([]));
  };

  const handleSelectConsultation = (c: Consultation) => {
    setPreFill({
      customerName: c.customerName ?? "",
      contact: c.contact ?? "",
      consultationId: c.id,
    });
    setSourceModalOpen(false);
    setFormOpen("new");
  };

  const handleSelectEstimate = (e: Estimate) => {
    setPreFill({
      customerName: e.customerName ?? "",
      contact: e.contact ?? "",
      estimateId: e.id,
    });
    setSourceModalOpen(false);
    setFormOpen("new");
  };

  const handleSendClick = (c: Contract) => {
    if (c.status === "sent" && c.signToken) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      setSendModal({ id: c.id, signUrl: `${base}/sign/${c.signToken}`, title: c.title });
      return;
    }
    fetch(`/api/contracts/${c.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendEmail ? { email: sendEmail } : {}),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const base = typeof window !== "undefined" ? window.location.origin : "";
        setSendModal({ id: c.id, signUrl: data.signUrl || `${base}/sign/${data.signToken}`, title: c.title });
        load();
      })
      .catch((err) => alert(err?.message || "발송 실패"));
  };

  const [sendingEmail, setSendingEmail] = useState(false);
  const handleSendEmail = () => {
    if (!sendModal || !sendEmail.trim()) {
      alert("이메일 주소를 입력해 주세요.");
      return;
    }
    setSendingEmail(true);
    fetch("/api/contracts/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: sendEmail.trim(), signUrl: sendModal.signUrl, title: sendModal.title }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        alert("이메일이 발송되었습니다.");
      })
      .catch((err) => alert(err?.message || "이메일 발송 실패"))
      .finally(() => setSendingEmail(false));
  };

  const sourceModal = sourceModalOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-800">상담 또는 견적에서 선택</h3>
          <button type="button" onClick={() => setSourceModalOpen(false)} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="flex gap-2 border-b border-gray-100 p-2">
          <button
            type="button"
            onClick={() => setSourceType("consultation")}
            className={`rounded px-3 py-1.5 text-sm ${sourceType === "consultation" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            상담
          </button>
          <button
            type="button"
            onClick={() => setSourceType("estimate")}
            className={`rounded px-3 py-1.5 text-sm ${sourceType === "estimate" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            견적
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4">
          {loadingSource && sourceType === "consultation" ? (
            <p className="py-8 text-center text-sm text-gray-500">불러오는 중...</p>
          ) : sourceType === "consultation" ? (
            consultations.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">상담 목록이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {consultations.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded border border-gray-100 p-3">
                    <span className="font-medium">{c.customerName || "-"}</span>
                    <span className="text-gray-500">{c.contact || ""}</span>
                    <button
                      type="button"
                      onClick={() => handleSelectConsultation(c)}
                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      선택
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : estimates.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">견적 목록이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {estimates.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded border border-gray-100 p-3">
                  <span className="font-medium">{e.customerName || "-"}</span>
                  <span className="text-gray-500">{e.contact || ""}</span>
                  <button
                    type="button"
                    onClick={() => handleSelectEstimate(e)}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-gray-200 p-3">
          <button
            type="button"
            onClick={() => {
              setPreFill({ customerName: "", contact: "" });
              setSourceModalOpen(false);
              setFormOpen("new");
            }}
            className="text-sm text-gray-600 underline hover:text-gray-800"
          >
            연동 없이 새로 작성
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const editingContract = formOpen !== null && formOpen !== "new" ? contracts.find((c) => c.id === formOpen) ?? null : null;
  const showForm = formOpen !== null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900 sm:text-xl">계약서 작성</h1>
        <button
          type="button"
          onClick={handleNewClick}
          className="min-h-[44px] rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800"
        >
          신규 계약
        </button>
      </div>

      {sourceModal}

      {sendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">서명 링크</h3>
            <p className="mt-2 text-sm text-gray-600">아래 링크를 상대방에게 전달하세요.</p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                readOnly
                value={sendModal.signUrl}
                className="flex-1 rounded border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sendModal.signUrl);
                  alert("복사되었습니다.");
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                복사
              </button>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500">이메일로 보내기 (선택)</label>
              <input
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="이메일 주소"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="mt-2 rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {sendingEmail ? "발송 중..." : "이메일 발송"}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSendModal(null)}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm ? (
        <ContractForm
          contract={editingContract}
          preFill={formOpen === "new" ? preFill : null}
          onSave={() => {
            setFormOpen(null);
            load();
          }}
          onCancel={() => setFormOpen(null)}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">저장된 계약 목록입니다. 서명 요청 링크를 발송하거나 완료 건을 확인할 수 있습니다.</p>
          <div className="mb-2 flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded border-gray-300"
              />
              완료 건 보기
            </label>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="p-2 sm:p-3">제목</th>
                  <th className="p-2 sm:p-3">고객명</th>
                  <th className="p-2 sm:p-3">연락처</th>
                  <th className="p-2 sm:p-3">상태</th>
                  <th className="p-2 sm:p-3">생성일</th>
                  <th className="w-32 p-2 sm:p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      {contracts.length === 0
                        ? "저장된 계약이 없습니다. \"신규 계약\"으로 작성해 보세요."
                        : "표시할 계약이 없습니다. '완료 건 보기'를 켜 보세요."}
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => (
                    <tr key={c.id} className="text-gray-700 hover:bg-gray-50">
                      <td className="p-2 font-medium sm:p-3">{c.title || "-"}</td>
                      <td className="p-2 sm:p-3">{c.customerName || "-"}</td>
                      <td className="p-2 sm:p-3">{c.contact || "-"}</td>
                      <td className="p-2 sm:p-3">{statusLabel(c.status)}</td>
                      <td className="p-2 sm:p-3">{formatDateYMD(c.createdAt)}</td>
                      <td className="whitespace-nowrap p-2 sm:p-3 align-middle">
                        <div className="flex items-center gap-2">
                          {c.status === "draft" && (
                            <button
                              type="button"
                              onClick={() => setFormOpen(c.id)}
                              className="rounded px-2 py-1 text-blue-600 hover:underline active:bg-blue-50"
                            >
                              수정
                            </button>
                          )}
                          {(c.status === "draft" || c.status === "sent") && (
                            <>
                              {c.status === "draft" && (
                                <span className="text-gray-300">|</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSendClick(c)}
                                className="rounded px-2 py-1 text-green-600 hover:underline active:bg-green-50"
                              >
                                {c.status === "sent" ? "링크 복사" : "서명 요청"}
                              </button>
                            </>
                          )}
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm("이 계약을 삭제할까요?")) return;
                              fetch(`/api/contracts/${c.id}`, { method: "DELETE" })
                                .then((res) => (res.ok ? load() : res.json().then((d) => Promise.reject(d))))
                                .catch(() => alert("삭제 실패"));
                            }}
                            className="rounded px-2 py-1 text-red-500 hover:underline active:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
