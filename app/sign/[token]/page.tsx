"use client";

import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { PdfToA4Images } from "@/components/contract/PdfToA4Images";

type SignInfo = {
  id: number;
  title: string;
  customerName: string;
  contact: string;
  status: string;
  documentUrl?: string;
  body?: string;
  details?: Record<string, string> | string | null;
  alreadySigned?: boolean;
};

/** 계약 details로 표준도급 계약서 요약 1페이지 HTML 생성 (인쇄용과 동일 구조, 도장 포함). 서명은 표 밖 레이어로 따로 겹침 */
function buildSummaryPageHtml(
  details: Record<string, string> | null,
  stampUrl: string | null,
  signer?: { name: string; residentNumber: string; address: string }
): string {
  if (!details || typeof details !== "object") return "";
  const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const raw = Number(String(details.contractAmount ?? "").replace(/\D/g, "")) || 0;
  const fmtAmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");
  const contractAmountFormatted = raw ? raw.toLocaleString("ko-KR") : "-";
  const downPaymentPercent = String(details.downPaymentPercent ?? "").trim();
  const balancePercent = String(details.balancePercent ?? "").trim();
  const downAmtFmt = fmtAmt(downPaymentPercent ? Math.round(raw * Number(downPaymentPercent) / 100) : 0);
  const balanceAmtFmt = fmtAmt(balancePercent ? Math.round(raw * Number(balancePercent) / 100) : 0);
  let interimList: Array<{ percent: string; daysAfter: string }>;
  try {
    const rawPayments = details.interimPayments;
    if (rawPayments != null && typeof rawPayments === "string" && rawPayments.trim()) {
      const parsed = JSON.parse(rawPayments) as Array<{ percent?: string; daysAfter?: string }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        interimList = parsed.map((p) => ({ percent: String(p.percent ?? "").trim(), daysAfter: String(p.daysAfter ?? "").trim() }));
      } else interimList = [{ percent: String(details.interimPercent ?? "").trim(), daysAfter: String(details.interimDaysAfter ?? "").trim() }];
    } else if (Array.isArray(rawPayments) && rawPayments.length > 0) {
      interimList = (rawPayments as Array<{ percent?: string; daysAfter?: string }>).map((p) => ({ percent: String(p.percent ?? "").trim(), daysAfter: String(p.daysAfter ?? "").trim() }));
    } else interimList = [{ percent: String(details.interimPercent ?? "").trim(), daysAfter: String(details.interimDaysAfter ?? "").trim() }];
  } catch {
    interimList = [{ percent: String(details.interimPercent ?? "").trim(), daysAfter: String(details.interimDaysAfter ?? "").trim() }];
  }
  const interimRows = interimList.map((item, idx) => {
    const amt = fmtAmt(raw && item.percent ? Math.round(raw * Number(item.percent) / 100) : 0);
    const label = idx === 0 ? "중도금1차" : idx === 1 ? "중도금2차" : idx === 2 ? "중도금3차" : `중도금${idx + 1}차`;
    return `<tr><td class="contract-print-row-label">${label}</td><td colspan="3" class="contract-print-value">${amt}원(&nbsp;&nbsp;${esc(item.percent)}&nbsp;&nbsp;%) <span class="contract-print-red">공사로부터 ${esc(item.daysAfter)}일후</span></td></tr>`;
  }).join("");
  const rowspanMoney = 3 + interimList.length + 1;
  const sigDisplay = String(details.contractorSignature ?? details.contractorName ?? details.contractorSignatureDirect ?? "").trim();
  const stampHtml = stampUrl ? `<img src="${esc(stampUrl)}" class="contract-print-stamp" alt="" />` : "";
  const stampSigHtml = stampUrl ? `<img src="${esc(stampUrl)}" class="contract-print-stamp-sig" alt="" onerror="this.remove()" />` : "";
  const clientName = signer?.name?.trim() || String(details.clientName ?? "").trim();
  const clientAddress = signer?.address?.trim() || String(details.clientAddress ?? "").trim();
  const clientResidentNumber = signer?.residentNumber?.trim() || String(details.clientResidentNumber ?? "").trim();
  return (
    `<div class="contract-print-summary contract-print-page1 contract-sign-summary-page">` +
    `<h1 class="contract-print-title">실내건축공사 표준도급 계약서</h1>` +
    `<table class="contract-print-main-tbl">` +
    `<colgroup><col class="contract-print-col-section" /><col class="contract-print-col-label" /><col class="contract-print-col-sub" /><col class="contract-print-col-value2" /><col class="contract-print-col-in" /></colgroup>` +
    `<tbody>` +
    `<tr><th rowspan="2" class="contract-print-section-label">계<br/>약<br/>자</th><td class="contract-print-row-label">발주자(수급인)</td><td colspan="2" class="contract-print-value">${esc(clientName)}</td><td class="contract-print-in">(인)</td></tr>` +
    `<tr><td class="contract-print-row-label">시공자(하수급인)</td><td colspan="2" class="contract-print-value">${esc(details.contractorCompanyName ?? "")}</td><td class="contract-print-in">(인)</td></tr>` +
    `<tr><th rowspan="4" class="contract-print-section-label">공<br/>사<br/>개<br/>요</th><td class="contract-print-row-label">공 사 명</td><td colspan="3" class="contract-print-value">${esc(details.projectName ?? "")}</td></tr>` +
    `<tr><td class="contract-print-row-label">공사장소(면적)</td><td colspan="3" class="contract-print-value">${esc(details.projectPlace ?? "")}</td></tr>` +
    `<tr><td rowspan="2" class="contract-print-row-label">공사기간</td><td class="contract-print-sub-label">착공</td><td colspan="2" class="contract-print-value">${esc(details.projectStartDate ?? "")}</td></tr>` +
    `<tr><td class="contract-print-sub-label">준공</td><td colspan="2" class="contract-print-value">${esc(details.projectEndDate ?? "")}</td></tr>` +
    `<tr><th rowspan="${rowspanMoney}" class="contract-print-section-label">공<br/>사<br/>대<br/>금</th><td class="contract-print-row-label">계약금액</td><td colspan="3" class="contract-print-value">${esc(contractAmountFormatted)}원 <span class="contract-print-red">부가세별도</span></td></tr>` +
    `<tr><td class="contract-print-row-label">선금</td><td colspan="3" class="contract-print-value">${downAmtFmt}원(&nbsp;&nbsp;${esc(downPaymentPercent)}&nbsp;&nbsp;%) <span class="contract-print-red">계약이후 바로</span></td></tr>` +
    interimRows +
    `<tr><td class="contract-print-row-label">잔 금</td><td colspan="3" class="contract-print-value">${balanceAmtFmt}원(&nbsp;&nbsp;${esc(balancePercent)}&nbsp;&nbsp;%) <span class="contract-print-red">공사완료 시</span></td></tr>` +
    `</tbody></table>` +
    (stampHtml ? stampHtml : "") +
    `<p class="contract-print-clause">발주자(수급인, 이하 &quot;갑&quot;이라한다)와 시공자(하수급인, 이하 &quot;을&quot;이라 한다)는 상기와 같이 계약을 체결하고 전자계약으로 작성한다.</p>` +
    `<div class="contract-print-signatures">` +
    `<div class="contract-print-sig-block"><p class="contract-print-sig-title">발주자(수급인)</p><p class="contract-print-sig-line">주소 : ${esc(clientAddress)}</p><p class="contract-print-sig-line">주민번호 : ${esc(clientResidentNumber)}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(clientName)}</span><span class="contract-print-in-fixed contract-print-red">(인)</span></p></div>` +
    `<div class="contract-print-sig-block"><p class="contract-print-sig-title">시공자(하수급인)</p><p class="contract-print-sig-line">주소 : ${esc(details.contractorAddress ?? "")}</p><p class="contract-print-sig-line">상호 : ${esc(details.contractorCompanyName ?? "")}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(sigDisplay)}</span><span class="contract-print-in-fixed contract-print-stamp-in-wrap"><span class="contract-print-red contract-print-in-text">(인)</span>${stampSigHtml}</span></p></div>` +
    `</div></div>`
  );
}

