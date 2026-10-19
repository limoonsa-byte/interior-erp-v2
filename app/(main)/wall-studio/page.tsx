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
    <div className="relative h-[calc(100dvh-3.5rem)] min-h-[480px] bg-white">
      <iframe
        title="Wall Studio"
        src={url}
        className="h-full w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="새 창에서 열기"
        className="absolute right-2 top-2 z-10 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900/80 px-2 text-xs font-medium text-white shadow-sm backdrop-blur hover:bg-slate-900"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        새 창
      </a>
    </div>
  );
}
