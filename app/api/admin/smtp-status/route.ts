import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSmtpConfigured } from "@/lib/smtp";

async function getCompany() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get("company");
  if (!cookie) return null;
  try {
    return JSON.parse(cookie.value) as { id: number; code: string; name: string };
  } catch {
    return null;
  }
}

/** SMTP 설정 여부만 반환 (값은 노출하지 않음). DB → 환경변수 순으로 확인 */
export async function GET() {
  try {
    const company = await getCompany();
    if (!company) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const configured = await isSmtpConfigured(company.id);

    return NextResponse.json({ configured });
  } catch (error) {
    console.error("smtp-status error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
