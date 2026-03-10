"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone, Copy, Check } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function AddToHomePage() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installResult, setInstallResult] = useState<"idle" | "success" | "dismissed" | "unsupported">("idle");
  const [installUrl, setInstallUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInstallUrl(typeof window !== "undefined" ? `${window.location.origin}/add-to-home` : "");
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // 브라우저가 설치 프롬프트를 안 주면(준비 중 계속) 2초 후 수동 방법 안내로 전환
  useEffect(() => {
    if (installed || deferredPrompt) return;
    const t = setTimeout(() => {
      setInstallResult((prev) => (prev === "idle" ? "unsupported" : prev));
    }, 2000);
    return () => clearTimeout(t);
  }, [installed, deferredPrompt]);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone) {
      setInstalled(true);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setInstallResult(outcome === "accepted" ? "success" : "dismissed");
      if (outcome === "accepted") setDeferredPrompt(null);
    } else {
      setInstallResult("unsupported");
    }
  };

  const copyUrl = () => {
    if (!installUrl) return;
    navigator.clipboard.writeText(installUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">바탕화면(홈 화면)에 추가</h1>
      <p className="text-sm text-gray-600 mb-4">
        앱처럼 사용하려면 <strong>아래 방법 중 하나</strong>로 설치하세요. 아래 주소를 공유하면 받는 사람도 같은 방법으로 설치할 수 있습니다.
      </p>

      {installed && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4 text-center text-green-800">
          <p className="font-medium">이미 앱으로 설치되어 있습니다.</p>
          <Link href="/consulting" className="mt-2 inline-block text-sm text-green-700 underline">메인으로 이동</Link>
        </div>
      )}

      {/* 1) 가장 쉬운 방법: 주소창 설치 아이콘 */}
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 mb-4">
        <h2 className="font-semibold text-emerald-900 mb-2">설치 방법 (권장)</h2>
        <p className="text-sm text-emerald-800 mb-2">
          <strong>PC (Chrome/Edge):</strong> 화면 오른쪽 위 <strong>주소창 옆 설치 아이콘(⊕)</strong>을 클릭 → &quot;설치&quot; 누르면 끝입니다.
        </p>
        <p className="text-sm text-emerald-800">
          <strong>모바일:</strong> 브라우저 메뉴(⋮) → &quot;앱 설치&quot; 또는 &quot;홈 화면에 추가&quot;
        </p>
      </div>

      {/* 2) 이 페이지에서 버튼으로 설치 시도 (브라우저가 허용할 때만) */}
      {!installed && (
        <div className="mb-4">
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 px-6 text-base font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={installResult === "idle" && !deferredPrompt}
          >
            <Smartphone className="h-5 w-5" />
            {deferredPrompt
              ? "여기서 설치하기 (바탕화면에 추가)"
              : installResult === "unsupported"
                ? "이 브라우저는 위 방법(주소창 ⊕)으로 설치하세요"
                : installResult === "idle"
                  ? "준비 중..."
                  : "다시 설치하기"}
          </button>
          {installResult === "success" && (
            <p className="mt-3 text-center text-sm text-green-600">설치 완료. 바탕화면 또는 앱 목록에서 실행하세요.</p>
          )}
          {installResult === "dismissed" && (
            <p className="mt-3 text-center text-sm text-gray-500">설치를 취소하셨습니다. 위 &quot;권장 방법&quot;으로 주소창 ⊕를 눌러도 됩니다.</p>
          )}
        </div>
      )}

      {/* 설치 URL 공유 */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-4 mb-6">
        <p className="text-xs font-medium text-blue-800 mb-2">공유용 주소 (이 주소를 보내면 받는 사람이 열어서 위 방법으로 설치 가능)</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            readOnly
            value={installUrl}
            className="flex-1 min-w-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-gray-900"
          />
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "복사됨" : "복사"}
          </button>
        </div>
      </div>

      {/* 상세 수동 방법 */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <h2 className="font-semibold text-gray-900 mb-3">상세 설치 방법</h2>
        <ul className="space-y-2 list-disc list-inside">
          <li><strong>PC (Chrome/Edge):</strong> 주소창 오른쪽 설치 아이콘(⊕) 또는 메뉴(⋮) → &quot;앱 설치&quot;</li>
          <li><strong>Android (Chrome):</strong> 메뉴(⋮) → &quot;홈 화면에 추가&quot; 또는 &quot;앱 설치&quot;</li>
          <li><strong>iPhone/iPad (Safari):</strong> 하단 공유 버튼 → &quot;홈 화면에 추가&quot;</li>
        </ul>
      </div>

      <div className="mt-6">
        <Link href="/consulting" className="text-sm text-gray-500 hover:text-gray-700 underline">
          ← 메인으로
        </Link>
      </div>
    </div>
  );
}
