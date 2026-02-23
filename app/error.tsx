"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-800">오류가 발생했습니다</h2>
        <p className="mt-2 text-sm text-gray-600">
          페이지를 불러오는 중 문제가 생겼습니다. 아래 버튼으로 다시 시도하거나, 브라우저를 새로고침해 주세요.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 w-full rounded-lg bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900"
        >
          다시 시도
        </button>
        <p className="mt-4 text-xs text-gray-400">
          계속되면 Vercel 대시보드에서 NEXTAUTH_URL 환경 변수가 배포 주소로 설정되어 있는지 확인한 뒤 재배포해 주세요.
        </p>
      </div>
    </div>
  );
}
