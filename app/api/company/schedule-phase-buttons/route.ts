import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  DEFAULT_SCHEDULE_PHASE_BUTTONS,
  normalizeSchedulePhaseLabels,
} from "@/lib/defaultSchedulePhaseButtons";

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

/** 회사별 일정 공정 버튼 기본 목록 조회 */
export async function GET() {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const result = await sql`
      SELECT labels_json
      FROM company_schedule_phase_buttons
      WHERE company_id = ${company.id}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({
        labels: [...DEFAULT_SCHEDULE_PHASE_BUTTONS],
        isDefault: true,
      });
    }

    const row = result.rows[0] as { labels_json?: string };
    let parsed: unknown = [];
    try {
      parsed = row.labels_json ? JSON.parse(row.labels_json) : [];
    } catch {
      parsed = [];
    }
    const labels = normalizeSchedulePhaseLabels(parsed);
    if (labels.length === 0) {
      return NextResponse.json({
        labels: [...DEFAULT_SCHEDULE_PHASE_BUTTONS],
        isDefault: true,
      });
    }
    return NextResponse.json({ labels, isDefault: false });
  } catch (error) {
    console.error("schedule-phase-buttons GET error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|company_schedule_phase_buttons/i.test(msg)) {
      return NextResponse.json({
        labels: [...DEFAULT_SCHEDULE_PHASE_BUTTONS],
        isDefault: true,
        warning: "DB 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요.",
      });
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

/** 회사별 일정 공정 버튼 기본 목록 저장 */
export async function PUT(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) {
      return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    }

    const body = await request.json();
    const labels = normalizeSchedulePhaseLabels(body.labels);
    if (labels.length === 0) {
      return NextResponse.json({ error: "공정 이름을 하나 이상 입력해 주세요." }, { status: 400 });
    }

    const labelsJson = JSON.stringify(labels);
    await sql`
      INSERT INTO company_schedule_phase_buttons (company_id, labels_json, updated_at)
      VALUES (${company.id}, ${labelsJson}, NOW())
      ON CONFLICT (company_id)
      DO UPDATE SET labels_json = ${labelsJson}, updated_at = NOW()
    `;

    return NextResponse.json({ message: "저장되었습니다.", labels });
  } catch (error) {
    console.error("schedule-phase-buttons PUT error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (/relation.*does not exist|company_schedule_phase_buttons/i.test(msg)) {
      return NextResponse.json(
        { error: "일정 공정 버튼 테이블이 없습니다. node scripts/migrate.js 를 실행해 주세요." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
