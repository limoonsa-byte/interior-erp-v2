import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "fs/promises";
import path from "path";
import { sql } from "@vercel/postgres";
import { PDFDocument } from "pdf-lib";

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

/** 마스터 전용: 저장된 계약서 PDF 그대로 응답 (뷰어 제목은 "계약서양식"으로 표시) */
export async function GET() {
  const company = await requireMaster();
  if (!company) {
    return NextResponse.json({ error: "마스터 권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await sql`
      SELECT document_path, document_data FROM master_contract_template WHERE id = 1 LIMIT 1
    `;
    const docPath = result.rows[0]?.document_path;
    const docData = result.rows[0]?.document_data;
    if (!docPath || typeof docPath !== "string") {
      return NextResponse.json({ error: "저장된 PDF가 없습니다." }, { status: 404 });
    }

    let buf: Buffer | null = null;
    const baseDir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    const fileName = docPath.startsWith("contracts/") ? docPath.slice("contracts/".length) : path.basename(docPath);
    try {
      buf = await readFile(path.join(baseDir, fileName));
    } catch {
      if (docData && typeof docData === "string") {
        buf = Buffer.from(docData, "base64");
      }
    }
    if (!buf) {
      return NextResponse.json({ error: "PDF를 불러올 수 없습니다." }, { status: 404 });
    }
    let outputBuf: Buffer = buf;
    try {
      const doc = await PDFDocument.load(buf);
      doc.setTitle("계약서양식");
      const bytes = await doc.save();
      outputBuf = Buffer.from(bytes);
    } catch (_) {
      // 메타데이터 수정 실패 시 원본 그대로 반환
    }
    const displayName = "계약서양식.pdf";
    const encodedDisplayName = encodeURIComponent(displayName);
    return new NextResponse(new Uint8Array(outputBuf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="contract-form.pdf"; filename*=UTF-8''${encodedDisplayName}`,
      },
    });
  } catch (e) {
    console.error("master contract-template document error:", e);
    return NextResponse.json({ error: "PDF를 불러올 수 없습니다." }, { status: 404 });
  }
}
