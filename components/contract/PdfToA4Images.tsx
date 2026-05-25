"use client";

import React, { useEffect, useState } from "react";
import { renderPdfUrlToPageImages } from "@/lib/renderPdfUrlToPageImages";
import { sameOriginApiUrl } from "@/lib/sameOriginUrl";

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

  const effectiveUrl =
    (documentUrl ? sameOriginApiUrl(documentUrl) : "") ||
    (documentPath.trim() ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/company/contract-document?path=${encodeURIComponent(documentPath)}` : "");

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
        const images = await renderPdfUrlToPageImages(effectiveUrl);
        if (cancelled) return;
        if (!cancelled) setPageImages(images);
        if (!cancelled && onPagesLoaded && images.length > 0) onPagesLoaded(images);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          const is404 = msg.includes("404") || /Missing PDF|404|retrieving PDF/i.test(msg);
          const isNetworkError = /failed to fetch|network|load/i.test(msg) || msg === "Failed to fetch";
          if (is404) {
            setError(
              "2페이지 이후 본문 PDF가 서버에 없습니다. 작성자가 계약서를 저장해 본문이 반영됐는지, 또는 관리 화면에 계약서 양식 PDF가 등록돼 있는지 확인해 주세요. 위 요약만으로도 서명은 가능합니다."
            );
          } else if (isNetworkError) {
            setError(
              "본문 PDF를 불러오지 못했습니다(네트워크 또는 주소 불일치). 페이지를 새로고침하거나, 잠시 후 «새 창에서 보기»로 직접 열어 보세요. 계속되면 브라우저 콘솔·네트워크 탭의 오류 내용을 개발자에게 전달해 주세요."
            );
          } else {
            setError(msg || "PDF 로드 실패");
          }
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
        className="contract-print-doc-img w-full border border-gray-200 bg-white shadow-sm"
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
