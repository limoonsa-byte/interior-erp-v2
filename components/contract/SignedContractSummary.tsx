"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { computePaymentScheduleForDisplay, parseInterimLinesFromDetails, isVatIncluded, vatLabelText } from "@/lib/contractPaymentSchedule";
import { positionContractSignatureOverlays } from "@/lib/positionContractSignatureOverlays";

export type SignedContractSummaryContract = {
  details: Record<string, unknown> | null;
  signerName?: string;
  signerAddress?: string;
  signerResidentNumber?: string;
  signatureData?: string;
};

/**
 * 계약서 1페이지(요약+서명란) 렌더링. 서명 이미지는 .contract-print-in / .contract-print-in-fixed 기준으로 배치.
 * "계약서 보기 → 이메일 보내기"와 "서명하기 완료 이메일"이 동일한 PDF가 되도록 이 컴포넌트로 1페이지 캡처를 통일.
 */
export function SignedContractSummary({ contract }: { contract: SignedContractSummaryContract }) {
  const d = contract.details;
  const containerRef = useRef<HTMLDivElement>(null);
  const sig1Ref = useRef<HTMLImageElement>(null);
  const sig2Ref = useRef<HTMLImageElement>(null);

  const hasSignature = !!contract.signatureData && contract.signatureData.startsWith("data:");

  const html = useMemo(() => {
    if (!d || typeof d !== "object") return "";
    const dStr = d as Record<string, string>;
    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const raw = Number(String(dStr.contractAmount ?? "").replace(/\D/g, "")) || 0;
    const fmtAmt = (n: number) => (n ? n.toLocaleString("ko-KR") : "");
    const contractAmountFormatted = raw ? raw.toLocaleString("ko-KR") : "-";
    const downPct = String(dStr.downPaymentPercent ?? "").trim();
    const balPctLegacy = String(dStr.balancePercent ?? "").trim();
    const interimList = parseInterimLinesFromDetails(dStr as unknown as Record<string, unknown>);
    const schedule = computePaymentScheduleForDisplay(raw, downPct, interimList, balPctLegacy);
    const downAmtFmt = fmtAmt(schedule.downAmount);
    const balanceAmtFmt = fmtAmt(schedule.balanceAmount);
    const sp = "\u00A0\u00A0";
    const interimRows = interimList
      .map((item, idx) => {
        const amt = fmtAmt(schedule.interimAmounts[idx] ?? 0);
        const label = idx === 0 ? "중도금1차" : `중도금${idx + 1}차`;
        const days = (item.daysAfter ?? "").trim();
        const daysPart = days ? `${esc(days)}일` : "\u00A0\u00A0\u00A0";
        return `<tr><td class="contract-print-row-label">${label}</td><td colspan="3" class="contract-print-value">${amt}원(${sp}${esc(item.percent)}${sp}%) <span class="contract-print-red">공사로부터 ${daysPart}후</span></td></tr>`;
      })
      .join("");
    const rowspanMoney = 3 + interimList.length;
    const clientName = contract.signerName || String(dStr.clientName ?? "");
    const sigDisplay = String(
      dStr.contractorSignature ?? dStr.contractorName ?? dStr.contractorSignatureDirect ?? ""
    ).trim();
    const clientAddr = contract.signerAddress || String(dStr.clientAddress ?? dStr.client_address ?? "").trim();
    const clientRrn =
      contract.signerResidentNumber || String(dStr.clientResidentNumber ?? dStr.client_resident_number ?? "").trim();
    const stampHtml = `<img src="/api/company/asset/stamp" class="contract-print-stamp" alt="" onerror="this.remove()" />`;
    const stampSigHtml = `<img src="/api/company/asset/stamp" class="contract-print-stamp-sig" alt="" onerror="this.remove()" />`;
    const specialRaw = String(dStr.specialProvisions ?? "").trim();
    const specialBlock =
      specialRaw.length > 0
        ? `<div class="contract-print-special-provisions"><div class="contract-print-special-title">특약사항</div><div class="contract-print-special-body">${esc(specialRaw).replace(/\n/g, "<br/>")}</div></div>`
        : "";
    return (
      `<div class="contract-print-summary contract-print-page1 contract-sign-summary-page">` +
      `<h1 class="contract-print-title">실내건축공사 표준도급 계약서</h1>` +
      `<table class="contract-print-main-tbl">` +
      `<colgroup><col class="contract-print-col-section" /><col class="contract-print-col-label" /><col class="contract-print-col-sub" /><col class="contract-print-col-value2" /><col class="contract-print-col-in" /></colgroup>` +
      `<tbody>` +
      `<tr><th rowspan="2" class="contract-print-section-label">계<br/>약<br/>자</th><td class="contract-print-row-label">발주자(수급인)</td><td colspan="2" class="contract-print-value">${esc(clientName)}</td><td class="contract-print-in">(인)</td></tr>` +
      `<tr><td class="contract-print-row-label">시공자(하수급인)</td><td colspan="2" class="contract-print-value">${esc(dStr.contractorCompanyName ?? "")}</td><td class="contract-print-in">(인)</td></tr>` +
      `<tr><th rowspan="4" class="contract-print-section-label">공<br/>사<br/>개<br/>요</th><td class="contract-print-row-label">공 사 명</td><td colspan="3" class="contract-print-value">${esc(dStr.projectName ?? "")}</td></tr>` +
      `<tr><td class="contract-print-row-label">공사장소(면적)</td><td colspan="3" class="contract-print-value">${esc(dStr.projectPlace ?? "")}</td></tr>` +
      `<tr><td rowspan="2" class="contract-print-row-label">공사기간</td><td class="contract-print-sub-label">착공</td><td colspan="2" class="contract-print-value">${esc(dStr.projectStartDate ?? "")}</td></tr>` +
      `<tr><td class="contract-print-sub-label">준공</td><td colspan="2" class="contract-print-value">${esc(dStr.projectEndDate ?? "")}</td></tr>` +
      `<tr><th rowspan="${rowspanMoney}" class="contract-print-section-label">공<br/>사<br/>대<br/>금</th><td class="contract-print-row-label">계약금액</td><td colspan="3" class="contract-print-value">${esc(contractAmountFormatted)}원 <span class="contract-print-red">${vatLabelText(isVatIncluded(dStr as unknown as Record<string, unknown>))}</span></td></tr>` +
      `<tr><td class="contract-print-row-label">선금</td><td colspan="3" class="contract-print-value">${downAmtFmt}원(${sp}${esc(downPct)}${sp}%) <span class="contract-print-red">계약이후 바로</span></td></tr>` +
      interimRows +
      `<tr><td class="contract-print-row-label">잔 금</td><td colspan="3" class="contract-print-value">${balanceAmtFmt}원(${sp}${esc(schedule.balancePercentLabel)}${sp}%) <span class="contract-print-red">공사완료 시</span></td></tr>` +
      `</tbody></table>` +
      stampHtml +
      specialBlock +
      `<p class="contract-print-clause">발주자(수급인, 이하 &quot;갑&quot;이라한다)와 시공자(하수급인, 이하 &quot;을&quot;이라 한다)는 상기와 같이 계약을 체결하고 전자계약으로 작성한다.</p>` +
      `<div class="contract-print-signatures">` +
      `<div class="contract-print-sig-block"><p class="contract-print-sig-title">발주자(수급인)</p><p class="contract-print-sig-line">주소 : ${esc(clientAddr)}</p><p class="contract-print-sig-line">주민번호 : ${esc(clientRrn)}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(clientName)}</span><span class="contract-print-in-fixed contract-print-red">(인)</span></p></div>` +
      `<div class="contract-print-sig-block"><p class="contract-print-sig-title">시공자(하수급인)</p><p class="contract-print-sig-line">주소 : ${esc(dStr.contractorAddress ?? "")}</p><p class="contract-print-sig-line">상호 : ${esc(dStr.contractorCompanyName ?? "")}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(sigDisplay)}</span><span class="contract-print-in-fixed contract-print-stamp-in-wrap"><span class="contract-print-red contract-print-in-text">(인)</span>${stampSigHtml}</span></p></div>` +
      `</div></div>`
    );
  }, [d, contract.signerName, contract.signerAddress, contract.signerResidentNumber]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    container.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      if (img.classList.contains("contract-print-signature-overlay")) return;
      const hide = () => {
        img.style.display = "none";
      };
      if (img.complete && img.naturalWidth === 0) {
        hide();
        return;
      }
      img.addEventListener("error", hide);
    });

    if (!hasSignature) return;
    const run = () => positionContractSignatureOverlays(container);
    run();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(run) : null;
    ro?.observe(container);
    return () => ro?.disconnect();
  }, [hasSignature, html]);

  if (!html) return null;

  return (
    <div ref={containerRef} className="contract-sign-summary" style={{ position: "relative" }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {hasSignature && (
        <>
          <img
            ref={sig1Ref}
            src={contract.signatureData!}
            className="contract-print-signature-overlay"
            alt=""
            aria-hidden
          />
          <img
            ref={sig2Ref}
            src={contract.signatureData!}
            className="contract-print-signature-overlay"
            alt=""
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
