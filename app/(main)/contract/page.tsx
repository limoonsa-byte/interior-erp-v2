"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PdfToA4Images } from "@/components/contract/PdfToA4Images";
import { SignBodyA4Viewer } from "@/components/contract/SignBodyA4Viewer";
import { SignedContractSummary } from "@/components/contract/SignedContractSummary";
import {
  buildContractViewPrintPayload,
  formatContractDocImagesPrintHtml,
  mountContractPrintRoot,
  runContractPrintDialog,
} from "@/lib/contractViewPrint";
import { computePaymentScheduleForDisplay, parseInterimLinesFromDetails, isVatIncluded, vatLabelText } from "@/lib/contractPaymentSchedule";
import { resolveContractBodyPdfUrl } from "@/lib/renderPdfUrlToPageImages";

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
  bodyMargins?: { top: number; right: number; bottom: number; left: number };
  details?: Record<string, unknown>;
  status: string;
  signToken?: string;
  signedAt?: string;
  signerName?: string;
  signerAddress?: string;
  signerResidentNumber?: string;
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

/** 견적 VAT 포함금액 (별도 × 1.1 후 만원 단위 절삭 — 견적서 미리보기와 동일) */
function estimateTotalVatInclusive(est: Estimate): number {
  const exclusive = estimateTotalVatExclusive(est);
  if (exclusive <= 0) return 0;
  return Math.floor((exclusive * 1.1) / 10000) * 10000;
}

