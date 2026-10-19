"use client";

import { ExternalLink } from "lucide-react";

/** Wall Studio 도면 웹앱. 환경변수 NEXT_PUBLIC_WALL_STUDIO_URL 로 덮어쓸 수 있음 */
const DEFAULT_WALL_STUDIO_URL = "https://wall-studio-kappa.vercel.app/";

function getWallStudioUrl(): string {
  const fromEnv =
    typeof process.env.NEXT_PUBLIC_WALL_STUDIO_URL === "string"
      ? process.env.NEXT_PUBLIC_WALL_STUDIO_URL.trim()
      : "";
  return fromEnv || DEFAULT_WALL_STUDIO_URL;
}

export default function WallStudioPage() {
  const url = getWallStudioUrl();

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[480px] flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 sm:px-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Wall Studio</h1>
          <p className="text-xs text-gray-500">도면 그리기 웹앱</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
        >
          <ExternalLink className="h-4 w-4" />
          새 창에서 열기
        </a>
      </div>
      <iframe
        title="Wall Studio"
        src={url}
        className="min-h-0 w-full flex-1 border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
