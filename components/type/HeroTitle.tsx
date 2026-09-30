"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Hero title that is always exactly two lines (guide §4.3). Each line is nowrap; after fonts load
 * and on every resize the font size is set so the widest line fills the column:
 *   size = column / widestLineAt100px × 100 × 0.98, capped at min(124, 0.16 × vh + 40), min 34.
 * Before JS runs, CSS container units give a close approximation (`--ch` = longest line length).
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
      h.style.fontSize = "100px";
      let widest = 0;
      // Lines are display:block, so measure their content width, not the block's width
      // (otherwise a line shorter than the column reads as exactly the column width).
      h.querySelectorAll<HTMLElement>(".ln").forEach((l) => {
        l.style.width = "max-content";
        widest = Math.max(widest, l.getBoundingClientRect().width);
        l.style.width = "";
      });
      if (!widest) return;
      const cap = Math.min(124, window.innerHeight * 0.16 + 40);
      h.style.fontSize = `${Math.max(34, Math.min(cap, (100 * width * 0.98) / widest))}px`;
    };

    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  const chars = Math.max(textLength(line1), textLength(line2));

  return (
    <div className="fit" ref={wrap}>
      <h1 className="d h1 two" id={id} ref={h1} style={{ ["--ch" as string]: chars }}>
        <span className="ln">{line1}</span>
        <span className="ln">{line2}</span>
      </h1>
    </div>
  );
}

/** Character count of a line for the CSS fallback, including text inside a highlight span. */
function textLength(node: ReactNode): number {
  if (typeof node === "string" || typeof node === "number") return String(node).length;
  if (Array.isArray(node)) return node.reduce((n, c) => n + textLength(c), 0);
  if (node && typeof node === "object" && "props" in node) {
    return textLength((node.props as { children?: ReactNode }).children);
  }
  return 0;
}
