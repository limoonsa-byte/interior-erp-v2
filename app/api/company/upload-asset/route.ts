import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { writeFile, mkdir } from "fs/promises";
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

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const formData = await request.formData();
    const type = formData.get("type") as string | null;
    const file = formData.get("file") as File | null;
    if (!type || !["logo", "stamp"].includes(type)) return NextResponse.json({ error: "type은 logo 또는 stamp여야 합니다." }, { status: 400 });
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "파일 크기는 2MB 이하여야 합니다." }, { status: 400 });
    const mime = file.type?.toLowerCase() || "";
    if (!ALLOWED_TYPES.includes(mime)) return NextResponse.json({ error: "이미지 파일만 업로드 가능합니다. (PNG, JPG, GIF, WebP)" }, { status: 400 });
    const ext = mime.replace("image/", "") || "png";
    const baseDir = process.env.VERCEL ? path.join("/tmp", "company") : path.join(process.cwd(), "uploads", "company");
    const dir = path.join(baseDir, String(company.id));
    await mkdir(dir, { recursive: true });
    const fileName = `${type}.${ext}`;
    const filePath = path.join(dir, fileName);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buf);
    const storedPath = `company/${company.id}/${fileName}`;
    if (type === "logo") {
      await sql`UPDATE companies SET logo_path = ${storedPath} WHERE id = ${company.id}`;
    } else {
      await sql`UPDATE companies SET stamp_path = ${storedPath} WHERE id = ${company.id}`;
    }
    return NextResponse.json({ path: storedPath }, { status: 200 });
  } catch (error) {
    console.error("company upload-asset error:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
