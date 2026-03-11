import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { PDFParse } from "pdf-parse";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number };
  } catch {
    return null;
  }
}

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
  } catch (_) {}
}
setPdfWorkerOnce();

/** 계약 문서(PDF)에서 텍스트 추출해 반환. 미리보기/인쇄 시 내용 표시용 */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  if (!pathParam || typeof pathParam !== "string" || !pathParam.startsWith("contracts/") || pathParam.includes("..")) {
    return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  }
  const fileName = pathParam.slice("contracts/".length) || path.basename(pathParam);
  if (!fileName || !fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ text: "" }, { status: 200 });
  }
  const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
  const filePath = path.join(baseDir, fileName);
  let parser: InstanceType<typeof PDFParse> | null = null;
  try {
    const buf = await readFile(filePath);
    parser = new PDFParse({ data: buf });
    const result = await parser.getText();
    await parser.destroy();
    parser = null;
    const rawText =
      Array.isArray(result?.pages) && result.pages.length > 0
        ? result.pages
            .sort((a: { num: number }, b: { num: number }) => a.num - b.num)
            .map((p: { text?: string }) => p.text ?? "")
            .join("\n\n")
        : (result?.text ?? "");
    return NextResponse.json({ text: rawText.trim() }, { status: 200 });
  } catch (err) {
    if (parser) {
      try {
        await parser.destroy();
      } catch (_) {}
    }
    console.error("contract-document-text error:", err);
    return NextResponse.json({ text: "" }, { status: 200 });
  }
}
