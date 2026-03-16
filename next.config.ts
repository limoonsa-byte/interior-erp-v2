import type { NextConfig } from "next";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Turbopack이 next-auth를 next/auth로 잘못 해석하는 것 방지
      "next/auth": "next-auth",
    },
  },
  serverExternalPackages: ["@pdf-lib/fontkit", "pdfkit", "next-auth"],
  outputFileTracingIncludes: {
    "/api/**": ["./fonts/**"],
  },
  experimental: {
    // 자재리스트 등 base64 이미지 저장 시 요청 크기 증가 허용 (기본 1MB → 10MB)
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default withPWA(nextConfig);
