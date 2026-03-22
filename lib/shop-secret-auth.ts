import { sql } from "@vercel/postgres";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export const SHOP_SECRET_COOKIE = "shop_secret_session";
const SHOP_SECRET_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h

type SecretSession = {
  companyId: number;
  tokenHash: string;
  expiresAt: string;
};

export function hashSecretToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function encodeSecretSession(session: SecretSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeSecretSession(value: string | undefined): SecretSession | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<SecretSession>;
    const companyId = Number(parsed.companyId);
    const tokenHash = typeof parsed.tokenHash === "string" ? parsed.tokenHash : "";
    const expiresAt = typeof parsed.expiresAt === "string" ? parsed.expiresAt : "";
    if (!companyId || !tokenHash || !expiresAt) return null;
    return { companyId, tokenHash, expiresAt };
  } catch {
    return null;
  }
}

export async function validateRawSecretToken(rawToken: string): Promise<SecretSession | null> {
  const tokenHash = hashSecretToken(rawToken.trim());
  const result = await sql`
    SELECT company_id, token_hash, expires_at, revoked_at
    FROM shop_secret_tokens
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as {
    company_id: number;
    token_hash: string;
    expires_at: string | Date;
    revoked_at?: string | Date | null;
  };
  if (row.revoked_at) return null;
  if (!safeEq(row.token_hash, tokenHash)) return null;
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return null;
  return {
    companyId: Number(row.company_id),
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function requireSecretSession(): Promise<SecretSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SHOP_SECRET_COOKIE)?.value;
  const session = decodeSecretSession(raw);
  if (!session) return null;
  const exp = new Date(session.expiresAt);
  if (Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now()) return null;
  const result = await sql`
    SELECT id, company_id, token_hash, expires_at, revoked_at
    FROM shop_secret_tokens
    WHERE company_id = ${session.companyId}
      AND token_hash = ${session.tokenHash}
    LIMIT 1
  `;
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as { token_hash: string; expires_at: string | Date; revoked_at?: string | Date | null };
  if (row.revoked_at) return null;
  if (!safeEq(row.token_hash, session.tokenHash)) return null;
  const dbExp = new Date(row.expires_at);
  if (Number.isNaN(dbExp.getTime()) || dbExp.getTime() <= Date.now()) return null;
  return {
    companyId: session.companyId,
    tokenHash: session.tokenHash,
    expiresAt: dbExp.toISOString(),
  };
}

export function secretCookieOptions(expiresAtIso: string) {
  const expiresAt = new Date(expiresAtIso);
  const maxAge = Math.min(
    SHOP_SECRET_COOKIE_MAX_AGE_SECONDS,
    Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  );
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function getCompanyIdFromLoginCookie(): Promise<number | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("company")?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: number };
    const id = Number(parsed.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
