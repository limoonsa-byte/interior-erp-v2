"use client";

import React, { useEffect, useRef } from "react";

/** 계약서 본문 HTML을 A4 뷰로 표시 (PDF 없을 때 / PDF 로드 실패 시 폴백) */
export function SignBodyA4Viewer({
  bodyHtml,
  margins,
}: {
  bodyHtml: string;
  margins: { top: number; right: number; bottom: number; left: number };
}) {
  const mT = margins.top,
    mR = margins.right,
    mB = margins.bottom,
    mL = margins.left;
  const cleanHtml = bodyHtml.replace(/<div[^>]*data-page-break[^>]*>[\s\S]*?<\/div>/gi, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewerRef.current;
    const wrap = containerRef.current;
    if (!el || !wrap || !cleanHtml.trim()) {
      if (el) el.innerHTML = "";
      return;
    }
    el.innerHTML = cleanHtml;
    const MM_PX = 96 / 25.4;
    const contentHPx = (297 - mT - mB) * MM_PX;
    const gapPx = (mB + 8 + mT) * MM_PX;
    let spacerCount = 0;
    for (let iter = 0; iter < 100; iter++) {
      let inserted = false;
      const base = el.getBoundingClientRect().top;
      let page = 0;
      const kids = Array.from(el.children) as HTMLElement[];
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.dataset && kid.dataset.pageSpacer) {
          page++;
          continue;
        }
        const elRect = kid.getBoundingClientRect();
        const elBottom = elRect.bottom - base;
        const pageBoundary = (page + 1) * contentHPx + page * gapPx;
        if (elBottom > pageBoundary + 1) {
          const spacer = document.createElement("div");
          spacer.dataset.pageSpacer = "1";
          const elTop = elRect.top - base;
          const spacerH = pageBoundary + gapPx - elTop;
          if (spacerH > 0) {
            spacer.style.cssText = `height:${spacerH}px;flex-shrink:0;pointer-events:none;`;
          }
          el.insertBefore(spacer, kid);
          spacerCount++;
          inserted = true;
          break;
        }
      }
      if (!inserted) break;
    }
    const totalPages = spacerCount + 1;
    const totalH = totalPages * 297 + (totalPages - 1) * 8;
    wrap.style.height = `${totalH}mm`;
  }, [cleanHtml, mT, mR, mB, mL]);

  const gap = 8,
    c = 4,
    sc = "#c0c0c0";
  const rH = 297 + gap;
  const mkP = (d: string) => `<path d='${d}' fill='none' stroke='${sc}' stroke-width='0.3'/>`;
  const svg = [
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 210 ${rH}'>`,
    `<rect x='0' y='0' width='210' height='297' fill='#fff'/>`,
    `<rect x='0' y='297' width='210' height='${gap}' fill='#e8e8e8'/>`,
    mkP(`M ${mL - c} ${mT} L ${mL} ${mT} L ${mL} ${mT - c}`),
    mkP(`M ${210 - mR + c} ${mT} L ${210 - mR} ${mT} L ${210 - mR} ${mT - c}`),
    mkP(`M ${mL - c} ${297 - mB} L ${mL} ${297 - mB} L ${mL} ${297 - mB + c}`),
    mkP(`M ${210 - mR + c} ${297 - mB} L ${210 - mR} ${297 - mB} L ${210 - mR} ${297 - mB + c}`),
    `</svg>`,
  ].join("");
  const bgUrl = `url("data:image/svg+xml,${svg.replace(/#/g, "%23")}")`;

  return (
    <div
      ref={containerRef}
      className="contract-a4-paper-sheet mx-auto"
      style={{
        width: "100%",
        maxWidth: "210mm",
        minHeight: "297mm",
        padding: `${mT}mm ${mR}mm ${mB}mm ${mL}mm`,
        boxSizing: "border-box",
        backgroundImage: bgUrl,
        backgroundSize: `100% ${rH}mm`,
        backgroundRepeat: "repeat-y",
        backgroundPosition: "0 0",
      }}
    >
      <div ref={viewerRef} className="text-gray-900 prose prose-sm max-w-none" />
    </div>
  );
}
