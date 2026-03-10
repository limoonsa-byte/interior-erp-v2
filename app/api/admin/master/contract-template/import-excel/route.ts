import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import { excelSheetToContractBody, excelSheetToContractTitle } from "@/lib/excelToContractText";

async function requireMaster() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    const fromCookie = JSON.parse(cookie.value) as { id: number };
    const result = await sql`
      SELECT id FROM companies WHERE id = ${fromCookie.id} AND is_master = true LIMIT 1
    `;
    return result.rows.length > 0 ? fromCookie : null;
  } catch {
    return null;
  }
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** 마스터 전용: 엑셀 파일을 업로드하면 계약서 양식(제목·본문)으로 변환해 저장 */
export async function POST(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "엑셀 파일을 선택해 주세요." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 5MB 이하여야 합니다." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "엑셀에 시트가 없습니다." }, { status: 400 });
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (string | number)[][];
    if (!rows.length) {
      return NextResponse.json({ error: "시트 내용이 비어 있습니다." }, { status: 400 });
    }
    const title = excelSheetToContractTitle(rows);
    const body = excelSheetToContractBody(rows);
    await sql`
      UPDATE master_contract_template
      SET title = ${title}, body = ${body}, updated_at = NOW()
      WHERE id = 1
    `;
    return NextResponse.json({ message: "엑셀 양식이 적용되었습니다.", title }, { status: 200 });
  } catch (error) {
    console.error("contract-template import-excel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "엑셀 변환 실패" },
      { status: 500 }
    );
  }
}
