/**
 * 서버에서 자기 자신(앱)의 URL을 fetch할 때 사용.
 * VERCEL_URL에는 프로토콜이 없으므로 https:// 를 붙임.
 */
export function getAppBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
  const s = String(u).replace(/\/+$/, "");
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://${s}`;
}
