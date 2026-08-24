import nodemailer from "nodemailer";
import { sql } from "@vercel/postgres";

export type TransporterResult = { transporter: nodemailer.Transporter; from: string } | null;

export type GetTransporterOptions = {
  /** true면 회사 SMTP를 건너뛰고 마스터/환경변수만 사용 */
  skipCompany?: boolean;
};

/** 이메일 주소에서 SMTP 호스트·포트 자동 판별 (Gmail, 네이버만) */
export function getSmtpConfigFromEmail(email: string): { host: string; port: number } | null {
  const addr = String(email ?? "").trim().toLowerCase();
  if (!addr || !addr.includes("@")) return null;
  const fullDomain = addr.split("@")[1] || "";
  if (fullDomain.includes("gmail.com") || fullDomain.includes("googlemail.com")) return { host: "smtp.gmail.com", port: 587 };
  if (fullDomain.includes("naver.com") || fullDomain.includes("naver.co.kr") || fullDomain.includes("naver.jp")) return { host: "smtp.naver.com", port: 587 };
  return null;
}

export function isSmtpAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Invalid login|BadCredentials|535|Username and Password not accepted|EAUTH|authentication failed|Invalid credentials/i.test(
    msg
  );
}

/** 사용자에게 보여줄 SMTP/발송 오류 메시지 */
export function formatSmtpSendError(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  if (isSmtpAuthError(err)) {
    return (
      "이메일 계정 인증에 실패했습니다. Gmail은 일반 비밀번호가 아니라 「앱 비밀번호」 또는 「Gmail로 연결(OAuth)」이 필요합니다. " +
      "마스터 관리 → 마스터 메일(OAuth)에서 다시 연결하거나, 관리에서 잘못된 회사 SMTP 비밀번호를 지운 뒤 다시 시도해 주세요."
    );
  }
  return `이메일 발송에 실패했습니다: ${detail}`;
}

async function verifyPasswordTransporter(transporter: nodemailer.Transporter): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

async function companyDisplayFrom(companyId: number | null | undefined, fallback: string): Promise<string> {
  let from = fallback;
  if (companyId == null) return from;
  try {
    const row = await sql`SELECT name, company_email FROM companies WHERE id = ${companyId}`;
    if (row.rows.length > 0) {
      const name = (row.rows[0] as { name: string | null }).name?.trim();
      const companyEmail = (row.rows[0] as { company_email: string | null }).company_email?.trim();
      const addr = companyEmail && companyEmail.includes("@") ? companyEmail : fallback;
      if (name) from = `"${name.replace(/"/g, "'")}" <${addr}>`;
      else from = addr;
    }
  } catch {
    // ignore
  }
  if (!from || !from.includes("@")) from = process.env.MAIL_FROM?.trim() || fallback;
  return from;
}

async function createGoogleOAuthTransporter(params: {
  user: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<nodemailer.Transporter | null> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  const accessToken = (tokenData as { access_token?: string }).access_token;
  if (!accessToken) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      type: "OAuth2",
      user: params.user,
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      refreshToken: params.refreshToken,
      accessToken,
    },
  });
}

