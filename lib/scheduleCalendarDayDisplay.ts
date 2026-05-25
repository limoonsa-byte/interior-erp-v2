import { getHolidayName } from "@/lib/koreanHolidays";

/** 화면·인쇄 공통 칸/헤더 배경 (Tailwind opacity 대신 고정색 — 인쇄 시 배경 유지) */
export const SCHEDULE_CAL_CELL_BG = {
  muted: "schedule-cal-cell-muted",
  sun: "schedule-cal-cell-sun",
  sat: "schedule-cal-cell-sat",
} as const;

export const SCHEDULE_CAL_HEADER_BG = {
  sun: "schedule-cal-header-sun",
  sat: "schedule-cal-header-sat",
  weekday: "schedule-cal-header-weekday",
} as const;

export function scheduleCalendarWeekHeaderClass(index: number): string {
  const base = "border-r border-gray-300 last:border-r-0";
  if (index === 0) return `${base} ${SCHEDULE_CAL_HEADER_BG.sun} text-red-500`;
  if (index === 6) return `${base} ${SCHEDULE_CAL_HEADER_BG.sat} text-blue-500`;
  return `${base} ${SCHEDULE_CAL_HEADER_BG.weekday} text-gray-600`;
}

/** 일정 캘린더(전체일정·공사 일정) 날짜 칸 — 공휴일 빨간 숫자 + 옆 라벨 */
export function getScheduleCalendarDayDisplay(date: string, isCurrentMonth: boolean) {
  const holiday = getHolidayName(date);
  const dow = new Date(date + "T12:00:00").getDay();
  const isHoliday = !!holiday;
  const isSunday = dow === 0;
  const isSaturday = dow === 6;
  const isOff = isSunday || isSaturday || isHoliday;

  let dayColorClass = "text-gray-900";
  if (!isCurrentMonth) dayColorClass = "text-gray-400";
  else if (isSunday || isHoliday) dayColorClass = "text-red-500 font-semibold";
  else if (isSaturday) dayColorClass = "text-blue-500 font-semibold";

  let cellBgClass = "";
  if (!isCurrentMonth) cellBgClass = SCHEDULE_CAL_CELL_BG.muted;
  else if (isSunday || (isHoliday && !isSaturday)) cellBgClass = SCHEDULE_CAL_CELL_BG.sun;
  else if (isSaturday) cellBgClass = SCHEDULE_CAL_CELL_BG.sat;

  return {
    holiday,
    isHoliday,
    isOff,
    isSunday,
    isSaturday,
    dayColorClass,
    cellBgClass,
    showHolidayLabel: isHoliday && isCurrentMonth,
  };
}

/** 일·토·공휴일만 칸색. 평일(공사 기간 포함)은 흰색 — 파란색은 토요일만 */
export function resolveScheduleCalendarCellBg(
  date: string,
  isCurrentMonth: boolean,
  options?: { muted?: boolean }
): string {
  const d = getScheduleCalendarDayDisplay(date, isCurrentMonth);
  if (options?.muted) return SCHEDULE_CAL_CELL_BG.muted;
  if (!isCurrentMonth) return SCHEDULE_CAL_CELL_BG.muted;
  if (d.isSunday || (d.isHoliday && !d.isSaturday)) return SCHEDULE_CAL_CELL_BG.sun;
  if (d.isSaturday) return SCHEDULE_CAL_CELL_BG.sat;
  return "";
}
