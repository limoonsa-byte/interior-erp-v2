import { getScheduleCalendarDayDisplay } from "@/lib/scheduleCalendarDayDisplay";

type Props = {
  date: string;
  dayNum: number;
  isCurrentMonth: boolean;
  className?: string;
  size?: "sm" | "md";
};

/** 어린이날처럼: 날짜 빨간색 + 옆에 공휴일명(지방선거 등) */
export function ScheduleCalendarDayLabel({
  date,
  dayNum,
  isCurrentMonth,
  className = "",
  size = "md",
}: Props) {
  const { holiday, dayColorClass, showHolidayLabel } = getScheduleCalendarDayDisplay(date, isCurrentMonth);
  const numSize = size === "sm" ? "text-[11px]" : "text-xs sm:text-sm";
  const labelSize = size === "sm" ? "text-[10px]" : "text-[9px] sm:text-[10px]";

  return (
    <div className={`text-right ${numSize} ${dayColorClass} ${className}`.trim()}>
      {dayNum}
      {showHolidayLabel && holiday ? (
        <span className={`ml-1 font-normal text-red-400 ${labelSize}`}>{holiday}</span>
      ) : null}
    </div>
  );
}