const A4_WIDTH = 793;

function ContractSummaryScaled({
  info,
  token,
  signer,
  signatureData,
  captureRef,
}: {
  info: SignInfo;
  token: string;
  signer: { name: string; residentNumber: string; address: string };
  signatureData?: string | null;
  captureRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const details =
    info.details == null
      ? null
      : typeof info.details === "string"
        ? (() => { try { return JSON.parse(info.details as string) as Record<string, string>; } catch { return null; } })()
        : (info.details as Record<string, string>);
  const stampUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/contracts/stamp/${info.id}?token=${encodeURIComponent(token)}`
      : null;
  const summaryHtml = buildSummaryPageHtml(details, stampUrl, signer);

  const containerRef = useRef<HTMLDivElement>(null);
  const sig1Ref = useRef<HTMLImageElement>(null);
  const sig2Ref = useRef<HTMLImageElement>(null);

  const hasSignature = !!signatureData && signatureData.startsWith("data:");

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const hide = () => { img.style.display = "none"; };
      if (img.complete && img.naturalWidth === 0) hide();
      else img.addEventListener("error", hide);
    });
  }, [summaryHtml]);

  useEffect(() => {
    if (!hasSignature || !containerRef.current) return;
    const container = containerRef.current;
    const inElements = container.querySelectorAll<HTMLElement>(".contract-print-in-fixed");
    const tableInCells = container.querySelectorAll<HTMLElement>(".contract-print-in");
    const containerRect = container.getBoundingClientRect();

    if (tableInCells.length > 0 && sig1Ref.current) {
      const cellRect = tableInCells[0].getBoundingClientRect();
      const cx = cellRect.left + cellRect.width / 2 - containerRect.left;
      const cy = cellRect.top + cellRect.height / 2 - containerRect.top;
      sig1Ref.current.style.left = `${cx}px`;
      sig1Ref.current.style.top = `${cy}px`;
      sig1Ref.current.style.transform = "translate(-50%, -50%)";
    }

    if (inElements.length > 0 && sig2Ref.current) {
      const inRect = inElements[0].getBoundingClientRect();
      const cx = inRect.left + inRect.width / 2 - containerRect.left;
      const cy = inRect.top + inRect.height / 2 - containerRect.top;
      sig2Ref.current.style.left = `${cx}px`;
      sig2Ref.current.style.top = `${cy}px`;
      sig2Ref.current.style.transform = "translate(-50%, -50%)";
    }
  });

  if (!summaryHtml) return null;

  const setRef = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (captureRef) (captureRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };
  return (
    <div ref={setRef} className="contract-sign-summary contract-sign-summary-with-overlays mb-4">
      <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
      {hasSignature && (
        <>
          <img
            ref={sig1Ref}
            src={signatureData!}
            className="contract-print-signature-overlay"
            alt=""
            aria-hidden
          />
          <img
            ref={sig2Ref}
            src={signatureData!}
            className="contract-print-signature-overlay"
            alt=""
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

export default function SignPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";
  const [info, setInfo] = useState<SignInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signerName, setSignerName] = useState("");
  const [signerAddress, setSignerAddress] = useState("");
  const [signerResidentNumber, setSignerResidentNumber] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signerEmail, setSignerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const summaryCaptureRef = useRef<HTMLDivElement>(null);
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

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
    }
    resize();

    const getPos = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      return { x: clientX - r.left, y: clientY - r.top };
    };

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!isDrawing.current) return;
      const { x, y } = getPos(e);
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
    window.addEventListener("resize", resize);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
      window.removeEventListener("resize", resize);
    };
  }, [info?.id, info?.alreadySigned]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !signerName.trim()) {
      alert("서명자 이름을 입력해 주세요.");
      return;
    }
    if (!signerResidentNumber.trim()) {
      alert("주민번호를 입력해 주세요.");
      return;
    }
    if (!signerAddress.trim()) {
      alert("주소를 입력해 주세요.");
      return;
    }
    if (!signatureData) {
      alert("서명을 그려 주세요.");
      return;
    }
    setSubmitting(true);
    let summaryImage: string | undefined;
    if (info?.documentUrl && summaryCaptureRef.current) {
      let offscreen: HTMLDivElement | null = null;
      try {
        const html2canvas = (await import("html2canvas")).default;
        const el = summaryCaptureRef.current;
        offscreen = document.createElement("div");
        offscreen.className = "contract-email-capture-print-style";
        offscreen.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;min-height:1123px;background:#fff;z-index:-1;box-sizing:border-box;";
        document.body.appendChild(offscreen);
        const clone = el.cloneNode(true) as HTMLElement;
        clone.style.width = "100%";
        offscreen.appendChild(clone);
        const imgs = clone.querySelectorAll("img");
        await Promise.all(Array.from(imgs).map((img) => img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 3000); })));
        await new Promise((r) => setTimeout(r, 500));
        const canvas = await html2canvas(offscreen, { scale: 3, useCORS: true, backgroundColor: "#ffffff", width: 794, windowWidth: 794, logging: false });
        summaryImage = canvas.toDataURL("image/png");
      } catch (err) {
        console.warn("서명 요약 캡처 실패:", err);
      } finally {
        if (offscreen?.parentNode) document.body.removeChild(offscreen);
      }
    }
    try {
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signerAddress: signerAddress.trim() || undefined,
          signerResidentNumber: signerResidentNumber.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
          signatureData,
          summaryImage,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSubmitted(true);
      if (data.emailSent === false && data.emailError) {
        console.error("이메일 발송 실패:", data.emailError);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
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
          {signerEmail.trim() && (
            <p className="mt-2 text-sm text-blue-600">
              {signerEmail.trim()} 으로 계약서가 발송되었습니다.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="mx-auto max-w-4xl rounded-xl bg-white p-4 shadow-md sm:p-6">
        <h1 className="text-lg font-bold text-gray-900">계약서 서명</h1>
        <p className="mt-1 text-sm text-gray-600">{info.title}</p>

        {/* 1페이지: 요약(서명란). 2페이지부터: 작성 시 자동 변환된 본문 PDF 또는 업로드된 문서 */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-800">계약 내용</h2>
          <p className="mt-0.5 text-xs text-gray-500">아래 내용을 확인한 후 하단에서 서명해 주세요.</p>
          <div className="contract-sign-view-pages mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 space-y-4">
            {/* 1페이지: 표준도급 계약서 요약 + 서명란 */}
            <ContractSummaryScaled
              info={info}
              token={token}
              signer={{ name: signerName, residentNumber: signerResidentNumber, address: signerAddress }}
              signatureData={signatureData}
              captureRef={summaryCaptureRef}
            />
            {/* 2페이지부터: 업로드된 PDF만 표시 (본문은 작성 시 자동 PDF 변환 또는 수동 업로드) */}
            {info.documentUrl ? (
              <>
                <PdfToA4Images
                  documentUrl={info.documentUrl}
                  className="space-y-4"
                  fullWidth
                  pageWrapperClassName="contract-sign-doc-page"
                />
                <a
                  href={info.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-blue-600 hover:underline"
                >
                  새 창에서 보기
                </a>
              </>
            ) : info.body?.trim() ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                본문은 작성자가 <strong>저장</strong>할 때 시스템이 자동으로 PDF로 변환해 넣습니다. 수동으로 인쇄 미리보기·PDF 저장·업로드할 필요 없습니다. 아직 2페이지가 보이지 않는다면 계약 작성자에게 &quot;계약서 저장 한 번 더 해 주세요&quot;라고 문의하세요.
              </div>
            ) : (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                이 계약서에는 계약 본문(2페이지 이후)이 등록되지 않았습니다. 필요 시 계약 작성자에게 문의하세요.
              </div>
            )}
          </div>
        </div>

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
            <label className="block text-sm font-medium text-gray-700">주민번호 *</label>
            <input
              type="text"
              value={signerResidentNumber}
              onChange={(e) => setSignerResidentNumber(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900"
              placeholder="주민등록번호를 입력하세요"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">주소 *</label>
            <input
              type="text"
              value={signerAddress}
              onChange={(e) => setSignerAddress(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900"
              placeholder="주소를 입력하세요"
              autoComplete="street-address"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">서명 (아래 칸에 그려 주세요)</label>
            <div className="mx-auto mt-1 max-w-[480px] rounded border-2 border-dashed border-gray-300 bg-gray-50">
              <canvas
                ref={canvasRef}
                className="block h-[216px] w-full touch-none sm:h-[240px]"
                style={{ touchAction: "none" }}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">서명일: {new Date().toLocaleDateString("ko-KR")}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700">계약서 받을 이메일 (선택)</label>
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900"
              placeholder="서명 완료 후 계약서를 받을 이메일 주소"
            />
          </div>
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
