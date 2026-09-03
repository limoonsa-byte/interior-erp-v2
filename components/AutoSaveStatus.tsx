"use client";

/** 자동 저장 상태 문구 (저장 버튼 옆 등) */
export function AutoSaveStatus({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <span className="text-xs text-gray-500 whitespace-nowrap" aria-live="polite">
      {label}
    </span>
  );
}
