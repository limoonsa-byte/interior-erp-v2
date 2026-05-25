import { renderPdfUrlToPageImages, resolveContractBodyPdfUrl } from "@/lib/renderPdfUrlToPageImages";
import { sameOriginApiUrl } from "@/lib/sameOriginUrl";
import { positionContractSignatureOverlays } from "@/lib/positionContractSignatureOverlays";

export type ContractPrintPayload = {
  page1Image: string;
  docImages: string[];
  bodyHtmlSection: string;
};

function scrapeDocImagesFromDom(): string[] {
  const wrapper = document.querySelector(".contract-print-same-as-view .contract-print-doc-pages-wrapper");
  if (!wrapper) return [];
  const out: string[] = [];
  wrapper.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (img.src?.startsWith("data:") && !img.classList.contains("contract-print-signature-overlay")) {
      out.push(img.src);
    }
  });
  return out;
}

export function formatContractDocImagesPrintHtml(docImages: string[]): string {
  return buildBodyHtmlSection(docImages, null);
}

function buildBodyHtmlSection(docImages: string[], bodyWrapper: Element | null): string {
  if (docImages.length > 0) {
    return `<div class="contract-print-doc-pages-wrapper">${docImages
      .map(
        (src, i) =>
          `<img src="${src}" alt="계약 본문 ${i + 1}페이지" class="contract-print-doc-img w-full" />`
      )
      .join("")}</div>`;
  }
  if (bodyWrapper) {
    const cloned = bodyWrapper.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll(".text-xs.text-gray-500, .text-red-700").forEach((el) => el.remove());
    if (cloned.innerHTML.trim()) {
      return `<div class="contract-print-doc-pages-wrapper contract-print-body-html-wrap">${cloned.innerHTML}</div>`;
    }
  }
  return "";
}

/** 계약서 보기와 동일한 1페이지 캡처 + 본문(PDF/HTML) 수집 */
export async function buildContractViewPrintPayload(
  contract: { id?: number; documentPath?: string },
  options: {
    summaryEl: HTMLDivElement | null;
    capturePage1: (el: HTMLDivElement) => Promise<string>;
    cachedDocImages: string[];
    waitForPdfMs?: number;
  }
): Promise<ContractPrintPayload> {
  const { summaryEl, capturePage1, cachedDocImages, waitForPdfMs = 2500 } = options;

  if (summaryEl) {
    positionContractSignatureOverlays(summaryEl);
    await Promise.all(
      Array.from(summaryEl.querySelectorAll("img")).map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 4000);
              })
      )
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  let page1Image = "";
  if (summaryEl) {
    try {
      page1Image = await capturePage1(summaryEl);
    } catch (e) {
      console.warn("1페이지 캡처 실패:", e);
    }
  }

  let docImages = [...cachedDocImages];
  if (docImages.length === 0) {
    docImages = scrapeDocImagesFromDom();
  }
  const pdfUrl = resolveContractBodyPdfUrl(contract);
  if (docImages.length === 0 && pdfUrl) {
    await new Promise((r) => setTimeout(r, waitForPdfMs));
    docImages = scrapeDocImagesFromDom();
  }
  if (docImages.length === 0 && pdfUrl) {
    try {
      docImages = await renderPdfUrlToPageImages(sameOriginApiUrl(pdfUrl));
    } catch (e) {
      console.warn("본문 PDF 직접 렌더 실패:", e);
    }
  }

  const bodyWrapper = document.querySelector(
    ".contract-print-same-as-view .contract-print-doc-pages-wrapper"
  );
  const bodyHtmlSection = buildBodyHtmlSection(docImages, bodyWrapper);

  return { page1Image, docImages, bodyHtmlSection };
}

export function mountContractPrintRoot(payload: ContractPrintPayload, summaryFallback: HTMLElement | null): void {
  const existing = document.getElementById("contract-print-pages");
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = "contract-print-pages";
  root.className = "contract-print-pages-root";
  const printParts: string[] = [];
  if (payload.page1Image) {
    printParts.push(
      `<div class="contract-print-view-page1-capture"><img src="${payload.page1Image}" alt="계약서 1페이지" class="contract-print-doc-img" style="width:100%;max-width:210mm;margin:0 auto;display:block" /></div>`
    );
  }
  if (payload.bodyHtmlSection) printParts.push(payload.bodyHtmlSection);
  if (printParts.length > 0) {
    root.innerHTML = printParts.join("");
  } else if (summaryFallback) {
    root.appendChild(summaryFallback.cloneNode(true));
  }

  document.body.appendChild(root);
}

export function runContractPrintDialog(title: string): void {
  document.body.classList.add("contract-print-pages-mode");
  const prevTitle = document.title;
  document.title = `${title.replace(/[/\\:*?"<>|]/g, " ").trim() || "계약서"}`;
  window.print();
  const cleanup = () => {
    document.title = prevTitle;
    document.body.classList.remove("contract-print-pages-mode");
    const el = document.getElementById("contract-print-pages");
    if (el) el.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 2000);
}
