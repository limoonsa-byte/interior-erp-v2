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

/**
 * 같은 상담(그룹)의 프로젝트 제목.
 * 상담 제목을 최우선으로 쓰고, 없으면 메인 견적 표시제목을 그룹 전체에 동일 적용한다.
 */
export function resolveGroupProjectTitle(opts: {
  consultationTitle?: string | null;
  items: Array<{
    title?: string | null;
    displayTitle?: string | null;
    consultationTitle?: string | null;
  }>;
  isAdditionalTitle?: (title?: string | null) => boolean;
  fallback?: string;
}): string {
  const fromConsult = firstNonEmpty(
    opts.consultationTitle,
    ...opts.items.map((i) => i.consultationTitle)
  );
  if (fromConsult) return fromConsult;

  const isAdditional =
    opts.isAdditionalTitle ??
    ((title?: string | null) => {
      const t = String(title ?? "").trim();
      return t.includes("추가견적") || t.includes("추가 견적");
    });

  const main = opts.items.find((i) => !isAdditional(i.title)) ?? opts.items[0] ?? null;
  return (
    firstNonEmpty(main?.displayTitle, main?.title, opts.items[0]?.displayTitle, opts.items[0]?.title) ||
    (opts.fallback ?? "제목 없음")
  );
}

/** 저장된 제목에 추가 견적 표시가 남아 있는지 */
export function isAdditionalEstimateTitle(title?: string | null): boolean {
  const t = String(title ?? "").trim();
  if (!t) return false;
  return (
    t.includes("추가견적") ||
    t.includes("추가 견적") ||
    t.startsWith("(추가)") ||
    t.startsWith("（추가）")
  );
}

type EstimateGroupItem = {
  id: number;
  title?: string | null;
};

/**
 * 같은 현장의 견적 중 메인을 맨 위에 둔다.
 * 추가 표시가 없는 견적 가운데 가장 먼저 저장한 것(가장 작은 id)이 메인이다.
 * 견적일자로 순서를 바꾸지 않는다. 날짜가 늦다고 추가 견적이 메인 위로 올라가면
 * 원래 견적이 ㄴ 아래에 들어가 헷갈린다.
 * + 추가 견적서로 나중에 만든 견적은 항상 메인 아래다.
 */
export function orderEstimateGroup<T extends EstimateGroupItem>(items: T[]): T[] {
  if (items.length <= 1) return items.slice();
  const unmarked = items.filter((item) => !isAdditionalEstimateTitle(item.title));
  const pool = unmarked.length > 0 ? unmarked : items;
  const main = pool.reduce((acc, cur) => (cur.id < acc.id ? cur : acc));
  const children = items
    .filter((item) => item.id !== main.id)
    .slice()
    .sort((a, b) => a.id - b.id);
  return [main, ...children];
}

/** 목록 제목. 추가 견적은 앞에 (추가)를 붙여 메인과 구분한다. */
export function estimateListTitle(projectTitle: string, isChild: boolean): string {
  const name = projectTitle.trim() || "-";
  return isChild ? `ㄴ ${withAdditionalPrefix(name, true)}` : name;
}

export type EstimateIdentity = {
  id: number;
  consultationId?: number | null;
  customerName?: string | null;
  address?: string | null;
  title?: string | null;
};

/** 같은 현장끼리 묶는 키. 상담이 있으면 상담 기준, 없으면 고객+주소. */
export function estimateGroupKey(item: EstimateIdentity): string {
  if (item.consultationId != null && String(item.consultationId).trim() !== "") {
    return `consult-${item.consultationId}`;
  }
  return `site-${String(item.customerName ?? "").trim()}|${String(item.address ?? "").trim()}`;
}

/** 그룹에서 메인이 아닌 견적 id. 작업일지·자재·결제 등 다른 화면에서도 같은 기준으로 구분한다. */
export function additionalEstimateIdSet(items: EstimateIdentity[]): Set<number> {
  const groups = new Map<string, EstimateIdentity[]>();
  for (const item of items) {
    const key = estimateGroupKey(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  const ids = new Set<number>();
  for (const group of groups.values()) {
    const ordered = orderEstimateGroup(group);
    for (const child of ordered.slice(1)) ids.add(child.id);
  }
  return ids;
}

/** 추가 견적 제목 앞에 (추가)를 붙인다. 이미 있으면 한 번만 둔다. */
export function withAdditionalPrefix(title: string, isAdditional: boolean): string {
  const name = title.trim();
  if (!isAdditional) return name;
  if (!name) return "(추가)";
  if (name.startsWith("(추가)") || name.startsWith("（추가）") || name.startsWith("ㄴ (추가)")) return name;
  return `(추가) ${name}`;
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
