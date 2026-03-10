/**
 * PDF에서 추출한 텍스트를 계약서 제목·본문으로 정리.
 * - 제목: "계약서" 포함한 첫 줄 또는 기본값
 * - 본문: 전체 텍스트 정규화(연속 공백/줄바꿈 정리)
 */
export function pdfTextToContractTitle(rawText: string): string {
  const lines = rawText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines.slice(0, 20)) {
    if (/계약서/.test(line) && line.length < 120) return line;
  }
  return "실내건축공사 표준도급 계약서";
}

export function pdfTextToContractBody(rawText: string): string {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 0)
    .join("\n");
}
