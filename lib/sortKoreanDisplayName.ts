/**
 * 목록 이름 정렬: 숫자로 시작하는 항목 → 한글/기타 가나다순.
 * (예: "1팀", "2호", "김철수", "박영희")
 */
export function compareKoreanDisplayName(a: string, b: string): number {
  const ta = a.trim();
  const tb = b.trim();
  const aStartsWithDigit = /^\d/.test(ta);
  const bStartsWithDigit = /^\d/.test(tb);
  if (aStartsWithDigit !== bStartsWithDigit) {
    return aStartsWithDigit ? -1 : 1;
  }
  return ta.localeCompare(tb, "ko", { numeric: true, sensitivity: "base" });
}

export function sortByKoreanDisplayName<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((x, y) => compareKoreanDisplayName(getLabel(x), getLabel(y)));
}
