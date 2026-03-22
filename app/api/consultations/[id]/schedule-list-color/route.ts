import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ensureConsultationsColumns } from "@/lib/consultations-migrate";

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

function parseColor(body: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "요청 본문이 올바르지 않습니다." };
  }
  const color = (body as { color?: unknown }).color;
  if (color == null || color === "") {
    return { ok: true, value: null };
  }
  if (typeof color !== "string") {
    return { ok: false, error: "색상 형식이 올바르지 않습니다." };
  }
  const t = color.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) {
    return { ok: false, error: "색상은 #RRGGBB 형식이어야 합니다." };
  }
  return { ok: true, value: t };
}

/** 일정 목록·캘린더 막대용 표시 색만 저장 (상담당 1색) */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const { id } = await params;
    const consultationId = parseInt(id, 10);
    if (Number.isNaN(consultationId)) {
      return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
    }

    const parsed = parseColor(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await ensureConsultationsColumns();

    const result = await sql`
      UPDATE consultations
      SET schedule_list_color = ${parsed.value}
      WHERE id = ${consultationId} AND company_id = ${company.id}
      RETURNING id
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "해당 상담을 찾을 수 없거나 수정 권한이 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      scheduleListColor: parsed.value ?? undefined,
    });
  } catch (error) {
    console.error("schedule-list-color PATCH error:", error);
    const msg =
      error instanceof Error && /schedule_list_color|column/i.test(error.message)
        ? "DB 컬럼이 없습니다. npm run migrate 또는 서버 재시작 후 다시 시도해 주세요."
        : "Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
