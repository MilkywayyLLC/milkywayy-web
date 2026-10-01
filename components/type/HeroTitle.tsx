"use client";

import { isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";
import { Hl } from "@/components/ui/Section";
import { LIGHT_HL_PAD_EM, lineEm } from "@/lib/heroFit";

/**
 * Hero title that is always exactly two lines (guide §4.3). Each line is nowrap and the font size
 * is set so the widest line fills the column:
 *   size = column / widestLineAt100px × 100 × 0.98, capped at min(124, 0.16 × vh + 40), min 34.
 * The server computes each line's width from Archivo's glyph widths (lib/heroFit) and passes it to
 * CSS as --em-d / --em-l, so the first paint is already fitted. After fonts load, the client
 * measures the real lines and corrects any small error, and keeps fitting on resize.
 */
export function HeroTitle({
  line1,
  line2,
  id,
}: {
  line1: ReactNode;
  line2: ReactNode;
  id?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const h1 = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const box = wrap.current;
    const h = h1.current;
    if (!box || !h) return;

    const fit = () => {
      const width = box.clientWidth;
      if (!width) return;
      const lines = h.querySelectorAll<HTMLElement>(".ln");
      // Measure at 100px; lines are display:block, so measure their content (max-content) width.
      h.style.fontSize = "100px";
      let widest = 0;
      lines.forEach((l) => {
        l.style.width = "max-content";
        widest = Math.max(widest, l.getBoundingClientRect().width);
        l.style.width = "";
      });
      if (!widest) {
        h.style.fontSize = "";
        return;
      }
      const cap = Math.min(124, window.innerHeight * 0.16 + 40);
      h.style.fontSize = `${Math.max(34, Math.min(cap, (100 * width * 0.98) / widest))}px`;
    };

    // Refit only when the width changes, on the next frame. Resizing the title changes the
    // wrapper's height, and refitting inside that same observer callback makes Safari report a
    // "ResizeObserver loop" error.
    let lastWidth = -1;
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (box.clientWidth === lastWidth) return;
        lastWidth = box.clientWidth;
        fit();
      });
    };
    document.fonts?.ready.then(() => {
      lastWidth = box.clientWidth;
      fit();
    });
    const ro = new ResizeObserver(onResize);
    ro.observe(box);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const d = Math.max(widthEm(line1, 0), widthEm(line2, 0));
  const l = Math.max(widthEm(line1, LIGHT_HL_PAD_EM), widthEm(line2, LIGHT_HL_PAD_EM));

  return (
    <div className="fit" ref={wrap}>
      <h1
        className="d h1 two"
        id={id}
        ref={h1}
        style={{ ["--em-d" as string]: d.toFixed(3), ["--em-l" as string]: l.toFixed(3) }}
      >
        <span className="ln">{line1}</span>
        <span className="ln">{line2}</span>
      </h1>
    </div>
  );
}

/** Estimated width in em of a line, adding `hlPad` for each highlighted segment. */
function widthEm(node: ReactNode, hlPad: number): number {
  if (typeof node === "string" || typeof node === "number") return lineEm(String(node));
  if (Array.isArray(node))
    return node.reduce((n: number, c: ReactNode) => n + widthEm(c, hlPad), 0);
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; className?: string };
    const inner = widthEm(props.children, hlPad);
    // From a server component, <Hl> arrives already rendered as <span className="hl">.
    const isHl = node.type === Hl || props.className?.split(" ").includes("hl");
    return isHl ? inner + hlPad : inner;
  }
  return 0;
}
