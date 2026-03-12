"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PdfToA4Images } from "@/components/contract/PdfToA4Images";

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
  body?: string;
  details?: Record<string, unknown>;
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
  pyung?: number | string;
  status?: string;
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName?: string;
  contact?: string;
  address?: string;
  title?: string;
  items?: { qty?: number; materialUnitPrice?: number; laborUnitPrice?: number; unitPrice?: number }[];
  overheadPercent?: number;
  profitPercent?: number;
};

type PicItem = { id: number; name: string };

/** 견적 items + 공과잡비/이윤 적용 후 만원 단위 절삭 (VAT 별도 금액) */
function estimateTotalVatExclusive(est: Estimate): number {
  const items = est.items ?? [];
  const subtotal = items.reduce(
    (s, i) =>
      s +
      (Number(i.qty) || 0) * (Number(i.materialUnitPrice ?? (i as { unitPrice?: number }).unitPrice ?? 0) || 0) +
      (Number(i.qty) || 0) * (Number(i.laborUnitPrice ?? 0) || 0),
    0
  );
  const ohRate = (Number(est.overheadPercent) ?? 5) / 100;
  const prRate = (Number(est.profitPercent) ?? 10) / 100;
  const sum = subtotal + Math.floor(subtotal * ohRate) + Math.floor(subtotal * prRate);
  return Math.floor(sum / 10000) * 10000;
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

/** 계약금액 입력용: 숫자만 추출 후 천단위 콤마 포맷 */
function formatContractAmountDisplay(val: string | number | undefined): string {
  const s = val != null ? String(val).replace(/\D/g, "") : "";
  if (s === "") return "";
  return Number(s).toLocaleString("ko-KR");
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
  preFill: { customerName: string; contact: string; consultationId?: number; estimateId?: number; estimateTitle?: string; address?: string; pyung?: number | string; estimateContractAmount?: number } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = contract !== null;
  const [title, setTitle] = useState(contract?.title ?? "");
  const [customerName, setCustomerName] = useState(contract?.customerName ?? preFill?.customerName ?? "");
  const [contact, setContact] = useState(contract?.contact ?? preFill?.contact ?? "");
  const [signerEmail, setSignerEmail] = useState(contract?.signerEmail ?? "");
  const [documentPath, setDocumentPath] = useState(contract?.documentPath ?? "");
  const [body, setBody] = useState(contract?.body ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingCompanyTemplate, setLoadingCompanyTemplate] = useState(false);

  const details = (contract?.details ?? {}) as Record<string, string>;
  const [clientName, setClientName] = useState(details.clientName ?? "");
  const [clientAddress, setClientAddress] = useState(details.clientAddress ?? "");
  const [clientResidentNumber, setClientResidentNumber] = useState(details.clientResidentNumber ?? "");
  const [contractorCompanyName, setContractorCompanyName] = useState(details.contractorCompanyName ?? "");
  const [contractorAddress, setContractorAddress] = useState(details.contractorAddress ?? "");
  const [pics, setPics] = useState<PicItem[]>([]);
  const [contractorSignatureSelect, setContractorSignatureSelect] = useState("");
  const [contractorSignatureDirect, setContractorSignatureDirect] = useState("");
  const [projectName, setProjectName] = useState(details.projectName ?? "");
  const [projectPlace, setProjectPlace] = useState(details.projectPlace ?? "");
  const [projectStartDate, setProjectStartDate] = useState(details.projectStartDate ?? "");
  const [projectEndDate, setProjectEndDate] = useState(details.projectEndDate ?? "");
  const [contractAmount, setContractAmount] = useState(() => formatContractAmountDisplay(details.contractAmount ?? ""));
  const [downPaymentPercent, setDownPaymentPercent] = useState(details.downPaymentPercent ?? "");
  const [interimPayments, setInterimPayments] = useState<Array<{ percent: string; daysAfter: string }>>(() => {
    try {
      const raw = details.interimPayments;
      if (raw != null && typeof raw === "string" && raw.trim()) {
        const parsed = JSON.parse(raw) as Array<{ percent?: string; daysAfter?: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((p) => ({ percent: String(p.percent ?? "").trim(), daysAfter: String(p.daysAfter ?? "").trim() }));
      }
    } catch {}
    return [{ percent: details.interimPercent ?? "", daysAfter: details.interimDaysAfter ?? "" }];
  });
  const [balancePercent, setBalancePercent] = useState(details.balancePercent ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pdfPageImages, setPdfPageImages] = useState<string[]>([]);
  const [stampUrl, setStampUrl] = useState("");
  const previewPrintRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documentPath || !documentPath.toLowerCase().endsWith(".pdf")) setPdfPageImages([]);
  }, [documentPath]);

  useEffect(() => {
    fetch(`/api/company/asset/stamp?t=${Date.now()}`)
      .then((res) => { if (!res.ok) throw new Error(); return res.blob(); })
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => setStampUrl(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .catch(() => setStampUrl(""));
  }, []);

  useEffect(() => {
    const d = (contract?.details ?? {}) as Record<string, string>;
    setClientName(d.clientName ?? "");
    setClientAddress(d.clientAddress ?? "");
    setClientResidentNumber(d.clientResidentNumber ?? "");
    setContractorCompanyName(d.contractorCompanyName ?? "");
    setContractorAddress(d.contractorAddress ?? "");
    const sig = (d.contractorSignature ?? "").trim();
    setContractorSignatureDirect(sig);
    if (sig) setContractorSignatureSelect("__direct__");
    else setContractorSignatureSelect("");
    setProjectName(d.projectName ?? "");
    setProjectPlace(d.projectPlace ?? "");
    setProjectStartDate(d.projectStartDate ?? "");
    setProjectEndDate(d.projectEndDate ?? "");
    setContractAmount(formatContractAmountDisplay(d.contractAmount));
    setDownPaymentPercent(d.downPaymentPercent ?? "");
    try {
      const raw = d.interimPayments;
      if (raw != null && typeof raw === "string" && raw.trim()) {
        const parsed = JSON.parse(raw) as Array<{ percent?: string; daysAfter?: string }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInterimPayments(parsed.map((p) => ({ percent: String(p.percent ?? "").trim(), daysAfter: String(p.daysAfter ?? "").trim() })));
          setBalancePercent(d.balancePercent ?? "");
          return;
        }
      }
    } catch {}
    setInterimPayments([{ percent: d.interimPercent ?? "", daysAfter: d.interimDaysAfter ?? "" }]);
    setBalancePercent(d.balancePercent ?? "");
  }, [contract?.id, contract?.details]);

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => {
        const name = (data?.company?.name ?? data?.company?.code ?? "").trim();
        if (name) setContractorCompanyName((prev) => (prev.trim() ? prev : name));
        const addr = (data?.company?.contractorAddress ?? "").trim();
        if (addr) setContractorAddress((prev) => (prev.trim() ? prev : addr));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/company/pics")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setPics(data) : setPics([])))
      .catch(() => setPics([]));
  }, []);

  useEffect(() => {
    if (pics.length === 0 || !contractorSignatureDirect.trim()) return;
    const match = pics.find((p) => p.name.trim() === contractorSignatureDirect.trim());
    if (match) setContractorSignatureSelect(String(match.id));
  }, [pics, contractorSignatureDirect]);

  useEffect(() => {
    if (preFill && !isEdit) {
      setCustomerName(preFill.customerName);
      setContact(preFill.contact);
      if (preFill.estimateTitle != null && preFill.estimateTitle.trim()) {
        setTitle(preFill.estimateTitle.trim());
        setProjectName(preFill.estimateTitle.trim());
      }
      if (preFill.estimateContractAmount != null && preFill.estimateContractAmount > 0) {
        setContractAmount(formatContractAmountDisplay(String(preFill.estimateContractAmount)));
      }
      if (preFill.address != null && preFill.address.trim()) {
        const p = preFill.pyung != null && String(preFill.pyung).trim() !== "" ? ` (${preFill.pyung}평)` : "";
        setProjectPlace((prev) => (prev.trim() ? prev : preFill.address!.trim() + p));
      } else if (preFill.pyung != null && String(preFill.pyung).trim() !== "") {
        setProjectPlace((prev) => (prev.trim() ? prev : `${preFill.pyung}평`));
      }
    }
  }, [preFill, isEdit]);

  const handleLoadTemplate = () => {
    setLoadingTemplate(true);
    fetch("/api/company/contract-template")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error || "양식을 불러올 수 없습니다.");
          return;
        }
        const loadedTitle = data.title != null ? String(data.title) : "";
        const loadedBody = data.body != null ? String(data.body) : "";
        const loadedDocPath = data.documentPath != null ? String(data.documentPath) : "";
        setTitle(loadedTitle);
        // 마스터에 PDF가 있으면 본문 텍스트는 넣지 않음 (서명 시 PDF만 표시)
        setBody(loadedDocPath ? "" : loadedBody);
        if (loadedDocPath) {
          setDocumentPath(loadedDocPath);
          setUploadFileName("마스터 PDF 적용됨");
        }
        if (loadedDocPath || loadedBody.trim()) {
          alert(loadedDocPath ? "마스터 PDF가 계약 문서로 적용되었습니다. 저장하면 서명 페이지에 PDF 그대로 표시됩니다." : "마스터 관리에서 저장한 계약서 양식(제목·본문)을 불러왔습니다.");
        } else {
          alert("마스터 관리에서 계약서 양식(엑셀/PDF 불러오기)을 등록한 뒤 다시 불러오기를 사용해 주세요.");
        }
      })
      .catch(() => alert("양식 불러오기에 실패했습니다."))
      .finally(() => setLoadingTemplate(false));
  };

  const handleLoadCompanyTemplate = () => {
    setLoadingCompanyTemplate(true);
    fetch("/api/company/company-contract-template")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error || "회사 양식을 불러올 수 없습니다.");
          return;
        }
        const loadedTitle = data.title != null ? String(data.title) : "";
        const loadedBody = data.body != null ? String(data.body) : "";
        const loadedDocPath = data.documentPath != null ? String(data.documentPath) : "";
        setTitle(loadedTitle);
        setBody(loadedDocPath ? "" : loadedBody);
        if (loadedDocPath) {
          setDocumentPath(loadedDocPath);
          setUploadFileName("회사 PDF 적용됨");
        } else {
          setDocumentPath("");
          setUploadFileName(null);
        }
        if (loadedDocPath || loadedBody.trim()) {
          alert(loadedDocPath ? "회사 PDF가 계약 문서로 적용되었습니다." : "관리에서 등록한 회사 계약서 양식(제목·본문)을 불러왔습니다.");
        } else {
          alert("관리 → 계약서 양식에서 제목·본문을 등록한 뒤 다시 불러오기를 사용해 주세요.");
        }
      })
      .catch(() => alert("회사 양식 불러오기에 실패했습니다."))
      .finally(() => setLoadingCompanyTemplate(false));
  };

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
    const detailsObj: Record<string, string> = {};
    if (clientName.trim()) detailsObj.clientName = clientName.trim();
    if (clientAddress.trim()) detailsObj.clientAddress = clientAddress.trim();
    if (clientResidentNumber.trim()) detailsObj.clientResidentNumber = clientResidentNumber.trim();
    if (contractorCompanyName.trim()) detailsObj.contractorCompanyName = contractorCompanyName.trim();
    if (contractorAddress.trim()) detailsObj.contractorAddress = contractorAddress.trim();
    const sigValue =
      contractorSignatureSelect === "__direct__"
        ? contractorSignatureDirect.trim()
        : contractorSignatureSelect
          ? (pics.find((p) => String(p.id) === contractorSignatureSelect)?.name ?? "").trim()
          : "";
    if (sigValue) {
      detailsObj.contractorSignature = sigValue;
      detailsObj.contractorName = sigValue;
    }
    if (projectName.trim()) detailsObj.projectName = projectName.trim();
    if (projectPlace.trim()) detailsObj.projectPlace = projectPlace.trim();
    if (projectStartDate.trim()) detailsObj.projectStartDate = projectStartDate.trim();
    if (projectEndDate.trim()) detailsObj.projectEndDate = projectEndDate.trim();
    if (contractAmount.trim()) {
      const raw = contractAmount.replace(/\D/g, "").trim();
      if (raw) detailsObj.contractAmount = raw;
    }
    if (downPaymentPercent.trim()) detailsObj.downPaymentPercent = downPaymentPercent.trim();
    detailsObj.interimPayments = JSON.stringify(interimPayments);
    if (balancePercent.trim()) detailsObj.balancePercent = balancePercent.trim();

    const payload = {
      title: title.trim(),
      customerName: customerName.trim(),
      contact: contact.trim(),
      signerEmail: signerEmail.trim() || undefined,
      documentPath: documentPath || undefined,
      body: body.trim() || undefined,
      details: Object.keys(detailsObj).length > 0 ? detailsObj : undefined,
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

  const sigDisplay =
    contractorSignatureSelect === "__direct__"
      ? contractorSignatureDirect.trim()
      : contractorSignatureSelect
        ? (pics.find((p) => String(p.id) === contractorSignatureSelect)?.name ?? "").trim()
        : "";
  const contractAmountFormatted =
    contractAmount.trim() && /^\d+$/.test(contractAmount.replace(/\D/g, ""))
      ? Number(contractAmount.replace(/\D/g, "")).toLocaleString("ko-KR")
      : contractAmount || "-";

  const handlePrint = () => {
    const printRootId = "contract-print-only";
    const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const rawAmount = Number(contractAmount.replace(/\D/g, "")) || 0;
    const fmtAmt = (n: number) => n ? n.toLocaleString("ko-KR") : "";
    const downAmtFmt = fmtAmt(rawAmount && downPaymentPercent ? Math.round(rawAmount * Number(downPaymentPercent) / 100) : 0);
    const balanceAmtFmt = fmtAmt(rawAmount && balancePercent ? Math.round(rawAmount * Number(balancePercent) / 100) : 0);
    const interimRows = interimPayments.map((item, idx) => {
      const amt = fmtAmt(rawAmount && item.percent ? Math.round(rawAmount * Number(item.percent) / 100) : 0);
      const label = idx === 0 ? "중도금1차" : idx === 1 ? "중도금2차" : idx === 2 ? "중도금3차" : `중도금${idx + 1}차`;
      return `<tr><td class="contract-print-row-label">${label}</td><td colspan="3" class="contract-print-value">${amt}원(&nbsp;&nbsp;${esc(item.percent || "")}&nbsp;&nbsp;%) <span class="contract-print-red">공사로부터 ${esc(item.daysAfter || "")}일후</span></td></tr>`;
    }).join("");
    const rowspanMoney = 3 + interimPayments.length + 1; /* 계약금액 + 선금 + 중도금들 + 잔금 */
    const stampSrc = stampUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/company/asset/stamp?t=${Date.now()}` : "");
    /* 1페이지: 실내건축공사 표준도급 계약서 양식 — 참고 이미지와 동일한 레이아웃 */
    const page1 =
      `<div class="contract-print-summary contract-print-page1">` +
      `<h1 class="contract-print-title">실내건축공사 표준도급 계약서</h1>` +
      `<table class="contract-print-main-tbl">` +
      `<colgroup><col class="contract-print-col-section" /><col class="contract-print-col-label" /><col class="contract-print-col-sub" /><col class="contract-print-col-value2" /><col class="contract-print-col-in" /></colgroup>` +
      `<tbody>` +
      /* 계약자 */
      `<tr><th rowspan="2" class="contract-print-section-label">계<br/>약<br/>자</th><td class="contract-print-row-label">발주자(수급인)</td><td colspan="2" class="contract-print-value">${esc(clientName || "")}</td><td class="contract-print-in">(인)</td></tr>` +
      `<tr><td class="contract-print-row-label">시공자(하수급인)</td><td colspan="2" class="contract-print-value">${esc(contractorCompanyName || "")}</td><td class="contract-print-in">(인)</td></tr>` +
      /* 공사개요 */
      `<tr><th rowspan="4" class="contract-print-section-label">공<br/>사<br/>개<br/>요</th><td class="contract-print-row-label">공 사 명</td><td colspan="3" class="contract-print-value">${esc(projectName || "")}</td></tr>` +
      `<tr><td class="contract-print-row-label">공사장소(면적)</td><td colspan="3" class="contract-print-value">${esc(projectPlace || "")}</td></tr>` +
      `<tr><td rowspan="2" class="contract-print-row-label">공사기간</td><td class="contract-print-sub-label">착공</td><td colspan="2" class="contract-print-value">${esc(projectStartDate || "")}</td></tr>` +
      `<tr><td class="contract-print-sub-label">준공</td><td colspan="2" class="contract-print-value">${esc(projectEndDate || "")}</td></tr>` +
      /* 공사대금 */
      `<tr><th rowspan="${rowspanMoney}" class="contract-print-section-label">공<br/>사<br/>대<br/>금</th><td class="contract-print-row-label">계약금액</td><td colspan="3" class="contract-print-value">${esc(contractAmountFormatted)}원 <span class="contract-print-red">부가세별도</span></td></tr>` +
      `<tr><td class="contract-print-row-label">선금</td><td colspan="3" class="contract-print-value">${downAmtFmt}원(&nbsp;&nbsp;${esc(downPaymentPercent || "")}&nbsp;&nbsp;%) <span class="contract-print-red">계약이후 바로</span></td></tr>` +
      interimRows +
      `<tr><td class="contract-print-row-label">잔 금</td><td colspan="3" class="contract-print-value">${balanceAmtFmt}원(&nbsp;&nbsp;${esc(balancePercent || "")}&nbsp;&nbsp;%) <span class="contract-print-red">공사완료 시</span></td></tr>` +
      `</tbody></table>` +
      (stampSrc ? `<img src="${stampSrc}" class="contract-print-stamp" alt="" />` : "") +
      /* 약관 문구 */
      `<p class="contract-print-clause">발주자(수급인, 이하 &quot;갑&quot;이라한다)와 시공자(하수급인, 이하 &quot;을&quot;이라 한다)는 상기와 같이 계약을 체결하고 전자계약으로 작성한다.</p>` +
      /* 서명란 */
      `<div class="contract-print-signatures">` +
      `<div class="contract-print-sig-block">` +
      `<p class="contract-print-sig-title">발주자(수급인)</p>` +
      `<p class="contract-print-sig-line">주소 : ${esc(clientAddress || "")}</p>` +
      `<p class="contract-print-sig-line">주민번호 : ${esc(clientResidentNumber || "")}</p>` +
      `<p class="contract-print-sig-line contract-print-sig-line-name">성명 : ${esc(clientName || "")}<span class="contract-print-in-fixed contract-print-red">(인)</span></p>` +
      `</div>` +
      `<div class="contract-print-sig-block">` +
      `<p class="contract-print-sig-title">시공자(하수급인)</p>` +
      `<p class="contract-print-sig-line">주소 : ${esc(contractorAddress || "")}</p>` +
      `<p class="contract-print-sig-line">상호 : ${esc(contractorCompanyName || "")}</p>` +
      `<p class="contract-print-sig-line contract-print-sig-line-name">성명 : ${esc(sigDisplay || "")}<span class="contract-print-in-fixed">${stampSrc ? `<img src="${stampSrc}" class="contract-print-stamp-sig" alt="" />` : `<span class="contract-print-red">(인)</span>`}</span></p>` +
      `</div>` +
      `</div></div>`;
    const docSection =
      documentPath && documentPath.toLowerCase().endsWith(".pdf") && pdfPageImages.length > 0
        ? `<div class="contract-print-doc-pages border-t border-gray-200 pt-3"><div class="space-y-4">${pdfPageImages.map((dataUrl, i) => `<img src="${dataUrl}" alt="계약 문서 ${i + 1}페이지" class="contract-print-doc-img w-full border border-gray-200 bg-white shadow-sm" />`).join("")}</div></div>`
        : documentPath && !documentPath.toLowerCase().endsWith(".pdf")
          ? `<div class="contract-print-doc-pages border-t border-gray-200 pt-3"><div class="rounded border border-gray-200 bg-gray-50 overflow-hidden"><img src="/api/company/contract-document?path=${encodeURIComponent(documentPath)}" alt="계약 문서" class="contract-print-doc-img max-h-[50vh] w-full object-contain" /></div></div>`
          : "";
    const wrap = document.createElement("div");
    wrap.id = printRootId;
    wrap.className = "contract-print-only-root";
    wrap.innerHTML = page1 + docSection;
    document.body.appendChild(wrap);
    document.body.classList.add("contract-printing");
    const prevTitle = document.title;
    const safeName = (title || "제목없음").trim().replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "제목없음";
    document.title = `계약서 ${safeName}`;
    window.print();
    const cleanup = () => {
      document.title = prevTitle;
      document.body.classList.remove("contract-printing");
      const root = document.getElementById(printRootId);
      if (root) root.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">{isEdit ? "계약 수정" : "신규 계약"}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleLoadTemplate}
          disabled={loadingTemplate}
          className="rounded-lg border border-blue-500 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          {loadingTemplate ? "불러오는 중..." : "마스터 양식 불러오기"}
        </button>
        <button
          type="button"
          onClick={handleLoadCompanyTemplate}
          disabled={loadingCompanyTemplate}
          className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
        >
          {loadingCompanyTemplate ? "불러오는 중..." : "회사양식 불러오기"}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">계약 제목 * (견적서 제목)</label>
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
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">실내건축공사 표준도급계약서 (C부분 입력)</h3>
          <p className="mb-3 text-xs text-gray-600">표준도급계약서에 적을 발주자·시공자 정보입니다.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 text-xs font-medium text-gray-500">발주자(수급인) <span className="font-normal text-gray-400">※ 발주자가 직접 입력하실수도 있습니다.</span></div>
            <div>
              <label className="block text-xs font-medium text-gray-600">이름</label>
              <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="발주자 이름" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">주소</label>
              <input type="text" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="발주자 주소" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">주민번호</label>
              <input type="text" value={clientResidentNumber} onChange={(e) => setClientResidentNumber(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="주민등록번호" />
            </div>
            <div className="sm:col-span-2 text-xs font-medium text-gray-500 mt-2">시공자(하수급인)</div>
            <div>
              <label className="block text-xs font-medium text-gray-600">상호</label>
              <input type="text" value={contractorCompanyName} onChange={(e) => setContractorCompanyName(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="회사명" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">주소</label>
              <input type="text" value={contractorAddress} onChange={(e) => setContractorAddress(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="시공자 주소" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">시공자 서명</label>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <select
                  value={contractorSignatureSelect}
                  onChange={(e) => {
                    const v = e.target.value;
                    setContractorSignatureSelect(v);
                    if (v !== "__direct__") {
                      const pic = pics.find((p) => String(p.id) === v);
                      if (pic) setContractorSignatureDirect(pic.name);
                    }
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm min-w-[140px]"
                >
                  <option value="">선택</option>
                  {pics.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="__direct__">직접입력</option>
                </select>
                {contractorSignatureSelect === "__direct__" && (
                  <input
                    type="text"
                    value={contractorSignatureDirect}
                    onChange={(e) => setContractorSignatureDirect(e.target.value)}
                    placeholder="시공자 서명 입력"
                    className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[120px]"
                  />
                )}
              </div>
            </div>
            <div className="sm:col-span-2 text-xs font-medium text-gray-500 mt-3 pt-3 border-t border-gray-200">공사 정보</div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">공사명</label>
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="공사명" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">공사장소(면적)</label>
              <input type="text" value={projectPlace} onChange={(e) => setProjectPlace(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="공사장소 또는 면적" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">공사기간</label>
              <div className="mt-0.5 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500">공사 시작 날짜</label>
                  <input type="date" value={projectStartDate} onChange={(e) => setProjectStartDate(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500">공사 마감 날짜</label>
                  <input type="date" value={projectEndDate} onChange={(e) => setProjectEndDate(e.target.value)} className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            <div className="sm:col-span-2 text-xs font-medium text-gray-500 mt-3 pt-3 border-t border-gray-200">계약금·선금·중도금·잔금</div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600">계약금액 <span className="text-gray-500 font-normal">(VAT 별도)</span></label>
              <div className="mt-0.5 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(formatContractAmountDisplay(e.target.value))}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="견적에서 선택 시 자동 입력"
                />
                <span className="text-xs text-gray-500 shrink-0">원</span>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-gray-600">선금</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="text" inputMode="numeric" value={downPaymentPercent} onChange={(e) => setDownPaymentPercent(e.target.value)} className="w-14 rounded border border-gray-300 px-2 py-1.5 text-sm text-right" placeholder="30" />
                <span className="text-sm text-gray-600">% : 계약이후 바로</span>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-gray-600">중도금</label>
              {interimPayments.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500 w-16 shrink-0">{idx === 0 ? "중도금1차" : idx === 1 ? "중도금2차" : idx === 2 ? "중도금3차" : `중도금${idx + 1}차`}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.percent}
                    onChange={(e) => setInterimPayments((prev) => prev.map((p, i) => i === idx ? { ...p, percent: e.target.value } : p))}
                    className="w-14 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                    placeholder="40"
                  />
                  <span className="text-sm text-gray-600">% : 공사로부터</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={item.daysAfter}
                    onChange={(e) => setInterimPayments((prev) => prev.map((p, i) => i === idx ? { ...p, daysAfter: e.target.value } : p))}
                    className="w-14 rounded border border-gray-300 px-2 py-1.5 text-sm text-right"
                    placeholder="14"
                  />
                  <span className="text-sm text-gray-600">일후</span>
                  {interimPayments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setInterimPayments((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setInterimPayments((prev) => [...prev, { percent: "", daysAfter: "" }])}
                className="rounded border border-blue-500 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                중도금 추가
              </button>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-gray-600">잔금</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="text" inputMode="numeric" value={balancePercent} onChange={(e) => setBalancePercent(e.target.value)} className="w-14 rounded border border-gray-300 px-2 py-1.5 text-sm text-right" placeholder="30" />
                <span className="text-sm text-gray-600">% : 공사완료시</span>
              </div>
            </div>
          </div>
        </div>
        {documentPath ? (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">계약 문서</p>
            {documentPath.toLowerCase().endsWith(".pdf") ? (
              <PdfToA4Images documentPath={documentPath} className="mt-2" onPagesLoaded={setPdfPageImages} />
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                <img
                  src={`/api/company/contract-document?path=${encodeURIComponent(documentPath)}`}
                  alt="계약 문서"
                  className="max-h-[50vh] w-full object-contain"
                />
              </div>
            )}
          </div>
        ) : (
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
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
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
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          인쇄/미리보기
        </button>
      </div>
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print" role="dialog" aria-modal="true">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">계약서 미리보기</h3>
              <div className="flex gap-2">
                <button type="button" onClick={handlePrint} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                  인쇄 (PDF로 저장 가능)
                </button>
                <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  닫기
                </button>
              </div>
            </div>
            <div ref={previewPrintRef} id="contract-preview-print-area" className="overflow-y-auto p-4 text-sm">
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900">{title || "(제목 없음)"}</p>
                </div>
                <table className="w-full border-collapse border border-gray-300 text-left">
                  <caption className="text-left font-semibold text-gray-800 py-1">고객</caption>
                  <tbody>
                    <tr className="border-b border-gray-200"><th className="w-28 bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">고객명</th><td className="px-2 py-1.5 border border-gray-300">{customerName || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">연락처</th><td className="px-2 py-1.5 border border-gray-300">{contact || "-"}</td></tr>
                  </tbody>
                </table>
                <table className="w-full border-collapse border border-gray-300 text-left">
                  <caption className="text-left font-semibold text-gray-800 py-1">발주자(수급인)</caption>
                  <tbody>
                    <tr className="border-b border-gray-200"><th className="w-28 bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">이름</th><td className="px-2 py-1.5 border border-gray-300">{clientName || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">주소</th><td className="px-2 py-1.5 border border-gray-300">{clientAddress || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">주민번호</th><td className="px-2 py-1.5 border border-gray-300">{clientResidentNumber || "-"}</td></tr>
                  </tbody>
                </table>
                <table className="w-full border-collapse border border-gray-300 text-left">
                  <caption className="text-left font-semibold text-gray-800 py-1">시공자(하수급인)</caption>
                  <tbody>
                    <tr className="border-b border-gray-200"><th className="w-28 bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">상호</th><td className="px-2 py-1.5 border border-gray-300">{contractorCompanyName || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">주소</th><td className="px-2 py-1.5 border border-gray-300">{contractorAddress || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">시공자 서명</th><td className="px-2 py-1.5 border border-gray-300">{sigDisplay || "-"}</td></tr>
                  </tbody>
                </table>
                <table className="w-full border-collapse border border-gray-300 text-left">
                  <caption className="text-left font-semibold text-gray-800 py-1">공사 정보</caption>
                  <tbody>
                    <tr className="border-b border-gray-200"><th className="w-28 bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">공사명</th><td className="px-2 py-1.5 border border-gray-300">{projectName || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">공사장소(면적)</th><td className="px-2 py-1.5 border border-gray-300">{projectPlace || "-"}</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">공사기간</th><td className="px-2 py-1.5 border border-gray-300">{projectStartDate || "-"} ~ {projectEndDate || "-"}</td></tr>
                  </tbody>
                </table>
                <table className="w-full border-collapse border border-gray-300 text-left">
                  <caption className="text-left font-semibold text-gray-800 py-1">계약금·선금·중도금·잔금</caption>
                  <tbody>
                    <tr className="border-b border-gray-200"><th className="w-40 bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">계약금액(VAT 별도)</th><td className="px-2 py-1.5 border border-gray-300">{contractAmountFormatted}원</td></tr>
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">선금</th><td className="px-2 py-1.5 border border-gray-300">{downPaymentPercent || "-"}% (계약이후 바로)</td></tr>
                    {interimPayments.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">{idx === 0 ? "중도금1차" : idx === 1 ? "중도금2차" : idx === 2 ? "중도금3차" : `중도금${idx + 1}차`}</th>
                        <td className="px-2 py-1.5 border border-gray-300">{item.percent || "-"}% (공사로부터 {item.daysAfter || "-"}일후)</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-200"><th className="bg-gray-50 px-2 py-1.5 border border-gray-300 font-medium">잔금</th><td className="px-2 py-1.5 border border-gray-300">{balancePercent || "-"}% (공사완료시)</td></tr>
                  </tbody>
                </table>
                {documentPath && (
                  <div className="border-t border-gray-200 pt-3">
                    {documentPath.toLowerCase().endsWith(".pdf") ? (
                      pdfPageImages.length > 0 ? (
                        <div className="space-y-4">
                          {pdfPageImages.map((dataUrl, i) => (
                            <img
                              key={i}
                              src={dataUrl}
                              alt={`계약 문서 ${i + 1}페이지`}
                              className="w-full border border-gray-200 bg-white shadow-sm"
                              style={{ maxWidth: 595 }}
                            />
                          ))}
                        </div>
                      ) : (
                        <PdfToA4Images documentPath={documentPath} onPagesLoaded={setPdfPageImages} />
                      )
                    ) : (
                      <div className="rounded border border-gray-200 bg-gray-50 overflow-hidden">
                        <img
                          src={`/api/company/contract-document?path=${encodeURIComponent(documentPath)}`}
                          alt="계약 문서"
                          className="max-h-[50vh] w-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [preFill, setPreFill] = useState<{ customerName: string; contact: string; consultationId?: number; estimateId?: number; estimateTitle?: string; address?: string; pyung?: number | string; estimateContractAmount?: number } | null>(null);
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

  /** 견적 선택 모달에 표시할 견적 (상담미팅 관리에서 완료된 항목 제외) */
  const estimatesToShowInModal = useMemo(() => {
    return estimates.filter((est) => {
      if (est.consultationId == null) return true;
      const c = consultations.find((x) => x.id === est.consultationId);
      const status = c?.status ?? "";
      return status !== "완료및정산" && status !== "완료";
    });
  }, [estimates, consultations]);

  const handleNewClick = () => {
    setSourceModalOpen(true);
    setSourceType("estimate");
    setLoadingSource(true);
    setPreFill(null);
    fetch("/api/consultations")
      .then((res) => res.json())
      .then((list) => setConsultations(Array.isArray(list) ? list : []))
      .catch(() => setConsultations([]));
    fetch("/api/estimates")
      .then((res) => res.json())
      .then((list) => setEstimates(Array.isArray(list) ? list : []))
      .catch(() => setEstimates([]))
      .finally(() => setLoadingSource(false));
  };

  const handleSelectConsultation = (c: Consultation) => {
    setPreFill({
      customerName: c.customerName ?? "",
      contact: c.contact ?? "",
      consultationId: c.id,
      address: c.address ?? "",
      pyung: c.pyung,
    });
    setSourceModalOpen(false);
    setFormOpen("new");
  };

  const handleSelectEstimate = (e: Estimate) => {
    const c = e.consultationId != null ? consultations.find((x) => x.id === e.consultationId) : undefined;
    const contractAmountFromEstimate = estimateTotalVatExclusive(e);
    setPreFill({
      customerName: e.customerName ?? "",
      contact: e.contact ?? "",
      estimateId: e.id,
      estimateTitle: e.title ?? "",
      address: c?.address ?? "",
      pyung: c?.pyung,
      estimateContractAmount: contractAmountFromEstimate > 0 ? contractAmountFromEstimate : undefined,
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
          <h3 className="text-sm font-semibold text-gray-800">견적에서 선택 (계약서는 견적 건만 작성 가능)</h3>
          <button type="button" onClick={() => setSourceModalOpen(false)} className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4">
          {loadingSource ? (
            <p className="py-8 text-center text-sm text-gray-500">불러오는 중...</p>
          ) : estimatesToShowInModal.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">견적 목록이 없습니다. 견적서를 먼저 작성한 뒤 계약을 등록할 수 있습니다. (상담미팅에서 완료된 건은 제외됩니다)</p>
          ) : (
            <ul className="space-y-2">
              {estimatesToShowInModal.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded border border-gray-100 p-3">
                  <span className="font-medium">{e.customerName || "-"}</span>
                  <span className="text-gray-500">{e.contact || ""}</span>
                  <span className="text-xs text-gray-400">{e.title || ""}</span>
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
                          {(c.status === "draft" || c.status === "sent") && (
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
                              {c.status === "draft" && <span className="text-gray-300">|</span>}
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
