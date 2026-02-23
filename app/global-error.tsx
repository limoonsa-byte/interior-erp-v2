"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f9fafb" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              maxWidth: 400,
              padding: 24,
              background: "white",
              borderRadius: 16,
              border: "1px solid #fecaca",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#991b1b" }}>
              오류가 발생했습니다
            </h2>
            <p style={{ marginTop: 8, fontSize: 14, color: "#4b5563" }}>
              앱을 불러오는 중 문제가 생겼습니다. 다시 시도하거나 브라우저를 새로고침해 주세요.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "white",
                background: "#1e293b",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