/** 회사 DB SMTP 설정 → 마스터 OAuth(env) → env SMTP 순으로 메일 전송용 transporter 반환 */
export async function getTransporter(
  companyId?: number | null,
  options?: GetTransporterOptions
): Promise<TransporterResult> {
  const skipCompany = options?.skipCompany === true;

  if (!skipCompany && companyId != null) {
    const result = await sql`
      SELECT smtp_host, smtp_port, smtp_user, smtp_pass, company_email, smtp_oauth_provider, smtp_oauth_refresh_token
      FROM companies WHERE id = ${companyId}
    `;
    if (result.rows.length > 0) {
      const r = result.rows[0] as {
        smtp_host: string | null;
        smtp_port: string | null;
        smtp_user: string | null;
        smtp_pass: string | null;
        company_email: string | null;
        smtp_oauth_provider: string | null;
        smtp_oauth_refresh_token: string | null;
      };
      const oauthProvider = r.smtp_oauth_provider?.trim();
      const refreshToken = r.smtp_oauth_refresh_token?.trim();
      const user = r.smtp_user?.trim();

      if (oauthProvider === "google" && refreshToken && user) {
        const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
        if (clientId && clientSecret) {
          const transporter = await createGoogleOAuthTransporter({
            user,
            refreshToken,
            clientId,
            clientSecret,
          });
          if (transporter) {
            const from = r.company_email?.trim() || user;
            return { transporter, from };
          }
        }
      }

      const host = r.smtp_host?.trim();
      const pass = r.smtp_pass?.replace(/\s+/g, "").trim();
      if (host && user && pass) {
        const port = Number(r.smtp_port?.trim()) || 587;
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        // 잘못된 Gmail 일반 비밀번호 등이 있으면 마스터로 넘김 (535 방지)
        if (await verifyPasswordTransporter(transporter)) {
          const from = r.company_email?.trim() || user;
          return { transporter, from };
        }
      }
    }
  }

  // 마스터(DB): master_smtp_config - OAuth 또는 앱 비밀번호
  let masterRow: {
    rows: Array<{
      smtp_oauth_provider: string | null;
      smtp_oauth_refresh_token: string | null;
      smtp_user: string | null;
      smtp_pass: string | null;
      smtp_host: string | null;
      smtp_port: string | null;
    }>;
  };
  try {
    masterRow = await sql`
      SELECT smtp_oauth_provider, smtp_oauth_refresh_token, smtp_user, smtp_pass, smtp_host, smtp_port FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
  } catch {
    masterRow = { rows: [] };
  }
  if (masterRow.rows.length > 0) {
    const m = masterRow.rows[0];
    const oauthProvider = m.smtp_oauth_provider?.trim();
    const refreshToken = m.smtp_oauth_refresh_token?.trim();
    const masterUser = m.smtp_user?.trim();
    const masterPass = m.smtp_pass?.replace(/\s+/g, "").trim();
    const masterHost = m.smtp_host?.trim() || "smtp.gmail.com";
    const masterPort = Number(m.smtp_port?.trim()) || 587;

    if (oauthProvider === "google" && refreshToken && masterUser) {
      const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
      if (googleClientId && googleClientSecret) {
        const transporter = await createGoogleOAuthTransporter({
          user: masterUser,
          refreshToken,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        });
        if (transporter) {
          const from = await companyDisplayFrom(companyId, masterUser);
          return { transporter, from };
        }
      }
    }

    if (masterUser && masterPass && (masterHost.includes("gmail") || masterHost.includes("google") || masterHost.includes("naver"))) {
      const transporter = nodemailer.createTransport({
        host: masterHost,
        port: masterPort,
        secure: masterPort === 465,
        auth: { user: masterUser, pass: masterPass },
      });
      if (await verifyPasswordTransporter(transporter)) {
        const from = await companyDisplayFrom(companyId, masterUser);
        return { transporter, from };
      }
    }
  }

  // 마스터 OAuth(env)
  const masterRefresh = process.env.MASTER_SMTP_OAUTH_REFRESH_TOKEN?.trim();
  const envMasterUser = process.env.MASTER_SMTP_OAUTH_USER?.trim();
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (masterRefresh && envMasterUser && googleClientId && googleClientSecret) {
    const transporter = await createGoogleOAuthTransporter({
      user: envMasterUser,
      refreshToken: masterRefresh,
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    });
    if (transporter) {
      const from = await companyDisplayFrom(companyId, envMasterUser);
      return { transporter, from };
    }
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "").trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  if (!(await verifyPasswordTransporter(transporter))) return null;
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
      const r = result.rows[0] as {
        smtp_host: string | null;
        smtp_user: string | null;
        smtp_pass: string | null;
        smtp_oauth_provider: string | null;
        smtp_oauth_refresh_token: string | null;
      };
      if (r.smtp_oauth_provider?.trim() === "google" && r.smtp_oauth_refresh_token?.trim() && r.smtp_user?.trim()) return true;
      if (r.smtp_oauth_provider?.trim() === "naver" && r.smtp_user?.trim() && r.smtp_pass?.trim()) return true;
      if (r.smtp_host?.trim() && r.smtp_user?.trim() && r.smtp_pass?.trim()) return true;
    }
  }
  try {
    const masterRow = await sql`
      SELECT smtp_oauth_provider, smtp_oauth_refresh_token, smtp_user, smtp_pass, smtp_host FROM master_smtp_config WHERE id = 1 LIMIT 1
    `;
    if (masterRow.rows.length > 0) {
      const m = masterRow.rows[0] as {
        smtp_oauth_provider: string | null;
        smtp_oauth_refresh_token: string | null;
        smtp_user: string | null;
        smtp_pass: string | null;
        smtp_host: string | null;
      };
      if (m.smtp_oauth_provider?.trim() === "google" && m.smtp_oauth_refresh_token?.trim() && m.smtp_user?.trim()) return true;
      const h = m.smtp_host?.trim() || "";
      if (m.smtp_user?.trim() && m.smtp_pass?.trim() && (h.includes("gmail") || h.includes("google") || h.includes("naver")))
        return true;
    }
  } catch {
    // master_smtp_config 테이블 없을 수 있음
  }
  if (
    process.env.MASTER_SMTP_OAUTH_REFRESH_TOKEN?.trim() &&
    process.env.MASTER_SMTP_OAUTH_USER?.trim() &&
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim()
  )
    return true;
  return !!(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}
