import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    const type = file.type?.toLowerCase() || "";
    if (!ALLOWED_TYPES.includes(type) && !type.startsWith("image/")) return NextResponse.json({ error: "PDF 또는 이미지 파일만 업로드 가능합니다." }, { status: 400 });
    const dir = process.env.VERCEL ? path.join("/tmp", "contracts") : path.join(process.cwd(), "uploads", "contracts");
    await mkdir(dir, { recursive: true });
    const ext = type === "application/pdf" ? "pdf" : type.replace("image/", "") || "bin";
    const safeName = `${Date.now()}-${company.id}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const filePath = path.join(dir, safeName);
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buf);
    const documentPath = `contracts/${safeName}`;
    return NextResponse.json({ documentPath }, { status: 200 });
  } catch (error) {
    console.error("contracts upload error:", error);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}
