/** 상담 진행상태: 공사 착수 이후 단계 */

export const CONSTRUCTION_IN_PROGRESS_STATUS = "공사진행";

export const COMPLETED_CONSULTATION_STATUSES = new Set(["완료및정산", "완료"]);

/** 공사진행 중 */
export function isConstructionInProgressStatus(status: string | undefined | null): boolean {
  return String(status ?? "").trim() === CONSTRUCTION_IN_PROGRESS_STATUS;
}

/** 공사진행 또는 완료(정산) — 메뉴 노출 판단용 */
export function isConstructionPhaseStatus(status: string | undefined | null): boolean {
  const s = String(status ?? "").trim();
  return s === CONSTRUCTION_IN_PROGRESS_STATUS || COMPLETED_CONSULTATION_STATUSES.has(s);
}

/** 회사에 공사진행(또는 완료) 상담이 하나라도 있는지 */
export function companyHasConstructionPhase(
  consultations: Array<{ status?: string | null }>
): boolean {
  return consultations.some((c) => isConstructionPhaseStatus(c.status));
}

/**
 * 일정·정산 등 공사 메뉴 목록 노출 여부.
 * 기본: 공사진행만. 완료 건 보기 ON: 완료및정산/완료 포함.
 * 견적서작성 등 사전 단계는 숨김.
 */
export function isVisibleInConstructionMenus(
  status: string | undefined | null,
  showCompleted: boolean
): boolean {
  if (isConstructionInProgressStatus(status)) return true;
  if (showCompleted && COMPLETED_CONSULTATION_STATUSES.has(String(status ?? "").trim())) {
    return true;
  }
  return false;
}

/**
 * 공사진행 전이면 숨길 메뉴 경로 (PC·모바일 공통).
 * 상담/견적/계약·통계·채팅·계산기·관리 등은 항상 표시.
 */
export const CONSTRUCTION_GATED_MENU_PATHS = [
  "/schedule",
  "/work-log",
  "/workers",
  "/material-order",
  "/material-list",
  "/labor-pay",
  "/payment",
  "/settlement",
  "/projects",
] as const;

export function isConstructionGatedHref(href: string): boolean {
  const path = String(href || "").split("?")[0].replace(/\/$/, "") || "/";
  const normalized = path.startsWith("/mobile") ? path.slice("/mobile".length) || "/" : path;
  return CONSTRUCTION_GATED_MENU_PATHS.some(
    (p) => normalized === p || normalized.startsWith(`${p}/`)
  );
}
