import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { readFile } from "fs/promises";
import path from "path";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { type } = await params;
    if (type !== "logo" && type !== "stamp") return NextResponse.json({ error: "type은 logo 또는 stamp여야 합니다." }, { status: 400 });
    const result = type === "logo"
      ? await sql`SELECT logo_path AS path FROM companies WHERE id = ${company.id}`
      : await sql`SELECT stamp_path AS path FROM companies WHERE id = ${company.id}`;
    if (result.rows.length === 0 || !result.rows[0].path) return NextResponse.json({ error: "이미지가 없습니다." }, { status: 404 });
    const storedPath = String(result.rows[0].path);
    const baseDir = process.env.VERCEL ? path.join("/tmp", "company") : path.join(process.cwd(), "uploads", "company");
    const filePath = path.join(baseDir, storedPath.replace(/^company\//, ""));
    const buf = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("company asset GET error:", error);
    return NextResponse.json({ error: "파일을 읽을 수 없습니다." }, { status: 404 });
  }
}
