"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseEstimateExcelRows } from "@/lib/parseEstimateExcel";
import { DEFAULT_SCHEDULE_PHASE_BUTTONS } from "@/lib/defaultSchedulePhaseButtons";

type PicItem = { id: number; name: string; phone?: string; employeeCode?: string; position?: string };

type EstimateTemplateItem = { id: number; title: string; createdAt?: string };

type DefaultEstimateTemplate = {
  id: number;
  title: string;
  items: unknown[];
  processOrder?: string[];
  note?: string;
};

type ModalKind =
  | null
  | "pics"
  | "password-change"
  | "company-login-password"
  | "drawing-api"
  | "estimate-templates"
  | "logo-stamp"
  | "company-contract"
  | "company-info"
  | "schedule-phase-buttons";

export default function AdminPage() {
  const searchParams = useSearchParams();
  const [pinStatus, setPinStatus] = useState<{ hasPin: boolean } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);

  const [pics, setPics] = useState<PicItem[]>([]);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmployeeCode, setNewEmployeeCode] = useState("");
  const [newPosition, setNewPosition] = useState("");
  const [newPositionCustom, setNewPositionCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPic, setEditingPic] = useState<PicItem | null>(null);
  const [editEmployeeCode, setEditEmployeeCode] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editPositionCustom, setEditPositionCustom] = useState("");

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMessage, setPwMessage] = useState("");

  const [companyPwCurrent, setCompanyPwCurrent] = useState("");
  const [companyPwNew, setCompanyPwNew] = useState("");
  const [companyPwConfirm, setCompanyPwConfirm] = useState("");
  const [companyPwMessage, setCompanyPwMessage] = useState("");

  const [drawingApiUrl, setDrawingApiUrl] = useState("");
  const [drawingApiLoading, setDrawingApiLoading] = useState(false);
  const [drawingApiMessage, setDrawingApiMessage] = useState("");

  const [estimateTemplates, setEstimateTemplates] = useState<EstimateTemplateItem[]>([]);
  const [defaultEstimateTemplates, setDefaultEstimateTemplates] = useState<DefaultEstimateTemplate[]>([]);
  const [estimateTemplateTitle, setEstimateTemplateTitle] = useState("");
  const [estimateTemplateEditId, setEstimateTemplateEditId] = useState<number | null>(null);
  const [estimateTemplateFile, setEstimateTemplateFile] = useState<File | null>(null);
  const [estimateTemplateLoading, setEstimateTemplateLoading] = useState(false);
  const [estimateTemplateError, setEstimateTemplateError] = useState<string | null>(null);
  const [downloadDefaultLoadingId, setDownloadDefaultLoadingId] = useState<number | null>(null);
  const estimateTemplateFileInputRef = useRef<HTMLInputElement>(null);

  const [companyLogoPath, setCompanyLogoPath] = useState<string | null>(null);
  const [companyStampPath, setCompanyStampPath] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [stampUploading, setStampUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const [companyContractTitle, setCompanyContractTitle] = useState("");
  const [companyContractDocumentPath, setCompanyContractDocumentPath] = useState<string | null>(null);
  const [companyContractPdfFile, setCompanyContractPdfFile] = useState<File | null>(null);
  const [companyContractSaving, setCompanyContractSaving] = useState(false);
  const [companyContractUploading, setCompanyContractUploading] = useState(false);
  const companyContractPdfInputRef = useRef<HTMLInputElement>(null);

  const [companyInfoName, setCompanyInfoName] = useState("");
  const [companyInfoAddress, setCompanyInfoAddress] = useState("");
  const [companyInfoRegNo, setCompanyInfoRegNo] = useState("");
  const [companyInfoEmail, setCompanyInfoEmail] = useState("");
  const [companyInfoSaving, setCompanyInfoSaving] = useState(false);
  const [companyInfoMessage, setCompanyInfoMessage] = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  const [smtpOauthProvider, setSmtpOauthProvider] = useState<string | null>(null);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [showNaverAppPasswordModal, setShowNaverAppPasswordModal] = useState(false);
  const [naverAppPasswordInput, setNaverAppPasswordInput] = useState("");
  const [naverAppPasswordSaving, setNaverAppPasswordSaving] = useState(false);

  const [schedulePhaseLabels, setSchedulePhaseLabels] = useState<string[]>([]);
  const [schedulePhaseSaving, setSchedulePhaseSaving] = useState(false);
  const [schedulePhaseMessage, setSchedulePhaseMessage] = useState("");

  const loadPinStatus = useCallback(() => {
    fetch("/api/company/admin-pin")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setPinStatus({ hasPin: false });
          setPinError(data.error);
          return;
        }
        setPinStatus({ hasPin: !!data.hasPin });
        setPinError("");
      })
      .catch(() => {
        setPinStatus({ hasPin: false });
        setPinError("상태를 불러올 수 없습니다.");
      });
  }, []);

  useEffect(() => {
    loadPinStatus();
  }, [loadPinStatus]);

  const handlePinSubmit = () => {
    const pin = pinInput.replace(/\D/g, "").slice(0, 4);
    if (pin.length !== 4) {
      setPinError("숫자 4자리를 입력해 주세요.");
      return;
    }
    setPinError("");
    fetch("/api/company/admin-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.set) {
          setAdminUnlocked(true);
          setPinInput("");
          return;
        }
        if (data.ok) {
          setAdminUnlocked(true);
          setPinInput("");
          return;
        }
        setPinError("비밀번호가 일치하지 않습니다.");
      })
      .catch(() => setPinError("오류가 발생했습니다."));
  };

  const loadPics = useCallback(() => {
    fetch("/api/company/pics")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPics(data);
          setError(null);
        } else {
          setError((data as { error?: string }).error || "목록을 불러올 수 없습니다.");
        }
      })
      .catch(() => setError("목록을 불러올 수 없습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (modal === "pics") loadPics();
    if (modal === "drawing-api") {
      queueMicrotask(() => setDrawingApiLoading(true));
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          setDrawingApiUrl(data.drawingListApiUrl || "");
        })
        .catch(() => {})
        .finally(() => setDrawingApiLoading(false));
    }
    if (modal === "estimate-templates") {
      queueMicrotask(() => {
        setEstimateTemplateTitle("");
        setEstimateTemplateEditId(null);
        setEstimateTemplateFile(null);
        setEstimateTemplateError(null);
      });
      fetch("/api/company/estimate-templates")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setEstimateTemplates(data.map((t: { id: number; title: string; createdAt?: string }) => ({ id: t.id, title: t.title, createdAt: t.createdAt })));
          else setEstimateTemplates([]);
        })
        .catch(() => setEstimateTemplates([]));
      fetch("/api/company/default-estimate-templates")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setDefaultEstimateTemplates(data);
          else setDefaultEstimateTemplates([]);
        })
        .catch(() => setDefaultEstimateTemplates([]));
    }
    if (modal === "logo-stamp") {
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          if (data.logoPath != null) setCompanyLogoPath(data.logoPath);
          else setCompanyLogoPath(null);
          if (data.stampPath != null) setCompanyStampPath(data.stampPath);
          else setCompanyStampPath(null);
          setLogoFile(null);
          setStampFile(null);
        })
        .catch(() => {
          setCompanyLogoPath(null);
          setCompanyStampPath(null);
        });
    }
    if (modal === "company-contract") {
      fetch("/api/company/company-contract-template")
        .then((res) => res.json())
        .then((data) => {
          setCompanyContractTitle(data.title ?? "");
          setCompanyContractDocumentPath(data.documentPath != null ? String(data.documentPath) : null);
          setCompanyContractPdfFile(null);
          if (companyContractPdfInputRef.current) companyContractPdfInputRef.current.value = "";
        })
        .catch(() => {
          setCompanyContractTitle("");
          setCompanyContractDocumentPath(null);
        });
    }
    if (modal === "company-info") {
      fetch("/api/company")
        .then((res) => res.json())
        .then((data) => {
          setCompanyInfoName(data.name ?? "");
          setCompanyInfoAddress(data.contractorAddress ?? "");
          setCompanyInfoRegNo(data.contractorRegNo ?? "");
          setCompanyInfoEmail(data.companyEmail ?? "");
          setCompanyInfoMessage("");
          setSmtpUser(data.smtpUser ?? "");
          setSmtpPass("");
          setSmtpOauthProvider(data.smtpOauthProvider ?? null);
        })
        .catch(() => {
          setCompanyInfoName("");
          setCompanyInfoAddress("");
          setCompanyInfoRegNo("");
          setCompanyInfoEmail("");
          setSmtpUser("");
          setSmtpPass("");
          setSmtpOauthProvider(null);
        });
      fetch("/api/admin/smtp-status")
        .then((res) => res.ok ? res.json() : { configured: false })
        .then((data) => setSmtpConfigured(data.configured === true))
        .catch(() => setSmtpConfigured(false));
    }
    if (modal === "schedule-phase-buttons") {
      queueMicrotask(() => {
        setSchedulePhaseMessage("");
        setSchedulePhaseSaving(false);
      });
      fetch("/api/company/schedule-phase-buttons")
        .then((res) => res.json())
        .then((data) => {
          const labels = Array.isArray(data.labels)
            ? data.labels.filter((s: unknown) => typeof s === "string" && String(s).trim())
            : [];
          setSchedulePhaseLabels(
            labels.length > 0 ? labels : [...DEFAULT_SCHEDULE_PHASE_BUTTONS]
          );
          if (data.warning) setSchedulePhaseMessage(String(data.warning));
        })
        .catch(() => {
          setSchedulePhaseLabels([...DEFAULT_SCHEDULE_PHASE_BUTTONS]);
          setSchedulePhaseMessage("목록을 불러오지 못했습니다.");
        });
    }
  }, [modal, loadPics]);

  useEffect(() => {
    const ok = searchParams.get("smtp_oauth");
    if (ok === "ok") {
      if (typeof window !== "undefined" && window.opener) {
        window.opener.location.reload();
        window.close();
        return;
      }
      setModal("company-info");
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/admin");
    }
    if (ok === "naver_ok") {
      if (typeof window !== "undefined" && window.opener) {
        window.history.replaceState({}, "", "/admin");
        setShowNaverAppPasswordModal(true);
        return;
      }
      setModal("company-info");
      if (typeof window !== "undefined") window.history.replaceState({}, "", "/admin");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);

  const handleAddPic = () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    const positionValue = newPosition === "추가입력" ? newPositionCustom.trim() : newPosition;
    fetch("/api/company/pics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone: newPhone.trim(),
        employeeCode: newEmployeeCode.trim() || undefined,
        position: positionValue || undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setNewName("");
          setNewPhone("");
          setNewEmployeeCode("");
          setNewPosition("");
          setNewPositionCustom("");
          setError(null);
          loadPics();
        } else {
          const msg = (data as { error?: string }).error || "추가 실패";
          setError(msg);
          alert(msg);
        }
        return null;
      })
      .catch(() => {
        setError("추가 중 오류가 발생했습니다.");
        alert("추가 중 오류가 발생했습니다.");
      })
      .finally(() => setLoading(false));
  };

  const handleDeletePic = (id: number) => {
    if (!confirm("이 담당자를 목록에서 삭제할까요?")) return;
    fetch(`/api/company/pics/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          loadPics();
          setEditingPic(null);
        } else {
          alert((data as { error?: string }).error || "삭제 실패");
        }
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const handleSavePicEdit = () => {
    if (!editingPic) return;
    const positionValue = editPosition === "추가입력" ? editPositionCustom.trim() : editPosition;
    fetch(`/api/company/pics/${editingPic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode: editEmployeeCode.trim() || undefined,
        position: positionValue || undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          loadPics();
          setEditingPic(null);
          setEditEmployeeCode("");
          setEditPosition("");
          setEditPositionCustom("");
        } else {
          alert((data as { error?: string }).error || "수정 실패");
        }
      })
      .catch(() => alert("수정 중 오류가 발생했습니다."));
  };

  const handlePasswordChange = () => {
    const cur = pwCurrent.replace(/\D/g, "").slice(0, 4);
    const neu = pwNew.replace(/\D/g, "").slice(0, 4);
    const conf = pwConfirm.replace(/\D/g, "").slice(0, 4);
    if (cur.length !== 4 || neu.length !== 4 || conf.length !== 4) {
      setPwMessage("모두 숫자 4자리로 입력해 주세요.");
      return;
    }
    if (neu !== conf) {
      setPwMessage("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setPwMessage("");
    fetch("/api/company/admin-pin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin: cur, newPin: neu }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setPwCurrent("");
          setPwNew("");
          setPwConfirm("");
          setPwMessage("비밀번호가 변경되었습니다.");
          setTimeout(() => {
            setModal(null);
            setPwMessage("");
          }, 1500);
        } else {
          setPwMessage((data as { error?: string }).error || "변경 실패");
        }
      })
      .catch(() => setPwMessage("오류가 발생했습니다."));
  };

  const handleCompanyLoginPasswordChange = () => {
    const neu = companyPwNew.trim();
    const conf = companyPwConfirm.trim();
    if (neu.length < 6) {
      setCompanyPwMessage("새 비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (neu !== conf) {
      setCompanyPwMessage("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    setCompanyPwMessage("");
    fetch("/api/company/company-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: companyPwCurrent,
        newPassword: neu,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setCompanyPwCurrent("");
          setCompanyPwNew("");
          setCompanyPwConfirm("");
          setCompanyPwMessage(
            (data as { message?: string }).message || "비밀번호가 변경되었습니다."
          );
          setTimeout(() => {
            setModal(null);
            setCompanyPwMessage("");
          }, 1500);
        } else {
          setCompanyPwMessage((data as { error?: string }).error || "변경 실패");
        }
      })
      .catch(() => setCompanyPwMessage("오류가 발생했습니다."));
  };

  const refreshEstimateTemplates = () => {
    fetch("/api/company/estimate-templates")
      .then((r) => r.json())
      .then((arr) => {
        if (Array.isArray(arr)) {
          setEstimateTemplates(arr.map((t: EstimateTemplateItem) => ({ id: t.id, title: t.title, createdAt: t.createdAt })));
        }
      });
  };

  const clearEstimateTemplateForm = () => {
    setEstimateTemplateTitle("");
    setEstimateTemplateEditId(null);
    setEstimateTemplateFile(null);
    if (estimateTemplateFileInputRef.current) estimateTemplateFileInputRef.current.value = "";
  };

  const handleStartEditEstimateTemplate = (t: EstimateTemplateItem) => {
    setEstimateTemplateEditId(t.id);
    setEstimateTemplateTitle(t.title);
    setEstimateTemplateFile(null);
    if (estimateTemplateFileInputRef.current) estimateTemplateFileInputRef.current.value = "";
    setEstimateTemplateError(null);
  };

  const handleAddEstimateTemplate = () => {
    const title = estimateTemplateTitle.trim();
    if (!title) {
      setEstimateTemplateError("커스텀 견적 제목을 입력해 주세요.");
      return;
    }
    setEstimateTemplateError(null);
    setEstimateTemplateLoading(true);

    const doSave = (items: unknown[] | undefined, processOrder: string[] | undefined) => {
      const isEdit = estimateTemplateEditId != null;
      const url = isEdit ? `/api/company/estimate-templates/${estimateTemplateEditId}` : "/api/company/estimate-templates";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, unknown> = { title };
      if (items !== undefined) body.items = items;
      if (processOrder !== undefined) body.processOrder = processOrder;

      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            clearEstimateTemplateForm();
            refreshEstimateTemplates();
          } else {
            setEstimateTemplateError((data as { error?: string }).error || (isEdit ? "수정 실패" : "저장 실패"));
          }
        })
        .catch(() => setEstimateTemplateError(isEdit ? "수정 중 오류가 발생했습니다." : "저장 중 오류가 발생했습니다."))
        .finally(() => setEstimateTemplateLoading(false));
    };

    if (estimateTemplateFile) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const XLSX = await import("xlsx");
          const data = ev.target?.result;
          if (!data) {
            setEstimateTemplateError("파일을 읽을 수 없습니다.");
            setEstimateTemplateLoading(false);
            return;
          }
          const wb = XLSX.read(data, { type: "binary" });
          if (!wb.SheetNames?.length) {
            setEstimateTemplateError("엑셀에 시트가 없습니다.");
            setEstimateTemplateLoading(false);
            return;
          }
          let ws = wb.Sheets[wb.SheetNames[0]];
          sheetLoop: for (const name of wb.SheetNames) {
            const s = wb.Sheets[name];
            const preview = XLSX.utils.sheet_to_json(s, { header: 1, defval: "", range: 0 }) as (string | number)[][];
            for (let r = 0; r < Math.min(15, preview.length); r++) {
              const a = String(preview[r]?.[0] ?? "").trim().toLowerCase();
              const b = String(preview[r]?.[1] ?? "").trim();
              const c = String(preview[r]?.[2] ?? "").trim();
              if (a === "no" || (b === "품목" && c === "규격")) {
                ws = s;
                break sheetLoop;
              }
            }
          }
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
          const rows = rawRows.map((row) => {
            const arr = Array.isArray(row) ? [...row] : [];
            while (arr.length < 9) arr.push("");
            return arr;
          });
          const parsed = parseEstimateExcelRows(rows);
          if (parsed && parsed.items.length > 0) {
            doSave(parsed.items, parsed.processOrder);
          } else {
            setEstimateTemplateError("엑셀에서 견적 항목을 찾지 못했습니다. 견적서 엑셀 저장 형식으로 올려 주세요.");
            setEstimateTemplateLoading(false);
          }
        } catch (err) {
          setEstimateTemplateError("엑셀 파싱 중 오류가 발생했습니다.");
          setEstimateTemplateLoading(false);
        }
      };
      reader.readAsBinaryString(estimateTemplateFile);
    } else if (estimateTemplateEditId != null) {
      // 수정: 엑셀 없으면 제목만 변경
      doSave(undefined, undefined);
    } else {
      doSave([], []);
    }
  };

  const handleDownloadDefaultAsExcel = async (t: DefaultEstimateTemplate) => {
    setEstimateTemplateError(null);
    setDownloadDefaultLoadingId(t.id);
    try {
      const ExcelJS = await import("exceljs");
      const items = (t.items ?? []) as { processGroup?: string; category?: string; spec?: string; unit?: string; materialUnitPrice?: number; laborUnitPrice?: number; note?: string }[];
      const processOrder = t.processOrder ?? [];
      const orderMap = new Map(processOrder.map((name, idx) => [name, idx]));
      const sorted = [...items].sort((a, b) => {
        const pa = a.processGroup ?? "";
        const pb = b.processGroup ?? "";
        const ia = orderMap.get(pa) ?? processOrder.length;
        const ib = orderMap.get(pb) ?? processOrder.length;
        if (ia !== ib) return ia - ib;
        return 0;
      });
      const groups: { name: string; items: typeof sorted }[] = [];
      let currentName = "";
      let currentItems: typeof sorted = [];
      sorted.forEach((it) => {
        const name = it.processGroup ?? "";
        if (name !== currentName) {
          if (currentItems.length > 0) groups.push({ name: currentName, items: currentItems });
          currentName = name;
          currentItems = [it];
        } else {
          currentItems.push(it);
        }
      });
      if (currentItems.length > 0) groups.push({ name: currentName, items: currentItems });

      const ROW_TYPE_COL = 7;
      const data: (string | number)[][] = [
        ["고객명", "", "", "", "", "", "", ""],
        ["연락처", "", "", "", "", "", "", ""],
        ["주소", "", "", "", "", "", "", ""],
        ["제목", "", "", "", "", "", "", ""],
        ["견적일자", "", "", "", "", "", "", ""],
        ["특이사항", (t.note as string) ?? "", "", "", "", "", "", ""],
        ["", "", "", "", "", "", "", ""],
        ["no", "품목", "규격", "단위", "재료비단가", "노무비단가", "비고", "행구분"],
      ];
      groups.forEach((grp) => {
        const displayName = grp.name.startsWith("\u200B") ? "" : grp.name;
        data.push([displayName, "#", "", "", "", "", "", "공정"]);
        grp.items.forEach((it, subNo) => {
          data.push([
            subNo + 1,
            it.category ?? "",
            it.spec ?? "",
            it.unit ?? "",
            Number(it.materialUnitPrice ?? 0) || 0,
            Number(it.laborUnitPrice ?? 0) || 0,
            it.note ?? "",
            "",
          ]);
        });
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("견적서", { views: [{ rightToLeft: false }] });
      data.forEach((row) => {
        const padded = row.length >= 8 ? row : [...row, ...Array(8 - row.length).fill("")];
        ws.addRow(padded);
      });
      const thinBorder = { top: { style: "thin" as const }, left: { style: "thin" as const }, bottom: { style: "thin" as const }, right: { style: "thin" as const } };
      const grayFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9D9D9" }, bgColor: { argb: "FFD9D9D9" } };
      const lightSkyBlueFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD6EAF8" }, bgColor: { argb: "FFD6EAF8" } };
      ws.eachRow((row, rowNumber) => {
        const rowIndex = rowNumber - 1;
        const isHeaderRow = rowNumber === 8;
        const isProcessNameRow =
          rowNumber > 8 &&
          rowIndex < data.length &&
          data[rowIndex] &&
          (String(data[rowIndex][ROW_TYPE_COL] ?? "").trim() === "공정");
        const hasBorder = rowNumber >= 8 && !isProcessNameRow;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 8) {
            if (hasBorder) cell.border = thinBorder;
            if (isHeaderRow) cell.fill = grayFill;
            else if (isProcessNameRow) cell.fill = lightSkyBlueFill;
            if (isProcessNameRow && colNumber === 1) cell.font = { bold: true };
          }
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `견적서_${(t.title || "기본서식").replace(/[/\\?*:[\]]/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setEstimateTemplateError("엑셀 다운로드 중 오류가 발생했습니다.");
    } finally {
      setDownloadDefaultLoadingId(null);
    }
  };

  const handleDeleteEstimateTemplate = (id: number) => {
    if (!confirm("이 견적 템플릿을 삭제할까요?")) return;
    fetch(`/api/company/estimate-templates/${id}`, { method: "DELETE" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setEstimateTemplates((prev) => prev.filter((t) => t.id !== id));
          if (estimateTemplateEditId === id) clearEstimateTemplateForm();
        } else {
          alert((data as { error?: string }).error || "삭제 실패");
        }
      })
      .catch(() => alert("삭제 중 오류가 발생했습니다."));
  };

  const handleLogoUpload = () => {
    if (!logoFile) {
      alert("로고 이미지를 선택해 주세요.");
      return;
    }
    setLogoUploading(true);
    const formData = new FormData();
    formData.append("type", "logo");
    formData.append("file", logoFile);
    fetch("/api/company/upload-asset", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.path) {
          setCompanyLogoPath(data.path);
          setLogoFile(null);
          if (logoInputRef.current) logoInputRef.current.value = "";
          alert("로고가 저장되었습니다.");
        } else alert(data.error || "업로드 실패");
      })
      .catch(() => alert("업로드 실패"))
      .finally(() => setLogoUploading(false));
  };

  const handleStampUpload = () => {
    if (!stampFile) {
      alert("서명/도장 이미지를 선택해 주세요.");
      return;
    }
    setStampUploading(true);
    const formData = new FormData();
    formData.append("type", "stamp");
    formData.append("file", stampFile);
    fetch("/api/company/upload-asset", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.path) {
          setCompanyStampPath(data.path);
          setStampFile(null);
          if (stampInputRef.current) stampInputRef.current.value = "";
          alert("서명/도장이 저장되었습니다.");
        } else alert(data.error || "업로드 실패");
      })
      .catch(() => alert("업로드 실패"))
      .finally(() => setStampUploading(false));
  };

  const handleSaveCompanyContract = () => {
    setCompanyContractSaving(true);
    const doSave = (docPath: string | null) => {
      fetch("/api/company/company-contract-template", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: companyContractTitle.trim(),
          body: "",
          documentPath: docPath ?? null,
          bodyMargins: { top: 15, right: 15, bottom: 15, left: 15 },
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          alert("저장되었습니다. 계약서 작성에서 회사양식 불러오기로 PDF를 적용할 수 있습니다.");
          setModal(null);
        })
        .catch((e) => alert(e?.message || "저장 실패"))
        .finally(() => setCompanyContractSaving(false));
    };
    if (companyContractPdfFile) {
      setCompanyContractUploading(true);
      const formData = new FormData();
      formData.append("file", companyContractPdfFile);
      formData.append("companyTemplate", "1");
      fetch("/api/contracts/upload", { method: "POST", body: formData })
        .then((res) => res.json())
        .then((data) => {
          if (data.documentPath) doSave(data.documentPath);
          else {
            alert(data.error || "PDF 업로드 실패");
            setCompanyContractSaving(false);
          }
        })
        .catch(() => {
          alert("업로드 실패");
          setCompanyContractSaving(false);
        })
        .finally(() => setCompanyContractUploading(false));
    } else {
      doSave(companyContractDocumentPath);
    }
  };

  const handleSaveSchedulePhaseButtons = () => {
    const labels = schedulePhaseLabels.map((s) => s.trim()).filter(Boolean);
    if (labels.length === 0) {
      setSchedulePhaseMessage("공정 이름을 하나 이상 입력해 주세요.");
      return;
    }
    setSchedulePhaseMessage("");
    setSchedulePhaseSaving(true);
    fetch("/api/company/schedule-phase-buttons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (Array.isArray((data as { labels?: string[] }).labels)) {
            setSchedulePhaseLabels((data as { labels: string[] }).labels);
          }
          setSchedulePhaseMessage("저장되었습니다.");
          setTimeout(() => {
            setModal(null);
            setSchedulePhaseMessage("");
          }, 1500);
        } else {
          setSchedulePhaseMessage((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => setSchedulePhaseMessage("오류가 발생했습니다."))
      .finally(() => setSchedulePhaseSaving(false));
  };

  const handleSaveDrawingApi = () => {
    setDrawingApiMessage("");
    setDrawingApiLoading(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawingListApiUrl: drawingApiUrl.trim() }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setDrawingApiMessage("저장되었습니다.");
          setTimeout(() => {
            setModal(null);
            setDrawingApiMessage("");
          }, 1500);
        } else {
          setDrawingApiMessage((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => setDrawingApiMessage("오류가 발생했습니다."))
      .finally(() => setDrawingApiLoading(false));
  };

  const handleSaveCompanyInfo = () => {
    setCompanyInfoMessage("");
    setCompanyInfoSaving(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyInfoName.trim(),
        contractorAddress: companyInfoAddress.trim() || null,
        contractorRegNo: companyInfoRegNo.trim() || null,
        companyEmail: companyInfoEmail.trim() || null,
        smtpUser: smtpUser.trim() || null,
        smtpPass: smtpPass.trim() ? smtpPass : undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setCompanyInfoMessage("저장되었습니다.");
          setTimeout(() => {
            setModal(null);
            setCompanyInfoMessage("");
          }, 1500);
        } else {
          setCompanyInfoMessage((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => setCompanyInfoMessage("오류가 발생했습니다."))
      .finally(() => setCompanyInfoSaving(false));
  };

  const handleSaveNaverAppPassword = () => {
    const pass = naverAppPasswordInput.trim();
    if (!pass) return;
    setNaverAppPasswordSaving(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smtpPass: pass }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (typeof window !== "undefined" && window.opener) {
            window.opener.location.reload();
            window.close();
          } else {
            setShowNaverAppPasswordModal(false);
            setNaverAppPasswordInput("");
            setModal("company-info");
            fetch("/api/company").then((r) => r.json()).then((d) => { setSmtpOauthProvider(d.smtpOauthProvider ?? null); setSmtpUser(d.smtpUser ?? ""); });
            fetch("/api/admin/smtp-status").then((r) => r.json()).then((d) => setSmtpConfigured(d.configured === true));
          }
        } else {
          alert((data as { error?: string }).error || "저장 실패");
        }
      })
      .catch(() => alert("오류가 발생했습니다."))
      .finally(() => setNaverAppPasswordSaving(false));
  };

  if (pinStatus === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    );
  }

  if (!adminUnlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-xs rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-bold text-gray-800">관리</h1>
          {pinStatus.hasPin ? (
            <p className="mb-3 text-sm text-gray-600">관리 비밀번호를 입력하세요 (숫자 4자리)</p>
          ) : (
            <p className="mb-3 text-sm text-gray-600">관리 비밀번호를 설정하세요 (숫자 4자리)</p>
          )}
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
            placeholder="****"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest"
          />
          {pinError && <p className="mb-2 text-sm text-red-600">{pinError}</p>}
          <button
            type="button"
            onClick={handlePinSubmit}
            className="min-h-[48px] w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="mb-6 text-xl font-bold text-gray-800">관리</h1>

      <ul className="max-w-md space-y-2">
        <li>
          <button
            type="button"
            onClick={() => setModal("pics")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            담당자 설정
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("company-info")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            회사 정보
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("drawing-api")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            도면보관함 API 설정
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("estimate-templates")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            견적서 관리
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("logo-stamp")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            회사 로고 / 서명·도장
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("company-contract")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            계약서 양식
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("schedule-phase-buttons")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            일정 공정 기본 버튼
          </button>
        </li>
        <li>
          <Link
            href="/admin/order-format"
            className="min-h-[48px] flex w-full items-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            자재발주 서식관리
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={() => {
              setCompanyPwMessage("");
              setModal("company-login-password");
            }}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            회사 로그인 비밀번호 변경
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setModal("password-change")}
            className="min-h-[48px] w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 active:bg-gray-200"
          >
            관리 비밀번호 변경
          </button>
        </li>
      </ul>

      {/* 담당자 설정 모달 */}
      {modal === "pics" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">담당자 설정</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              여기서 등록한 담당자는 상담 등록·수정 시 담당자 선택 목록에 표시됩니다. 직원 코드를 설정하면 해당 담당자로 로그인할 수 있으며, 회사 가입 비밀번호를 사용합니다.
            </p>
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPic()}
                  placeholder="담당자명"
                  className="min-w-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddPic()}
                  placeholder="전화번호"
                  className="min-w-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={newEmployeeCode}
                  onChange={(e) => setNewEmployeeCode(e.target.value)}
                  placeholder="직원 코드 (로그인용)"
                  className="min-w-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <select
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">직급 선택</option>
                  <option value="대표">대표</option>
                  <option value="관리자">관리자</option>
                  <option value="사원">사원</option>
                  <option value="추가입력">추가입력</option>
                </select>
                {newPosition === "추가입력" && (
                  <input
                    type="text"
                    value={newPositionCustom}
                    onChange={(e) => setNewPositionCustom(e.target.value)}
                    placeholder="직급 직접 입력"
                    className="min-w-[100px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={handleAddPic}
                  disabled={loading || !newName.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>
            {error && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {error}
              </div>
            )}
            {loading && pics.length === 0 ? (
              <p className="text-sm text-gray-500">불러오는 중...</p>
            ) : pics.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 담당자가 없습니다. 위에서 추가해 주세요.</p>
            ) : (
              <ul className="space-y-2">
                {pics.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                  >
                    {editingPic?.id === item.id ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={editEmployeeCode}
                            onChange={(e) => setEditEmployeeCode(e.target.value)}
                            placeholder="직원 코드"
                            className="rounded border border-gray-300 px-2 py-1 text-sm w-24"
                          />
                          <select
                            value={editPosition}
                            onChange={(e) => setEditPosition(e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-sm"
                          >
                            <option value="">직급</option>
                            <option value="대표">대표</option>
                            <option value="관리자">관리자</option>
                            <option value="사원">사원</option>
                            <option value="추가입력">추가입력</option>
                          </select>
                          {editPosition === "추가입력" && (
                            <input
                              type="text"
                              value={editPositionCustom}
                              onChange={(e) => setEditPositionCustom(e.target.value)}
                              placeholder="직급 입력"
                              className="rounded border border-gray-300 px-2 py-1 text-sm w-24"
                            />
                          )}
                          <button
                            type="button"
                            onClick={handleSavePicEdit}
                            className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingPic(null); }}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-800">{item.name}</span>
                          <span className="text-gray-500">{item.phone || "-"}</span>
                          {item.employeeCode && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                              코드: {item.employeeCode}
                            </span>
                          )}
                          {item.position && (
                            <span className="text-gray-600 text-xs">직급: {item.position}</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPic(item);
                              setEditEmployeeCode(item.employeeCode ?? "");
                              const pos = item.position ?? "";
                              const isPreset = ["대표", "관리자", "사원"].includes(pos);
                              setEditPosition(isPreset ? pos : (pos ? "추가입력" : ""));
                              setEditPositionCustom(isPreset ? "" : pos);
                            }}
                            className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50 text-xs"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePic(item.id)}
                            className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 일정 공정 기본 버튼 모달 */}
      {modal === "schedule-phase-buttons" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">일정 공정 기본 버튼</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              일정 작성 화면에서 캘린더로 끌어다 놓는 공정 버튼의 회사 기본 목록입니다. 새 일정을 열 때 이 목록이 적용됩니다.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {schedulePhaseLabels.map((label, idx) => (
                <div
                  key={`${label}-${idx}`}
                  className="flex items-center gap-0.5 rounded-lg border border-gray-300 bg-white"
                >
                  <span className="px-3 py-1.5 text-sm font-medium text-gray-700">{label}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSchedulePhaseLabels((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="rounded-r-md px-1.5 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50"
                    title="삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt("추가할 공정 이름");
                  if (!name?.trim()) return;
                  const t = name.trim();
                  if (schedulePhaseLabels.includes(t)) {
                    alert("이미 있는 공정입니다.");
                    return;
                  }
                  setSchedulePhaseLabels((prev) => [...prev, t]);
                }}
                className="rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                + 추가
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSchedulePhaseLabels([...DEFAULT_SCHEDULE_PHASE_BUTTONS])}
              className="mb-3 text-xs text-blue-600 hover:underline"
            >
              시스템 기본값으로 되돌리기
            </button>
            {schedulePhaseMessage && (
              <p
                className={`mb-3 text-sm ${
                  schedulePhaseMessage.includes("저장되었습니다")
                    ? "text-green-600"
                    : schedulePhaseMessage.includes("테이블") || schedulePhaseMessage.includes("migrate")
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {schedulePhaseMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={schedulePhaseSaving}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveSchedulePhaseButtons}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={schedulePhaseSaving}
              >
                {schedulePhaseSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 도면보관함 API 설정 모달 */}
      {modal === "drawing-api" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">도면보관함 API 설정</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              Google Apps Script 웹앱 URL을 입력하세요. 견적서 작성 시 도면보관함 불러오기 기능에 사용됩니다.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">API URL (action=list 포함)</label>
              <input
                type="url"
                value={drawingApiUrl}
                onChange={(e) => setDrawingApiUrl(e.target.value)}
                placeholder="https://script.google.com/.../exec?action=list"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={drawingApiLoading}
              />
            </div>
            {drawingApiMessage && (
              <p className={`mb-3 text-sm ${drawingApiMessage.includes("저장되었습니다") ? "text-green-600" : "text-red-600"}`}>
                {drawingApiMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={drawingApiLoading}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveDrawingApi}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={drawingApiLoading}
              >
                {drawingApiLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회사 정보 모달 */}
      {modal === "company-info" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">회사 정보</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              회사명, 주소, 사업자번호를 입력하면 계약서 등 문서에 반영됩니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">회사명</label>
                <input
                  type="text"
                  value={companyInfoName}
                  onChange={(e) => setCompanyInfoName(e.target.value)}
                  placeholder="회사명"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  disabled={companyInfoSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">주소</label>
                <input
                  type="text"
                  value={companyInfoAddress}
                  onChange={(e) => setCompanyInfoAddress(e.target.value)}
                  placeholder="회사 주소 (계약서 시공자 주소로 사용)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  disabled={companyInfoSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">사업자번호</label>
                <input
                  type="text"
                  value={companyInfoRegNo}
                  onChange={(e) => setCompanyInfoRegNo(e.target.value)}
                  placeholder="예: 123-45-67890"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  disabled={companyInfoSaving}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">회사 이메일</label>
                <input
                  type="email"
                  value={companyInfoEmail}
                  onChange={(e) => setCompanyInfoEmail(e.target.value)}
                  placeholder="예: info@company.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  disabled={companyInfoSaving}
                />
              </div>
            </div>
            {companyInfoMessage && (
              <p className={`mt-3 text-sm ${companyInfoMessage.includes("저장되었습니다") ? "text-green-600" : "text-red-600"}`}>
                {companyInfoMessage}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={companyInfoSaving}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveCompanyInfo}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={companyInfoSaving}
              >
                {companyInfoSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 네이버 앱 비밀번호 입력 모달 (OAuth 콜백 팝업용) */}
      {showNaverAppPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-gray-800">네이버 메일 발송 설정</h2>
            <p className="mb-3 text-sm text-gray-600">메일 발송을 위해 앱 비밀번호를 한 번 입력하세요. 네이버: 메일 환경설정 → POP3·IMAP → 보안 연결에서 발급할 수 있습니다.</p>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-600">앱 비밀번호</label>
              <input
                type="password"
                value={naverAppPasswordInput}
                onChange={(e) => setNaverAppPasswordInput(e.target.value)}
                placeholder="앱 비밀번호 입력"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={naverAppPasswordSaving}
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowNaverAppPasswordModal(false); setNaverAppPasswordInput(""); if (typeof window !== "undefined" && window.opener) window.close(); }}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={naverAppPasswordSaving}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveNaverAppPassword}
                disabled={naverAppPasswordSaving || !naverAppPasswordInput.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {naverAppPasswordSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 견적서 관리 모달 (커스텀 견적 제목 저장) */}
      {modal === "estimate-templates" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">견적서 관리</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              기본 템플릿을 엑셀로 다운받아 수정한 뒤, 제목을 넣고 파일을 선택해 저장하면 우리 회사 템플릿이 됩니다. 견적서 작성 → 템플릿 불러오기 → 우리 회사 템플릿에서 불러올 수 있습니다.
            </p>
            {defaultEstimateTemplates.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-gray-500">기본 템플릿 엑셀 다운로드 (수정 후 위에서 파일로 등록)</p>
                <ul className="space-y-2">
                  {defaultEstimateTemplates.map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm">
                      <span className="font-medium text-gray-800">{t.title}</span>
                      <button
                        type="button"
                        onClick={() => handleDownloadDefaultAsExcel(t)}
                        disabled={downloadDefaultLoadingId === t.id}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {downloadDefaultLoadingId === t.id ? "다운로드 중..." : "엑셀 다운"}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={estimateTemplateTitle}
                onChange={(e) => setEstimateTemplateTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddEstimateTemplate()}
                placeholder="예: 아파트 표준견적, 상가 견적"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {estimateTemplateEditId != null && (
                <button
                  type="button"
                  onClick={clearEstimateTemplateForm}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  취소
                </button>
              )}
              <button
                type="button"
                onClick={handleAddEstimateTemplate}
                disabled={estimateTemplateLoading || !estimateTemplateTitle.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {estimateTemplateEditId != null ? "수정 저장" : "저장"}
              </button>
            </div>
            {estimateTemplateEditId != null && (
              <p className="mb-2 text-xs text-blue-700">선택한 우리 회사 양식을 수정 중입니다. 제목만 바꾸거나, 엑셀을 선택해 내용까지 바꿀 수 있습니다.</p>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                ref={estimateTemplateFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setEstimateTemplateFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => estimateTemplateFileInputRef.current?.click()}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {estimateTemplateFile ? `선택됨: ${estimateTemplateFile.name}` : "엑셀으로 내용 채우기 (선택)"}
              </button>
              {estimateTemplateFile && (
                <button
                  type="button"
                  onClick={() => { setEstimateTemplateFile(null); if (estimateTemplateFileInputRef.current) estimateTemplateFileInputRef.current.value = ""; }}
                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  취소
                </button>
              )}
            </div>
            {estimateTemplateError && (
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {estimateTemplateError}
              </div>
            )}
            {estimateTemplates.length === 0 ? (
              <p className="text-sm text-gray-500">등록된 견적 템플릿이 없습니다. 위에서 기본 템플릿 엑셀 다운 후 수정하거나, 제목 입력 + 파일 선택 후 저장하세요.</p>
            ) : (
              <ul className="space-y-2">
                {estimateTemplates.map((t) => (
                  <li
                    key={t.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      estimateTemplateEditId === t.id ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <span className="font-medium text-gray-800">{t.title}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEditEstimateTemplate(t)}
                        className="rounded px-2 py-1 text-blue-600 hover:bg-blue-50"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEstimateTemplate(t.id)}
                        className="rounded px-2 py-1 text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 회사 로고 / 서명·도장 모달 */}
      {modal === "logo-stamp" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">회사 로고 / 서명·도장</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              회사 로고와 서명·도장 이미지를 등록하면 견적서, 계약서 등 문서에 활용할 수 있습니다. (이미지: PNG, JPG, GIF, WebP 2MB 이하)
            </p>
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">회사 로고</h3>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-shrink-0">
                    {companyLogoPath ? (
                      <img
                        src={`/api/company/asset/logo?t=${Date.now()}`}
                        alt="로고"
                        className="h-20 w-20 rounded border border-gray-200 object-contain bg-gray-50"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
                        없음
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      파일 선택
                    </button>
                    {logoFile && <span className="ml-2 text-sm text-gray-600">{logoFile.name}</span>}
                    <button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={logoUploading || !logoFile}
                      className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {logoUploading ? "업로드 중..." : "업로드"}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-700">서명 / 도장</h3>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-shrink-0">
                    {companyStampPath ? (
                      <img
                        src={`/api/company/asset/stamp?t=${Date.now()}`}
                        alt="서명·도장"
                        className="h-20 w-20 rounded border border-gray-200 object-contain bg-gray-50"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
                        없음
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      ref={stampInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => setStampFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                      type="button"
                      onClick={() => stampInputRef.current?.click()}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      파일 선택
                    </button>
                    {stampFile && <span className="ml-2 text-sm text-gray-600">{stampFile.name}</span>}
                    <button
                      type="button"
                      onClick={handleStampUpload}
                      disabled={stampUploading || !stampFile}
                      className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {stampUploading ? "업로드 중..." : "업로드"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 계약서 양식 모달 (회사별): PDF만 등록 */}
      {modal === "company-contract" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800">계약서 양식</h2>
                <button type="button" onClick={() => setModal(null)} className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100" aria-label="닫기">✕</button>
              </div>
              <p className="mt-3 text-sm text-gray-600">
                계약 일반 조건 등은 PDF로만 등록합니다. 이 화면에서는 글을 입력하지 않습니다.
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">계약서 제목 (기본값)</label>
                  <input
                    type="text"
                    value={companyContractTitle}
                    onChange={(e) => setCompanyContractTitle(e.target.value)}
                    placeholder="예: 인테리어 계약서"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input ref={companyContractPdfInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setCompanyContractPdfFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => companyContractPdfInputRef.current?.click()} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  PDF 선택
                </button>
                {(companyContractDocumentPath || companyContractPdfFile) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyContractDocumentPath(null);
                      setCompanyContractPdfFile(null);
                      if (companyContractPdfInputRef.current) companyContractPdfInputRef.current.value = "";
                    }}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    PDF 삭제
                  </button>
                )}
                {companyContractDocumentPath && !companyContractPdfFile && <span className="text-xs text-green-600">저장된 PDF 있음</span>}
                {companyContractPdfFile && <span className="max-w-[200px] truncate text-xs text-gray-600" title={companyContractPdfFile.name}>{companyContractPdfFile.name}</span>}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled={companyContractSaving}>
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveCompanyContract}
                disabled={companyContractSaving || companyContractUploading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {companyContractSaving || companyContractUploading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회사 로그인 비밀번호 변경 모달 */}
      {modal === "company-login-password" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">회사 로그인 비밀번호 변경</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              직원이 개인 비밀번호 없이 로그인할 때 사용하는 회사 공통 비밀번호입니다. 새 비밀번호는 6자 이상입니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">현재 비밀번호</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={companyPwCurrent}
                  onChange={(e) => setCompanyPwCurrent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={companyPwNew}
                  onChange={(e) => setCompanyPwNew(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호 확인</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={companyPwConfirm}
                  onChange={(e) => setCompanyPwConfirm(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            {companyPwMessage && (
              <p
                className={`mt-3 text-sm ${
                  companyPwMessage.includes("되었습니다") ? "text-green-600" : "text-red-600"
                }`}
              >
                {companyPwMessage}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCompanyLoginPasswordChange}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 관리 비밀번호 변경 모달 */}
      {modal === "password-change" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">관리 비밀번호 변경</h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-8 w-8 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">숫자 4자리로 입력하세요.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">현재 비밀번호</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호 확인</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest"
                />
              </div>
            </div>
            {pwMessage && (
              <p className={`mt-3 text-sm ${pwMessage.includes("변경되었습니다") ? "text-green-600" : "text-red-600"}`}>
                {pwMessage}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handlePasswordChange}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                변경
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">이 페이지를 벗어나면 다시 비밀번호를 입력해야 합니다.</p>
    </div>
  );
}
