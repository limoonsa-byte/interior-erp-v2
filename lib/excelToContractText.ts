/**
 * 엑셀 시트를 계약서 본문용 텍스트로 변환.
 * 각 행의 셀을 공백으로 이어 한 줄로 만들고, 행은 줄바꿈으로 구분.
 */
export function excelSheetToContractBody(rows: (string | number)[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = (Array.isArray(row) ? row : [row]).map((c) =>
      String(c ?? "")
        .trim()
        .replace(/\r?\n/g, " ")
    );
    const line = cells.filter((c) => c.length > 0).join("  ");
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}

/** 엑셀 시트에서 계약서 제목으로 쓸 문자열 추출 (첫 몇 행에서 "계약서" 포함 또는 "표준 도급" 등) */
export function excelSheetToContractTitle(rows: (string | number)[][]): string {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i];
    const cells = (Array.isArray(row) ? row : [row]).map((c) => String(c ?? "").trim());
    const joined = cells.join(" ");
    if (/표준\s*도급\s*계약서/.test(joined) || (joined.includes("계약서") && joined.length < 80)) {
      const found = cells.find((c) => c.includes("계약서") && c.length < 80);
      if (found) return found;
      if (joined.length < 80) return joined;
    }
  }
  return "실내건축공사 표준도급 계약서";
}
