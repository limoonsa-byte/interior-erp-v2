import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { removeLaborPayFromApproval } from "@/lib/mergeLaborPayIntoApproval";

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

/** 인건비 요청 삭제 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const { id } = await params;
    const requestId = parseInt(id, 10);
    if (Number.isNaN(requestId)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    const result = await sql`
      DELETE FROM labor_pay_requests
      WHERE id = ${requestId} AND company_id = ${company.id}
      RETURNING id, estimate_id
    `;
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
    }
    const deleted = result.rows[0] as { id: number; estimate_id: number };
    try {
      await removeLaborPayFromApproval({
        estimateId: Number(deleted.estimate_id),
        companyId: company.id,
        laborPayRequestId: Number(deleted.id),
      });
    } catch (mergeErr) {
      console.error("labor-pay delete → approval remove error:", mergeErr);
    }
    return NextResponse.json({ message: "삭제되었습니다." });
  } catch (error) {
    console.error("labor-pay DELETE error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
