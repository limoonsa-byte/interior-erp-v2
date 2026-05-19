/** 일정 작성 — 캘린더에 끌어다 놓는 공정 버튼 기본 목록 */
export const DEFAULT_SCHEDULE_PHASE_BUTTONS = [
  "기본",
  "철거",
  "설비",
  "전기",
  "목공",
  "금속",
  "도장",
  "타일",
  "간판",
  "마감",
  "오픈",
] as const;

export function normalizeSchedulePhaseLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
