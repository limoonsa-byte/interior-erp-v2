import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import path from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";
import { pdfTextToContractTitle, pdfTextToContractBody } from "@/lib/pdfToContractText";

/** 로컬·배포 환경에서 PDF worker 경로 설정 (pdf.worker.mjs 오류 방지) */
function setPdfWorkerOnce() {
  try {
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs"
    );
    const workerUrl = pathToFileURL(workerPath).href;
    PDFParse.setWorker(workerUrl);
  } catch (_) {
    // worker 설정 실패 시 무시
  }
}
setPdfWorkerOnce();

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

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** 마스터 전용: PDF 파일을 업로드하면 텍스트를 추출해 계약서 양식(제목·본문)으로 저장 */
export async function POST(request: Request) {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "PDF 파일을 선택해 주세요." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    await parser.destroy();
    parser = null;
    // 전체 페이지 텍스트 합치기 (result.text가 마지막 페이지만 나오는 경우 대비)
    const rawText =
      Array.isArray(result?.pages) && result.pages.length > 0
        ? result.pages
            .sort((a: { num: number }, b: { num: number }) => a.num - b.num)
            .map((p: { text?: string }) => p.text ?? "")
            .join("\n\n")
        : (result?.text ?? "");
    if (!rawText.trim()) {
      return NextResponse.json({ error: "PDF에서 텍스트를 추출할 수 없습니다. 스캔 이미지 PDF는 지원하지 않습니다." }, { status: 400 });
    }
    const title = pdfTextToContractTitle(rawText);
    const body = pdfTextToContractBody(rawText);
    await sql`
      UPDATE master_contract_template
      SET title = ${title}, body = ${body}, updated_at = NOW()
      WHERE id = 1
    `;
    return NextResponse.json({ message: "PDF 양식이 적용되었습니다.", title }, { status: 200 });
  } catch (error) {
    if (parser) {
      try {
        await parser.destroy();
      } catch (_) {}
    }
    console.error("contract-template import-pdf error:", error);
    const errMsg = error instanceof Error ? error.message : "PDF 변환 실패";
    const isWorkerError = /worker|pdf\.worker\.mjs|cannot find module/i.test(errMsg);
    return NextResponse.json(
      {
        error: isWorkerError
          ? "PDF 변환 환경 오류입니다. 엑셀 파일로 양식 불러오기를 사용하시거나, 배포 환경에서 PDF를 시도해 주세요."
          : errMsg,
      },
      { status: 500 }
    );
  }
}
