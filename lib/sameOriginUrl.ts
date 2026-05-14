/**
 * 서버가 NEXT_PUBLIC_APP_URL 등으로 만든 절대 URL이 브라우저 탭(localhost 등)과 오리진이 다르면
 * pdf.js / fetch 가 CORS·실패로 끝남. API 경로만 남겨 현재 탭 기준으로 요청하게 맞춘다.
 */
export function sameOriginApiUrl(url: string): string {
  if (typeof window === "undefined" || !url.trim()) return url;
  try {
    const u = new URL(url, window.location.href);
    if (u.origin !== window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    return u.href;
  } catch {
    return url;
  }
}
