"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";

type SignInfo = {
  id: number;
  title: string;
  customerName: string;
  contact: string;
  status: string;
  documentUrl?: string;
  body?: string;
  alreadySigned?: boolean;
};

export default function SignPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";
  const [info, setInfo] = useState<SignInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    if (!token) {
      setError("링크가 올바르지 않습니다.");
      setLoading(false);
      return;
    }
    fetch(`/api/contracts/sign/${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setInfo(data);
      })
      .catch(() => setError("정보를 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !info || info.alreadySigned) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as MouseEvent).clientX - rect.left;
      const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as MouseEvent).clientY - rect.top;
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as MouseEvent).clientX - rect.left;
      const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as MouseEvent).clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const end = () => {
      isDrawing.current = false;
      if (canvas.toDataURL) setSignatureData(canvas.toDataURL("image/png"));
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [info?.id, info?.alreadySigned]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !signerName.trim()) {
      alert("이름을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    fetch(`/api/contracts/sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signerName: signerName.trim(), signatureData }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSubmitted(true);
      })
      .catch((err) => alert(err?.message || "제출 실패"))
      .finally(() => setSubmitting(false));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">불러오는 중...</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md">
          <h1 className="text-lg font-semibold text-gray-900">알림</h1>
          <p className="mt-2 text-gray-600">{error || "정보를 찾을 수 없습니다."}</p>
        </div>
      </div>
    );
  }

  if (info.alreadySigned) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md max-w-md">
          <h1 className="text-lg font-semibold text-gray-900">이미 서명이 완료되었습니다.</h1>
          <p className="mt-2 text-gray-600">이 계약서는 이미 서명이 완료된 문서입니다.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="rounded-lg bg-white p-6 text-center shadow-md max-w-md">
          <h1 className="text-lg font-semibold text-green-700">서명이 완료되었습니다.</h1>
          <p className="mt-2 text-gray-600">계약서 서명이 정상적으로 접수되었습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="mx-auto max-w-2xl rounded-xl bg-white p-4 shadow-md sm:p-6">
        <h1 className="text-lg font-bold text-gray-900">계약서 서명</h1>
        <p className="mt-1 text-sm text-gray-600">{info.title}</p>

        {/* PDF가 있으면 PDF만 표시 (원본 그대로: 순서·볼드·레이아웃 유지). 본문 텍스트는 사용 안 함 */}
        {info.documentUrl ? (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-800">계약 내용 (PDF 원본 그대로)</h2>
            <p className="mt-0.5 text-xs text-gray-500">아래 계약서 PDF를 확인한 후 하단에서 서명해 주세요. 업로드된 파일이 그대로 표시됩니다.</p>
            <div className="mt-2 rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
              <iframe
                src={info.documentUrl}
                title="계약 문서"
                className="h-[75vh] w-full min-h-[480px]"
              />
            </div>
            <a
              href={info.documentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-blue-600 hover:underline"
            >
              새 창에서 보기
            </a>
          </div>
        ) : (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-800">계약 내용</h2>
            <p className="mt-0.5 text-xs text-gray-500">아래 내용을 확인한 후 하단에서 서명해 주세요.</p>
            {info.body && info.body.trim() ? (
              <div className="mt-2 max-h-[50vh] min-h-[120px] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                {info.body}
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                이 계약서에는 계약 본문이 등록되지 않았습니다. 필요 시 계약 작성자에게 문의하세요.
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4 border-t border-gray-200 pt-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">서명자 이름 *</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900"
              placeholder="성함을 입력하세요"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">서명 (아래 칸에 그려 주세요)</label>
            <div className="mt-1 rounded border-2 border-dashed border-gray-300 bg-gray-50">
              <canvas
                ref={canvasRef}
                className="block h-32 w-full touch-none sm:h-40"
                style={{ touchAction: "none" }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">서명일: {new Date().toLocaleDateString("ko-KR")}</p>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "제출 중..." : "서명 제출"}
          </button>
        </form>
      </div>
    </div>
  );
}
