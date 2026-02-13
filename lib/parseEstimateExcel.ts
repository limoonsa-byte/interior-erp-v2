/**
 * 견적서 엑셀 시트를 파싱해 항목(items)과 공정순서(processOrder)를 반환.
 * 견적서 작성 엑셀 불러오기 / 마스터 기본 템플릿 엑셀 업로드에서 공통 사용.
 */
export type ParsedEstimateItem = {
  processGroup?: string;
  category: string;
  spec: string;
  unit: string;
  qty: number;
  materialUnitPrice?: number;
  laborUnitPrice?: number;
  note: string;
};

export type ParsedEstimateExcel = {
  items: ParsedEstimateItem[];
  processOrder: string[];
};

function get(rows: (string | number)[][], r: number, col: number): string {
  return String(rows[r]?.[col] ?? "").trim();
}

function parseNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseEstimateExcelRows(rawRows: (string | number)[][]): ParsedEstimateExcel | null {
  if (rawRows.length < 2) return null;
  const rows = rawRows.map((row) => {
    const arr = Array.isArray(row) ? [...row] : [];
    while (arr.length < 9) arr.push("");
    return arr;
  });

  let headerRow = 7;
  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const c0 = get(rows, r, 0).toLowerCase();
    if (c0 === "no" || (get(rows, r, 1) === "품목" && get(rows, r, 2) === "규격")) {
      headerRow = r;
      break;
    }
  }
  const dataStart = headerRow + 1;
  if (dataStart >= rows.length) return null;

  const hasQtyCol = get(rows, headerRow, 4) === "수량";
  const colMat = hasQtyCol ? 5 : 4;
  const colLabor = hasQtyCol ? 6 : 5;
  const colNote = hasQtyCol ? 7 : 6;
  const colRowType = hasQtyCol ? 8 : 7;

  const processOrderSeen: string[] = [];
  const newItems: ParsedEstimateItem[] = [];
  let currentProcess = "";
  const headerRowMatch = (r: number) =>
    get(rows, r, 0).toLowerCase() === "no" || (get(rows, r, 1) === "품목" && get(rows, r, 2) === "규격");

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 8) continue;
    if (headerRowMatch(r)) continue;
    const a = get(rows, r, 0);
    const b = get(rows, r, 1);
    const c = get(rows, r, 2);
    const d = get(rows, r, 3);
    const h = get(rows, r, colNote);
    const rowType = get(rows, r, colRowType);
    const mat = parseNum(rows[r]?.[colMat]);
    const labor = parseNum(rows[r]?.[colLabor]);
    const noItemCols = !b && !c && !d;
    const aIsNumber = /^\d+$/.test(a);
    const isProcessNameRow = rowType === "공정" || (b === "#" && !aIsNumber) || (!!a && noItemCols && !aIsNumber);
    if (isProcessNameRow) {
      currentProcess = b === "#" ? (a || currentProcess) : a;
      if (currentProcess && !processOrderSeen.includes(currentProcess)) processOrderSeen.push(currentProcess);
      continue;
    }
    if (b === "#" && aIsNumber) continue;
    if (!currentProcess && !a && !b && !c) continue;
    const processGroup = currentProcess || (newItems.length ? (newItems[newItems.length - 1].processGroup ?? "") : "");
    if (!processOrderSeen.includes(processGroup)) processOrderSeen.push(processGroup);
    newItems.push({
      processGroup,
      category: b,
      spec: c,
      unit: d || "식",
      qty: 0,
      materialUnitPrice: mat,
      laborUnitPrice: labor,
      note: h,
    });
  }

  if (newItems.length === 0) return null;
  const processOrder =
    processOrderSeen.length > 0
      ? processOrderSeen
      : [...new Set(newItems.map((i) => i.processGroup ?? "").filter((x) => x !== ""))];
  return { items: newItems, processOrder };
}
