/**
 * 견적서 기본서식 엑셀을 public/ 에 생성합니다.
 * 견적서 관리에서 "기본서식 다운로드" 시 이 파일을 사용합니다.
 * 실행: node scripts/generate-estimate-template.js
 */
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const FILENAME = "견적서_기본서식.xlsx";

// 견적서 작성 엑셀 저장/불러오기와 동일한 구조 (no, 품목, 규격, 단위, 재료비단가, 노무비단가, 비고, 행구분)
const data = [
  ["고객명", "", "", "", "", "", "", ""],
  ["연락처", "", "", "", "", "", "", ""],
  ["주소", "", "", "", "", "", "", ""],
  ["제목", "", "", "", "", "", "", ""],
  ["견적일자", "", "", "", "", "", "", ""],
  ["특이사항", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["no", "품목", "규격", "단위", "재료비단가", "노무비단가", "비고", "행구분"],
  ["시공", "#", "", "", "", "", "", "공정"],
  [1, "", "", "식", 0, 0, "", ""],
  [2, "", "", "식", 0, 0, "", ""],
  [3, "", "", "식", 0, 0, "", ""],
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("견적서", { views: [{ rightToLeft: false }] });
  data.forEach((row) => {
    const padded = row.length >= 8 ? row : [...row, ...Array(8 - row.length).fill("")];
    ws.addRow(padded);
  });

  const thinBorder = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
  const grayFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9D9D9" },
    bgColor: { argb: "FFD9D9D9" },
  };
  const lightSkyBlueFill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD6EAF8" },
    bgColor: { argb: "FFD6EAF8" },
  };
  const ROW_TYPE_COL = 8;
  ws.eachRow((row, rowNumber) => {
    const rowIndex = rowNumber - 1;
    const isHeaderRow = rowNumber === 8;
    const isProcessNameRow =
      rowNumber === 9; // "시공" 행
    const hasBorder = rowNumber >= 8 && !isProcessNameRow;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= ROW_TYPE_COL) {
        if (hasBorder) cell.border = thinBorder;
        if (isHeaderRow) cell.fill = grayFill;
        else if (isProcessNameRow) cell.fill = lightSkyBlueFill;
        if (isProcessNameRow && colNumber === 1) cell.font = { bold: true };
      }
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  const outPath = path.join(process.cwd(), "public", FILENAME);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buf));
  console.log("생성됨:", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
