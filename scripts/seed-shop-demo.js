/**
 * 비밀 자재몰 미리보기용 가상 상품을 넣습니다.
 * 같은 (회사, SKU)가 있으면 **이미지 URL만** 갱신합니다 (`DEMO-%` 미리보기용).
 * **companies 테이블의 모든 회사**에 넣어, 로그인/토큰 회사가 1번이 아니어도 목록에 보이게 합니다.
 *
 * 실행: npm run seed:shop-demo
 * (POSTGRES_URL / DATABASE_URL 필요 — migrate와 동일)
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filename) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return false;
  try {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^#=]+)=(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    });
    return true;
  } catch (_) {
    return false;
  }
}

if (loadEnvFile(".env.local")) console.log("[seed-shop-demo] .env.local 로드함");
else if (loadEnvFile(".env")) console.log("[seed-shop-demo] .env 로드함");

if (!process.env.POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL;
}

const { sql } = require("@vercel/postgres");

/** Unsplash 고정 URL(480 정사각). 품목 분위기에 맞게 SKU별 매핑 */
function demoImg(id) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=480&h=480&q=80`;
}

const DEMO_IMAGE_BY_SKU = {
  "DEMO-목재-합판": demoImg("1506439773649-6e0eb8cfb237"),
  "DEMO-목재-각재": demoImg("1441974231531-c6227db76b6e"),
  "DEMO-목재-MDF": demoImg("1503387762-592deb58ef4e"),
  "DEMO-목재-OSB": demoImg("1541888946425-d81bb19240f5"),
  "DEMO-목재-몰딩": demoImg("1600607687939-ce8a6c25118c"),
  "DEMO-목재-거치핀": demoImg("1504148455328-c376907d081c"),
  "DEMO-마루-강마루": demoImg("1615873968403-89e068629265"),
  "DEMO-마루-원목": demoImg("1600585154340-be6161a56a0c"),
  "DEMO-마루-헤링본": demoImg("1519710164239-da123dc03ef4"),
  "DEMO-마루-매트": demoImg("1578662996442-48f60103fc96"),
  "DEMO-장판-데코": demoImg("1519710164239-da123dc03ef4"),
  "DEMO-장판-PVC": demoImg("1600585154526-990dced4db0d"),
  "DEMO-장판-데코그레이": demoImg("1558618666-fcd25c85cd64"),
  "DEMO-장판-접착제": demoImg("1541888946425-d81bb19240f5"),
  "DEMO-필름-우드": demoImg("1441974231531-c6227db76b6e"),
  "DEMO-필름-화이트": demoImg("1600607687939-ce8a6c25118c"),
  "DEMO-필름-콘크리트": demoImg("1541888946425-d81bb19240f5"),
  "DEMO-필름-헤라": demoImg("1504148455328-c376907d081c"),
  "DEMO-조명-다운라이트": demoImg("1600210492486-724fe5c67fb0"),
  "DEMO-조명-간접": demoImg("1600047509807-ba8f99d2cdde"),
  "DEMO-전기-콘센트": demoImg("1621905251918-48416bd8575a"),
  "DEMO-전기-스위치": demoImg("1621905251918-48416bd8575a"),
  "DEMO-타일-300": demoImg("1519710164239-da123dc03ef4"),
  "DEMO-타일-본드": demoImg("1541888946425-d81bb19240f5"),
  "DEMO-도배-합지": demoImg("1484154218962-a197022b5858"),
  "DEMO-도배-실크": demoImg("1558618666-fcd25c85cd64"),
  "DEMO-중문-3연동": demoImg("1497366216548-37526070297c"),
  "DEMO-싱크-상판": demoImg("1556909114-f6e7ad7d3136"),
};

function demoImageForSku(sku) {
  return DEMO_IMAGE_BY_SKU[sku] ?? demoImg("1615873968403-89e068629265");
}

const DEMOS_RAW = [
  // 목재
  { sku: "DEMO-목재-합판", name: "합판 15T 1220×2440 (샘플)", shop_line: "목재", category: "합판", brand: "샘플", spec: "15T", unit: "장", price: 45000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-목재-각재", name: "각재 3.8×89 2.4M (샘플)", shop_line: "목재", category: "각재", brand: "샘플", spec: "3.8×89", unit: "개", price: 8000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-목재-MDF", name: "MDF 15T 1220×2440 (샘플)", shop_line: "목재", category: "MDF", brand: "샘플", spec: "15T", unit: "장", price: 38000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-목재-OSB", name: "OSB 11T 1250×2500 (샘플)", shop_line: "목재", category: "OSB", brand: "샘플", spec: "11T", unit: "장", price: 52000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-목재-몰딩", name: "평몰딩 50×2400 (샘플)", shop_line: "목재", category: "몰딩", brand: "샘플", spec: "50mm", unit: "개", price: 3500, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-목재-거치핀", name: "목재 거치핀 50mm (샘플)", shop_line: "목재", category: "부자재", brand: "샘플", spec: "50mm", unit: "봉", price: 12000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  // 마루
  { sku: "DEMO-마루-강마루", name: "강마루 오크 8T (샘플)", shop_line: "마루", category: "강마루", brand: "샘플", spec: "8T", unit: "㎡", price: 89000, sale_price: 79000, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-마루-원목", name: "원목마루 루바 (샘플)", shop_line: "마루", category: "원목", brand: "샘플", spec: "루바", unit: "㎡", price: 120000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-마루-헤링본", name: "강마루 헤링본 월넛 (샘플)", shop_line: "마루", category: "강마루", brand: "샘플", spec: "헤링본", unit: "㎡", price: 135000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-마루-매트", name: "바닥 매트지 2T (샘플)", shop_line: "마루", category: "하부재", brand: "샘플", spec: "2T", unit: "㎡", price: 4500, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  // 장판
  { sku: "DEMO-장판-데코", name: "데코타일 2.0T 화이트오크 (샘플)", shop_line: "장판", category: "장판", brand: "샘플", spec: "2.0T", unit: "㎡", price: 12000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-장판-PVC", name: "PVC 장판 롤 (샘플)", shop_line: "장판", category: "장판", brand: "샘플", spec: "롤", unit: "롤", price: 35000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-장판-데코그레이", name: "데코타일 2.0T 그레이오크 (샘플)", shop_line: "장판", category: "장판", brand: "샘플", spec: "2.0T", unit: "㎡", price: 12500, sale_price: 11000, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-장판-접착제", name: "장판 전용 접착제 14kg (샘플)", shop_line: "장판", category: "부자재", brand: "샘플", spec: "14kg", unit: "통", price: 68000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  // 필름
  { sku: "DEMO-필름-우드", name: "인테리어 필름 우드 (샘플)", shop_line: "필름", category: "필름", brand: "샘플", spec: "1220폭", unit: "M", price: 15000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-필름-화이트", name: "시트지 무광 화이트 (샘플)", shop_line: "필름", category: "필름", brand: "샘플", spec: "단색", unit: "M", price: 8000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-필름-콘크리트", name: "필름 콘크리트 패턴 (샘플)", shop_line: "필름", category: "필름", brand: "샘플", spec: "1220폭", unit: "M", price: 16500, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-필름-헤라", name: "필름 시공 헤라 세트 (샘플)", shop_line: "필름", category: "공구", brand: "샘플", spec: "세트", unit: "세트", price: 15000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  // 기타 구분 (비밀몰 '기타 구분' 드롭다운용)
  { sku: "DEMO-조명-다운라이트", name: "LED 다운라이트 4인치 12W (샘플)", shop_line: "조명", category: "다운라이트", brand: "샘플", spec: "12W", unit: "개", price: 18000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-조명-간접", name: "간접조명 T5 LED 1200 (샘플)", shop_line: "조명", category: "간접", brand: "샘플", spec: "1200mm", unit: "개", price: 32000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-전기-콘센트", name: "와이드 콘센트 2구 (샘플)", shop_line: "전기", category: "콘센트", brand: "샘플", spec: "2구", unit: "개", price: 8500, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-전기-스위치", name: "3로 스위치 (샘플)", shop_line: "전기", category: "스위치", brand: "샘플", spec: "3로", unit: "개", price: 12000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-타일-300", name: "포세린 타일 300×600 (샘플)", shop_line: "타일", category: "벽타일", brand: "샘플", spec: "300×600", unit: "장", price: 9500, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-타일-본드", name: "타일 접착 시멘트 20kg (샘플)", shop_line: "타일", category: "부자재", brand: "샘플", spec: "20kg", unit: "포", price: 22000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-도배-합지", name: "합지 도배지 롤 (샘플)", shop_line: "도배", category: "벽지", brand: "샘플", spec: "53cm×10m", unit: "롤", price: 28000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-도배-실크", name: "실크 벽지 롤 (샘플)", shop_line: "도배", category: "벽지", brand: "샘플", spec: "53cm×10m", unit: "롤", price: 55000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-중문-3연동", name: "3연동 중문 알루미늄 (샘플)", shop_line: "중문", category: "중문", brand: "샘플", spec: "900", unit: "SET", price: 890000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
  { sku: "DEMO-싱크-상판", name: "인조대리석 상판 2400 (샘플)", shop_line: "싱크", category: "상판", brand: "샘플", spec: "2400mm", unit: "개", price: 320000, sale_price: null, stock_status: "데모", image_url: null, product_url: null },
];

const DEMOS = DEMOS_RAW.map((d) => ({
  ...d,
  image_url: demoImageForSku(d.sku),
}));

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error("[seed-shop-demo] POSTGRES_URL이 없습니다. .env.local에 DB URL을 설정한 뒤 다시 실행하세요.");
    process.exit(1);
  }

  const found = await sql`SELECT id FROM companies ORDER BY id ASC`;
  const companyIds = found.rows.map((r) => r.id).filter((id) => Number.isFinite(id) && id > 0);
  if (companyIds.length === 0) {
    console.error("[seed-shop-demo] companies 테이블에 행이 없습니다.");
    process.exit(1);
  }
  console.log("[seed-shop-demo] 회사 수:", companyIds.length, "ids=", companyIds.join(", "));

  let inserted = 0;
  let imageOnly = 0;
  for (const companyId of companyIds) {
    for (const d of DEMOS) {
      const r = await sql`
        INSERT INTO shop_products (
          company_id, sku, name, shop_line, category, brand, spec, unit,
          price, sale_price, stock_status, image_url, product_url, is_active, updated_at
        )
        VALUES (
          ${companyId}, ${d.sku}, ${d.name}, ${d.shop_line}, ${d.category}, ${d.brand}, ${d.spec}, ${d.unit},
          ${d.price}, ${d.sale_price}, ${d.stock_status}, ${d.image_url}, ${d.product_url}, true, NOW()
        )
        ON CONFLICT (company_id, sku) DO UPDATE SET
          image_url = EXCLUDED.image_url,
          updated_at = NOW()
        RETURNING (xmax = 0) AS was_insert
      `;
      const row = r.rows[0];
      if (row?.was_insert) inserted += 1;
      else imageOnly += 1;
    }
  }

  console.log(
    `[seed-shop-demo] 완료: 신규 ${inserted}건, 기존 행 이미지·시각 갱신 ${imageOnly}건 (회사 ${companyIds.length}곳 × SKU ${DEMOS.length}종)`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-shop-demo] 실패:", e.message);
  process.exit(1);
});
