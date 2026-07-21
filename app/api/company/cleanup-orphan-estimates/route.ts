import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cleanupOrphanEstimates } from "@/lib/cleanupOrphanEstimates";

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

/** 상담 삭제 후 남은 고아 견적·자재발주 등 정리 */
export async function POST() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const deleted = await cleanupOrphanEstimates(company.id);
    return NextResponse.json({ message: "정리되었습니다.", deletedEstimates: deleted });
  } catch (error) {
    console.error("cleanup-orphan-estimates error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
