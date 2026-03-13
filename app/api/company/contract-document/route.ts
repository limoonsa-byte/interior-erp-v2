import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";

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

/** 로그인 회사: 계약서 작성 시 본문 PDF 미리보기용 (마스터 PDF 또는 업로드한 파일). 마스터 PDF는 뷰어 제목을 "계약서양식"으로 표시 */
export async function GET(request: Request) {
  const company = await getCompanyFromCookie();
  if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const url = new URL(request.url);
  const pathParam = url.searchParams.get("path");
  if (!pathParam || typeof pathParam !== "string" || !pathParam.startsWith("contracts/") || pathParam.includes("..")) {
    return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  }
  const fileName = pathParam.slice("contracts/".length) || path.basename(pathParam);
  if (!fileName) return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
  const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
  const filePath = path.join(baseDir, fileName);
  try {
    let buf: Buffer;
    try {
      buf = await readFile(filePath);
    } catch {
      if (fileName === "master-template.pdf") {
        const { sql } = await import("@vercel/postgres");
        const r = await sql`SELECT document_data FROM master_contract_template WHERE id = 1 LIMIT 1`;
        const data = r.rows[0]?.document_data;
        if (!data || typeof data !== "string") throw new Error("no data");
        buf = Buffer.from(data, "base64");
      } else {
        throw new Error("file not found");
      }
    }
    const isPdf = fileName.toLowerCase().endsWith(".pdf");
    if (isPdf && fileName === "master-template.pdf") {
      try {
        const doc = await PDFDocument.load(buf);
        doc.setTitle("계약서양식");
        const bytes = await doc.save();
        buf = Buffer.from(bytes);
      } catch (_) {
        // 메타데이터 수정 실패 시 원본 그대로
      }
    }
    const contentType = isPdf ? "application/pdf" : "image/png";
    const displayName = isPdf && fileName === "master-template.pdf" ? "계약서양식.pdf" : fileName;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(displayName)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
}
