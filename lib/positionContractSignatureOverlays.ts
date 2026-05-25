/**
 * 계약서 1페이지 서명 이미지를 (인) 칸 중앙에 맞춤.
 * 화면 보기·인쇄 복제본 모두 동일 로직 사용 (인쇄 시 폭이 달라져 px 좌표가 어긋나는 문제 방지).
 */
export function positionContractSignatureOverlays(container: HTMLElement) {
  const overlays = Array.from(
    container.querySelectorAll<HTMLImageElement>(".contract-print-signature-overlay")
  );
  if (!overlays.length) return;

  const containerRect = container.getBoundingClientRect();
  const sig1 = overlays[0];
  const sig2 = overlays[1];

  const tableInCells = container.querySelectorAll<HTMLElement>(
    "table.contract-print-main-tbl .contract-print-in"
  );
  const clientBottomIn = container.querySelector<HTMLElement>(
    ".contract-print-signatures .contract-print-sig-block:first-child .contract-print-in-fixed"
  );

  const place = (img: HTMLImageElement | undefined, target: HTMLElement | null) => {
    if (!img || !target) return;
    const tr = target.getBoundingClientRect();
    const cx = tr.left + tr.width / 2 - containerRect.left;
    const cy = tr.top + tr.height / 2 - containerRect.top;
    img.style.position = "absolute";
    img.style.left = `${cx}px`;
    img.style.top = `${cy}px`;
    img.style.transform = "translate(-50%, -50%)";
    img.style.display = "block";
  };

  if (tableInCells.length > 0) place(sig1, tableInCells[0]);
  if (clientBottomIn) place(sig2 ?? sig1, clientBottomIn);
}
