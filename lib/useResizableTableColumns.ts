"use client";

import { useCallback, useEffect, useState } from "react";

export type ColumnWidthMap = Record<string, number>;

/** 테이블 칸 너비 — localStorage에 저장, 헤더 드래그로 조절 */
export function useResizableTableColumns(
  storageKey: string,
  defaults: ColumnWidthMap,
  minWidth = 48
) {
  const [widths, setWidths] = useState<ColumnWidthMap>(defaults);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ColumnWidthMap;
      if (parsed && typeof parsed === "object") {
        setWidths({ ...defaults, ...parsed });
      }
    } catch {
      /* ignore */
    }
    // defaults는 초기 1회만 — 저장값과 병합
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback(
    (next: ColumnWidthMap) => {
      setWidths(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const startResize = useCallback(
    (colId: string, startX: number) => {
      const startW = widths[colId] ?? defaults[colId] ?? minWidth;
      const onMove = (e: MouseEvent) => {
        const w = Math.max(minWidth, Math.round(startW + e.clientX - startX));
        setWidths((prev) => ({ ...prev, [colId]: w }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setWidths((prev) => {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(prev));
          } catch {
            /* ignore */
          }
          return prev;
        });
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [widths, defaults, minWidth, storageKey]
  );

  const resetWidths = useCallback(() => persist({ ...defaults }), [defaults, persist]);

  const tableMinWidth = Object.values(widths).reduce((s, w) => s + (Number(w) || 0), 0) + 40;

  return { widths, startResize, resetWidths, tableMinWidth };
}
