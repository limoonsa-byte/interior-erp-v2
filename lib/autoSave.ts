/** 작성 화면 자동 저장 간격 (5분) */
export const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000;

/** 자동 저장 타이머 확인 주기 */
export const AUTO_SAVE_CHECK_MS = 15 * 1000;

export function formatAutoSavedAt(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
