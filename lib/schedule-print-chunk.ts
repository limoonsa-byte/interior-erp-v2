/**
 * 요일 7열 × N주 = 한 페이지 캘린더 칸 수.
 * 6주 한 달이 한 페이지에 들어가도록 6으로 둔다.
 */
export const SCHEDULE_PRINT_WEEK_COLS = 7;
export const SCHEDULE_PRINT_WEEKS_PER_PAGE = 6;
export const SCHEDULE_PRINT_CELLS_PER_PAGE =
  SCHEDULE_PRINT_WEEK_COLS * SCHEDULE_PRINT_WEEKS_PER_PAGE;

/** @deprecated SCHEDULE_PRINT_CELLS_PER_PAGE 사용 */
export const SCHEDULE_PRINT_DAYS_PER_PAGE = SCHEDULE_PRINT_CELLS_PER_PAGE;

export function chunkDaysForPrint<T>(days: T[], pageSize = SCHEDULE_PRINT_CELLS_PER_PAGE): T[][] {
  if (days.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < days.length; i += pageSize) {
    chunks.push(days.slice(i, i + pageSize));
  }
  return chunks;
}

/** 마지막 줄을 7열 맞춤 (빈 칸은 null) */
export function padChunkToWeekRows<T>(chunk: T[]): (T | null)[] {
  const out: (T | null)[] = [...chunk];
  while (out.length % 7 !== 0) out.push(null);
  return out;
}
