"use client";

import React, { useEffect, useState, useRef } from "react";

/** 도면 보관함 API에서 한 행 형식 (ERP에서 목록 불러올 때) */
type DrawingListRow = {
  siteName?: string;
  savedAt?: string;
  summary?: string;
  data?: { zones?: { name?: string; area?: string }[]; doors?: unknown[]; height?: number };
  현장명?: string;
  저장시각?: string;
  요약?: string;
  데이터?: { zones?: { name?: string; area?: string }[]; doors?: unknown[]; height?: number };
};

/** 도면 JSON → 견적용 payload (ERP에서 불러온 도면 데이터 변환) */
function drawingDataToPayload(
  drawingData: DrawingListRow["data"],
  summary?: string
): SmartFieldEstimatePayload {
  if (!drawingData) return {};
  const zones = drawingData.zones || [];
  const doors = drawingData.doors || [];
  const height = drawingData.height;
  const roomAreas = zones.map((z) => ({ name: z.name || "", area: parseFloat(String(z.area)) || 0 }));
  let totalArea = 0;
  roomAreas.forEach((r) => (totalArea += r.area));
  const dimensions: string[] = [];
  if (height) dimensions.push("천장고 " + (height / 1000).toFixed(1) + "m");
  if (summary) dimensions.push(summary);
  return {
    doorCount: doors.length,
    roomAreas,
    totalArea,
    dimensions: dimensions.join(", "),
  };
}

function getTodayDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 견적일자 표시용 YYYY-MM-DD 형식 */
function formatDateYMD(dateStr: string | undefined): string {
  if (!dateStr || !dateStr.trim()) return "-";
  const d = new Date(dateStr.trim());
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type EstimateItem = {
  processGroup?: string;
  category: string;
  spec: string;
  unit: string;
  qty: number;
  /** 재료비 단가 (기존 unitPrice 호환: 없으면 unitPrice 사용) */
  materialUnitPrice?: number;
  /** 노무비 단가 */
  laborUnitPrice?: number;
  unitPrice?: number;
  note: string;
};

/** 스마트 현장관리에서 보내는 데이터 형식 (해당 앱에서 postMessage로 전달 시 사용) */
export type SmartFieldEstimatePayload = {
  doorCount?: number;
  roomAreas?: { name: string; area: number }[];
  totalArea?: number;
  dimensions?: string;
  items?: EstimateItem[];
};

type Estimate = {
  id: number;
  consultationId?: number;
  customerName: string;
  contact: string;
  address: string;
  title: string;
  estimateDate?: string;
  note: string;
  items: EstimateItem[];
  processOrder?: string[];
  createdAt?: string;
};

const emptyItem: EstimateItem = {
  processGroup: "",
  category: "",
  spec: "",
  unit: "식",
  qty: 1,
  materialUnitPrice: 0,
  laborUnitPrice: 0,
  note: "",
};

function materialAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const p = Number(item.materialUnitPrice ?? item.unitPrice ?? 0) || 0;
  return q * p;
}
function laborAmount(item: EstimateItem): number {
  const q = Number(item.qty) || 0;
  const p = Number(item.laborUnitPrice ?? 0) || 0;
  return q * p;
}
function amount(item: EstimateItem): number {
  return materialAmount(item) + laborAmount(item);
}

/** 스마트 현장관리 페이로드 → 견적 항목으로 변환 (치수/문 개수/방면적 등) */
function smartFieldPayloadToItems(payload: SmartFieldEstimatePayload): EstimateItem[] {
  const result: EstimateItem[] = [];
  if (payload.items && payload.items.length > 0) {
    payload.items.forEach((it) =>
      result.push({
        processGroup: (it as EstimateItem).processGroup ?? "",
        category: it.category || "",
        spec: it.spec || "",
        unit: it.unit || "식",
        qty: Number(it.qty) || 0,
        materialUnitPrice: Number((it as EstimateItem).materialUnitPrice ?? it.unitPrice ?? 0) || 0,
        laborUnitPrice: Number((it as EstimateItem).laborUnitPrice ?? 0) || 0,
        note: it.note || "",
      })
    );
    return result;
  }
  if (payload.doorCount != null && payload.doorCount > 0) {
    result.push({
      processGroup: "",
      category: "문",
      spec: "문 개수",
      unit: "개",
      qty: Number(payload.doorCount),
      materialUnitPrice: 0,
      laborUnitPrice: 0,
      note: "",
    });
  }
  if (payload.roomAreas && payload.roomAreas.length > 0) {
    payload.roomAreas.forEach((r) => {
      result.push({
        processGroup: "",
        category: "방면적",
        spec: r.name || "",
        unit: "m²",
        qty: Number(r.area) || 0,
        materialUnitPrice: 0,
        laborUnitPrice: 0,
        note: "",
      });
    });
  }
  if (payload.totalArea != null && payload.totalArea > 0 && result.every((i) => i.category !== "전체면적")) {
    result.unshift({
      processGroup: "",
      category: "전체면적",
      spec: "계",
      unit: "m²",
      qty: Number(payload.totalArea),
      materialUnitPrice: 0,
      laborUnitPrice: 0,
      note: payload.dimensions || "",
    });
  } else if (payload.dimensions) {
    if (result.length > 0) result[0].note = payload.dimensions;
  }
  return result;
}

