import { Extension, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

const MM = 96 / 25.4;

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: false,

  addOptions() {
    return { gapHeightMm: 30 };
  },

  addAttributes() {
    return {
      height: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-height-mm") ||
          `${this.options.gapHeightMm}`,
        renderHTML: (attrs) =>
          attrs.height ? { "data-height-mm": attrs.height } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },

  renderHTML({ node }) {
    const h = node.attrs.height || `${this.options.gapHeightMm}`;
    return [
      "div",
      {
        "data-page-break": "",
        "data-height-mm": h,
        style: `display:block;height:${h}mm;min-height:${h}mm;flex-shrink:0;pointer-events:none;box-sizing:border-box;`,
      },
    ];
  },
});

/**
 * 본문 높이를 측정해 자동으로 페이지 브레이크를 삽입/조정/제거.
 * pageContentHeightMm: 본문 인쇄 영역 높이 (297 - marginTop - marginBottom)
 * pageGapPx: 페이지 사이 시각적 간격 (px). 기본 20px.
 */
export const AutoPageBreak = Extension.create({
  name: "autoPageBreak",

  addOptions() {
    return {
      pageContentHeightMm: 267,
      pageGapMm: 8,
    };
  },

  addProseMirrorPlugins() {
    const cPx = this.options.pageContentHeightMm * MM;
    const gapPx = this.options.pageGapMm * MM;

    return [
      new Plugin({
        view(initView) {
          let raf: number | null = null;

          const schedule = (v: typeof initView) => {
            if (raf != null) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              raf = null;
              tick(v);
            });
          };

          const tick = (view: typeof initView) => {
            const { state } = view;
            const { doc, schema } = state;
            const pbT = schema.nodes.pageBreak;
            if (!pbT) return;

            const el = view.dom;
            if (!el?.children?.length) return;
            const base = el.getBoundingClientRect().top;

            const pagePx = cPx + gapPx;

            let pg = 0;
            let prevBot = 0;
            let dPos = 0;

            for (
              let i = 0, di = 0;
              i < doc.childCount && di < el.children.length;
              i++, di++
            ) {
              const nd = doc.child(i);
              const dm = el.children[di] as HTMLElement;
              const r = dm.getBoundingClientRect();
              const t = r.top - base;
              const b = r.bottom - base;

              if (nd.type.name === "pageBreak") {
                const wantEnd = pg * pagePx + cPx + gapPx;
                const wantH = Math.round((wantEnd - t) / MM);
                const curH = parseInt(nd.attrs.height || "30", 10);
                if (Math.abs(wantH - curH) > 2 && wantH > 0) {
                  view.dispatch(
                    state.tr.setNodeMarkup(dPos, undefined, {
                      height: String(wantH),
                    }),
                  );
                  return;
                }
                pg++;
                prevBot = b;
                dPos += nd.nodeSize;
                continue;
              }

              const pgEnd = pg * pagePx + cPx;
              if (b > pgEnd + 2 && t > pg * pagePx + 2) {
                const nxt = pg * pagePx + cPx + gapPx;
                const gap = Math.max(Math.round((nxt - prevBot) / MM), 3);
                view.dispatch(
                  state.tr.insert(dPos, pbT.create({ height: String(gap) })),
                );
                return;
              }

              prevBot = b;
              dPos += nd.nodeSize;
            }

            pg = 0;
            dPos = 0;
            for (
              let i = 0, di = 0;
              i < doc.childCount && di < el.children.length;
              i++, di++
            ) {
              const nd = doc.child(i);
              const dm = el.children[di] as HTMLElement;
              const r = dm.getBoundingClientRect();
              const t = r.top - base;

              if (nd.type.name === "pageBreak") {
                const pgStart = pg * pagePx;
                const used = t - pgStart;
                let nextH = 0;
                for (let j = i + 1; j < doc.childCount; j++) {
                  if (doc.child(j).type.name !== "pageBreak") {
                    const ndi = di + (j - i);
                    if (ndi < el.children.length)
                      nextH = (
                        el.children[ndi] as HTMLElement
                      ).getBoundingClientRect().height;
                    break;
                  }
                }
                if (used + nextH <= cPx + 2) {
                  view.dispatch(
                    state.tr.delete(dPos, dPos + nd.nodeSize),
                  );
                  return;
                }
                pg++;
                dPos += nd.nodeSize;
                continue;
              }
              dPos += nd.nodeSize;
            }
          };

          setTimeout(() => schedule(initView), 60);

          return {
            update(view, prev) {
              if (!view.state.doc.eq(prev.doc)) schedule(view);
            },
            destroy() {
              if (raf != null) cancelAnimationFrame(raf);
            },
          };
        },
      }),
    ];
  },
});
