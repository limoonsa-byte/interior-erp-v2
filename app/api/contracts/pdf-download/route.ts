import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { buildContractPdfFromImage } from "@/lib/buildContractPdf";
import { cookies } from "next/headers";

async function getCompanyFromCookie() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { contractId, summaryImage } = await request.json();
    if (!contractId || !summaryImage || typeof summaryImage !== "string" || !summaryImage.startsWith("data:image/")) {
      return NextResponse.json({ error: "contractId와 summaryImage(이미지 data URL)는 필수입니다." }, { status: 400 });
    }

    const companyId = company.id;
    const result = await sql`
      SELECT id, title, document_path FROM contracts WHERE id = ${Number(contractId)} AND company_id = ${companyId}
    `;
    if (result.rows.length === 0) return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });

    const c = result.rows[0];
    const documentPath = c.document_path ? String(c.document_path) : null;
    const pdfBytes = await buildContractPdfFromImage(summaryImage, documentPath);

    const title = String(c.title ?? "계약서");
    const safeFileName = title.replace(/[/\\:*?"<>|]/g, " ").trim().replace(/\s+/g, " ") || "계약서";

    return new NextResponse(new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeFileName)}.pdf"`,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("계약서 PDF 다운로드 실패:", detail, error);
    return NextResponse.json({ error: `PDF 생성에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