function EstimateForm({
  estimate,
  consultationPreFill,
  onSave,
  onCancel,
}: {
  estimate: Estimate | null;
  consultationPreFill: { customerName: string; contact: string; address: string; consultationId: number } | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const isEdit = estimate !== null;
  const [customerName, setCustomerName] = useState(estimate?.customerName ?? consultationPreFill?.customerName ?? "");
  const [contact, setContact] = useState(estimate?.contact ?? consultationPreFill?.contact ?? "");
  const [address, setAddress] = useState(estimate?.address ?? consultationPreFill?.address ?? "");
  const [title, setTitle] = useState(estimate?.title ?? "");
  const [estimateDate, setEstimateDate] = useState(estimate?.estimateDate ?? getTodayDateLocal());
  const [note, setNote] = useState(estimate?.note ?? "");
  const [items, setItems] = useState<EstimateItem[]>(
    estimate?.items?.length
      ? estimate.items.map((i) => ({
          ...emptyItem,
          ...i,
          processGroup: i.processGroup ?? "",
          qty: Number(i.qty) || 0,
          materialUnitPrice: Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0,
          laborUnitPrice: Number(i.laborUnitPrice ?? 0) || 0,
        }))
      : [{ ...emptyItem }]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (consultationPreFill && !isEdit) {
      setCustomerName(consultationPreFill.customerName);
      setContact(consultationPreFill.contact);
      setAddress(consultationPreFill.address);
    }
  }, [consultationPreFill, isEdit]);

  const [smartFieldModalOpen, setSmartFieldModalOpen] = useState(false);
  const [smartFieldListUrl, setSmartFieldListUrl] = useState("");
  const [smartFieldList, setSmartFieldList] = useState<DrawingListRow[] | null>(null);
  const [smartFieldLoading, setSmartFieldLoading] = useState(false);
  /** 도면에서 불러온 참조값 (항목에 넣지 않고 상단 표로만 표시) */
  const [drawingReference, setDrawingReference] = useState<SmartFieldEstimatePayload | null>(null);
  /** 한글 등 IME 조합 중일 때 임시 값 (조합 완료 시에만 state 반영해서 포커스/선택 유지) */
  const [composition, setComposition] = useState<{ key: string; value: string } | null>(null);
  /** 공정 표시 순서 (맨 아래 추가·순서변경용). 저장된 값 또는 items에서 유지 순서로 추출 */
  const [processOrder, setProcessOrder] = useState<string[]>(() => {
    if (estimate?.processOrder && estimate.processOrder.length > 0) return estimate.processOrder;
    const order: string[] = [];
    const seen = new Set<string>();
    (estimate?.items ?? []).forEach((i) => {
      const g = i.processGroup ?? "";
      if (g && !seen.has(g)) {
        seen.add(g);
        order.push(g);
      }
    });
    return order;
  });
  const [processOrderModalOpen, setProcessOrderModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewPrintRef = React.useRef<HTMLDivElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  /** 커스텀 견적 불러오기 / 템플릿으로 저장 */
  type EstimateTemplateRow = { id: number; title: string; items: EstimateItem[]; processOrder?: string[] };
  const [customTemplateModalOpen, setCustomTemplateModalOpen] = useState(false);
  const [customTemplateList, setCustomTemplateList] = useState<EstimateTemplateRow[]>([]);
  const [customTemplateLoading, setCustomTemplateLoading] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [saveTemplateList, setSaveTemplateList] = useState<{ id: number; title: string }[]>([]);
  const [saveTemplateTargetId, setSaveTemplateTargetId] = useState<number | null>(null);
  const [saveAsNewTitle, setSaveAsNewTitle] = useState("");
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false);

  useEffect(() => {
    if (processOrder.length === 0 && items.length > 0) {
      const order: string[] = [];
      const seen = new Set<string>();
      items.forEach((i) => {
        const g = i.processGroup ?? "";
        if (g && !seen.has(g)) {
          seen.add(g);
          order.push(g);
        }
      });
      if (order.length > 0) setProcessOrder(order);
    }
  }, [items, processOrder.length]);

  // 회사 정보에서 API URL 가져오기
  useEffect(() => {
    fetch("/api/company")
      .then((res) => res.json())
      .then((data) => {
        if (data?.drawingListApiUrl) {
          setSmartFieldListUrl(data.drawingListApiUrl);
        }
      })
      .catch(() => {});
  }, []);

  /** 해당 공정(그룹) 아래에 항목 한 줄 추가. indices = 그 그룹의 item 인덱스들 */
  const addRowToProcess = (processGroupName: string, indices: number[]) => {
    if (indices.length === 0) {
      setItems((prev) => [...prev, { ...emptyItem, processGroup: processGroupName }]);
      return;
    }
    const lastIdx = Math.max(...indices);
    setItems((prev) => {
      const newItem: EstimateItem = { ...emptyItem, processGroup: processGroupName };
      return [...prev.slice(0, lastIdx + 1), newItem, ...prev.slice(lastIdx + 1)];
    });
  };
  /** 공정 추가: 새 공정을 제일 마지막(맨 밑)에 배치 */
  const addNewSection = () => {
    const newId = `\u200B${Date.now()}`;
    setItems((prev) => [...prev, { ...emptyItem, processGroup: newId }]);
    setProcessOrder((prev) => [...prev, newId]);
  };
  
  const loadSmartFieldList = () => {
    const url = smartFieldListUrl.trim();
    if (!url) {
      alert("도면 목록 API URL을 입력해 주세요. 관리 페이지에서 설정할 수 있습니다.");
      return;
    }
    setSmartFieldLoading(true);
    setSmartFieldList(null);
    fetch(url)
      .then((res) => res.json())
      .then((raw) => {
        let arr: unknown[] = [];
        if (Array.isArray(raw)) arr = raw;
        else if (raw && typeof raw === "object") arr = (raw as { items?: unknown[] }).items ?? (raw as { data?: unknown[] }).data ?? (raw as { rows?: unknown[] }).rows ?? [];
        const list = arr as DrawingListRow[];
        setSmartFieldList(list);
        if (list.length === 0) alert("불러온 목록이 비어 있습니다. 스크립트에서 시트/열 구성을 확인해 주세요.");
      })
      .catch(() => {
        alert("목록을 불러오지 못했습니다. URL과 CORS 설정을 확인해 주세요.");
        setSmartFieldList([]);
      })
      .finally(() => setSmartFieldLoading(false));
  };

  const openSmartFieldModal = () => {
    setSmartFieldModalOpen(true);
    setSmartFieldList(null);
    // URL이 있으면 자동으로 목록 불러오기
    if (smartFieldListUrl.trim()) {
      loadSmartFieldList();
    }
  };
  const selectDrawing = (row: DrawingListRow) => {
    const data = row.data ?? row.데이터;
    const summary = row.summary ?? row.요약 ?? "";
    const payload = drawingDataToPayload(data, summary);
    const hasRef = payload.doorCount != null || (payload.roomAreas && payload.roomAreas.length > 0) || payload.totalArea != null || payload.dimensions;
    if (hasRef) {
      setDrawingReference(payload);
      setSmartFieldModalOpen(false);
    } else {
      alert("선택한 도면에 사용할 수 있는 참조 데이터가 없습니다.");
    }
  };

  const openCustomTemplateModal = () => {
    setCustomTemplateModalOpen(true);
    setCustomTemplateLoading(true);
    fetch("/api/company/estimate-templates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCustomTemplateList(data as EstimateTemplateRow[]);
        else setCustomTemplateList([]);
      })
      .catch(() => setCustomTemplateList([]))
      .finally(() => setCustomTemplateLoading(false));
  };

  const loadCustomTemplate = (t: EstimateTemplateRow) => {
    const normalized = (t.items || []).map((i) => ({
      ...emptyItem,
      ...i,
      processGroup: i.processGroup ?? "",
      qty: Number(i.qty) || 0,
      materialUnitPrice: Number(i.materialUnitPrice ?? (i as EstimateItem & { unitPrice?: number }).unitPrice ?? 0) || 0,
      laborUnitPrice: Number(i.laborUnitPrice ?? 0) || 0,
    }));
    setItems(normalized.length > 0 ? normalized : [{ ...emptyItem }]);
    if (t.processOrder && t.processOrder.length > 0) setProcessOrder(t.processOrder);
    else if (normalized.length > 0) {
      const order: string[] = [];
      const seen = new Set<string>();
      normalized.forEach((i) => {
        const g = i.processGroup ?? "";
        if (g && !seen.has(g)) {
          seen.add(g);
          order.push(g);
        }
      });
      if (order.length > 0) setProcessOrder(order);
    }
    setCustomTemplateModalOpen(false);
  };

  const openSaveTemplateModal = () => {
    setSaveTemplateModalOpen(true);
    setSaveTemplateTargetId(null);
    setSaveAsNewTitle("");
    fetch("/api/company/estimate-templates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSaveTemplateList(data.map((x: { id: number; title: string }) => ({ id: x.id, title: x.title })));
        else setSaveTemplateList([]);
      })
      .catch(() => setSaveTemplateList([]));
  };

  const handleSaveTemplate = () => {
    const payload = {
      items: items.map((it) => ({
        processGroup: it.processGroup ?? "",
        category: it.category,
        spec: it.spec,
        unit: it.unit,
        qty: Number(it.qty) || 0,
        materialUnitPrice: Number(it.materialUnitPrice ?? 0) || 0,
        laborUnitPrice: Number(it.laborUnitPrice ?? 0) || 0,
        note: it.note,
      })),
      processOrder,
    };
    if (saveTemplateTargetId != null) {
      setSaveTemplateLoading(true);
      fetch(`/api/company/estimate-templates/${saveTemplateTargetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (res.ok) {
            alert("템플릿에 저장되었습니다.");
            setSaveTemplateModalOpen(false);
          } else {
            res.json().then((d) => alert((d as { error?: string }).error || "저장 실패"));
          }
        })
        .catch(() => alert("저장 중 오류가 발생했습니다."))
        .finally(() => setSaveTemplateLoading(false));
    } else {
      const title = saveAsNewTitle.trim();
      if (!title) {
        alert("새 템플릿 제목을 입력하세요.");
        return;
      }
      setSaveTemplateLoading(true);
      fetch("/api/company/estimate-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, title }),
      })
        .then((res) => {
          if (res.ok) {
            alert("새 템플릿으로 저장되었습니다.");
            setSaveTemplateModalOpen(false);
          } else {
            res.json().then((d) => alert((d as { error?: string }).error || "저장 실패"));
          }
        })
        .catch(() => alert("저장 중 오류가 발생했습니다."))
        .finally(() => setSaveTemplateLoading(false));
    }
  };

  /** 엑셀 저장: 3번 형식 - 공정명 그룹 헤더 행 + No 1,2,3 항목 행, 테두리·연한 회색 배경 */
  const exportToExcel = async () => {
    try {
      const ExcelJS = await import("exceljs");
      const orderMap = new Map(processOrder.map((name, idx) => [name, idx]));
      const sortedIndices = items
        .map((_, i) => i)
        .sort((a, b) => {
          const pa = items[a].processGroup ?? "";
          const pb = items[b].processGroup ?? "";
          const ia = orderMap.get(pa) ?? processOrder.length;
          const ib = orderMap.get(pb) ?? processOrder.length;
          if (ia !== ib) return ia - ib;
          return a - b;
        });
      const groups: { name: string; indices: number[] }[] = [];
      let currentName = "";
      let currentIndices: number[] = [];
      sortedIndices.forEach((idx) => {
        const name = items[idx].processGroup ?? "";
        if (name !== currentName) {
          if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });
          currentName = name;
          currentIndices = [idx];
        } else {
          currentIndices.push(idx);
        }
      });
      if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });

      const data: (string | number)[][] = [
        ["고객명", customerName || ""],
        ["연락처", contact || ""],
        ["주소", address || ""],
        ["제목", title || ""],
        ["견적일자", estimateDate || ""],
        ["비고", note || ""],
        [],
        ["no", "품목", "규격", "단위", "수량", "재료비단가", "노무비단가", "비고"],
      ];
      groups.forEach((grp) => {
        const displayName = grp.name.startsWith("\u200B") ? "" : grp.name;
        data.push([displayName, "", "", "", "", "", "", ""]);
        grp.indices.forEach((origIdx, subNo) => {
          const it = items[origIdx];
          data.push([
            subNo + 1,
            it.category ?? "",
            it.spec ?? "",
            it.unit ?? "",
            Number(it.qty) || 0,
            Number(it.materialUnitPrice ?? 0) || 0,
            Number(it.laborUnitPrice ?? 0) || 0,
            it.note ?? "",
          ]);
        });
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("견적서", { views: [{ rightToLeft: false }] });
      data.forEach((row) => {
        const padded = row.length >= 8 ? row : [...row, ...Array(8 - row.length).fill("")];
        ws.addRow(padded);
      });

      const thinBorder = {
        top: { style: "thin" as const },
        left: { style: "thin" as const },
        bottom: { style: "thin" as const },
        right: { style: "thin" as const },
      };
      const grayFill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFD9D9D9" },
        bgColor: { argb: "FFD9D9D9" },
      };
      const lightSkyBlueFill = {
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb: "FFD6EAF8" },
        bgColor: { argb: "FFD6EAF8" },
      };
      ws.eachRow((row, rowNumber) => {
        const rowIndex = rowNumber - 1;
        const isHeaderRow = rowNumber === 8;
        const isProcessNameRow =
          rowNumber > 8 &&
          rowIndex < data.length &&
          data[rowIndex] &&
          String(data[rowIndex][0] ?? "").trim() !== "" &&
          [1, 2, 3, 4, 5, 6, 7].every((c) => !String(data[rowIndex][c] ?? "").trim());
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

      const fileName = `견적서_${title || "제목없음"}_${estimateDate || new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("엑셀 저장 중 오류가 발생했습니다.");
    }
  };

  /** 엑셀 불러오기: 파일 선택 후 견적 폼에 반영 */
  const handleExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const XLSX = await import("xlsx");
        const data = ev.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: "binary" });
        const first = wb.SheetNames[0];
        if (!first) return;
        const ws = wb.Sheets[first];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as (string | number)[][];
        if (rows.length < 9) {
          alert("엑셀 형식이 올바르지 않습니다. 견적서 엑셀 저장으로 내보낸 파일을 사용해 주세요.");
          return;
        }
        const get = (r: number, col: number) => String(rows[r]?.[col] ?? "").trim();
        setCustomerName(get(0, 1));
        setContact(get(1, 1));
        setAddress(get(2, 1));
        setTitle(get(3, 1));
        setEstimateDate(get(4, 1) || "");
        setNote(get(5, 1));
        const processOrderSeen: string[] = [];
        const newItems: EstimateItem[] = [];
        let currentProcess = "";
        for (let r = 8; r < rows.length; r++) {
          const row = rows[r];
          if (!row) continue;
          const a = String(row[0] ?? "").trim();
          const b = String(row[1] ?? "").trim();
          const c = String(row[2] ?? "").trim();
          const d = String(row[3] ?? "").trim();
          const h = String(row[7] ?? "").trim();
          const restEmpty = !b && !c && !d && !String(row[4] ?? "").trim() && !String(row[5] ?? "").trim() && !String(row[6] ?? "").trim() && !h;
          if (a && restEmpty) {
            currentProcess = a;
            if (currentProcess && !processOrderSeen.includes(currentProcess)) processOrderSeen.push(currentProcess);
            continue;
          }
          if (!currentProcess && !a && !b && !c) continue;
          const processGroup = currentProcess || a;
          if (processGroup && !processOrderSeen.includes(processGroup)) processOrderSeen.push(processGroup);
          newItems.push({
            processGroup: processGroup || (newItems.length ? newItems[newItems.length - 1].processGroup : ""),
            category: b,
            spec: c,
            unit: d || "식",
            qty: Number(row[4]) || 0,
            materialUnitPrice: Number(row[5]) || 0,
            laborUnitPrice: Number(row[6]) || 0,
            note: h,
          });
          if (!currentProcess && a) currentProcess = a;
        }
        if (newItems.length > 0) {
          setItems(newItems);
          setProcessOrder(
            processOrderSeen.length > 0
              ? processOrderSeen
              : [...new Set(newItems.map((i) => i.processGroup ?? "").filter((x): x is string => x !== ""))]
          );
        } else {
          alert("엑셀에서 항목을 찾지 못했습니다. 9행부터 공정 그룹 헤더 또는 품목 행이 있는지 확인해 주세요.");
        }
      } catch (err) {
        console.error(err);
        alert("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const removeRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof EstimateItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      (next[idx] as Record<string, unknown>)[field] = value;
      if (field === "qty" || field === "materialUnitPrice" || field === "laborUnitPrice") {
        next[idx].qty = Number(next[idx].qty) || 0;
        next[idx].materialUnitPrice = Number(next[idx].materialUnitPrice ?? 0) || 0;
        next[idx].laborUnitPrice = Number(next[idx].laborUnitPrice ?? 0) || 0;
      }
      return next;
    });
  };

  /** 같은 공정의 모든 항목 processGroup 일괄 변경 (섹션 제목 수정 시) */
  const updateProcessGroupForIndices = (indices: number[], newName: string) => {
    setItems((prev) => {
      const next = [...prev];
      indices.forEach((i) => {
        next[i] = { ...next[i], processGroup: newName };
      });
      return next;
    });
  };

  /** 수량 0인 항목은 견적서에 포함하지 않음 */
  const subtotal = items.reduce((sum, it) => ((Number(it.qty) || 0) > 0 ? sum + amount(it) : sum), 0);
  const vat = Math.floor(subtotal * 0.1);
  const total = subtotal + vat;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        consultationId: estimate?.consultationId ?? consultationPreFill?.consultationId ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("consultationId") : null),
        customerName: customerName.trim(),
        contact: contact.trim(),
        address: address.trim(),
        title: title.trim(),
        estimateDate: estimateDate || undefined,
        note: note.trim(),
        processOrder: processOrder.length > 0 ? processOrder : undefined,
        items: items.map((it) => ({
          processGroup: it.processGroup ?? "",
          category: it.category,
          spec: it.spec,
          unit: it.unit,
          qty: Number(it.qty) || 0,
          materialUnitPrice: Number(it.materialUnitPrice ?? 0) || 0,
          laborUnitPrice: Number(it.laborUnitPrice ?? 0) || 0,
          note: it.note,
        })),
      };
      const url = isEdit ? `/api/estimates/${estimate.id}` : "/api/estimates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "저장에 실패했습니다.");
        return;
      }
      alert(isEdit ? "수정되었습니다." : "저장되었습니다.");
      onSave();
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">고객명</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="고객명"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">연락처</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="연락처"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">주소</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="주소"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">견적 제목</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 거실 리모델링 견적"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">견적일자</label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={estimateDate}
            onChange={(e) => setEstimateDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">비고</label>
          <input
            type="text"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="비고"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">견적 항목</h3>
        <p className="mb-2 text-xs text-gray-500">공정명을 입력하면 섹션으로 묶이고, 프린트 시 &quot;가설철거 1. 항목 2. 항목 … 목공사 1. 항목&quot; 형태로 보입니다.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openSmartFieldModal}
            className="rounded-lg border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            도면 보관함에서 불러오기
          </button>
          <button
            type="button"
            onClick={openCustomTemplateModal}
            className="rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            커스텀 견적 불러오기
          </button>
          <button
            type="button"
            onClick={openSaveTemplateModal}
            className="rounded-lg border border-gray-500 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            템플릿으로 저장
          </button>
          <button type="button" onClick={addNewSection} className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            + 공정 추가
          </button>
          <button type="button" onClick={() => setProcessOrderModalOpen(true)} className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            공정 순서 변경
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        &quot;도면 보관함에서 불러오기&quot;로 한 건을 선택하면 방·거실·방면적·문 개수 등이 상단 참조 표에만 표시됩니다. (항목에는 자동 입력되지 않습니다.)
      </p>
      <p className="mb-4 text-xs text-amber-700">
        ※스마트현장관리 앱설치필수
      </p>

      {/* 도면에서 불러온 참조값 표 (항목에 넣지 않고 참고용) */}
      {drawingReference && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold text-gray-600">도면 참조값</p>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl border-collapse text-sm">
              <tbody className="divide-y divide-gray-200">
                {drawingReference.roomAreas && drawingReference.roomAreas.length > 0 && (
                  <>
                    {drawingReference.roomAreas.filter((r) => !(r.name || "").includes("거실")).length > 0 && (
                      <tr>
                        <td className="py-1 pr-4 font-medium text-gray-700">방</td>
                        <td className="py-1 text-gray-800">
                          {drawingReference.roomAreas.filter((r) => !(r.name || "").includes("거실")).length}개
                        </td>
                      </tr>
                    )}
                    {drawingReference.roomAreas.filter((r) => (r.name || "").includes("거실")).length > 0 && (
                      <tr>
                        <td className="py-1 pr-4 font-medium text-gray-700">거실</td>
                        <td className="py-1 text-gray-800">
                          {drawingReference.roomAreas.filter((r) => (r.name || "").includes("거실")).length}개
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pr-4 font-medium text-gray-700">방면적</td>
                      <td className="py-1 text-gray-800">
                        {drawingReference.roomAreas.map((r) => `${r.name || "방"} ${r.area}m²`).join(", ")}
                      </td>
                    </tr>
                  </>
                )}
                {drawingReference.doorCount != null && drawingReference.doorCount > 0 && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">문</td>
                    <td className="py-1 text-gray-800">{drawingReference.doorCount}개</td>
                  </tr>
                )}
                {drawingReference.totalArea != null && drawingReference.totalArea > 0 && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">전체면적</td>
                    <td className="py-1 text-gray-800">{drawingReference.totalArea}m²</td>
                  </tr>
                )}
                {drawingReference.dimensions && (
                  <tr>
                    <td className="py-1 pr-4 font-medium text-gray-700">비고</td>
                    <td className="py-1 text-gray-800">{drawingReference.dimensions}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => setDrawingReference(null)}
            className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
          >
            참조값 지우기
          </button>
        </div>
      )}

      {smartFieldModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">도면 보관함에서 불러오기</h3>
              <button type="button" onClick={() => setSmartFieldModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4">
              {smartFieldLoading ? (
                <p className="text-center text-sm text-gray-500 py-8">목록을 불러오는 중...</p>
              ) : !smartFieldList ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-3">도면 API URL이 설정되지 않았습니다.</p>
                  <p className="text-xs text-gray-400">관리 페이지에서 도면 보관함 API URL을 먼저 설정해 주세요.</p>
                </div>
              ) : smartFieldList.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">저장된 도면이 없습니다.</p>
              ) : (
                <div className="overflow-auto max-h-[60vh] rounded-lg border border-gray-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2">현장명</th>
                        <th className="p-2">저장시각</th>
                        <th className="p-2">요약</th>
                        <th className="w-20 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {smartFieldList.map((row, idx) => (
                        <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2">{row.siteName ?? row.현장명 ?? "-"}</td>
                          <td className="p-2 text-gray-600">{row.savedAt ?? row.저장시각 ?? "-"}</td>
                          <td className="p-2 text-gray-600 truncate max-w-[120px]" title={row.summary ?? row.요약 ?? ""}>{row.summary ?? row.요약 ?? "-"}</td>
                          <td className="p-2">
                            <button type="button" onClick={() => selectDrawing(row)} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">선택</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-700">
              <th className="p-2 w-14">No</th>
              <th className="p-2">품목</th>
              <th className="p-2">규격</th>
              <th className="p-2 w-16">단위</th>
              <th className="p-2 w-20">수량</th>
              <th className="p-2 w-24">재료비단가</th>
              <th className="p-2 w-24">재료비금액</th>
              <th className="p-2 w-24">노무비단가</th>
              <th className="p-2 w-24">노무비금액</th>
              <th className="p-2 w-24">금액</th>
              <th className="p-2">비고</th>
              <th className="w-10 p-2" />
            </tr>
          </thead>
          <tbody>
            {(() => {
              const orderMap = new Map(processOrder.map((name, idx) => [name, idx]));
              const sortedIndices = items
                .map((_, i) => i)
                .sort((a, b) => {
                  const pa = items[a].processGroup ?? "";
                  const pb = items[b].processGroup ?? "";
                  const ia = orderMap.get(pa) ?? processOrder.length;
                  const ib = orderMap.get(pb) ?? processOrder.length;
                  if (ia !== ib) return ia - ib;
                  return a - b;
                });
              const groups: { name: string; indices: number[] }[] = [];
              let currentName = "";
              let currentIndices: number[] = [];
              sortedIndices.forEach((idx) => {
                const name = items[idx].processGroup ?? "";
                if (name !== currentName) {
                  if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });
                  currentName = name;
                  currentIndices = [idx];
                } else {
                  currentIndices.push(idx);
                }
              });
              if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });

              const rows: React.ReactNode[] = [];
              groups.forEach((grp) => {
                const visibleIndices = grp.indices.filter((i) => (Number(items[i].qty) || 0) > 0);
                if (visibleIndices.length === 0) return;
                const isNewSection = /^\u200B/.test(grp.name);
                rows.push(
                  <tr key={`h-${grp.indices[0]}`} className="border-b border-gray-200 bg-gray-100">
                    <td colSpan={12} className="p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          className="max-w-xs flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 font-semibold text-gray-800"
                          value={isNewSection ? "" : grp.name}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateProcessGroupForIndices(grp.indices, v);
                            setProcessOrder((prev) => prev.map((p) => (p === grp.name ? v : p)));
                          }}
                          placeholder="가설철거, 목공사 등 (숫자 가능)"
                        />
                        <button
                          type="button"
                          onClick={() => addRowToProcess(grp.name, grp.indices)}
                          className="rounded border border-blue-500 bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                        >
                          + 항목 추가
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                visibleIndices.forEach((origIdx, subNo) => {
                  const item = items[origIdx];
                  const noLabel = `${subNo + 1}.`;
                  rows.push(
                    <tr key={origIdx} className="border-b border-gray-100">
                      <td className="p-2 font-mono text-gray-600">{noLabel}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={composition?.key === `item-${origIdx}-category` ? composition.value : (item.category ?? "")}
                          onCompositionStart={() => setComposition({ key: `item-${origIdx}-category`, value: item.category ?? "" })}
                          onCompositionEnd={(e) => {
                            updateItem(origIdx, "category", e.currentTarget.value);
                            setComposition(null);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (composition?.key === `item-${origIdx}-category`) {
                              if (/^[\x00-\x7F]*$/.test(v)) {
                                updateItem(origIdx, "category", v);
                                setComposition(null);
                              } else setComposition((c) => (c ? { ...c, value: v } : null));
                            } else updateItem(origIdx, "category", v);
                          }}
                          placeholder="도배, 바닥 등"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={composition?.key === `item-${origIdx}-spec` ? composition.value : (item.spec ?? "")}
                          onCompositionStart={() => setComposition({ key: `item-${origIdx}-spec`, value: item.spec ?? "" })}
                          onCompositionEnd={(e) => {
                            updateItem(origIdx, "spec", e.currentTarget.value);
                            setComposition(null);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (composition?.key === `item-${origIdx}-spec`) {
                              if (/^[\x00-\x7F]*$/.test(v)) {
                                updateItem(origIdx, "spec", v);
                                setComposition(null);
                              } else setComposition((c) => (c ? { ...c, value: v } : null));
                            } else updateItem(origIdx, "spec", v);
                          }}
                          placeholder="규격"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={composition?.key === `item-${origIdx}-unit` ? composition.value : (item.unit ?? "")}
                          onCompositionStart={() => setComposition({ key: `item-${origIdx}-unit`, value: item.unit ?? "" })}
                          onCompositionEnd={(e) => {
                            updateItem(origIdx, "unit", e.currentTarget.value);
                            setComposition(null);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (composition?.key === `item-${origIdx}-unit`) {
                              if (/^[\x00-\x7F]*$/.test(v)) {
                                updateItem(origIdx, "unit", v);
                                setComposition(null);
                              } else setComposition((c) => (c ? { ...c, value: v } : null));
                            } else updateItem(origIdx, "unit", v);
                          }}
                          placeholder="식, m²"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          lang="en"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.qty === 0 || item.qty === undefined ? "" : String(item.qty)}
                          onCompositionEnd={(e) => {
                            const raw = e.currentTarget.value.replace(/\D/g, "");
                            updateItem(origIdx, "qty", raw === "" ? 0 : raw);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            updateItem(origIdx, "qty", raw === "" ? 0 : raw);
                          }}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          lang="en"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.materialUnitPrice === 0 || item.materialUnitPrice === undefined || item.materialUnitPrice === "" ? "" : String(item.materialUnitPrice)}
                          onCompositionEnd={(e) => {
                            const raw = e.currentTarget.value.replace(/\D/g, "");
                            updateItem(origIdx, "materialUnitPrice", raw === "" ? 0 : raw);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            updateItem(origIdx, "materialUnitPrice", raw === "" ? 0 : raw);
                          }}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2 text-right font-medium">{formatNumber(materialAmount(item))}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          lang="en"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={item.laborUnitPrice === 0 || item.laborUnitPrice === undefined || item.laborUnitPrice === "" ? "" : String(item.laborUnitPrice)}
                          onCompositionEnd={(e) => {
                            const raw = e.currentTarget.value.replace(/\D/g, "");
                            updateItem(origIdx, "laborUnitPrice", raw === "" ? 0 : raw);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, "");
                            updateItem(origIdx, "laborUnitPrice", raw === "" ? 0 : raw);
                          }}
                          placeholder="숫자만"
                        />
                      </td>
                      <td className="p-2 text-right font-medium">{formatNumber(laborAmount(item))}</td>
                      <td className="p-2 text-right font-medium">{formatNumber(amount(item))}</td>
                      <td className="p-2">
                        <input
                          type="text"
                          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                          value={composition?.key === `item-${origIdx}-note` ? composition.value : (item.note ?? "")}
                          onCompositionStart={() => setComposition({ key: `item-${origIdx}-note`, value: item.note ?? "" })}
                          onCompositionEnd={(e) => {
                            updateItem(origIdx, "note", e.currentTarget.value);
                            setComposition(null);
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (composition?.key === `item-${origIdx}-note`) {
                              if (/^[\x00-\x7F]*$/.test(v)) {
                                updateItem(origIdx, "note", v);
                                setComposition(null);
                              } else setComposition((c) => (c ? { ...c, value: v } : null));
                            } else updateItem(origIdx, "note", v);
                          }}
                          placeholder="비고"
                        />
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => removeRow(origIdx)} className="text-red-500 hover:underline" disabled={items.length <= 1}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  );
                });
              });
              return rows;
            })()}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end gap-4 border-t border-gray-200 pt-4">
        <div className="text-sm text-gray-600">
          소계: <strong>{formatNumber(subtotal)}</strong>원 · 부가세(10%): <strong>{formatNumber(vat)}</strong>원 · 합계: <strong>{formatNumber(total)}</strong>원
        </div>
      </div>
      <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFile} />
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setPreviewOpen(true)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          견적서 미리보기
        </button>
        <button type="button" onClick={() => { setPreviewOpen(true); setTimeout(() => window.print(), 400); }} className="rounded-lg border border-gray-400 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          견적서 출력 / PDF 저장
        </button>
        <button type="button" onClick={exportToExcel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          엑셀 저장
        </button>
        <button type="button" onClick={() => excelInputRef.current?.click()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          엑셀 불러오기
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          취소
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>

    {/* 견적서 미리보기 모달 (인쇄 시 이 영역만 출력) */}
    {previewOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">견적서 미리보기</h3>
            <div className="flex gap-2 no-print">
              <button type="button" onClick={() => window.print()} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                인쇄 (PDF로 저장 가능)
              </button>
              <button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                닫기
              </button>
            </div>
          </div>
          <div className="overflow-auto p-6" id="estimate-preview-print" ref={previewPrintRef}>
            <div className="mx-auto max-w-2xl text-sm">
              <h2 className="mb-4 text-lg font-bold text-gray-900">견적서</h2>
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1">
                <div>고객명: {customerName || "-"}</div>
                <div>연락처: {contact || "-"}</div>
                <div className="col-span-2">주소: {address || "-"}</div>
                <div>제목: {title || "-"}</div>
                <div>견적일자: {formatDateYMD(estimateDate)}</div>
              </div>
              {note && <p className="mb-3 text-gray-600">비고: {note}</p>}
              <table className="w-full border-collapse border border-gray-300 text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-left">No</th>
                    <th className="border border-gray-300 p-2 text-left">품목</th>
                    <th className="border border-gray-300 p-2 text-left">규격</th>
                    <th className="border border-gray-300 p-2 text-left">단위</th>
                    <th className="border border-gray-300 p-2 text-right">수량</th>
                    <th className="border border-gray-300 p-2 text-right">재료비 단가</th>
                    <th className="border border-gray-300 p-2 text-right">재료비 금액</th>
                    <th className="border border-gray-300 p-2 text-right">노무비 단가</th>
                    <th className="border border-gray-300 p-2 text-right">노무비 금액</th>
                    <th className="border border-gray-300 p-2 text-right">금액</th>
                    <th className="border border-gray-300 p-2 text-left">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const orderMap = new Map(processOrder.map((name, idx) => [name, idx]));
                    const sortedIndices = items
                      .map((_, i) => i)
                      .sort((a, b) => {
                        const pa = items[a].processGroup ?? "";
                        const pb = items[b].processGroup ?? "";
                        const ia = orderMap.get(pa) ?? processOrder.length;
                        const ib = orderMap.get(pb) ?? processOrder.length;
                        if (ia !== ib) return ia - ib;
                        return a - b;
                      });
                    const groups: { name: string; indices: number[] }[] = [];
                    let currentName = "";
                    let currentIndices: number[] = [];
                    sortedIndices.forEach((idx) => {
                      const name = items[idx].processGroup ?? "";
                      if (name !== currentName) {
                        if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });
                        currentName = name;
                        currentIndices = [idx];
                      } else {
                        currentIndices.push(idx);
                      }
                    });
                    if (currentIndices.length > 0) groups.push({ name: currentName, indices: currentIndices });
                    const rows: React.ReactNode[] = [];
                    groups.forEach((grp) => {
                      const visibleIndices = grp.indices.filter((i) => (Number(items[i].qty) || 0) > 0);
                      if (visibleIndices.length === 0) return;
                      const displayName = grp.name.startsWith("\u200B") ? "" : grp.name;
                      if (displayName) {
                        rows.push(
                          <tr key={`ph-${grp.indices[0]}`} className="bg-gray-100 font-semibold">
                            <td colSpan={11} className="border border-gray-300 p-2">{displayName}</td>
                          </tr>
                        );
                      }
                      visibleIndices.forEach((origIdx, subNo) => {
                        const item = items[origIdx];
                        rows.push(
                          <tr key={origIdx}>
                            <td className="border border-gray-300 p-2">{subNo + 1}.</td>
                            <td className="border border-gray-300 p-2">{item.category ?? ""}</td>
                            <td className="border border-gray-300 p-2">{item.spec ?? ""}</td>
                            <td className="border border-gray-300 p-2">{item.unit ?? ""}</td>
                            <td className="border border-gray-300 p-2 text-right">{item.qty ?? ""}</td>
                            <td className="border border-gray-300 p-2 text-right">{formatNumber(Number(item.materialUnitPrice ?? 0) || 0)}</td>
                            <td className="border border-gray-300 p-2 text-right">{formatNumber(materialAmount(item))}</td>
                            <td className="border border-gray-300 p-2 text-right">{formatNumber(Number(item.laborUnitPrice ?? 0) || 0)}</td>
                            <td className="border border-gray-300 p-2 text-right">{formatNumber(laborAmount(item))}</td>
                            <td className="border border-gray-300 p-2 text-right">{formatNumber(amount(item))}</td>
                            <td className="border border-gray-300 p-2">{item.note ?? ""}</td>
                          </tr>
                        );
                      });
                    });
                    return rows;
                  })()}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-amber-700">※스마트현장관리 앱설치필수</p>
              <div className="mt-4 border-t border-gray-200 pt-3 text-right">
                소계: <strong>{formatNumber(subtotal)}</strong>원 · 부가세(10%): <strong>{formatNumber(vat)}</strong>원 · 합계: <strong>{formatNumber(total)}</strong>원
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {processOrderModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">공정 순서 변경</h3>
            <button type="button" onClick={() => setProcessOrderModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">아래 목록에서 위/아래 버튼으로 표시 순서를 바꾼 뒤 적용을 눌러주세요.</p>
            <ul className="space-y-2">
              {processOrder.map((name, idx) => (
                <li key={name} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="text-sm font-medium text-gray-800 truncate flex-1">
                    {name.startsWith("\u200B") ? "(새 공정)" : name || "(이름 없음)"}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...processOrder];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setProcessOrder(next);
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === processOrder.length - 1}
                      onClick={() => {
                        const next = [...processOrder];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setProcessOrder(next);
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ↓
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setProcessOrderModalOpen(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                취소
              </button>
              <button type="button" onClick={() => setProcessOrderModalOpen(false)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                적용
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* 커스텀 견적 불러오기 모달 */}
    {customTemplateModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">커스텀 견적 불러오기</h3>
            <button type="button" onClick={() => setCustomTemplateModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">관리에서 저장한 견적 템플릿을 선택하면 현재 항목이 바뀝니다.</p>
            {customTemplateLoading ? (
              <p className="text-sm text-gray-500 py-4">불러오는 중...</p>
            ) : customTemplateList.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">저장된 템플릿이 없습니다. 관리 → 견적서 관리에서 커스텀 제목을 저장해 주세요.</p>
            ) : (
              <ul className="space-y-2">
                {customTemplateList.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => loadCustomTemplate(t)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-100"
                    >
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )}

    {/* 템플릿으로 저장 모달 */}
    {saveTemplateModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">템플릿으로 저장</h3>
            <button type="button" onClick={() => setSaveTemplateModalOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-600 mb-3">기존 템플릿을 덮어쓰거나, 새 제목으로 저장할 수 있습니다.</p>
            <div className="space-y-2 mb-4">
              {saveTemplateList.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setSaveTemplateTargetId(t.id); setSaveAsNewTitle(""); }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium ${saveTemplateTargetId === t.id ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"}`}
                >
                  {t.title} (덮어쓰기)
                </button>
              ))}
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">또는 새 템플릿 제목</label>
              <input
                type="text"
                value={saveAsNewTitle}
                onChange={(e) => { setSaveAsNewTitle(e.target.value); setSaveTemplateTargetId(null); }}
                placeholder="예: 아파트 표준견적"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSaveTemplateModalOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={saveTemplateLoading || (saveTemplateTargetId == null && !saveAsNewTitle.trim())}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saveTemplateLoading ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

type Consultation = {
  id: number;
  customerName?: string;
  contact?: string;
  address?: string;
  estimateMeetingAt?: string;
};

export default function EstimatePage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [formOpen, setFormOpen] = useState<"new" | number | null>(null);
  const [consultationPreFill, setConsultationPreFill] = useState<{ customerName: string; contact: string; address: string; consultationId: number } | null>(null);
  const [consultationModalOpen, setConsultationModalOpen] = useState(false);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingConsultations, setLoadingConsultations] = useState(false);

  const load = () => {
    fetch("/api/estimates")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setEstimates(data);
      })
      .catch(() => setEstimates([]));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const cId = q.get("consultationId");
    if (cId) {
      fetch("/api/consultations")
        .then((res) => res.json())
        .then((list) => {
          const c = Array.isArray(list) ? list.find((x: { id: number }) => String(x.id) === cId) : null;
          if (c) {
            setConsultationPreFill({ 
              customerName: c.customerName ?? "", 
              contact: c.contact ?? "", 
              address: c.address ?? "",
              consultationId: c.id
            });
            setFormOpen("new");
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleNewEstimateClick = () => {
    setLoadingConsultations(true);
    setConsultationModalOpen(true);
    fetch("/api/consultations")
      .then((res) => res.json())
      .then((list) => {
        if (Array.isArray(list)) {
          // 견적미팅이 체크된 항목만 필터링
          const filtered = list.filter((c: Consultation) => c.estimateMeetingAt);
          setConsultations(filtered);
        }
      })
      .catch(() => setConsultations([]))
      .finally(() => setLoadingConsultations(false));
  };

  const handleSelectConsultation = (c: Consultation) => {
    setConsultationPreFill({
      customerName: c.customerName ?? "",
      contact: c.contact ?? "",
      address: c.address ?? "",
      consultationId: c.id,
    });
    setConsultationModalOpen(false);
    setFormOpen("new");
  };

  const editingEstimate = formOpen !== null && formOpen !== "new" ? estimates.find((e) => e.id === formOpen) ?? null : null;
  const showForm = formOpen !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">견적서 작성</h1>
        <button
          type="button"
          onClick={handleNewEstimateClick}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          신규 견적
        </button>
      </div>

      {/* 상담 선택 모달 */}
      {consultationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">상담 선택 (견적미팅 예정)</h3>
              <button 
                type="button" 
                onClick={() => setConsultationModalOpen(false)} 
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {loadingConsultations ? (
                <p className="text-center text-sm text-gray-500 py-8">불러오는 중...</p>
              ) : consultations.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 mb-2">견적미팅이 예정된 상담이 없습니다.</p>
                  <p className="text-xs text-gray-400">상담 및 미팅관리에서 견적미팅 일시를 먼저 입력해 주세요.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="p-2">고객명</th>
                        <th className="p-2">연락처</th>
                        <th className="p-2">주소</th>
                        <th className="p-2">견적미팅</th>
                        <th className="w-20 p-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {consultations.map((c) => (
                        <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="p-2 font-medium">{c.customerName || "-"}</td>
                          <td className="p-2">{c.contact || "-"}</td>
                          <td className="p-2 text-gray-600 truncate max-w-[200px]" title={c.address}>{c.address || "-"}</td>
                          <td className="p-2 text-gray-600">{c.estimateMeetingAt || "-"}</td>
                          <td className="p-2">
                            <button 
                              type="button" 
                              onClick={() => handleSelectConsultation(c)} 
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              선택
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm ? (
        <EstimateForm
          estimate={editingEstimate ?? null}
          consultationPreFill={formOpen === "new" ? consultationPreFill : null}
          onSave={() => {
            setFormOpen(null);
            load();
          }}
          onCancel={() => setFormOpen(null)}
        />
      ) : (
        <>
          <p className="text-sm text-gray-500">저장된 견적 목록입니다. 수정·삭제하거나 신규 견적을 작성할 수 있습니다.</p>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-700">
                <tr>
                  <th className="p-3">견적일자</th>
                  <th className="p-3">고객명</th>
                  <th className="p-3">연락처</th>
                  <th className="p-3">제목</th>
                  <th className="p-3 text-right">합계</th>
                  <th className="w-24 p-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {estimates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      저장된 견적이 없습니다. &quot;신규 견적&quot;으로 작성해 보세요.
                    </td>
                  </tr>
                ) : (
                  estimates.map((est) => {
                    const subtotal = (est.items || []).reduce(
                      (s, i) =>
                        s +
                        (Number(i.qty) || 0) * (Number(i.materialUnitPrice ?? i.unitPrice ?? 0) || 0) +
                        (Number(i.qty) || 0) * (Number(i.laborUnitPrice ?? 0) || 0),
                      0
                    );
                    const total = subtotal + Math.floor(subtotal * 0.1);
                    return (
                      <tr key={est.id} className="text-gray-700 hover:bg-gray-50">
                        <td className="p-3">{formatDateYMD(est.estimateDate)}</td>
                        <td className="p-3 font-medium">{est.customerName || "-"}</td>
                        <td className="p-3">{est.contact || "-"}</td>
                        <td className="p-3">{est.title || "-"}</td>
                        <td className="p-3 text-right">{formatNumber(total)}원</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setFormOpen(est.id)}
                              className="text-blue-600 hover:underline"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!confirm("이 견적을 삭제할까요?")) return;
                                fetch(`/api/estimates/${est.id}`, { method: "DELETE" })
                                  .then((res) => res.ok && load())
                                  .catch(() => alert("삭제 실패"));
                              }}
                              className="text-red-500 hover:underline"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
