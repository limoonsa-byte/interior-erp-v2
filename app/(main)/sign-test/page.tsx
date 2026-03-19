"use client";

import React, { useEffect, useState } from "react";
import { SignedContractSummary } from "@/components/contract/SignedContractSummary";
import type { SignedContractSummaryContract } from "@/components/contract/SignedContractSummary";

type Contract = {
  id: number;
  title: string;
  customerName: string;
  status: string;
  signedAt?: string;
};

type ContractFull = SignedContractSummaryContract & {
  id: number;
  title?: string;
  documentPath?: string;
};

/** 계약서 작성 인쇄 미리보기와 동일하게 1페이지만 캡처 (794px SignedContractSummary) */
async function capturePage1AsImage(contract: ContractFull): Promise<string> {
  const html2canvas = (await import("html2canvas")).default;
  const { createRoot } = await import("react-dom/client");
  const offscreen = document.createElement("div");
  offscreen.className = "contract-email-capture-print-style";
  offscreen.style.cssText =
    "position:fixed;left:-9999px;top:0;width:794px;min-height:1123px;background:#fff;z-index:-1;box-sizing:border-box;";
  document.body.appendChild(offscreen);
  const container = document.createElement("div");
  offscreen.appendChild(container);
  const root = createRoot(container);
  root.render(React.createElement(SignedContractSummary, { contract }));
  await new Promise((r) => setTimeout(r, 1000));
  const imgs = offscreen.querySelectorAll("img");
  await Promise.all(
    Array.from(imgs).map((img) =>
      img.complete ? Promise.resolve() : new Promise<void>((r) => { (img as HTMLImageElement).onload = () => r(); (img as HTMLImageElement).onerror = () => r(); setTimeout(r, 2000); })
    )
  );
  await new Promise((r) => setTimeout(r, 300));
  const canvas = await html2canvas(offscreen, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    width: 794,
    windowWidth: 794,
    logging: false,
  });
  const dataUrl = canvas.toDataURL("image/png");
  root.unmount();
  document.body.removeChild(offscreen);
  return dataUrl;
}

/** 1페이지 이미지 + 본문 PDF 합쳐서 PDF bytes */
async function mergePdf(summaryImage: string, documentArrayBuffer: ArrayBuffer | null): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const A4_W = 595.28;
  const A4_H = 841.89;
  const pdfDoc = await PDFDocument.create();

  const addImagePage = (dataUrl: string) => {
    const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (!match) return Promise.resolve();
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const isPng = match[1] === "png";
    return (isPng ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes)).then((img) => {
      const scale = Math.min(A4_W / img.width, A4_H / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const page = pdfDoc.addPage([A4_W, A4_H]);
      page.drawImage(img, { x: 0, y: A4_H - h, width: w, height: h });
    });
  };

  await addImagePage(summaryImage);
  if (documentArrayBuffer && documentArrayBuffer.byteLength > 0) {
    const existingPdf = await PDFDocument.load(documentArrayBuffer);
    const pages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
    for (const p of pages) pdfDoc.addPage(p);
  }
  return pdfDoc.save();
}

export default function SignTestPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/contracts")
      .then((res) => res.json())
      .then((list: Contract[]) => {
        const signed = (Array.isArray(list) ? list : []).filter((c) => c.status === "signed");
        setContracts(signed);
        if (signed.length > 0 && !selectedId) setSelectedId(signed[0].id);
      })
      .catch(() => setContracts([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const openPreview = async () => {
    if (!selectedId) {
      setMessage({ type: "err", text: "계약서를 선택하세요." });
      return;
    }
    setMessage(null);
    setPreviewing(true);
    try {
      const cRes = await fetch(`/api/contracts/${selectedId}`);
      if (!cRes.ok) throw new Error("계약서를 불러올 수 없습니다.");
      const contract: ContractFull = await cRes.json();
      if (!contract.details) throw new Error("계약 상세가 없습니다.");
      const summaryImage = await capturePage1AsImage(contract);
      let docBuf: ArrayBuffer | null = null;
      try {
        const dRes = await fetch(`/api/contracts/document/${selectedId}`, { credentials: "include" });
        if (dRes.ok) docBuf = await dRes.arrayBuffer();
      } catch (_) {}
      const pdfBytes = await mergePdf(summaryImage, docBuf);
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "PDF 생성 실패" });
    } finally {
      setPreviewing(false);
    }
  };

  const sendEmail = async () => {
    if (!selectedId) {
      setMessage({ type: "err", text: "계약서를 선택하세요." });
      return;
    }
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage({ type: "err", text: "받을 이메일 주소를 입력하세요." });
      return;
    }
    setSending(true);
    setMessage(null);
    try {
      const cRes = await fetch(`/api/contracts/${selectedId}`);
      if (!cRes.ok) throw new Error("계약서를 불러올 수 없습니다.");
      const contract: ContractFull = await cRes.json();
      if (!contract.details) throw new Error("계약 상세가 없습니다.");
      const summaryImage = await capturePage1AsImage(contract);
      const res = await fetch("/api/contracts/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: selectedId, email: trimmed, summaryImage }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "ok", text: `이메일이 발송되었습니다. (${trimmed})` });
      } else {
        setMessage({ type: "err", text: data.error || "발송 실패" });
      }
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "발송 요청 실패" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">계약서 목록 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">서명 · 이메일 PDF 테스트</h1>
      <p className="mt-1 text-sm text-gray-500">
        <strong>계약서 작성 인쇄 미리보기</strong>와 동일한 1페이지만 사용합니다. 발주자 내용·서명·도장 크기는 그대로입니다.
      </p>

      <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">계약서 선택</label>
          <select
            value={selectedId === "" ? "" : selectedId}
            onChange={(e) => setSelectedId(e.target.value === "" ? "" : Number(e.target.value))}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">선택하세요</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.id}] {c.title || "(제목 없음)"} — {c.customerName || "-"}
              </option>
            ))}
          </select>
          {contracts.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">서명 완료된 계약서가 없습니다. 계약서 작성에서 먼저 서명을 완료하세요.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPreview}
            disabled={!selectedId || contracts.length === 0 || previewing}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {previewing ? "PDF 만드는 중..." : "PDF 미리보기 (1페이지 = 인쇄 미리보기)"}
          </button>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <label className="block text-sm font-medium text-gray-700">테스트 이메일 주소</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendEmail}
            disabled={!selectedId || !email.trim() || sending}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? "발송 중..." : "이메일로 보내기"}
          </button>
        </div>

        {message && (
          <p className={message.type === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"}>
            {message.text}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        1페이지는 계약서 작성의 인쇄 미리보기와 동일합니다. 서명·도장 크기를 바꾸지 않습니다.
      </p>
    </div>
  );
}