type ContractPreFill = {
  customerName: string;
  contact: string;
  consultationId?: number;
  estimateId?: number;
  estimateTitle?: string;
  address?: string;
  pyung?: number | string;
  estimateContractAmount?: number;
  estimateContractAmountVatIncluded?: number;
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
  preFill: ContractPreFill | null;
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
  const [bodyMargins, setBodyMargins] = useState<{ top: number; right: number; bottom: number; left: number }>(() => {
    const m = contract?.bodyMargins;
    if (m && typeof m.top === "number" && typeof m.right === "number" && typeof m.bottom === "number" && typeof m.left === "number") {
      return { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
    }
    return { top: 15, right: 15, bottom: 15, left: 15 };
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingCompanyTemplate, setLoadingCompanyTemplate] = useState(false);

  const details = (contract?.details ?? {}) as Record<string, string>;
  const detailsUnknown = (contract?.details ?? {}) as Record<string, unknown>;
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
  /** false=부가세별도(기본), true=부가세포함 */
  const [vatIncluded, setVatIncluded] = useState(() => isVatIncluded(detailsUnknown));
  /** 견적에서 가져온 VAT 별도/포함 금액 — 체크 시 전환용 */
  const [estimateAmtExclusive, setEstimateAmtExclusive] = useState<number | null>(
    () => (preFill?.estimateContractAmount && preFill.estimateContractAmount > 0 ? preFill.estimateContractAmount : null)
  );
  const [estimateAmtVatIncluded, setEstimateAmtVatIncluded] = useState<number | null>(
    () =>
      preFill?.estimateContractAmountVatIncluded && preFill.estimateContractAmountVatIncluded > 0
        ? preFill.estimateContractAmountVatIncluded
        : null
  );
  const [downPaymentPercent, setDownPaymentPercent] = useState(details.downPaymentPercent ?? "");
  const [interimPayments, setInterimPayments] = useState<Array<{ percent: string; daysAfter: string }>>(() =>
    parseInterimLinesFromDetails(detailsUnknown).map((l) => ({
      percent: String(l.percent ?? "").trim(),
      daysAfter: String(l.daysAfter ?? "").trim(),
    }))
  );
  const [balancePercent, setBalancePercent] = useState(details.balancePercent ?? "");
  const [pdfPageImages, setPdfPageImages] = useState<string[]>([]);
  const [pdfPageSourcePath, setPdfPageSourcePath] = useState("");
  const [stampUrl, setStampUrl] = useState("");
  const [companyTemplateDocumentPath, setCompanyTemplateDocumentPath] = useState("");
  /** 관리(회사 계약서 양식)에만 본문이 있고 이 계약의 body가 비어 있을 때 인쇄·저장·본문 PDF에 쓰는 보조 본문 */
  const [companyTemplateBody, setCompanyTemplateBody] = useState("");
  const [specialProvisions, setSpecialProvisions] = useState(() => String(details.specialProvisions ?? ""));

  useEffect(() => {
    if (!documentPath || !documentPath.toLowerCase().endsWith(".pdf")) {
      setPdfPageImages([]);
      setPdfPageSourcePath("");
    }
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
    if (contract?.bodyMargins && typeof contract.bodyMargins.top === "number") {
      setBodyMargins({
        top: contract.bodyMargins.top,
        right: contract.bodyMargins.right,
        bottom: contract.bodyMargins.bottom,
        left: contract.bodyMargins.left,
      });
    }
    fetch("/api/company/company-contract-template")
      .then((res) => res.json())
      .then((data) => {
        setCompanyTemplateBody(data?.body != null ? String(data.body) : "");
        setCompanyTemplateDocumentPath(data?.documentPath != null ? String(data.documentPath) : "");
        if (!contract?.bodyMargins || typeof contract.bodyMargins.top !== "number") {
          if (data.bodyMargins) {
            setBodyMargins({
              top: Number(data.bodyMargins.top) || 15,
              right: Number(data.bodyMargins.right) || 15,
              bottom: Number(data.bodyMargins.bottom) || 15,
              left: Number(data.bodyMargins.left) || 15,
            });
          }
        }
      })
      .catch(() => {});
  }, [contract?.id, contract?.bodyMargins]);

  useEffect(() => {
    const d = (contract?.details ?? {}) as Record<string, string>;
    const du = (contract?.details ?? {}) as Record<string, unknown>;
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
    setVatIncluded(isVatIncluded(du));
    setDownPaymentPercent(d.downPaymentPercent ?? "");
    setInterimPayments(
      parseInterimLinesFromDetails(du).map((l) => ({
        percent: String(l.percent ?? "").trim(),
        daysAfter: String(l.daysAfter ?? "").trim(),
      }))
    );
    setBalancePercent(d.balancePercent ?? "");
    setSpecialProvisions(String(d.specialProvisions ?? ""));
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
      const exclusive =
        preFill.estimateContractAmount != null && preFill.estimateContractAmount > 0
          ? preFill.estimateContractAmount
          : null;
      const inclusive =
        preFill.estimateContractAmountVatIncluded != null && preFill.estimateContractAmountVatIncluded > 0
          ? preFill.estimateContractAmountVatIncluded
          : exclusive != null
            ? Math.floor((exclusive * 1.1) / 10000) * 10000
            : null;
      setEstimateAmtExclusive(exclusive);
      setEstimateAmtVatIncluded(inclusive != null && inclusive > 0 ? inclusive : null);
      if (exclusive != null) {
        setContractAmount(formatContractAmountDisplay(String(exclusive)));
        setVatIncluded(false);
      }
      if (preFill.address != null && preFill.address.trim()) {
        const p = preFill.pyung != null && String(preFill.pyung).trim() !== "" ? ` (${preFill.pyung}평)` : "";
        setProjectPlace((prev) => (prev.trim() ? prev : preFill.address!.trim() + p));
      } else if (preFill.pyung != null && String(preFill.pyung).trim() !== "") {
        setProjectPlace((prev) => (prev.trim() ? prev : `${preFill.pyung}평`));
      }
    }
  }, [preFill, isEdit]);

  /** 수정 시 연결된 견적에서 VAT 별도/포함 금액 로드 */
  useEffect(() => {
    const estimateId = contract?.estimateId ?? preFill?.estimateId;
    if (!estimateId) return;
    let cancelled = false;
    fetch(`/api/estimates/${estimateId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data?.error || !data) return;
        const exclusive = estimateTotalVatExclusive(data as Estimate);
        const inclusive = estimateTotalVatInclusive(data as Estimate);
        if (exclusive > 0) setEstimateAmtExclusive(exclusive);
        if (inclusive > 0) setEstimateAmtVatIncluded(inclusive);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contract?.estimateId, preFill?.estimateId]);

  const applyVatIncludedToggle = (checked: boolean) => {
    setVatIncluded(checked);
    if (checked) {
      if (estimateAmtVatIncluded != null && estimateAmtVatIncluded > 0) {
        setContractAmount(formatContractAmountDisplay(String(estimateAmtVatIncluded)));
      } else if (estimateAmtExclusive != null && estimateAmtExclusive > 0) {
        const inclusive = Math.floor((estimateAmtExclusive * 1.1) / 10000) * 10000;
        setEstimateAmtVatIncluded(inclusive);
        setContractAmount(formatContractAmountDisplay(String(inclusive)));
      }
    } else if (estimateAmtExclusive != null && estimateAmtExclusive > 0) {
      setContractAmount(formatContractAmountDisplay(String(estimateAmtExclusive)));
    }
  };

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
        if (data.bodyMargins) {
          setBodyMargins(data.bodyMargins);
        }
        setTitle(loadedTitle);
        if (loadedBody.trim() !== "") {
          setBody(loadedBody);
          setDocumentPath("");
          setUploadFileName(null);
          alert("마스터 관리에서 저장한 계약서 양식(제목·본문)을 불러왔습니다.");
        } else if (loadedDocPath) {
          setBody("");
          setDocumentPath(loadedDocPath);
          setUploadFileName("마스터 PDF 적용됨");
          alert("마스터 PDF가 계약 문서로 적용되었습니다. 저장하면 서명 페이지에 PDF 그대로 표시됩니다.");
        } else {
          setBody("");
          setDocumentPath("");
          setUploadFileName(null);
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
        if (data.bodyMargins) {
          setBodyMargins({
            top: Number(data.bodyMargins.top) || 15,
            right: Number(data.bodyMargins.right) || 15,
            bottom: Number(data.bodyMargins.bottom) || 15,
            left: Number(data.bodyMargins.left) || 15,
          });
        }
        setTitle(loadedTitle);
        if (loadedBody.trim() !== "") {
          setBody(loadedBody);
          setDocumentPath("");
          setUploadFileName(null);
          alert("관리에서 등록한 회사 계약서 양식(제목·본문)을 불러왔습니다.");
        } else if (loadedDocPath) {
          setBody("");
          setDocumentPath(loadedDocPath);
          setCompanyTemplateDocumentPath(loadedDocPath);
          setUploadFileName("회사 PDF 적용됨");
          alert("회사 PDF가 계약 문서로 적용되었습니다.");
        } else {
          setBody("");
          setDocumentPath("");
          setCompanyTemplateDocumentPath("");
          setUploadFileName(null);
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
    if (contract?.id) formData.append("contractId", String(contract.id));
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
    detailsObj.vatIncluded = vatIncluded ? "1" : "0";
    if (downPaymentPercent.trim()) detailsObj.downPaymentPercent = downPaymentPercent.trim();
    detailsObj.interimPayments = JSON.stringify(interimPayments);
    const rawNum = Number(contractAmount.replace(/\D/g, "")) || 0;
    const sched = computePaymentScheduleForDisplay(rawNum, downPaymentPercent, interimPayments, balancePercent);
    detailsObj.balancePercent = sched.balancePercentLabel;
    detailsObj.specialProvisions = specialProvisions.trim();

    const bodyHtmlToSave = body.trim() || companyTemplateBody.trim();

    const payload = {
      title: title.trim(),
      customerName: customerName.trim(),
      contact: contact.trim(),
      signerEmail: signerEmail.trim() || undefined,
      documentPath: documentPath || undefined,
      body: bodyHtmlToSave || undefined,
      details: Object.keys(detailsObj).length > 0 ? detailsObj : undefined,
      bodyMargins,
      consultationId: preFill?.consultationId ?? contract?.consultationId,
      estimateId: preFill?.estimateId ?? contract?.estimateId,
    };
    const doUploadBodyPdf = (contractId: number): Promise<{ documentPath?: string } | void> => {
      if (!bodyHtmlToSave) return Promise.resolve();
      return generateBodyPdf(bodyHtmlToSave)
        .then((blob) => {
          const formData = new FormData();
          formData.append("file", new File([blob], "contract-body.pdf", { type: "application/pdf" }));
          formData.append("contractId", String(contractId));
          formData.append("mergeCompanyContractAppendix", "1");
          return fetch("/api/contracts/upload", { method: "POST", body: formData });
        })
        .then((res) => res.json().then((data: { error?: string; documentPath?: string }) => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
          if (!ok || data.error) throw new Error(data?.error || "본문 PDF 업로드 실패");
          return { documentPath: data.documentPath };
        })
        .catch((err) => {
          const msg = err?.message || "";
          if (msg.includes("업로드") || msg.includes("upload")) throw err;
          throw new Error("본문 PDF 변환 실패: " + (msg || "알 수 없음"));
        });
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
        .then(() => doUploadBodyPdf(contract.id))
        .then((result) => {
          if (result?.documentPath) {
            setDocumentPath(result.documentPath);
            setUploadFileName("본문에서 자동 생성됨");
          }
          onSave();
        })
        .catch((err) => alert(err?.error || err?.message || "수정 실패"))
        .finally(() => setSaving(false));
    } else {
      fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json())
        .then(async (data) => {
          if (data.error) throw new Error(data.error);
          const id = data.id as number | undefined;
          if (id != null && bodyHtmlToSave) {
            const result = await doUploadBodyPdf(id);
            if (result?.documentPath) {
              setDocumentPath(result.documentPath);
              setUploadFileName("본문에서 자동 생성됨");
            }
          }
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

  const paymentSchedule = React.useMemo(() => {
    const raw = Number(contractAmount.replace(/\D/g, "")) || 0;
    return computePaymentScheduleForDisplay(raw, downPaymentPercent, interimPayments, balancePercent);
  }, [contractAmount, downPaymentPercent, interimPayments, balancePercent]);

  /** 인쇄/미리보기 공통: 1페이지 + 본문 HTML (계약서 작성 인쇄 미리보기와 동일한 구조·간격) */
  const contractPrintData = React.useMemo(() => {
    const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const fmtAmt = (n: number) => n ? n.toLocaleString("ko-KR") : "";
    const downAmtFmt = fmtAmt(paymentSchedule.downAmount);
    const balanceAmtFmt = fmtAmt(paymentSchedule.balanceAmount);
    const sp = "\u00A0\u00A0";
    const interimRows = interimPayments.map((item, idx) => {
      const amt = fmtAmt(paymentSchedule.interimAmounts[idx] ?? 0);
      const label = idx === 0 ? "중도금1차" : idx === 1 ? "중도금2차" : idx === 2 ? "중도금3차" : `중도금${idx + 1}차`;
      const days = (item.daysAfter || "").trim();
      const daysPart = days ? `${esc(days)}일` : "\u00A0\u00A0\u00A0";
      return `<tr><td class="contract-print-row-label">${label}</td><td colspan="3" class="contract-print-value">${amt}원(${sp}${esc(item.percent || "")}${sp}%) <span class="contract-print-red">공사로부터 ${daysPart}후</span></td></tr>`;
    }).join("");
    const rowspanMoney = 3 + interimPayments.length;
    const stampSrc = stampUrl || (typeof window !== "undefined" ? `${window.location.origin}/api/company/asset/stamp` : "");
    const page1Title = (title || "실내건축공사 표준도급 계약서").trim() || "실내건축공사 표준도급 계약서";
    const specialRaw = specialProvisions.trim();
    const specialBlock =
      specialRaw.length > 0
        ? `<div class="contract-print-special-provisions"><div class="contract-print-special-title">특약사항</div><div class="contract-print-special-body">${esc(specialRaw).replace(/\n/g, "<br/>")}</div></div>`
        : "";
    const bodyHtmlEffective = body.trim() || companyTemplateBody.trim();
    const page1 =
      `<div class="contract-print-summary contract-print-page1">` +
      `<div class="contract-print-page1-top">` +
      `<h1 class="contract-print-title">${esc(page1Title)}</h1>` +
      `<table class="contract-print-main-tbl">` +
      `<colgroup><col class="contract-print-col-section" /><col class="contract-print-col-label" /><col class="contract-print-col-sub" /><col class="contract-print-col-value2" /><col class="contract-print-col-in" /></colgroup>` +
      `<tbody>` +
      `<tr><th rowspan="2" class="contract-print-section-label">계<br/>약<br/>자</th><td class="contract-print-row-label">발주자(수급인)</td><td colspan="2" class="contract-print-value">${esc(clientName || "")}</td><td class="contract-print-in">(인)</td></tr>` +
      `<tr><td class="contract-print-row-label">시공자(하수급인)</td><td colspan="2" class="contract-print-value">${esc(contractorCompanyName || "")}</td><td class="contract-print-in">(인)</td></tr>` +
      `<tr><th rowspan="4" class="contract-print-section-label">공<br/>사<br/>개<br/>요</th><td class="contract-print-row-label">공 사 명</td><td colspan="3" class="contract-print-value">${esc(projectName || "")}</td></tr>` +
      `<tr><td class="contract-print-row-label">공사장소(면적)</td><td colspan="3" class="contract-print-value">${esc(projectPlace || "")}</td></tr>` +
      `<tr><td rowspan="2" class="contract-print-row-label">공사기간</td><td class="contract-print-sub-label">착공</td><td colspan="2" class="contract-print-value">${esc(projectStartDate || "")}</td></tr>` +
      `<tr><td class="contract-print-sub-label">준공</td><td colspan="2" class="contract-print-value">${esc(projectEndDate || "")}</td></tr>` +
      `<tr><th rowspan="${rowspanMoney}" class="contract-print-section-label">공<br/>사<br/>대<br/>금</th><td class="contract-print-row-label">계약금액</td><td colspan="3" class="contract-print-value">${esc(contractAmountFormatted)}원 <span class="contract-print-red">${vatLabelText(vatIncluded)}</span></td></tr>` +
      `<tr><td class="contract-print-row-label">선금</td><td colspan="3" class="contract-print-value">${downAmtFmt}원(${sp}${esc(downPaymentPercent || "")}${sp}%) <span class="contract-print-red">계약이후 바로</span></td></tr>` +
      interimRows +
      `<tr><td class="contract-print-row-label">잔 금</td><td colspan="3" class="contract-print-value">${balanceAmtFmt}원(${sp}${esc(paymentSchedule.balancePercentLabel)}${sp}%) <span class="contract-print-red">공사완료 시</span></td></tr>` +
      `</tbody></table>` +
      (stampSrc ? `<img src="${stampSrc}" class="contract-print-stamp" alt="" />` : "") +
      `</div>` +
      specialBlock +
      `<p class="contract-print-clause">발주자(수급인, 이하 &quot;갑&quot;이라한다)와 시공자(하수급인, 이하 &quot;을&quot;이라 한다)는 상기와 같이 계약을 체결하고 전자계약으로 작성한다.</p>` +
      `<div class="contract-print-signatures">` +
      `<div class="contract-print-sig-block"><p class="contract-print-sig-title">발주자(수급인)</p><p class="contract-print-sig-line">주소 : ${esc(clientAddress || "")}</p><p class="contract-print-sig-line">주민번호 : ${esc(clientResidentNumber || "")}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(clientName || "")}</span><span class="contract-print-in-fixed contract-print-red">(인)</span></p></div>` +
      `<div class="contract-print-sig-block"><p class="contract-print-sig-title">시공자(하수급인)</p><p class="contract-print-sig-line">주소 : ${esc(contractorAddress || "")}</p><p class="contract-print-sig-line">상호 : ${esc(contractorCompanyName || "")}</p><p class="contract-print-sig-line contract-print-sig-line-name"><span class="contract-print-sig-name-text">성명 : ${esc(sigDisplay || "")}</span><span class="contract-print-in-fixed contract-print-stamp-in-wrap"><span class="contract-print-red contract-print-in-text">(인)</span>${stampSrc ? `<img src="${stampSrc}" class="contract-print-stamp-sig" alt="" />` : ""}</span></p></div>` +
      `</div></div>`;
    const cleanBody = bodyHtmlEffective.replace(/<div[^>]*data-page-break[^>]*><\/div>/gi, "");
    const bodySection = cleanBody.trim()
      ? `<div class="contract-print-body contract-print-body-from-page2 prose prose-sm max-w-none">${cleanBody}</div>`
      : "";
    return { page1, bodySection, full: page1 + bodySection };
  }, [title, clientName, clientAddress, clientResidentNumber, contractorCompanyName, contractorAddress, projectName, projectPlace, projectStartDate, projectEndDate, contractAmountFormatted, vatIncluded, downPaymentPercent, interimPayments, body, companyTemplateBody, stampUrl, sigDisplay, paymentSchedule, specialProvisions]);
  const contractPrintHtml = contractPrintData.full;

  /** 본문 HTML을 서명용 PDF(2페이지부터 해당)로 변환. 브라우저 전용. */
  const generateBodyPdf = async (bodyHtml: string): Promise<Blob> => {
    /** 관리 에디터 자동 페이지 브레이크용 div — 화면에서는 간격용이나 html2canvas는 높이 그대로 캡처해 앞쪽에 여러 장의 빈 PDF 페이지가 생김(제1조가 뒤 장으로 밀리는 현상) */
    const stripPageBreakSpacers = (html: string) =>
      html.replace(/<div[^>]*data-page-break[^>]*>[\s\S]*?<\/div>/gi, "");
    const A4_W_PX = 794;
    const A4_H_PX = 1123;
    const SCALE = 2;
    const root = document.createElement("div");
    root.id = "contract-body-pdf-capture-root";
    const inner = document.createElement("div");
    inner.className = "contract-print-body contract-print-body-from-page2 prose prose-sm max-w-none";
    inner.innerHTML = stripPageBreakSpacers(bodyHtml);
    root.appendChild(inner);
    document.body.appendChild(root);
    try {
      const imgs = inner.querySelectorAll("img");
      await Promise.all(
        Array.from(imgs).map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((r) => {
                  img.onload = () => r();
                  img.onerror = () => r();
                  setTimeout(r, 3000);
                })
        )
      );
      await new Promise((r) => setTimeout(r, 200));
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(inner, {
        scale: SCALE,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: A4_W_PX,
        windowWidth: A4_W_PX,
        logging: false,
      });
    const fullHeight = Math.max(canvas.height, 1);
    const chunkHeight = A4_H_PX * SCALE;
    const { PDFDocument } = await import("pdf-lib");
    const A4_W_PT = 595.28;
    const A4_H_PT = 841.89;
    const pdfDoc = await PDFDocument.create();
    for (let y = 0; y < fullHeight; y += chunkHeight) {
      const h = Math.min(chunkHeight, fullHeight - y);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = h;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      if (canvas.height > 0) {
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      }
      const dataUrl = pageCanvas.toDataURL("image/png");
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const img = await pdfDoc.embedPng(bytes);
      const scale = Math.min(A4_W_PT / img.width, A4_H_PT / img.height);
      const w = img.width * scale;
      const he = img.height * scale;
      const page = pdfDoc.addPage([A4_W_PT, A4_H_PT]);
      page.drawImage(img, { x: 0, y: A4_H_PT - he, width: w, height: he });
    }
      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
    } finally {
      root.remove();
    }
  };

  const loadPdfPagesForPrint = async (docPath: string): Promise<string[]> => {
    const url = `${window.location.origin}/api/company/contract-document?path=${encodeURIComponent(docPath)}`;
    const pdfjsLib = await import("pdfjs-dist");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lib = pdfjsLib as any;
    if (lib.GlobalWorkerOptions) {
      lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version || "5.4.296"}/build/pdf.worker.min.mjs`;
    }
    const loadingTask = lib.getDocument({ url });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const scale = 2;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const renderTask = page.render({ canvasContext: ctx, viewport });
      await (renderTask.promise || Promise.resolve());
      pages.push(canvas.toDataURL("image/png"));
    }
    return pages;
  };

  const handlePrint = async () => {
    const printRootId = "contract-print-only";
    const effectiveDocPath = documentPath.trim() || companyTemplateDocumentPath.trim();
    const isPdfDoc = effectiveDocPath.toLowerCase().endsWith(".pdf");
    let resolvedPdfPages = pdfPageImages;
    const hasCachedCurrentPdf = pdfPageSourcePath === effectiveDocPath;
    if (!hasCachedCurrentPdf) resolvedPdfPages = [];
    if (isPdfDoc && resolvedPdfPages.length === 0 && effectiveDocPath) {
      try {
        resolvedPdfPages = await loadPdfPagesForPrint(effectiveDocPath);
        if (resolvedPdfPages.length > 0) {
          setPdfPageImages(resolvedPdfPages);
          setPdfPageSourcePath(effectiveDocPath);
        }
      } catch (e) {
        console.error("print pdf pages load failed:", e);
      }
    }
    if (isPdfDoc && resolvedPdfPages.length === 0) {
      alert("첨부된 PDF 본문을 불러오지 못했습니다. 저장 후 다시 시도해 주세요.");
    }
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      if (!contractPrintHtml.includes("contract-print-clause") || !contractPrintHtml.includes("contract-print-signatures") || !contractPrintHtml.includes("발주자(수급인)") || !contractPrintHtml.includes("시공자(하수급인)")) {
        console.error("[계약서 인쇄] 1페이지 필수 영역(약관 문구·서명란)이 누락되었습니다. 해당 블록을 삭제하지 마세요.");
      }
    }
    const hasPdfPages = isPdfDoc && resolvedPdfPages.length > 0;
    /**
     * 관리 → 계약서 양식의 PDF는 본문(1조~)부터 시작하는 파일이라 첫 장을 자르면 안 됨.
     * 예전: 회사 양식 PDF 1쪽이 요약표와 겹쳐 보일까봐 동일 파일이면 첫 장을 잘랐는데,
     *      “계약서 본문.pdf”처럼 1조부터 시작하는 PDF에서는 1조가 통째로 잘려 5조부터 보이는 문제 발생.
     * → 자르지 않고 원본 PDF 전체를 그대로 사용.
     */
    const printPdfPages = hasPdfPages ? [...resolvedPdfPages] : [];
    const docSection =
      printPdfPages.length > 0
        ? `<div class="contract-print-doc-pages">${printPdfPages.map((dataUrl, i) => `<div class="contract-print-doc-page"><img src="${dataUrl}" alt="계약 문서 ${i + 1}페이지" class="contract-print-doc-img" /></div>`).join("")}</div>`
        : effectiveDocPath && !effectiveDocPath.toLowerCase().endsWith(".pdf")
          ? `<div class="contract-print-doc-pages"><div class="contract-print-doc-page"><div class="rounded border border-gray-200 bg-gray-50 overflow-hidden"><img src="/api/company/contract-document?path=${encodeURIComponent(effectiveDocPath)}" alt="계약 문서" class="contract-print-doc-img max-h-[50vh] w-full object-contain" /></div></div></div>`
          : "";
    /**
     * PDF만 있고 인쇄할 HTML 본문이 전혀 없을 때만 HTML 블록 생략.
     * 계약 body 또는 관리(회사 계약서 양식) 본문 중 하나라도 있으면 인쇄에 포함.
     * 저장 후 본문이 PDF로 병합된 계약은 본문이 PDF·HTML에 겹칠 수 있음.
     */
    const bodyForPrintOmitCheck = body.trim() || companyTemplateBody.trim();
    const omitHtmlBodyBecausePdf =
      documentPath.trim().toLowerCase().endsWith(".pdf") &&
      documentPath.trim().length > 0 &&
      !bodyForPrintOmitCheck;
    // 1페이지에서 HTML 본문을 분리 → 2페이지부터 본문, 그 다음 PDF 부록
    const div = document.createElement("div");
    div.innerHTML = contractPrintHtml;
    const bodyEl = div.querySelector(".contract-print-body.contract-print-body-from-page2");
    let bodyHtmlSection = "";
    if (bodyEl) {
      if (!omitHtmlBodyBecausePdf) {
        bodyHtmlSection = `<div class="contract-print-body-section">${bodyEl.outerHTML}</div>`;
      }
      bodyEl.remove();
    }
    const firstPageHtml = div.innerHTML;
    const wrap = document.createElement("div");
    wrap.id = printRootId;
    wrap.className = "contract-print-only-root";
    wrap.style.cssText = `box-sizing: border-box;`;
    wrap.innerHTML = `<div class="contract-print-first-page" style="padding:0;box-sizing:border-box">${firstPageHtml}</div>${bodyHtmlSection}${docSection}`;
    document.body.appendChild(wrap);
    document.body.classList.add("contract-printing");
    const noHeaderFooterStyle = document.createElement("style");
    noHeaderFooterStyle.setAttribute("media", "print");
    noHeaderFooterStyle.id = "contract-print-no-header-footer";
    const contentH = 297;
    /* 요약 1페이지 높이를 297mm로 고정하면 내용이 넘칠 때 브라우저가 표·특약·서명을 여러 인쇄 장으로 쪼개 표가 2장째로 가는 등 깨짐 → 높이 고정 제거(globals.css의 자연 높이·page-break 유지) */
    noHeaderFooterStyle.textContent = `@page { size: A4; margin: 0; } #contract-print-only.contract-print-only-root { width: 100%; margin: 0; padding: 0; box-sizing: border-box; } #contract-print-only .contract-print-first-page { box-sizing: border-box; width: 100%; } #contract-print-only .contract-print-first-page .contract-print-body-from-page2 { padding: 0; box-sizing: border-box; } #contract-print-only .contract-print-body-section { page-break-before: always; padding: 0; box-sizing: border-box; font-size: 14px; line-height: 1.75; } #contract-print-only .contract-print-body-section .contract-print-body-from-page2 { padding: 0; } #contract-print-only .contract-print-doc-page { page-break-after: always; box-sizing: border-box; width: 100%; height: ${contentH}mm; padding: 0; margin: 0; overflow: hidden; } #contract-print-only .contract-print-doc-page:last-child { page-break-after: auto; } #contract-print-only .contract-print-doc-page .contract-print-doc-img { width: 100%; height: 100%; display: block; object-fit: contain; margin: 0; padding: 0; }`;
    document.head.appendChild(noHeaderFooterStyle);
    const prevTitle = document.title;
    const safeName = (title || "제목없음").trim().replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "제목없음";
    document.title = `계약서 ${safeName}`;
    window.print();
    const cleanup = () => {
      document.title = prevTitle;
      document.body.classList.remove("contract-printing");
      const styleEl = document.getElementById("contract-print-no-header-footer");
      if (styleEl) styleEl.remove();
      const root = document.getElementById(printRootId);
      if (root) root.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(cleanup, 2000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? "계약 수정" : "신규 계약"}</h2>
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
        <div className="flex flex-wrap gap-2">
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
              title="브라우저 인쇄 창이 열립니다. PDF로 저장하려면 대상에서 &quot;PDF로 저장&quot;을 선택하세요. 머리글·바닥글을 끄면 날짜·URL이 나오지 않습니다."
            >
              인쇄
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
        </div>
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
          <h3 className="mb-3 text-sm font-semibold text-gray-800">계약 요약 (발주자·시공자)</h3>
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
              <label className="block text-xs font-medium text-gray-600">
                계약금액{" "}
                <span className="text-gray-500 font-normal">
                  ({vatIncluded ? "VAT 포함" : "VAT 별도"})
                </span>
              </label>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(formatContractAmountDisplay(e.target.value))}
                  className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="견적에서 선택 시 자동 입력"
                />
                <span className="text-xs text-gray-500 shrink-0">원</span>
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vatIncluded}
                    onChange={(e) => applyVatIncludedToggle(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  부가세포함
                </label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                기본은 부가세별도입니다. 체크 시 견적서의 VAT 포함금액을 계약금액에 넣고, 계약서에 &quot;부가세포함&quot;으로 표시됩니다.
              </p>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <label className="block text-xs font-medium text-gray-600">선금</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0" />
                <input type="text" inputMode="numeric" value={downPaymentPercent} onChange={(e) => setDownPaymentPercent(e.target.value)} className="w-14 rounded border border-gray-300 px-2 py-1.5 text-sm text-right" placeholder="30" />
                <span className="text-sm text-gray-600">% : 계약이후 바로</span>
                {paymentSchedule.downAmount > 0 ? (
                  <span className="text-sm font-medium text-gray-800">→ {paymentSchedule.downAmount.toLocaleString("ko-KR")}원</span>
                ) : null}
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
                  {(paymentSchedule.interimAmounts[idx] ?? 0) > 0 ? (
                    <span className="text-sm font-medium text-gray-800">→ {(paymentSchedule.interimAmounts[idx] ?? 0).toLocaleString("ko-KR")}원</span>
                  ) : null}
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
              <label className="block text-xs font-medium text-gray-600">잔금 <span className="font-normal text-gray-400">(자동: 총액 − 선금 − 중도금)</span></label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0" />
                <span className="text-sm font-medium text-gray-900 tabular-nums">
                  {paymentSchedule.balanceAmount > 0 || paymentSchedule.balancePercentLabel
                    ? `${paymentSchedule.balanceAmount.toLocaleString("ko-KR")}원 (${paymentSchedule.balancePercentLabel || "0"}%)`
                    : "—"}
                </span>
                <span className="text-sm text-gray-600">공사완료 시</span>
              </div>
            </div>
            <div className="sm:col-span-2 mt-2 border-t border-gray-200 pt-3">
              <label className="block text-xs font-medium text-gray-600">특약사항</label>
              <p className="mt-0.5 text-[11px] text-gray-500">
                인쇄 1페이지에서 공사대금 표와 하단 약관 문구 사이에 들어갑니다. 줄바꿈은 그대로 반영됩니다.
              </p>
              <textarea
                value={specialProvisions}
                onChange={(e) => setSpecialProvisions(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900"
                placeholder="예) 별첨 견적서에 명시된 자재·공법으로 시공한다."
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function ContractPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [formOpen, setFormOpen] = useState<"new" | number | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"consultation" | "estimate">("consultation");
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [preFill, setPreFill] = useState<ContractPreFill | null>(null);
  const [sendModal, setSendModal] = useState<{ id: number; signUrl: string; title?: string } | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [signViewContract, setSignViewContract] = useState<Contract | null>(null);
  /** 계약서 보기: PDF 로드 실패 시 DB에 있는 HTML 본문(body)으로 표시 */
  const [viewBodyPdfFallback, setViewBodyPdfFallback] = useState(false);
  /** 계약서 보기: 본문 PDF 페이지 이미지 (보기·미리보기·인쇄 공통) */
  const [viewDocPageImages, setViewDocPageImages] = useState<string[]>([]);
  const [contractPrintPreview, setContractPrintPreview] = useState<{
    page1Image: string;
    docImages: string[];
  } | null>(null);
  const [contractPrintPreviewLoading, setContractPrintPreviewLoading] = useState(false);
  /** 계약 건에 본문 없을 때 관리(회사 양식) HTML */
  const [viewCompanyTemplateFallback, setViewCompanyTemplateFallback] = useState<{
    body?: string;
    bodyMargins?: { top: number; right: number; bottom: number; left: number };
  } | null>(null);
  const [viewDocPdfFailed, setViewDocPdfFailed] = useState(false);
  const [emailModal, setEmailModal] = useState<Contract | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const contractViewSummaryRef = useRef<HTMLDivElement>(null);
  const emailCaptureFromViewRef = useRef<string | null>(null);
  /** 이메일 발송 시 인쇄/PDF와 동일하게 추가 문서 페이지 이미지(data URL) 목록 */
  const emailDocPagesRef = useRef<string[]>([]);

  useEffect(() => {
    if (signViewContract) {
      setViewBodyPdfFallback(false);
      setViewDocPageImages([]);
      setContractPrintPreview(null);
      setViewCompanyTemplateFallback(null);
      setViewDocPdfFailed(false);
    }
  }, [signViewContract?.id]);

  useEffect(() => {
    if (!signViewContract?.id) return;
    if (signViewContract.body?.trim()) {
      setViewCompanyTemplateFallback(null);
      return;
    }
    let cancelled = false;
    fetch("/api/company/company-contract-template")
      .then((r) => r.json())
      .then((data: { body?: string; bodyMargins?: { top: number; right: number; bottom: number; left: number } }) => {
        if (cancelled || !data.body?.trim()) return;
        setViewCompanyTemplateFallback({
          body: data.body,
          bodyMargins: data.bodyMargins,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signViewContract?.id, signViewContract?.body]);

  const runContractViewPrint = async (contract: Contract) => {
    const payload = await buildContractViewPrintPayload(contract, {
      summaryEl: contractViewSummaryRef.current,
      capturePage1: captureContractViewPage1AsImage,
      cachedDocImages: viewDocPageImages,
    });
    mountContractPrintRoot(payload, contractViewSummaryRef.current);
    runContractPrintDialog(contract.title || "계약서");
  };

  const openContractPrintPreview = async () => {
    if (!signViewContract) return;
    setContractPrintPreviewLoading(true);
    setContractPrintPreview(null);
    try {
      const payload = await buildContractViewPrintPayload(signViewContract, {
        summaryEl: contractViewSummaryRef.current,
        capturePage1: captureContractViewPage1AsImage,
        cachedDocImages: viewDocPageImages,
      });
      if (payload.docImages.length > 0 && viewDocPageImages.length === 0) {
        setViewDocPageImages(payload.docImages);
      }
      setContractPrintPreview({
        page1Image: payload.page1Image,
        docImages: payload.docImages,
      });
    } catch (e) {
      console.warn("인쇄 미리보기 준비 실패:", e);
      alert("인쇄 미리보기를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setContractPrintPreviewLoading(false);
    }
  };

  /** 인쇄/PDF와 동일하게 1페이지(캡처) + 추가 문서 페이지로 PDF 생성 → base64 */
  const buildContractPdfForEmail = async (summaryImage: string, docPageDataUrls: string[]): Promise<string> => {
    const { PDFDocument } = await import("pdf-lib");
    const A4_W = 595.28;
    const A4_H = 841.89;
    const pdfDoc = await PDFDocument.create();

    const addImagePage = (dataUrl: string) => {
      const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
      if (!match) return Promise.resolve();
      const base64 = match[2];
      const binary = atob(base64);
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
    for (const url of docPageDataUrls) await addImagePage(url);

    const pdfBytes = await pdfDoc.save();
    const bytes = new Uint8Array(pdfBytes);
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  };

  /** 계약서 보기 1페이지 캡처해서 그대로 넣기. 배치/클론 없음. 해상도만 기기 비율로(선 흐림 방지). */
  const captureContractViewPage1AsImage = async (summaryEl: HTMLDivElement): Promise<string> => {
    const html2canvas = (await import("html2canvas")).default;
    const imgs = summaryEl.querySelectorAll("img");
    await Promise.all(Array.from(imgs).map((img) => img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 3000); })));
    await new Promise((r) => setTimeout(r, 300));
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const scale = Math.min(2, dpr);
    const canvas = await html2canvas(summaryEl, { scale, useCORS: true, backgroundColor: "#ffffff", logging: false });
    return canvas.toDataURL("image/png");
  };

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
    return contracts;
  }, [contracts]);

  /** 견적 선택 모달: 상담이 남아 있는 견적만, 완료 상담 제외 */
  const estimatesToShowInModal = useMemo(() => {
    return estimates.filter((est) => {
      if (est.consultationId == null) return false;
      const c = consultations.find((x) => x.id === est.consultationId);
      if (!c) return false;
      const status = c.status ?? "";
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
    const exclusive = estimateTotalVatExclusive(e);
    const inclusive = estimateTotalVatInclusive(e);
    setPreFill({
      customerName: e.customerName ?? "",
      contact: e.contact ?? "",
      estimateId: e.id,
      estimateTitle: e.title ?? "",
      address: c?.address ?? "",
      pyung: c?.pyung,
      estimateContractAmount: exclusive > 0 ? exclusive : undefined,
      estimateContractAmountVatIncluded: inclusive > 0 ? inclusive : undefined,
    });
    setSourceModalOpen(false);
    setFormOpen("new");
  };

  const handleSendClick = (c: Contract) => {
    if (c.status === "sent" && c.signToken) {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      setSendModal({ id: c.id, signUrl: `${base}/sign/${c.signToken}?v=1`, title: c.title });
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
        setSendModal({ id: c.id, signUrl: data.signUrl ? `${data.signUrl}${data.signUrl.includes("?") ? "&" : "?"}v=1` : `${base}/sign/${data.signToken}?v=1`, title: c.title });
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
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="row-actions-sticky w-32 p-2 text-center sm:hidden" aria-label="작업" />
                  <th className="p-2 sm:p-3">제목</th>
                  <th className="p-2 sm:p-3">고객명</th>
                  <th className="p-2 sm:p-3">연락처</th>
                  <th className="p-2 sm:p-3">상태</th>
                  <th className="p-2 sm:p-3">생성일</th>
                  <th className="hidden w-32 p-2 sm:table-cell sm:p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500">
                      저장된 계약이 없습니다. &quot;신규 계약&quot;으로 작성해 보세요.
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const actions = (
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
                        {c.status === "signed" && (
                          <>
                            <button
                              type="button"
                              onClick={() => setSignViewContract(c)}
                              className="rounded px-2 py-1 text-blue-600 hover:underline active:bg-blue-50"
                            >
                              계약서 보기
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => { setEmailModal(c); setEmailTo(c.signerEmail || ""); }}
                              className="rounded px-2 py-1 text-green-600 hover:underline active:bg-green-50"
                            >
                              이메일 보내기
                            </button>
                          </>
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
                    );
                    return (
                      <tr key={c.id} className="text-gray-700 hover:bg-gray-50">
                        <td className="row-actions-sticky whitespace-nowrap p-2 align-middle sm:hidden">{actions}</td>
                        <td className="p-2 font-medium sm:p-3">
                          <div className="max-w-[16rem] truncate" title={c.title || ""}>{c.title || "-"}</div>
                        </td>
                        <td className="p-2 sm:p-3">{c.customerName || "-"}</td>
                        <td className="p-2 sm:p-3">{c.contact || "-"}</td>
                        <td className="p-2 sm:p-3">{statusLabel(c.status)}</td>
                        <td className="p-2 sm:p-3">{formatDateYMD(c.createdAt)}</td>
                        <td className="hidden whitespace-nowrap p-2 align-middle sm:table-cell sm:p-3">{actions}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {signViewContract && (
        <div
          className="contract-view-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="contract-print-same-as-view relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="contract-view-print-hide sticky top-0 z-20 flex items-center justify-between bg-white px-5 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">계약서 보기</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openContractPrintPreview()}
                  disabled={contractPrintPreviewLoading}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {contractPrintPreviewLoading ? "미리보기 준비…" : "인쇄 미리보기"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!signViewContract) return;
                    void runContractViewPrint(signViewContract);
                  }}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  인쇄/PDF 저장
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const el = contractViewSummaryRef.current;
                    if (!el) return;
                    try {
                      emailCaptureFromViewRef.current = await captureContractViewPage1AsImage(el);
                      emailDocPagesRef.current = [];
                      const collectDocPages = () => {
                        const wrapper = document.querySelector(".contract-print-same-as-view .contract-print-doc-pages-wrapper");
                        if (!wrapper) return;
                        const imgs = wrapper.querySelectorAll<HTMLImageElement>("img[src^='data:']");
                        imgs.forEach((img) => { if (img.src) emailDocPagesRef.current.push(img.src); });
                      };
                      collectDocPages();
                      if (signViewContract.documentPath && emailDocPagesRef.current.length === 0) {
                        await new Promise((r) => setTimeout(r, 1500));
                        collectDocPages();
                      }
                      setEmailModal(signViewContract);
                      setEmailTo(signViewContract.signerEmail || "");
                      setSignViewContract(null);
                    } catch (e) {
                      console.warn("계약서 보기 캡처 실패:", e);
                      setEmailModal(signViewContract);
                      setEmailTo(signViewContract.signerEmail || "");
                      setSignViewContract(null);
                    }
                  }}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  이메일 보내기
                </button>
                <button type="button" onClick={() => setSignViewContract(null)} className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
              </div>
            </div>
            <div className="contract-view-print-content p-5 relative z-0">
              <div className="contract-view-print-hide mb-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                <div><span className="font-medium text-gray-500">제목: </span>{signViewContract.title || "-"}</div>
                <div><span className="font-medium text-gray-500">고객명: </span>{signViewContract.customerName || "-"}</div>
                <div><span className="font-medium text-gray-500">연락처: </span>{signViewContract.contact || "-"}</div>
                <div><span className="font-medium text-gray-500">서명자: </span>{signViewContract.signerName || "-"}</div>
                <div><span className="font-medium text-gray-500">서명일: </span>{signViewContract.signedAt ? new Date(signViewContract.signedAt).toLocaleDateString("ko-KR") : "-"}</div>
                <div><span className="font-medium text-gray-500">이메일: </span>{signViewContract.signerEmail || "-"}</div>
              </div>

              {signViewContract.details && (
                <div ref={contractViewSummaryRef} className="contract-sign-summary mb-4">
                  <SignedContractSummary contract={{ ...signViewContract, details: signViewContract.details ?? null }} />
                </div>
              )}

              {(() => {
                const c = signViewContract;
                const ownBody = c.body?.trim() || "";
                const templateBody = viewCompanyTemplateFallback?.body?.trim() || "";
                const bodyHtml = ownBody || templateBody;
                const hasBody = Boolean(bodyHtml);
                const pdfUrl = resolveContractBodyPdfUrl(c);
                const showBodyHtml = hasBody && !viewBodyPdfFallback;
                const showPdf = Boolean(pdfUrl);
                const usingCompanyTemplatePdf = !c.documentPath && showPdf;
                const usingCompanyTemplateHtml = !ownBody && Boolean(templateBody);
                const margins =
                  c.bodyMargins ??
                  viewCompanyTemplateFallback?.bodyMargins ??
                  { top: 15, right: 15, bottom: 15, left: 15 };
                return (
                  <>
                    {showBodyHtml && (
                      <div className="contract-print-doc-pages-wrapper contract-print-body-html-wrap mb-4">
                        <p className="mb-2 text-xs font-medium text-gray-600">
                          계약 본문 (편집 HTML)
                          {usingCompanyTemplateHtml ? " — 관리에 저장한 회사 양식" : ""}
                        </p>
                        <SignBodyA4Viewer bodyHtml={bodyHtml} margins={margins} />
                      </div>
                    )}
                    {showPdf && (
                      <div className="contract-print-doc-pages-wrapper mb-4">
                        <p className="mb-2 text-xs font-medium text-gray-600">
                          계약 본문 (PDF)
                          {usingCompanyTemplatePdf ? " — 관리에 저장한 회사 양식" : ""}
                          {showBodyHtml ? " · 인쇄·미리보기에 함께 포함" : ""}
                        </p>
                        <PdfToA4Images
                          documentUrl={pdfUrl!}
                          className="space-y-4"
                          fullWidth
                          onPagesLoaded={(urls) => {
                            setViewDocPageImages(urls);
                            setViewDocPdfFailed(false);
                          }}
                          onError={() => {
                            if (ownBody) setViewBodyPdfFallback(true);
                            else setViewDocPdfFailed(true);
                          }}
                        />
                      </div>
                    )}
                    {viewDocPdfFailed && !showBodyHtml && (
                      <p className="text-sm text-amber-700">
                        관리 화면의 「우리 회사 계약서 양식」에 PDF가 저장돼 있는지 확인해 주세요. 이 계약 건에는 본문 PDF가
                        따로 붙어 있지 않아 회사 양식을 불러옵니다.
                      </p>
                    )}
                    {!showBodyHtml && !showPdf && (
                      <p className="text-sm text-gray-500">
                        이 계약 건과 관리(회사 양식) 모두에 본문이 없습니다. 관리에서 PDF를 저장한 뒤 다시 열어 주세요.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {contractPrintPreview && signViewContract && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">인쇄 미리보기</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const payload = {
                      page1Image: contractPrintPreview.page1Image,
                      docImages: contractPrintPreview.docImages,
                      bodyHtmlSection: formatContractDocImagesPrintHtml(contractPrintPreview.docImages),
                    };
                    mountContractPrintRoot(payload, contractViewSummaryRef.current);
                    runContractPrintDialog(signViewContract.title || "계약서");
                  }}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  인쇄 / PDF 저장
                </button>
                <button
                  type="button"
                  onClick={() => setContractPrintPreview(null)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <p className="mb-3 text-xs text-gray-500">
                아래 내용이 인쇄·PDF 저장 결과와 같습니다. 1페이지 요약 + 본문 PDF
                {contractPrintPreview.docImages.length > 0
                  ? ` (${contractPrintPreview.docImages.length}쪽)`
                  : " (본문 없음)"}
                .
              </p>
              {contractPrintPreview.page1Image ? (
                <img
                  src={contractPrintPreview.page1Image}
                  alt="계약서 1페이지"
                  className="mb-4 w-full max-w-[210mm] border border-gray-200 bg-white"
                />
              ) : null}
              {contractPrintPreview.docImages.length > 0 ? (
                <div className="space-y-4">
                  {contractPrintPreview.docImages.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`계약 본문 ${i + 1}페이지`}
                      className="contract-print-doc-img w-full border border-gray-200 bg-white"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-amber-700">
                  본문 PDF를 불러오지 못했습니다. 계약서 보기에서 PDF가 보이는지 확인한 뒤 다시 시도해 주세요.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900 mb-4">계약서 이메일 보내기</h2>
            <p className="text-sm text-gray-600 mb-1">계약서: {emailModal.title}</p>
            <p className="text-sm text-gray-600 mb-4">고객: {emailModal.customerName}</p>
            <label className="block text-sm font-medium text-gray-700 mb-1">받는 이메일 주소</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              placeholder="이메일 주소를 입력하세요"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEmailModal(null); setEmailTo(""); }}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                취소
              </button>
              <button
                type="button"
                disabled={emailSending || !emailTo.trim()}
                onClick={async () => {
                  setEmailSending(true);
                  try {
                    let summaryImage: string | undefined = emailCaptureFromViewRef.current ?? undefined;
                    if (summaryImage) emailCaptureFromViewRef.current = null;
                    const docPages = [...emailDocPagesRef.current];
                    emailDocPagesRef.current = [];

                    if (!summaryImage) {
                      try {
                        const html2canvas = (await import("html2canvas")).default;
                        const offscreen = document.createElement("div");
                        offscreen.className = "contract-email-capture-print-style";
                        offscreen.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;min-height:1123px;background:#fff;z-index:-1;box-sizing:border-box;";
                        document.body.appendChild(offscreen);
                        const root = await import("react-dom/client");
                        const container = document.createElement("div");
                        offscreen.appendChild(container);
                        const r = root.createRoot(container);
                        r.render(React.createElement(SignedContractSummary, { contract: { ...emailModal, details: emailModal.details ?? null } }));
                        await new Promise((res) => setTimeout(res, 800));
                        const imgs = offscreen.querySelectorAll("img");
                        await Promise.all(Array.from(imgs).map((img) => img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); setTimeout(res, 2000); })));
                        await new Promise((res) => setTimeout(res, 200));
                        const canvas = await html2canvas(offscreen, { scale: 3, useCORS: true, backgroundColor: "#ffffff", width: 794, windowWidth: 794, logging: false });
                        summaryImage = canvas.toDataURL("image/png");
                        r.unmount();
                        document.body.removeChild(offscreen);
                      } catch (e) { console.warn("html2canvas capture failed, fallback to server-side:", e); }
                    }

                    /* 추가 문서가 있으면 클라이언트에서 전체 PDF 생성; 없으면 서버가 summaryImage + documentPath로 2페이지 이후 붙임 */
                    let pdfBase64: string | undefined;
                    if (summaryImage && docPages.length > 0) {
                      try {
                        pdfBase64 = await buildContractPdfForEmail(summaryImage, docPages);
                      } catch (e) {
                        console.warn("클라이언트 PDF 생성 실패, 서버 빌드로 전달:", e);
                      }
                    }

                    const res = await fetch("/api/contracts/send-email", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        contractId: emailModal.id,
                        email: emailTo.trim(),
                        summaryImage: pdfBase64 ? undefined : summaryImage,
                        pdfBase64,
                      }),
                    });
                    if (res.ok) {
                      alert("이메일이 발송되었습니다.");
                      setEmailModal(null);
                      setEmailTo("");
                    } else {
                      const d = await res.json();
                      alert(d.error || "이메일 발송에 실패했습니다.");
                    }
                  } catch {
                    alert("이메일 발송에 실패했습니다.");
                  } finally {
                    setEmailSending(false);
                  }
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {emailSending ? "발송 중..." : "발송"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
