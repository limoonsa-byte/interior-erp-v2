"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseEstimateExcelRows } from "@/lib/parseEstimateExcel";

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
              value={title}
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
