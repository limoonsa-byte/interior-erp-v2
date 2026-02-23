/**
 * 발주 기본 품목 엑셀 템플릿을 public/ 에 생성합니다.
 * 한 번 실행 후 생성된 파일을 커밋하면 API에서 정적으로 서빙합니다.
 * 실행: node scripts/generate-order-template.js
 */
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");

const ORDER_LABELS = [
  "목재발주",
  "중문발주",
  "조명",
  "전기부자재 발주",
  "타일(화장실용품)발주",
  "목공방재발주",
  "도배발주",
  "바닥재발주",
  "필름발주",
  "싱크가구발주",
  "기타",
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("발주 기본 품목", { views: [{ rightToLeft: false }] });
  const headers = ["발주 유형", "품목", "규격", "단위", "수량", "자재 단가", "비고"];
  ws.addRow(headers);
  ORDER_LABELS.forEach((label) => {
    ws.addRow([label, "", "", "", "", "", ""]);
  });
  const buf = await wb.xlsx.writeBuffer();
  const outPath = path.join(process.cwd(), "public", "발주_기본품목_템플릿.xlsx");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buf));
  console.log("생성됨:", outPath);
  const base64 = Buffer.from(buf).toString("base64");
  const libPath = path.join(process.cwd(), "lib", "order-template-base64.ts");
  fs.mkdirSync(path.dirname(libPath), { recursive: true });
  fs.writeFileSync(
    libPath,
    `/** 자동 생성 - node scripts/generate-order-template.js */\nexport const ORDER_TEMPLATE_BASE64 = ${JSON.stringify(base64)};\n`
  );
  console.log("생성됨:", libPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
