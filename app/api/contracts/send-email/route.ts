import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";

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

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function POST(request: Request) {
  try {
    const company = await getCompanyFromCookie();
    if (!company) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
    const body = await request.json();
    const { to, signUrl, title } = body;
    if (!to || typeof to !== "string" || !to.trim()) return NextResponse.json({ error: "수신 이메일을 입력해 주세요." }, { status: 400 });
    if (!signUrl || typeof signUrl !== "string") return NextResponse.json({ error: "서명 링크가 없습니다." }, { status: 400 });
    const transporter = getTransporter();
    if (!transporter) return NextResponse.json({ error: "이메일 발송이 설정되지 않았습니다. SMTP 환경변수를 확인해 주세요." }, { status: 503 });
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@localhost";
    const subject = title ? `[계약서 서명 요청] ${title}` : "계약서 서명 요청";
    const text = `아래 링크에서 계약서를 확인하고 서명해 주세요.\n\n${signUrl}`;
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;"><p>아래 링크에서 계약서를 확인하고 서명해 주세요.</p><p><a href="${signUrl}">서명 페이지로 이동</a></p><p style="color:#666;font-size:12px;">${signUrl}</p></body></html>`;
    await transporter.sendMail({
      from,
      to: to.trim(),
      subject,
      text,
      html,
    });
    return NextResponse.json({ message: "이메일이 발송되었습니다." }, { status: 200 });
  } catch (error) {
    console.error("contracts send-email error:", error);
    const msg = error instanceof Error ? error.message : "발송 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
