"use client";

import React, { useEffect, useState } from "react";

const A4_WIDTH_PX = 595;

type PdfToA4ImagesProps = {
  /** 계약 문서 path (예: contracts/master-template.pdf) — documentUrl 없을 때 사용 */
  documentPath?: string;
  /** PDF 직접 URL (서명 링크 등) — 있으면 이걸 사용하고 documentPath 무시 */
  documentUrl?: string;
  className?: string;
  /** true이면 maxWidth 제한 없이 컨테이너 폭 전체 사용 */
  fullWidth?: boolean;
  /** 이미지 로드 완료 시 호출 (미리보기/인쇄에서 재사용) */
  onPagesLoaded?: (dataUrls: string[]) => void;
  /** PDF 로드 실패 시 호출 (서명 페이지에서 HTML 본문 폴백용) */
  onError?: () => void;
  /** 각 페이지 이미지를 감쌀 div에 붙일 클래스 (서명 화면에서 A4 여백용) */
  pageWrapperClassName?: string;
};

export function PdfToA4Images({ documentPath = "", documentUrl, className = "", fullWidth = false, onPagesLoaded, onError, pageWrapperClassName }: PdfToA4ImagesProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveUrl = documentUrl || (documentPath.trim() ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/company/contract-document?path=${encodeURIComponent(documentPath)}` : "");

  useEffect(() => {
    if (!effectiveUrl || typeof window === "undefined") {
      setPageImages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lib = pdfjsLib as any;
        if (typeof window !== "undefined" && lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version || "5.4.296"}/build/pdf.worker.min.mjs`;
        }
        const loadingTask = lib.getDocument({ url: effectiveUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        const numPages = pdf.numPages;
        const scale = 2;
        const images: string[] = [];
        for (let i = 1; i <= numPages; i++) {
          if (cancelled) break;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          const renderTask = page.render({ canvasContext: ctx, viewport });
          await (renderTask.promise || Promise.resolve());
          images.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPageImages(images);
        if (!cancelled && onPagesLoaded && images.length > 0) onPagesLoaded(images);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          const is404 = msg.includes("404") || /retrieving PDF/i.test(msg);
          const isNetworkError = /failed to fetch|network|load/i.test(msg) || msg === "Failed to fetch";
          setError(is404 || isNetworkError
            ? "2페이지 이후 PDF가 아직 없습니다. 본문은 작성자가 계약서를 저장할 때 자동으로 PDF로 넣습니다. 계약 작성자에게 '계약서 저장 한 번 더 해 주세요'라고 요청하시거나, 위 요약을 확인하고 서명할 수 있습니다."
            : msg || "PDF 로드 실패");
          onError?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUrl]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-12 text-gray-500 ${className}`}>
        PDF를 이미지로 변환 중…
      </div>
    );
  }
  if (error) {
    return (
      <div className={`rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 ${className}`}>
        {error}
      </div>
    );
  }
  if (pageImages.length === 0) {
    return null;
  }

  const content = pageImages.map((dataUrl, i) => {
    const img = (
      <img
        key={i}
        src={dataUrl}
        alt={`계약 문서 ${i + 1}페이지`}
        className="w-full border border-gray-200 bg-white shadow-sm"
        style={fullWidth ? undefined : { maxWidth: A4_WIDTH_PX }}
      />
    );
    if (pageWrapperClassName) {
      return (
        <div key={i} className={pageWrapperClassName}>
          {img}
        </div>
      );
    }
    return img;
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {content}
    </div>
  );
}
