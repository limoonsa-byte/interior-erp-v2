"use client";

import type { ReactNode } from "react";
import { clsx } from "clsx";

type ResizableThProps = {
  colId: string;
  width: number;
  onResizeStart: (colId: string, startX: number) => void;
  className?: string;
  children: ReactNode;
  resizable?: boolean;
};

/** 헤더 오른쪽 끝 드래그로 열 너비 조절 */
export function ResizableTh({
  colId,
  width,
  onResizeStart,
  className,
  children,
  resizable = true,
}: ResizableThProps) {
  return (
    <th
      className={clsx("relative whitespace-nowrap p-2 sm:p-3", className)}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {children}
      {resizable ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label={`${colId} 열 너비 조절`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizeStart(colId, e.clientX);
          }}
          className="absolute right-0 top-0 z-10 h-full w-2 -mr-px cursor-col-resize touch-none hover:bg-blue-400/40 active:bg-blue-500/50"
          title="드래그해서 칸 너비 조절"
        />
      ) : null}
    </th>
  );
}
