/** 상담·견적 화면에서 쓰는 프로젝트 제목 표시 헬퍼 */

/** 비어 있지 않은 첫 문자열 */
export function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * 프로젝트 제목 (상담 프로젝트 제목 → 견적 제목 → 고객명 → fallback)
 * 상담에서 입력한 제목이 견적~정산까지 동일하게 보이도록 상담 제목을 우선한다.
 */
export function displayProjectTitle(opts: {
  estimateTitle?: string | null;
  consultationTitle?: string | null;
  customerName?: string | null;
  fallback?: string;
}): string {
  return (
    firstNonEmpty(opts.consultationTitle, opts.estimateTitle, opts.customerName) ||
    (opts.fallback ?? "제목 없음")
  );
}

/** 선택 목록용: "프로젝트 제목 · 고객명" (제목 없으면 고객명만) */
export function displayTitleWithCustomer(
  title: string | null | undefined,
  customerName: string | null | undefined
): string {
  const t = String(title ?? "").trim();
  const c = String(customerName ?? "").trim();
  if (t && c && t !== c) return `${t} · ${c}`;
  return t || c || "-";
}
