"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseEstimateExcelRows } from "@/lib/parseEstimateExcel";

const ContractRichEditor = dynamic(
  () => import("@/components/admin/ContractRichEditor").then((m) => m.ContractRichEditor),
  { ssr: false, loading: () => <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-8 text-center text-sm text-gray-500">본문 편집기 로딩 중…</div> }
);

type DefaultTemplate = {
  id: number;
  title: string;
  items: unknown[];
  processOrder?: string[];
  createdAt?: string;
};

type AddedOrderRow = {
  id: string;
  processGroup: string;
  category: string;
  spec: string;
  unit: string;
  qty: string;
  materialUnitPrice: string;
  note: string;
};

const ORDER_LABELS_FOR_PARSE = [
  "목재발주",
  "중문발주",
  "조명",
  "전기부자재 발주",
  "타일(화장실용품)발주",
  "목공방재발주",
  "도배발주",
  "바닥재발주",
  "필름발주",
  "싱크가구발주",
  "기타",
];

function parseOrderDefaultExcel(rows: (string | number)[][]): Record<string, AddedOrderRow[]> | null {
  if (!rows.length) return null;
  const byLabel: Record<string, AddedOrderRow[]> = {};
  const headerRow = rows[0].map((c) => String(c ?? "").trim());
  const labelIdx = headerRow.findIndex((h) => h === "발주 유형");
  const categoryIdx = headerRow.findIndex((h) => h === "품목");

  // 형식 1: 1행에 발주 유형 | 품목 | 규격 | ... (한 행 헤더)
  if (labelIdx >= 0 && categoryIdx >= 0) {
    const specIdx = headerRow.findIndex((h) => h === "규격");
    const unitIdx = headerRow.findIndex((h) => h === "단위");
    const qtyIdx = headerRow.findIndex((h) => h === "수량");
    const priceIdx = headerRow.findIndex((h) => h === "자재 단가");
    const noteIdx = headerRow.findIndex((h) => h === "비고");
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as (string | number)[];
      const label = String(r[labelIdx] ?? "").trim();
      if (!label) continue;
      byLabel[label] = byLabel[label] ?? [];
      byLabel[label].push({
        id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
        processGroup: "",
        category: String(r[categoryIdx] ?? "").trim(),
        spec: specIdx >= 0 ? String(r[specIdx] ?? "").trim() : "",
        unit: unitIdx >= 0 ? String(r[unitIdx] ?? "").trim() : "",
        qty: qtyIdx >= 0 ? String(r[qtyIdx] ?? "").trim() : "",
        materialUnitPrice: priceIdx >= 0 ? String(r[priceIdx] ?? "").trim() : "",
        note: noteIdx >= 0 ? String(r[noteIdx] ?? "").trim() : "",
      });
    }
    if (Object.keys(byLabel).length > 0) return byLabel;
  }

  // 형식 2: 블록 양식 — 발주 유형 제목 행 → 품목/규격/... 헤더 → 데이터 행
  let i = 0;
  while (i < rows.length) {
    const r = rows[i] as (string | number)[];
    const first = String(r[0] ?? "").trim();
    const label = ORDER_LABELS_FOR_PARSE.find((l) => first === l);
    if (!label) {
      i++;
      continue;
    }
    i++;
    if (i >= rows.length) break;
    const headerRow2 = (rows[i] as (string | number)[]).map((c) => String(c ?? "").trim());
    const catIdx = headerRow2.findIndex((h) => h === "품목");
    if (catIdx < 0) {
      i++;
      continue;
    }
    const specIdx = headerRow2.findIndex((h) => h === "규격");
    const unitIdx = headerRow2.findIndex((h) => h === "단위");
    const qtyIdx = headerRow2.findIndex((h) => h === "수량");
    const priceIdx = headerRow2.findIndex((h) => h === "자재 단가");
    const noteIdx = headerRow2.findIndex((h) => h === "비고");
    i++;
    byLabel[label] = byLabel[label] ?? [];
    while (i < rows.length) {
      const dataRow = rows[i] as (string | number)[];
      const nextFirst = String(dataRow[0] ?? "").trim();
      if (ORDER_LABELS_FOR_PARSE.includes(nextFirst)) break;
      const category = String(dataRow[catIdx] ?? "").trim();
      const hasAny = category || (specIdx >= 0 && String(dataRow[specIdx] ?? "").trim()) || (qtyIdx >= 0 && String(dataRow[qtyIdx] ?? "").trim()) || (priceIdx >= 0 && String(dataRow[priceIdx] ?? "").trim());
      if (hasAny) {
        byLabel[label].push({
          id: `row-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          processGroup: "",
          category,
          spec: specIdx >= 0 ? String(dataRow[specIdx] ?? "").trim() : "",
          unit: unitIdx >= 0 ? String(dataRow[unitIdx] ?? "").trim() : "",
          qty: qtyIdx >= 0 ? String(dataRow[qtyIdx] ?? "").trim() : "",
          materialUnitPrice: priceIdx >= 0 ? String(dataRow[priceIdx] ?? "").trim() : "",
          note: noteIdx >= 0 ? String(dataRow[noteIdx] ?? "").trim() : "",
        });
      }
      i++;
    }
  }
  return Object.keys(byLabel).length > 0 ? byLabel : null;
}

export default function MasterAdminPage() {
  const router = useRouter();
  const excelInputRef = useRef<HTMLInputElement>(null);
  const orderExcelInputRef = useRef<HTMLInputElement>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [templates, setTemplates] = useState<DefaultTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [parsedTemplate, setParsedTemplate] = useState<{ items: unknown[]; processOrder: string[] } | null>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderParsedItems, setOrderParsedItems] = useState<Record<string, AddedOrderRow[]> | null>(null);
  const [orderSelectedFileName, setOrderSelectedFileName] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderSubmitLoading, setOrderSubmitLoading] = useState(false);
  const [contractTemplateTitle, setContractTemplateTitle] = useState("");
  const [contractTemplateBody, setContractTemplateBody] = useState("");
  const [contractTemplateDocumentPath, setContractTemplateDocumentPath] = useState<string | null>(null);
  const [contractTemplatePdfVersion, setContractTemplatePdfVersion] = useState(0);
  /** 글로 적은 본문 A4 페이지 여백 (mm) */
  const [bodyMarginTop, setBodyMarginTop] = useState(15);
  const [bodyMarginRight, setBodyMarginRight] = useState(15);
  const [bodyMarginBottom, setBodyMarginBottom] = useState(15);
  const [bodyMarginLeft, setBodyMarginLeft] = useState(15);
  const PAGE_GAP_MM = 8;
  const repeatMm = 297 + PAGE_GAP_MM;

  const a4CornersSvg = useMemo(() => {
    const mT = bodyMarginTop, mR = bodyMarginRight, mB = bodyMarginBottom, mL = bodyMarginLeft;
    const c = 4, sc = "#c0c0c0", w = 210, h = 297, rH = repeatMm;
    const p = (d: string) => `<path d='${d}' fill='none' stroke='${sc}' stroke-width='0.3'/>`;
    const svg = [
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${rH}'>`,
      `<rect x='0' y='0' width='${w}' height='${h}' fill='#fff'/>`,
      `<rect x='0' y='${h}' width='${w}' height='${PAGE_GAP_MM}' fill='#e8e8e8'/>`,
      p(`M ${mL - c} ${mT} L ${mL} ${mT} L ${mL} ${mT - c}`),
      p(`M ${w - mR + c} ${mT} L ${w - mR} ${mT} L ${w - mR} ${mT - c}`),
      p(`M ${mL - c} ${h - mB} L ${mL} ${h - mB} L ${mL} ${h - mB + c}`),
      p(`M ${w - mR + c} ${h - mB} L ${w - mR} ${h - mB} L ${w - mR} ${h - mB + c}`),
      `</svg>`,
    ].join("");
    const encoded = svg.replace(/#/g, "%23");
    return `url("data:image/svg+xml,${encoded}")`;
  }, [bodyMarginTop, bodyMarginRight, bodyMarginBottom, bodyMarginLeft, repeatMm]);

  const [contractTemplateLoading, setContractTemplateLoading] = useState(false);
  const [contractTemplateSaving, setContractTemplateSaving] = useState(false);
  const [contractTemplateError, setContractTemplateError] = useState("");
  const contractExcelInputRef = useRef<HTMLInputElement>(null);
  const [contractExcelFile, setContractExcelFile] = useState<File | null>(null);
  const [contractExcelImporting, setContractExcelImporting] = useState(false);
  const contractPdfInputRef = useRef<HTMLInputElement>(null);
  const [contractPdfFile, setContractPdfFile] = useState<File | null>(null);
  const [contractPdfImporting, setContractPdfImporting] = useState(false);
  const [contractPdfDeleting, setContractPdfDeleting] = useState(false);
  /** PDF가 있을 때 본문 보기 방식: "pdf" = PDF 뷰어, "text" = 글로 적기(텍스트 편집) */
  const [contractBodyViewMode, setContractBodyViewMode] = useState<"pdf" | "text">("pdf");
  const [masterSmtpConfigured, setMasterSmtpConfigured] = useState(false);
  const [masterSmtpUser, setMasterSmtpUser] = useState<string | null>(null);
  const [masterSmtpProvider, setMasterSmtpProvider] = useState<"google" | "app_password" | null>(null);
  const [appPasswordEmail, setAppPasswordEmail] = useState("");
  const [appPasswordValue, setAppPasswordValue] = useState("");
  const [appPasswordSaving, setAppPasswordSaving] = useState(false);
  const [googleClientIdPaste, setGoogleClientIdPaste] = useState("");
  const [googleClientSecretPaste, setGoogleClientSecretPaste] = useState("");
  const [oauthEnvStatus, setOauthEnvStatus] = useState<{
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasAppUrl: boolean;
    redirectUri: string | null;
  } | null>(null);
  const searchParams = useSearchParams();

  const STORAGE_KEY_CLIENT_ID = "master_oauth_google_client_id";
  const STORAGE_KEY_CLIENT_SECRET = "master_oauth_google_client_secret";

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_CLIENT_ID);
      const savedSecret = localStorage.getItem(STORAGE_KEY_CLIENT_SECRET);
      if (savedId != null) setGoogleClientIdPaste(savedId);
      if (savedSecret != null) setGoogleClientSecretPaste(savedSecret);
    } catch {
      // ignore
    }
  }, []);

  const saveOauthPasteValues = () => {
    try {
      localStorage.setItem(STORAGE_KEY_CLIENT_ID, googleClientIdPaste.trim());
      localStorage.setItem(STORAGE_KEY_CLIENT_SECRET, googleClientSecretPaste.trim());
      alert("저장되었습니다. 이 기기에서 다시 들어와도 입력값이 유지됩니다.");
    } catch {
      alert("저장에 실패했습니다.");
    }
  };

  useEffect(() => {
    fetch("/api/company/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.company?.isMaster) {
          setAllowed(true);
        } else {
          setAllowed(false);
          router.replace("/admin");
        }
      })
      .catch(() => {
        setAllowed(false);
        router.replace("/admin");
      });
  }, [router]);

  const loadTemplates = () => {
    setLoading(true);
    fetch("/api/admin/master/default-templates")
      .then((res) => {
        if (!res.ok) throw new Error("목록 조회 실패");
        return res.json();
      })
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (allowed) loadTemplates();
  }, [allowed]);

  const loadMasterSmtp = () => {
    fetch("/api/admin/master/smtp")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => {
        setMasterSmtpConfigured(data.configured === true);
        setMasterSmtpUser(data.user ?? null);
        setMasterSmtpProvider(data.provider === "google" || data.provider === "app_password" ? data.provider : null);
      })
      .catch(() => {
        setMasterSmtpConfigured(false);
        setMasterSmtpUser(null);
        setMasterSmtpProvider(null);
      });
  };

  const loadOauthStatus = () => {
    fetch("/api/admin/master/smtp-oauth/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.hasClientId === "boolean") setOauthEnvStatus(data);
        else setOauthEnvStatus(null);
      })
      .catch(() => setOauthEnvStatus(null));
  };

  useEffect(() => {
    if (allowed) {
      loadMasterSmtp();
      loadOauthStatus();
    }
  }, [allowed]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err && typeof window !== "undefined") {
      const hint = searchParams.get("hint") ?? "";
      const messages: Record<string, string> = {
        smtp_oauth_denied: "Gmail 권한을 허용하지 않았습니다.",
        smtp_oauth_invalid: "잘못된 요청입니다. 다시 Gmail로 연결을 시도해 주세요.",
        smtp_oauth_unauthorized: "마스터 권한이 필요합니다. 로그인 상태를 확인해 주세요.",
        smtp_oauth_not_configured: "Vercel에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET을 설정해 주세요.",
        smtp_oauth_no_refresh:
          "Google에서 refresh token을 받지 못했습니다. 이미 이 앱을 허용한 적이 있으면 Google이 다시 토큰을 주지 않을 수 있습니다.\n\n해결: Google 계정 → 보안 → Google에 연결된 앱 및 서비스에서 이 앱(인테리어 ERP) 접근을 해제한 뒤, 아래 'Gmail로 연결'을 다시 눌러 주세요.",
        smtp_oauth_token_error: hint
          ? `Google 토큰 오류: ${hint}\n\n앱 연결을 해제한 뒤 다시 시도해 보세요.`
          : "Google 토큰 발급 중 오류가 났습니다. Google에 연결된 앱에서 이 앱을 해제한 뒤 다시 시도해 주세요.",
        smtp_oauth_db_error: "DB 저장 중 오류가 났습니다. 마이그레이션(/api/admin/migrate)을 실행한 뒤 다시 시도해 주세요.",
      };
      const msg = messages[err] || "연결 중 오류가 발생했습니다.";
      window.history.replaceState({}, "", "/admin/master");
      alert(msg);
    }
  }, [searchParams]);

  useEffect(() => {
    const ok = searchParams.get("smtp_oauth");
    if (ok === "ok") {
      if (typeof window !== "undefined" && window.opener) {
        window.opener.location.reload();
        window.close();
        return;
      }
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/admin/master");
      loadMasterSmtp();
    }
  }, [searchParams]);

  const loadContractTemplate = () => {
    setContractTemplateLoading(true);
    fetch("/api/admin/master/contract-template")
      .then((res) => {
        if (!res.ok) throw new Error("조회 실패");
        return res.json();
      })
      .then((data) => {
        setContractTemplateTitle(data.title ?? "");
        setContractTemplateBody(data.body ?? "");
        setContractTemplateDocumentPath(data.documentPath != null ? String(data.documentPath) : null);
        const m = data.bodyMargins as { top?: number; right?: number; bottom?: number; left?: number } | undefined;
        if (m) {
          setBodyMarginTop(typeof m.top === "number" ? m.top : 15);
          setBodyMarginRight(typeof m.right === "number" ? m.right : 15);
          setBodyMarginBottom(typeof m.bottom === "number" ? m.bottom : 15);
          setBodyMarginLeft(typeof m.left === "number" ? m.left : 15);
        }
        setContractTemplateError("");
      })
      .catch(() => setContractTemplateError("계약서 양식을 불러올 수 없습니다."))
      .finally(() => setContractTemplateLoading(false));
  };

  useEffect(() => {
    if (allowed) loadContractTemplate();
  }, [allowed]);

  const handleContractTemplateSave = () => {
    setContractTemplateError("");
    setContractTemplateSaving(true);
    fetch("/api/admin/master/contract-template", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: contractTemplateTitle,
        body: contractTemplateBody,
        bodyMargins: { top: bodyMarginTop, right: bodyMarginRight, bottom: bodyMarginBottom, left: bodyMarginLeft },
      }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data: data as { error?: string; message?: string } })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          const msg = data.error || (status === 403 ? "마스터 권한이 필요합니다. 로그인을 확인하세요." : "저장 실패");
          setContractTemplateError(msg);
          alert(msg);
          return;
        }
        alert("계약서 양식이 저장되었습니다.");
        loadContractTemplate();
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "저장 실패";
        setContractTemplateError(msg);
        alert(`저장 실패: ${msg}`);
      })
      .finally(() => setContractTemplateSaving(false));
  };

  const handleContractExcelImport = () => {
    if (!contractExcelFile) {
      alert("엑셀 파일을 선택해 주세요.");
      return;
    }
    setContractTemplateError("");
    setContractExcelImporting(true);
    const formData = new FormData();
    formData.append("file", contractExcelFile);
    fetch("/api/admin/master/contract-template/import-excel", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContractExcelFile(null);
        if (contractExcelInputRef.current) contractExcelInputRef.current.value = "";
        loadContractTemplate();
        alert(data.message || "엑셀 양식이 적용되었습니다.");
      })
      .catch((e) => setContractTemplateError(e.message || "엑셀 불러오기 실패"))
      .finally(() => setContractExcelImporting(false));
  };

  const handleContractPdfImport = () => {
    if (!contractPdfFile) {
      alert("PDF 파일을 선택해 주세요.");
      return;
    }
    setContractTemplateError("");
    setContractPdfImporting(true);
    const formData = new FormData();
    formData.append("file", contractPdfFile);
    fetch("/api/admin/master/contract-template/upload-pdf", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContractPdfFile(null);
        if (contractPdfInputRef.current) contractPdfInputRef.current.value = "";
        loadContractTemplate();
        setContractTemplatePdfVersion((v) => v + 1);
        alert(data.message || "PDF가 그대로 저장되었습니다. 계약서 작성에서 마스터 양식 불러오기 시 이 PDF가 적용됩니다.");
      })
      .catch((e) => setContractTemplateError(e.message || "PDF 저장 실패"))
      .finally(() => setContractPdfImporting(false));
  };

  const handleContractPdfDelete = () => {
    if (!contractTemplateDocumentPath) return;
    if (!confirm("저장된 마스터 계약서 PDF를 삭제할까요? 계약서 작성에서 마스터 양식 불러오기 시 PDF가 더 이상 적용되지 않습니다.")) return;
    setContractTemplateError("");
    setContractPdfDeleting(true);
    fetch("/api/admin/master/contract-template/delete-pdf", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        loadContractTemplate();
        setContractTemplatePdfVersion((v) => v + 1);
        setContractBodyViewMode("text");
        alert(data.message || "PDF가 삭제되었습니다.");
      })
      .catch((e) => setContractTemplateError(e.message || "PDF 삭제 실패"))
      .finally(() => setContractPdfDeleting(false));
  };

  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError("");
    setSelectedFileName("");
    setParsedTemplate(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const data = ev.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: "binary" });
        if (!wb.SheetNames?.length) {
          setError("엑셀에 시트가 없습니다.");
          return;
        }
        let ws = wb.Sheets[wb.SheetNames[0]];
        for (const name of wb.SheetNames) {
          const s = wb.Sheets[name];
          const preview = XLSX.utils.sheet_to_json(s, { header: 1, defval: "", range: 0 }) as (string | number)[][];
          for (let r = 0; r < Math.min(15, preview.length); r++) {
            const a = String(preview[r]?.[0] ?? "").trim().toLowerCase();
            const b = String(preview[r]?.[1] ?? "").trim();
            const c = String(preview[r]?.[2] ?? "").trim();
            if (a === "no" || (b === "품목" && c === "규격")) {
              ws = s;
              break;
            }
          }
        }
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
        const result = parseEstimateExcelRows(rawRows);
        if (!result) {
          setError("엑셀에서 항목을 찾지 못했습니다. 견적서 엑셀 저장으로 내보낸 형식과 동일하게 No/품목/규격 헤더가 있어야 합니다.");
          return;
        }
        setParsedTemplate({ items: result.items, processOrder: result.processOrder });
        setSelectedFileName(file.name);
      } catch (err) {
        console.error(err);
        setError("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAdd = () => {
    setError("");
    const t = title.trim();
    if (!t) {
      setError("템플릿 제목을 입력해 주세요.");
      return;
    }
    if (!parsedTemplate || parsedTemplate.items.length === 0) {
      setError("엑셀 파일을 선택해 주세요. (견적서 엑셀 저장으로 내보낸 파일을 사용하면 됩니다.)");
      return;
    }
    setSubmitLoading(true);
    fetch("/api/admin/master/default-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, items: parsedTemplate.items, processOrder: parsedTemplate.processOrder }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error((d as { error?: string }).error || "저장 실패"); });
        setTitle("");
        setParsedTemplate(null);
        setSelectedFileName("");
        loadTemplates();
      })
      .catch((e) => setError(e.message || "저장 실패"))
      .finally(() => setSubmitLoading(false));
  };

  const handleDelete = (id: number) => {
    if (!confirm("이 기본 템플릿을 삭제할까요? 모든 회사에서 더 이상 불러올 수 없습니다.")) return;
    fetch(`/api/admin/master/default-templates/${id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error("삭제 실패");
        loadTemplates();
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const handleOrderTemplateDownload = () => {
    setOrderError("");
    fetch("/api/admin/master/order-default/template")
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          let msg = "템플릿 다운로드에 실패했습니다.";
          try {
            const data = JSON.parse(text);
            if (data?.error) msg = data.error;
          } catch {
            if (res.status === 403) msg = "마스터 권한이 필요합니다.";
          }
          throw new Error(msg);
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "발주_기본품목_템플릿.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setOrderError(e instanceof Error ? e.message : "템플릿 다운로드에 실패했습니다."));
  };

  const handleOrderExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setOrderError("");
    setOrderSelectedFileName("");
    setOrderParsedItems(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const data = ev.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: "binary" });
        if (!wb.SheetNames?.length) {
          setOrderError("엑셀에 시트가 없습니다.");
          return;
        }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
        const parsed = parseOrderDefaultExcel(rows);
        if (!parsed) {
          setOrderError("엑셀에서 항목을 찾지 못했습니다. 첫 행에 '발주 유형', '품목' 등 컬럼이 있어야 합니다. 템플릿을 다운로드해 채워 넣으세요.");
          return;
        }
        setOrderParsedItems(parsed);
        setOrderSelectedFileName(file.name);
      } catch (err) {
        console.error(err);
        setOrderError("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleOrderSave = () => {
    setOrderError("");
    if (!orderParsedItems || Object.keys(orderParsedItems).length === 0) {
      setOrderError("엑셀 파일을 선택해 주세요. 기본 품목 엑셀을 다운로드해 채운 뒤 넣어 주세요.");
      return;
    }
    setOrderSubmitLoading(true);
    fetch("/api/admin/master/order-default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemsByLabel: orderParsedItems }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error((d as { error?: string }).error || "저장 실패"); });
        setOrderParsedItems(null);
        setOrderSelectedFileName("");
        alert("발주 기본 품목이 저장되었습니다.");
      })
      .catch((e) => setOrderError(e.message || "저장 실패"))
      .finally(() => setOrderSubmitLoading(false));
  };

  if (allowed === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-500">확인 중...</p>
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">마스터 관리</h1>
        <p className="mt-1 text-sm text-gray-600">
          시스템 전역 설정입니다. 기본 품목·자재 발주·기본 견적 템플릿을 여기서 등록하면 모든 회사가 사용할 수 있습니다.
        </p>
      </div>

      {/* 업자들의 비밀창고 */}
      <section className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-gray-900">업자들의 비밀창고</h2>
        <p className="mb-3 text-sm text-gray-600">
          비밀 링크 또는 회사 로그인 세션으로 고객용 목록·상세를 볼 수 있습니다. 상품 등록·엑셀 반영·비밀 링크 발급은 상품관리에서 합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/shop-secret"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            고객용 상품 목록
          </Link>
          <Link
            href="/shop-secret/about"
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            소개 페이지
          </Link>
          <Link
            href="/shop-secret/admin/products"
            className="inline-flex items-center rounded-lg border border-amber-700/40 bg-white px-4 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-50"
          >
            상품관리 (등록·엑셀·링크 발급) →
          </Link>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          경로: <code className="rounded bg-white/80 px-1">/shop-secret</code> ·{" "}
          <code className="rounded bg-white/80 px-1">/shop-secret/about</code> ·{" "}
          <code className="rounded bg-white/80 px-1">/shop-secret/admin/products</code>
        </p>
      </section>

      {/* 마스터 메일(OAuth) */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-gray-800">마스터 메일(OAuth)</h2>
        <p className="mb-4 text-sm text-gray-600">
          회사별 이메일 설정이 없을 때 계약서 등 메일을 이 계정으로 대신 발송합니다. Gmail로 연결하면 비밀번호 없이 OAuth로 발송됩니다. 보내는 이는 각 회사(회사명·회사 이메일)로 표시됩니다.
        </p>
        <p className="mb-2 text-xs font-medium text-gray-700">Google Cloud Console → 사용자 인증 정보 → OAuth 2.0 클라이언트 ID → 승인된 리디렉션 URI에 아래 주소를 추가하세요.</p>
        <div className="mb-4 space-y-2">
          {typeof window !== "undefined" && (() => {
            const base = (process.env.NEXT_PUBLIC_APP_URL || (window.location.origin === "http://localhost:3000" ? "https://interior-erp-v2.vercel.app" : window.location.origin)).replace(/\/$/, "");
            return (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 font-mono text-xs text-gray-800 break-all">
                  <span className="flex-1 min-w-0">{base}/api/admin/master/smtp-oauth/gmail/callback</span>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${base}/api/admin/master/smtp-oauth/gmail/callback`;
                      void navigator.clipboard.writeText(url);
                      alert("주소가 복사되었습니다. Google Cloud Console에 붙여넣기 하세요.");
                    }}
                    className="flex-shrink-0 rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    복사
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 font-mono text-xs text-gray-800 break-all">
                  <span className="flex-1 min-w-0">{base}/api/company/smtp-oauth/gmail/callback</span>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${base}/api/company/smtp-oauth/gmail/callback`;
                      void navigator.clipboard.writeText(url);
                      alert("주소가 복사되었습니다. Google Cloud Console에 붙여넣기 하세요.");
                    }}
                    className="flex-shrink-0 rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    복사
                  </button>
                </div>
              </>
            );
          })()}
        </div>
        {oauthEnvStatus != null && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
            <p className="mb-2 font-medium text-gray-700">연결 실패 시 확인 (서버에 설정된 값)</p>
            <p className="mb-1">
              GOOGLE_CLIENT_ID: {oauthEnvStatus.hasClientId ? <span className="text-green-600">✓ 설정됨</span> : <span className="text-red-600">✗ 없음 → Vercel 환경 변수에 추가 후 재배포</span>}
            </p>
            <p className="mb-1">
              GOOGLE_CLIENT_SECRET: {oauthEnvStatus.hasClientSecret ? <span className="text-green-600">✓ 설정됨</span> : <span className="text-red-600">✗ 없음 → Vercel 환경 변수에 추가 후 재배포</span>}
            </p>
            <p className="mb-1">
              NEXT_PUBLIC_APP_URL: {oauthEnvStatus.hasAppUrl ? <span className="text-green-600">✓ 설정됨</span> : <span className="text-red-600">✗ 없음</span>}
              {oauthEnvStatus.redirectUri && <span className="ml-1 text-gray-500">→ 콜백: {oauthEnvStatus.redirectUri}</span>}
            </p>
            <p className="mt-2 text-gray-600">위 콜백 주소가 Google Cloud Console → 승인된 리디렉션 URI에 정확히 등록되어 있어야 합니다.</p>
          </div>
        )}
        <p className="mb-2 text-xs font-medium text-gray-700">Vercel 환경 변수에 넣을 값 (Google Cloud Console에서 복사한 뒤 아래에 붙여넣고 [저장] 후 [복사]로 Vercel에 넣기)</p>
        <p className="mb-2 text-xs text-gray-600">아래에 넣고 [저장]을 누르면 이 기기 브라우저에만 저장되어, 다시 들어와도 입력값이 유지됩니다. Gmail 연결에 실제로 쓰이는 값은 Vercel 프로젝트 설정 → Environment Variables입니다.</p>
        <p className="mb-2 text-xs text-amber-700">※ 클라이언트 ID 형식: …apps.googleusercontent.com. &quot;master&quot; 같은 글자는 넣으면 안 됩니다.</p>
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <label className="w-32 flex-shrink-0 text-xs text-gray-600">GOOGLE_CLIENT_ID</label>
            <input
              type="text"
              value={googleClientIdPaste}
              onChange={(e) => setGoogleClientIdPaste(e.target.value)}
              placeholder="예: 123456789-xxxx.apps.googleusercontent.com"
              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => {
                if (googleClientIdPaste.trim()) {
                  void navigator.clipboard.writeText(googleClientIdPaste.trim());
                  alert("클립보드에 복사되었습니다. Vercel 환경 변수에 붙여넣기 하세요.");
                }
              }}
              className="flex-shrink-0 rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              복사
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="w-32 flex-shrink-0 text-xs text-gray-600">GOOGLE_CLIENT_SECRET</label>
            <input
              type="password"
              value={googleClientSecretPaste}
              onChange={(e) => setGoogleClientSecretPaste(e.target.value)}
              placeholder="Google에서 보안 비밀번호 복사 후 붙여넣기"
              className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => {
                if (googleClientSecretPaste.trim()) {
                  void navigator.clipboard.writeText(googleClientSecretPaste.trim());
                  alert("클립보드에 복사되었습니다. Vercel 환경 변수에 붙여넣기 하세요.");
                }
              }}
              className="flex-shrink-0 rounded border border-gray-400 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              복사
            </button>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={saveOauthPasteValues}
              className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              저장 (이 기기에만 저장)
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-800">대안: Gmail 앱 비밀번호로 연결 (OAuth가 안 될 때)</p>
          <p className="mb-3 text-xs text-amber-800">
            Google 계정에서 2단계 인증을 켠 뒤, &quot;앱 비밀번호&quot;를 생성해 아래에 넣으면 팝업 없이 바로 연결됩니다. OAuth 화면이 계속 뜨는 경우 이 방법을 사용하세요.
          </p>
          <p className="mb-2 text-xs text-gray-600">만드는 방법: Google 계정 → 보안 → 2단계 인증 사용 → 앱 비밀번호 → 앱 선택 &quot;메일&quot; → 생성 후 16자리 비밀번호 복사</p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={appPasswordEmail}
              onChange={(e) => setAppPasswordEmail(e.target.value)}
              placeholder="Gmail 주소 (예: you@gmail.com)"
              className="min-w-[200px] rounded border border-gray-300 px-2 py-1.5 text-sm"
              autoComplete="off"
            />
            <input
              type="password"
              value={appPasswordValue}
              onChange={(e) => setAppPasswordValue(e.target.value)}
              placeholder="앱 비밀번호 (16자)"
              className="min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={appPasswordSaving || !appPasswordEmail.trim() || !appPasswordValue.trim()}
              onClick={() => {
                setAppPasswordSaving(true);
                fetch("/api/admin/master/smtp", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: appPasswordEmail.trim(), appPassword: appPasswordValue.trim() }),
                })
                  .then((res) => {
                    if (!res.ok) return res.json().then((d) => Promise.reject(new Error((d as { error?: string }).error)));
                    setAppPasswordValue("");
                    loadMasterSmtp();
                    alert("저장되었습니다. Gmail 앱 비밀번호로 연결됨.");
                  })
                  .catch((e) => alert(e instanceof Error ? e.message : "저장 실패"))
                  .finally(() => setAppPasswordSaving(false));
              }}
              className="rounded border border-amber-600 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {appPasswordSaving ? "저장 중…" : "앱 비밀번호로 저장"}
            </button>
          </div>
        </div>

        {masterSmtpConfigured ? (
          <div>
            <p className="mb-2 text-sm font-medium text-green-700">Gmail 연결됨{masterSmtpProvider === "app_password" ? " (앱 비밀번호)" : ""}</p>
            <p className="mb-2 text-sm text-gray-600">{masterSmtpUser || "해당 계정으로 발송됩니다."}</p>
            <button
              type="button"
              onClick={() => {
                fetch("/api/admin/master/smtp", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ disconnect: true }),
                })
                  .then((res) => {
                    if (res.ok) {
                      setMasterSmtpConfigured(false);
                      setMasterSmtpUser(null);
                      setMasterSmtpProvider(null);
                    } else return res.json().then((d) => Promise.reject(new Error((d as { error?: string }).error)));
                  })
                  .catch((e) => alert(e instanceof Error ? e.message : "연결 해제 실패"));
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Gmail 연결 해제
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                const url = "/api/admin/master/smtp-oauth/gmail/start";
                window.open(url, "master_gmail_oauth", "width=520,height=640,scrollbars=yes");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span className="inline-block flex h-4 w-4 items-center justify-center rounded bg-[#ea4335]/20 text-xs font-bold text-[#ea4335]">G</span>
              Gmail로 연결 (새 창)
            </button>
          </div>
        )}
      </section>

      {/* 1. 자재 발주 기본 품목 (발주 유형별) */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-gray-800">자재 발주 기본 품목(발주 유형별)</h2>
        <p className="mb-4 text-sm text-gray-600">
          목재발주·중문발주·조명 등 유형마다 미리 채워 넣을 품목을 엑셀로 관리합니다. 기본 품목 엑셀을 다운로드해 채운 뒤 엑셀 파일을 넣어 등록하면 자재 발주 페이지 로드 시 해당 행들이 기본으로 들어갑니다.
        </p>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOrderTemplateDownload}
              className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              기본 품목 엑셀 다운로드
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">엑셀 파일 넣기</label>
            <input
              ref={orderExcelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleOrderExcelFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => orderExcelInputRef.current?.click()}
                className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                엑셀 파일 선택
              </button>
              {orderSelectedFileName && orderParsedItems && (
                <span className="text-sm text-gray-600">
                  선택됨: {orderSelectedFileName} (발주 유형 {Object.keys(orderParsedItems).length}개, 총 {Object.values(orderParsedItems).reduce((s, arr) => s + arr.length, 0)}개 품목)
                </span>
              )}
            </div>
          </div>
          {orderError && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{orderError}</p>
          )}
          <button
            type="button"
            onClick={handleOrderSave}
            disabled={orderSubmitLoading || !orderParsedItems || Object.keys(orderParsedItems).length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {orderSubmitLoading ? "저장 중..." : "기본 품목 등록"}
          </button>
        </div>
      </section>

      {/* 계약서 양식 */}
      <section id="contract-template" className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm scroll-mt-4">
        <h2 className="mb-2 text-base font-semibold text-gray-800">계약서 양식</h2>
        <p className="mb-4 text-sm text-gray-600">
          계약서 제목과 본문 양식을 등록하면 계약서 작성 페이지에서 &quot;마스터 양식 불러오기&quot;로 불러와 사용할 수 있습니다. 본문은 서명 페이지에 그대로 표시됩니다. <strong>엑셀 계약서(인테리어 계약서(공)-oro.xls 등) 또는 PDF 파일을 넣으면 자동으로 제목·본문이 채워집니다.</strong>
        </p>
        {contractTemplateLoading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="mb-2 text-sm font-medium text-blue-900">엑셀 파일로 양식 불러오기</p>
              <input
                ref={contractExcelInputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => setContractExcelFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => contractExcelInputRef.current?.click()}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  엑셀 선택 (.xls, .xlsx)
                </button>
                {contractExcelFile && <span className="text-sm text-blue-800">{contractExcelFile.name}</span>}
                <button
                  type="button"
                  onClick={handleContractExcelImport}
                  disabled={contractExcelImporting || !contractExcelFile}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {contractExcelImporting ? "적용 중..." : "엑셀으로 불러오기"}
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
              <p className="mb-2 text-sm font-medium text-emerald-900">PDF 파일로 양식 불러오기 (PDF 그대로 저장, 순서·볼드 유지)</p>
              <input
                ref={contractPdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => setContractPdfFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => contractPdfInputRef.current?.click()}
                  className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  PDF 선택
                </button>
                {contractPdfFile && <span className="text-sm text-emerald-800">{contractPdfFile.name}</span>}
                <button
                  type="button"
                  onClick={handleContractPdfImport}
                  disabled={contractPdfImporting || !contractPdfFile}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {contractPdfImporting ? "적용 중..." : "PDF 그대로 저장"}
                </button>
                <button
                  type="button"
                  onClick={handleContractPdfDelete}
                  disabled={contractPdfDeleting || !contractTemplateDocumentPath}
                  className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {contractPdfDeleting ? "삭제 중..." : "PDF 지우기"}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">계약서 제목 (기본값)</label>
              <input
                type="text"
                value={contractTemplateTitle ?? ""}
                onChange={(e) => setContractTemplateTitle(e.target.value)}
                placeholder="예: 인테리어 시공 계약서"
                className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            {(() => {
              const bodyRaw = contractTemplateBody ?? "";
              const bodyForEditor =
                bodyRaw.trim().startsWith("<")
                  ? bodyRaw
                  : bodyRaw
                    ? "<p>" + bodyRaw.replace(/\n/g, "</p><p>") + "</p>"
                    : "";
              return contractTemplateDocumentPath ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">계약서 본문</label>
                  <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setContractBodyViewMode("pdf")}
                      className={`rounded-md px-3 py-1.5 text-sm ${contractBodyViewMode === "pdf" ? "bg-white font-medium shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                    >
                      PDF 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => setContractBodyViewMode("text")}
                      className={`rounded-md px-3 py-1.5 text-sm ${contractBodyViewMode === "text" ? "bg-white font-medium shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                    >
                      글로 적기
                    </button>
                  </div>
                </div>
                {contractBodyViewMode === "pdf" ? (
                  <>
                    <p className="mb-2 text-xs text-gray-600">
                      아래 PDF가 그대로 저장되어 있습니다. 순서·볼드 등 원본 그대로 유지됩니다. 계약서 작성에서 &quot;마스터 양식 불러오기&quot; 시 이 PDF가 사용됩니다. (뷰어에 원본 파일 제목이 깨져 보일 수 있으나, 저장·적용에는 문제 없습니다.)
                    </p>
                    <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-100">
                      <iframe
                        key={contractTemplatePdfVersion}
                        src={`/api/admin/master/contract-template/document?v=${contractTemplatePdfVersion}`}
                        title="계약서 PDF"
                        className="h-[60vh] w-full min-h-[400px]"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-gray-500">본문을 수정할 수 있습니다. 굵게, 정렬, 글자 크기 등을 사용할 수 있습니다. 저장 시 제목·본문·여백이 함께 저장됩니다.</p>
                      <button
                        type="button"
                        onClick={handleContractTemplateSave}
                        disabled={contractTemplateSaving}
                        className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {contractTemplateSaving ? "저장 중..." : "글로 적은 본문 저장"}
                      </button>
                    </div>
                    <ContractRichEditor
                      value={bodyForEditor}
                      onChange={setContractTemplateBody}
                      placeholder="계약 조건, 시공 범위, 비용 등 본문 내용을 입력하세요. A4 페이지(297mm) 단위로 끊어져 인쇄됩니다."
                      minHeight="280px"
                      pageContentHeightMm={297 - bodyMarginTop - bodyMarginBottom}
                      pageGapMm={bodyMarginBottom + PAGE_GAP_MM + bodyMarginTop}
                      contentWrapper={(toolbar, content) => (
                        <>
                          {toolbar}
                          <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                            <p className="mb-2 text-xs font-medium text-gray-700">본문 페이지 여백 (A4, mm)</p>
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="flex items-center gap-1 text-sm text-gray-600">
                                상
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={bodyMarginTop}
                                  onChange={(e) => setBodyMarginTop(Number(e.target.value) || 0)}
                                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-sm text-gray-600">
                                하
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={bodyMarginBottom}
                                  onChange={(e) => setBodyMarginBottom(Number(e.target.value) || 0)}
                                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-sm text-gray-600">
                                좌
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={bodyMarginLeft}
                                  onChange={(e) => setBodyMarginLeft(Number(e.target.value) || 0)}
                                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                                />
                              </label>
                              <label className="flex items-center gap-1 text-sm text-gray-600">
                                우
                                <input
                                  type="number"
                                  min={0}
                                  max={50}
                                  value={bodyMarginRight}
                                  onChange={(e) => setBodyMarginRight(Number(e.target.value) || 0)}
                                  className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                                />
                              </label>
                            </div>
                          </div>
                          <div className="flex max-h-[65vh] min-h-[420px] min-w-0 flex-col">
                            <div className="min-h-0 flex-1 overflow-y-auto bg-[#e8e8e8] p-4">
                              <div
                                className="contract-a4-paper-sheet relative mx-auto"
                                style={{
                                  width: "210mm",
                                  maxWidth: "210mm",
                                  minHeight: `${297}mm`,
                                  boxSizing: "border-box",
                                  paddingTop: `${bodyMarginTop}mm`,
                                  paddingLeft: `${bodyMarginLeft}mm`,
                                  paddingRight: `${bodyMarginRight}mm`,
                                  paddingBottom: `${bodyMarginBottom}mm`,
                                  backgroundImage: a4CornersSvg,
                                  backgroundSize: `100% ${repeatMm}mm`,
                                  backgroundRepeat: "repeat-y",
                                  backgroundPosition: "0 0",
                                  "--body-ml": `${bodyMarginLeft}mm`,
                                  "--body-mr": `${bodyMarginRight}mm`,
                                  "--body-mt": `${bodyMarginTop}mm`,
                                  "--body-mb": `${bodyMarginBottom}mm`,
                                } as React.CSSProperties}
                              >
                                {content}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    />
                  </>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">계약서 본문 (글로 적기)</label>
                    <p className="text-xs text-gray-500">엑셀 불러오기 시 여기에 채워지거나, 위에서 PDF 그대로 저장하면 PDF가 사용됩니다. 굵게, 정렬, 글자 크기 등을 사용할 수 있습니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleContractTemplateSave}
                    disabled={contractTemplateSaving}
                    className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {contractTemplateSaving ? "저장 중..." : "글로 적은 본문 저장"}
                  </button>
                </div>
                <ContractRichEditor
                  value={bodyForEditor}
                  onChange={setContractTemplateBody}
                  placeholder="계약 조건, 시공 범위, 비용 등 본문 내용을 입력하세요. A4 페이지(297mm) 단위로 끊어져 인쇄됩니다."
                  minHeight="280px"
                  pageContentHeightMm={297 - bodyMarginTop - bodyMarginBottom}
                  pageGapMm={bodyMarginBottom + PAGE_GAP_MM + bodyMarginTop}
                  contentWrapper={(toolbar, content) => (
                    <>
                      {toolbar}
                      <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                        <p className="mb-2 text-xs font-medium text-gray-700">본문 페이지 여백 (A4, mm)</p>
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-1 text-sm text-gray-600">
                            상
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={bodyMarginTop}
                              onChange={(e) => setBodyMarginTop(Number(e.target.value) || 0)}
                              className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-sm text-gray-600">
                            하
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={bodyMarginBottom}
                              onChange={(e) => setBodyMarginBottom(Number(e.target.value) || 0)}
                              className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-sm text-gray-600">
                            좌
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={bodyMarginLeft}
                              onChange={(e) => setBodyMarginLeft(Number(e.target.value) || 0)}
                              className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-sm text-gray-600">
                            우
                            <input
                              type="number"
                              min={0}
                              max={50}
                              value={bodyMarginRight}
                              onChange={(e) => setBodyMarginRight(Number(e.target.value) || 0)}
                              className="w-14 rounded border border-gray-300 px-1 py-0.5 text-center text-sm"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="flex max-h-[65vh] min-h-[420px] min-w-0 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto bg-[#e8e8e8] p-4">
                          <div
                            className="contract-a4-paper-sheet relative mx-auto"
                            style={{
                              width: "210mm",
                              maxWidth: "210mm",
                              minHeight: `${297}mm`,
                              boxSizing: "border-box",
                              paddingTop: `${bodyMarginTop}mm`,
                              paddingLeft: `${bodyMarginLeft}mm`,
                              paddingRight: `${bodyMarginRight}mm`,
                              paddingBottom: `${bodyMarginBottom}mm`,
                              backgroundImage: a4CornersSvg,
                              backgroundSize: `100% ${repeatMm}mm`,
                              backgroundRepeat: "repeat-y",
                              backgroundPosition: "0 0",
                              "--body-ml": `${bodyMarginLeft}mm`,
                              "--body-mr": `${bodyMarginRight}mm`,
                              "--body-mt": `${bodyMarginTop}mm`,
                              "--body-mb": `${bodyMarginBottom}mm`,
                            } as React.CSSProperties}
                          >
                            {content}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                />
              </div>
            );
            })()}
            {contractTemplateError && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{contractTemplateError}</p>
            )}
            <button
              type="button"
              onClick={handleContractTemplateSave}
              disabled={contractTemplateSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {contractTemplateSaving ? "저장 중..." : "계약서 양식 저장"}
            </button>
          </div>
        )}
      </section>

      {/* 3. 기본 견적 템플릿 등록 */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">기본 견적 템플릿 등록</h2>
        <p className="mb-4 text-sm text-gray-600">
          제목을 입력하고, 견적서 형식의 엑셀 파일을 선택해 저장하면 모든 회사가 견적서 작성 → 템플릿 불러오기에서 &quot;기본 템플릿&quot;으로 불러올 수 있습니다. (견적서 작성 화면에서 엑셀 저장으로 내보낸 파일을 그대로 사용하면 됩니다.)
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">템플릿 제목</label>
            <input
              type="text"
              value={title ?? ""}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 표준 인테리어 견적"
              className="w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">엑셀 파일</label>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleExcelFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => excelInputRef.current?.click()}
                className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                엑셀 파일 선택
              </button>
              {selectedFileName && parsedTemplate && (
                <span className="text-sm text-gray-600">
                  선택됨: {selectedFileName} (항목 {parsedTemplate.items.length}개)
                </span>
              )}
            </div>
          </div>
          {error && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
          )}
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitLoading || !title.trim() || !parsedTemplate || parsedTemplate.items.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitLoading ? "저장 중..." : "기본 템플릿 추가"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-800">등록된 기본 템플릿</h2>
        {loading ? (
          <p className="text-sm text-gray-500">불러오는 중...</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 기본 템플릿이 없습니다. 위에서 엑셀 파일을 선택해 추가해 주세요.</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <span className="font-medium text-gray-800">{t.title}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(t.id)}
                  className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
