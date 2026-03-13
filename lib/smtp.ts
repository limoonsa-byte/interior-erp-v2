import nodemailer from "nodemailer";
import { sql } from "@vercel/postgres";

export type TransporterResult = { transporter: nodemailer.Transporter; from: string } | null;

/** 이메일 주소에서 SMTP 호스트·포트 자동 판별 (Gmail, 네이버만) */
export function getSmtpConfigFromEmail(email: string): { host: string; port: number } | null {
  const addr = String(email ?? "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) return null;
  const fullDomain = addr.split("@")[1] || "";
  if (fullDomain.includes("gmail.com") || fullDomain.includes("googlemail.com")) return { host: "smtp.gmail.com", port: 587 };
  if (fullDomain.includes("naver.com") || fullDomain.includes("naver.co.kr") || fullDomain.includes("naver.jp")) return { host: "smtp.naver.com", port: 587 };
  return null;
}

/** 회사 DB SMTP 설정 → 마스터 OAuth(env) → env SMTP 순으로 메일 전송용 transporter 반환 */
export async function getTransporter(companyId?: number | null): Promise<TransporterResult> {
  if (companyId != null) {
    const result = await sql`
      SELECT smtp_host, smtp_port, smtp_user, smtp_pass, company_email, smtp_oauth_provider, smtp_oauth_refresh_token
      FROM companies WHERE id = ${companyId}
    `;
    if (result.rows.length > 0) {
      const r = result.rows[0] as {
        smtp_host: string | null; smtp_port: string | null; smtp_user: string | null; smtp_pass: string | null;
        company_email: string | null; smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null;
      };
      const oauthProvider = r.smtp_oauth_provider?.trim();
      const refreshToken = r.smtp_oauth_refresh_token?.trim();
      const user = r.smtp_user?.trim();

      if (oauthProvider === "google" && refreshToken && user) {
        const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
        if (clientId && clientSecret) {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            }),
          });
          const tokenData = await tokenRes.json().catch(() => ({}));
          const accessToken = tokenData.access_token;
          if (accessToken) {
            const transporter = nodemailer.createTransport({
              host: "smtp.gmail.com",
              port: 587,
              secure: false,
              auth: {
                type: "OAuth2",
                user,
                clientId,
                clientSecret,
                refreshToken,
                accessToken,
              },
            });
            const from = (r.company_email?.trim() || user);
            return { transporter, from };
          }
        }
      }

      const host = r.smtp_host?.trim();
      const pass = r.smtp_pass?.trim();
      if (host && user && pass) {
        const port = Number(r.smtp_port?.trim()) || 587;
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        const from = (r.company_email?.trim() || user);
        return { transporter, from };
      }
    }
  }

  // 마스터(DB): master_smtp_config - OAuth 또는 앱 비밀번호
  let masterRow: { rows: Array<{ smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_host: string | null; smtp_port: string | null }> };
  try {
    masterRow = await sql`
      SELECT smtp_oauth_provider, smtp_oauth_refresh_token, smtp_user, smtp_pass, smtp_host, smtp_port FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
  } catch {
    masterRow = { rows: [] };
  }
  if (masterRow.rows.length > 0) {
    const m = masterRow.rows[0] as { smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_host: string | null; smtp_port: string | null };
    const oauthProvider = m.smtp_oauth_provider?.trim();
    const refreshToken = m.smtp_oauth_refresh_token?.trim();
    const masterUser = m.smtp_user?.trim();
    const masterPass = m.smtp_pass?.trim();
    const masterHost = m.smtp_host?.trim() || "smtp.gmail.com";
    const masterPort = Number(m.smtp_port?.trim()) || 587;

    if (oauthProvider === "google" && refreshToken && masterUser) {
      const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (googleClientId && googleClientSecret) {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        const tokenData = await tokenRes.json().catch(() => ({}));
        const accessToken = tokenData.access_token;
        if (accessToken) {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
              type: "OAuth2",
              user: masterUser,
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              refreshToken,
              accessToken,
            },
          });
          let from = masterUser;
          if (companyId != null) {
            const row = await sql`SELECT name, company_email FROM companies WHERE id = ${companyId}`;
            if (row.rows.length > 0) {
              const name = (row.rows[0] as { name: string | null }).name?.trim();
              const companyEmail = (row.rows[0] as { company_email: string | null }).company_email?.trim();
              const addr = companyEmail && companyEmail.includes("@") ? companyEmail : masterUser;
              if (name) from = `"${name.replace(/"/g, "'")}" <${addr}>`;
              else from = addr;
            }
          }
          if (!from || !from.includes("@")) from = process.env.MAIL_FROM?.trim() || masterUser;
          return { transporter, from };
        }
      }
    }

    if (masterUser && masterPass && (masterHost.includes("gmail") || masterHost.includes("google"))) {
      const transporter = nodemailer.createTransport({
        host: masterHost,
        port: masterPort,
        secure: masterPort === 465,
        auth: { user: masterUser, pass: masterPass },
      });
      let from = masterUser;
      if (companyId != null) {
        const row = await sql`SELECT name, company_email FROM companies WHERE id = ${companyId}`;
        if (row.rows.length > 0) {
          const name = (row.rows[0] as { name: string | null }).name?.trim();
          const companyEmail = (row.rows[0] as { company_email: string | null }).company_email?.trim();
          const addr = companyEmail && companyEmail.includes("@") ? companyEmail : masterUser;
          if (name) from = `"${name.replace(/"/g, "'")}" <${addr}>`;
          else from = addr;
        }
      }
      if (!from || !from.includes("@")) from = process.env.MAIL_FROM?.trim() || masterUser;
      return { transporter, from };
    }
  }

  // 마스터 OAuth(env): 회사별 설정 없을 때 운영자가 한 계정으로 대신 발송
  const masterRefresh = process.env.MASTER_SMTP_OAUTH_REFRESH_TOKEN?.trim();
  const masterUser = process.env.MASTER_SMTP_OAUTH_USER?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (masterRefresh && masterUser && googleClientId && googleClientSecret) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: masterRefresh,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    const accessToken = tokenData.access_token;
    if (accessToken) {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          type: "OAuth2",
          user: masterUser,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          refreshToken: masterRefresh,
          accessToken,
        },
      });
      // 보내는 이 = 로그인한 회사(회사명 + 회사 이메일 주소)
      let from = masterUser;
      if (companyId != null) {
        const row = await sql`SELECT name, company_email FROM companies WHERE id = ${companyId}`;
        if (row.rows.length > 0) {
          const name = (row.rows[0] as { name: string | null }).name?.trim();
          const companyEmail = (row.rows[0] as { company_email: string | null }).company_email?.trim();
          const addr = companyEmail && companyEmail.includes("@") ? companyEmail : masterUser;
          if (name) from = `"${name.replace(/"/g, "'")}" <${addr}>`;
          else from = addr;
        }
      }
      if (!from || !from.includes("@")) from = process.env.MAIL_FROM?.trim() || masterUser;
      return { transporter, from };
    }
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  const from = process.env.MAIL_FROM?.trim() || user;
  return { transporter, from };
}

