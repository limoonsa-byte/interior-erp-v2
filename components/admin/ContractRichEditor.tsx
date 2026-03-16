"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style/text-style";
import FontSize from "@tiptap/extension-text-style/font-size";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { PageBreak, AutoPageBreak } from "./ContractRichEditorPageBreak";

const FONT_SIZES = [
  { label: "9pt", value: "9pt" },
  { label: "10pt", value: "10pt" },
  { label: "12pt", value: "12pt" },
  { label: "14pt", value: "14pt" },
  { label: "18pt", value: "18pt" },
];

export function ContractRichEditor({
  value,
  onChange,
  placeholder = "계약 조건, 시공 범위 등 본문 내용을 입력하세요.",
  minHeight = "200px",
  contentWrapper,
  pageContentHeightMm,
  pageGapMm,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  /**
   * 본문만 감쌀 경우 (content) => ReactNode.
   * 툴바를 2번째 위치 등 별도 배치하려면 (toolbar, content) => ReactNode 로 두 인자를 받으세요.
   */
  contentWrapper?: ((content: React.ReactNode) => React.ReactNode) | ((toolbar: React.ReactNode, content: React.ReactNode) => React.ReactNode);
  /** A4 페이지 자동 바꿈 사용 시 본문 영역 높이(mm). contentWrapper 사용 시 기본 267. */
  pageContentHeightMm?: number;
  /** 페이지 간 간격(상하 여백 합, mm). 기본 30. */
  pageGapMm?: number;
}) {
  const autoPageBreak = typeof contentWrapper !== "undefined";
  const pageContentMm = pageContentHeightMm ?? 267;
  const pageGapMmVal = pageGapMm ?? 30;

  const extensions = useMemo(
    () => [
      StarterKit,
      TextStyle,
      FontSize,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      PageBreak.configure({ gapHeightMm: pageGapMmVal }),
      ...(autoPageBreak ? [AutoPageBreak.configure({ pageContentHeightMm: pageContentMm, pageGapMm: pageGapMmVal })] : []),
    ],
    [autoPageBreak, pageContentMm, pageGapMmVal]
  );

  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const [, setTick] = useState(0);
  const editor = useEditor({
    extensions,
    content: value || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[200px] px-3 py-2 focus:outline-none",
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => setTick((t) => t + 1);
    editor.on("transaction", onUpdate);
    editor.on("selectionUpdate", onUpdate);
    return () => {
      editor.off("transaction", onUpdate);
      editor.off("selectionUpdate", onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value || "<p></p>";
    if (next !== current && (value === "" || (value.trim().length > 0 && value.startsWith("<")))) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500" style={{ minHeight }}>
        로딩 중…
      </div>
    );
  }

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5 shadow-sm">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        className={`rounded px-2 py-1 text-sm font-medium ${editor?.isActive("bold") ? "bg-gray-300" : "hover:bg-gray-200"}`}
        title="굵게"
      >
        B
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        className={`rounded px-2 py-1 text-sm ${editor?.isActive("italic") ? "bg-gray-300 italic" : "hover:bg-gray-200"}`}
        title="기울임"
      >
        I
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        className={`rounded px-2 py-1 text-sm underline ${editor?.isActive("underline") ? "bg-gray-300" : "hover:bg-gray-200"}`}
        title="밑줄"
      >
        U
      </button>
      <span className="mx-1 text-gray-300">|</span>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${editor?.isActive({ textAlign: "left" }) ? "bg-gray-300" : "hover:bg-gray-200"}`}
        title="왼쪽 정렬"
      >
        <AlignLeft className="h-4 w-4" />
        <span>왼쪽</span>
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (editor?.isActive({ textAlign: "center" })) {
            editor?.chain().focus().setTextAlign("left").run();
          } else {
            editor?.chain().focus().setTextAlign("center").run();
          }
        }}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${editor?.isActive({ textAlign: "center" }) ? "bg-gray-300" : "hover:bg-gray-200"}`}
        title="가운데 정렬"
      >
        <AlignCenter className="h-4 w-4" />
        <span>가운데</span>
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (editor?.isActive({ textAlign: "right" })) {
            editor?.chain().focus().setTextAlign("left").run();
          } else {
            editor?.chain().focus().setTextAlign("right").run();
          }
        }}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${editor?.isActive({ textAlign: "right" }) ? "bg-gray-300" : "hover:bg-gray-200"}`}
        title="오른쪽 정렬"
      >
        <AlignRight className="h-4 w-4" />
        <span>오른쪽</span>
      </button>
      <span className="mx-1 text-gray-300">|</span>
      <select
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
        title="글자 크기"
        value=""
        onMouseDown={() => {
          if (editor) {
            const { from, to } = editor.state.selection;
            savedSelectionRef.current = { from, to };
          }
        }}
        onChange={(e) => {
          const v = e.target.value;
          if (v && editor) {
            const saved = savedSelectionRef.current;
            if (saved) {
              editor.chain().focus().setTextSelection(saved).setFontSize(v).run();
              savedSelectionRef.current = null;
            } else {
              editor.chain().focus().setFontSize(v).run();
            }
          }
          e.target.value = "";
        }}
      >
        <option value="">글자 크기</option>
        {FONT_SIZES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );

  const content = (
    <div
      className="contract-rich-editor-content min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      style={{ minHeight }}
    >
      <EditorContent editor={editor} />
    </div>
  );

  if (contentWrapper) {
    if (contentWrapper.length >= 2) {
      return <>{contentWrapper(toolbar, content)}</>;
    }
    const wrapContent = contentWrapper as (content: React.ReactNode) => React.ReactNode;
    return (
      <>
        {toolbar}
        {wrapContent(content)}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-300 bg-white">
      {toolbar}
      {content}
    </div>
  );
}
