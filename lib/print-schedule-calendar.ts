/**
 * 일정 캘린더 인쇄: 별도 iframe 문서에서만 출력.
 * 같은 창에서 visibility/absolute로 숨기면 Chrome이 페이지마다 동일 블록을 반복하는 경우가 있음.
 */
export function printScheduleCalendarContent(element: HTMLElement | null): void {
  if (!element) return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "aria-hidden",
    "true"
  );
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1";

  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write("<!DOCTYPE html><html><head><meta charset='utf-8'>");

  const base = doc.createElement("base");
  base.href = `${window.location.origin}/`;
  doc.head.appendChild(base);

  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    const el = node as HTMLLinkElement;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = el.href;
    doc.head.appendChild(link);
  });
  document.head.querySelectorAll("style").forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });

  const pageStyle = doc.createElement("style");
  pageStyle.textContent = `
    @page { size: A4 landscape !important; margin: 5mm !important; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff !important;
      height: 100%;
      box-sizing: border-box;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  `;
  doc.head.appendChild(pageStyle);

  doc.write("</head><body></body></html>");
  doc.close();

  doc.body.appendChild(doc.importNode(element, true));

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    try {
      win.focus();
      win.print();
    } finally {
      win.addEventListener("afterprint", () => iframe.remove(), { once: true });
      setTimeout(() => iframe.remove(), 90_000);
    }
  };

  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
  if (links.length === 0) {
    setTimeout(finish, 200);
    return;
  }

  let pending = links.length;
  const tick = () => {
    pending--;
    if (pending <= 0) setTimeout(finish, 300);
  };
  links.forEach((link) => {
    try {
      if (link.sheet && link.sheet.cssRules.length >= 0) {
        tick();
        return;
      }
    } catch {
      /* cross-origin */
    }
    link.addEventListener("load", tick, { once: true });
    link.addEventListener("error", tick, { once: true });
  });
  setTimeout(() => {
    if (!done) finish();
  }, 2500);
}
