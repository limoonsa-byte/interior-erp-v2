/** 중요(고정) 항목을 목록 상단에 두기 위한 비교 */
export function compareImportantFirst(
  aImportant: boolean | undefined | null,
  bImportant: boolean | undefined | null
): number {
  const a = aImportant ? 1 : 0;
  const b = bImportant ? 1 : 0;
  return b - a;
}

export function sortImportantFirst<T>(
  items: T[],
  getImportant: (item: T) => boolean | undefined | null
): T[] {
  return [...items].sort((a, b) => compareImportantFirst(getImportant(a), getImportant(b)));
}