/** SMTP 설정 여부 (회사 DB → 마스터 DB → 마스터 OAuth env → env SMTP) */
export async function isSmtpConfigured(companyId?: number | null): Promise<boolean> {
  if (companyId != null) {
    const result = await sql`
      SELECT smtp_host, smtp_user, smtp_pass, smtp_oauth_provider, smtp_oauth_refresh_token FROM companies WHERE id = ${companyId}
    `;
    if (result.rows.length > 0) {
      const r = result.rows[0] as { smtp_host: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null };
      if (r.smtp_oauth_provider?.trim() === "google" && r.smtp_oauth_refresh_token?.trim() && r.smtp_user?.trim()) return true;
      if (r.smtp_oauth_provider?.trim() === "naver" && r.smtp_user?.trim() && r.smtp_pass?.trim()) return true;
      if (r.smtp_host?.trim() && r.smtp_user?.trim() && r.smtp_pass?.trim()) return true;
    }
  }
  // 마스터(DB): OAuth 또는 앱 비밀번호
  try {
    const masterRow = await sql`
      SELECT smtp_oauth_provider, smtp_oauth_refresh_token, smtp_user, smtp_pass, smtp_host FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
    if (masterRow.rows.length > 0) {
      const m = masterRow.rows[0] as { smtp_oauth_provider: string | null; smtp_oauth_refresh_token: string | null; smtp_user: string | null; smtp_pass: string | null; smtp_host: string | null };
      if (m.smtp_oauth_provider?.trim() === "google" && m.smtp_oauth_refresh_token?.trim() && m.smtp_user?.trim()) return true;
      const h = m.smtp_host?.trim() || "";
      if (m.smtp_user?.trim() && m.smtp_pass?.trim() && (h.includes("gmail") || h.includes("google"))) return true;
    }
  } catch {
    // master_smtp_config 테이블 없을 수 있음
  }
  // 마스터 OAuth(env)로 발송 가능한지
  if (
    process.env.MASTER_SMTP_OAUTH_REFRESH_TOKEN?.trim() &&
    process.env.MASTER_SMTP_OAUTH_USER?.trim() &&
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  )
    return true;
  return !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}
