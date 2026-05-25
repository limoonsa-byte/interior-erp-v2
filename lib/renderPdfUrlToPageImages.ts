/** PDF URL → 페이지별 PNG data URL (계약서 보기·인쇄·이메일 공통) */
export async function renderPdfUrlToPageImages(pdfUrl: string): Promise<string[]> {
  if (!pdfUrl.trim() || typeof window === "undefined") return [];

  const pdfjsLib = await import("pdfjs-dist");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lib = pdfjsLib as any;
  if (lib.GlobalWorkerOptions) {
    lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version || "5.4.296"}/build/pdf.worker.min.mjs`;
  }

  const loadingTask = lib.getDocument({ url: pdfUrl });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const scale = 2;
  const images: string[] = [];

  for (let i = 1; i <= numPages; i++) {
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

  return images;
}

export function contractDocumentUrl(documentPath: string): string {
  return `/api/company/contract-document?path=${encodeURIComponent(documentPath)}`;
}

/** 계약 건 PDF → 없으면 관리(회사 양식)·마스터 양식까지 서버에서 조회하는 문서 API */
export function resolveContractBodyPdfUrl(contract: { id?: number; documentPath?: string }): string | null {
  if (contract.documentPath?.trim()) {
    return contractDocumentUrl(contract.documentPath.trim());
  }
  if (contract.id) {
    return `/api/contracts/document/${contract.id}`;
  }
  return null;
}
