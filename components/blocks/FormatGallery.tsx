"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { MediaFrame } from "@/components/media/MediaFrame";
import { MediaOpen } from "@/components/media/MediaOpen";
import { Tabs } from "@/components/ui/Tabs";
import { kindOf, type MediaKind } from "@/lib/media-config";
import type { Shown } from "@/lib/playable";
import { inTab, TAB_LABEL, type GalleryTab } from "@/lib/gallery-tabs";

export type { GalleryTab };

type Layout = {
  kind: MediaKind;
  /** Columns on desktop, tablet (≤ 900px) and phone (≤ 560px). */
  cols: [number, number, number];
  sizes: string;
  /** Window variant: rows visible before "See more". */
  rows?: number;
  /** Fraction of the next row left showing (faded) under the window; default a 44px sliver. */
  peek?: number;
};

/**
 * Work in uniform grids, one tab per format, so a row never mixes ratios (lib/media-config).
 * Every card shows its title; photos open the lightbox, videos play in the card (shared player),
 * 360 tours load in the card. No horizontal scrolling. Two column sets:
 * - "page" (/work, Post-production): photos 2 per row, reels and AI avatars 3 (2 on phones, each
 *   card at most 78vh tall, the grid centred), long-form 2, 360 tours one large card per row.
 * - "window" (Property shoots): a symmetrical grid inside a fixed-height window showing two rows
 *   of photos or one row of reels, or one 360 tour and a half; "See more" scrolls inside it (and hands the wheel
 *   back to the page at either end); the page doesn't grow.
 * Tabs without items are hidden.
 */
const REEL_SIZES = "(max-width: 900px) 33vw, 360px";
const LAYOUTS: Record<"page" | "window", Record<GalleryTab, Layout>> = {
  page: {
    photo: { kind: "photo", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
    reel: { kind: "reel", cols: [3, 3, 2], sizes: REEL_SIZES },
    "ai-avatar": { kind: "reel", cols: [3, 3, 2], sizes: REEL_SIZES },
    "long-form": { kind: "long-form", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
    "360": { kind: "360", cols: [1, 1, 1], sizes: "(max-width: 1200px) 100vw, 1200px" },
  },
  window: {
    photo: { kind: "photo", cols: [2, 2, 2], sizes: "(max-width: 900px) 50vw, 33vw", rows: 2 },
    reel: { kind: "reel", cols: [3, 3, 2], sizes: REEL_SIZES, rows: 1 },
    "ai-avatar": { kind: "reel", cols: [3, 3, 2], sizes: REEL_SIZES, rows: 1 },
    "long-form": {
      kind: "long-form",
      cols: [2, 2, 1],
      sizes: "(max-width: 560px) 100vw, 50vw",
      rows: 2,
    },
    "360": {
      kind: "360",
      cols: [1, 1, 1],
      sizes: "(max-width: 1200px) 100vw, 1200px",
      rows: 1,
      peek: 0.5,
    },
  },
};

export function FormatGallery({
  items,
  tabs = ["photo", "reel", "long-form", "ai-avatar"],
  label = "Work by format",
  variant = "page",
}: {
  items: Shown[];
  tabs?: GalleryTab[];
  label?: string;
  variant?: "page" | "window";
}) {
  const uid = useId();
  const present = tabs.filter((t) => items.some((i) => inTab(t, i)));
  const [tab, setTab] = useState<GalleryTab>(present[0] ?? "photo");
  if (!present.length) return null;
  const shown = items.filter((i) => inTab(tab, i));
  const layout = LAYOUTS[variant][tab];
  const [c, ct, cp] = layout.cols;

  const grid = (
    <div
      className="fg-grid"
      data-tab={tab}
      style={{ "--c": c, "--ct": ct, "--cp": cp } as CSSProperties}
      role={present.length > 1 ? "tabpanel" : undefined}
      id={`${uid}-panel`}
      aria-labelledby={present.length > 1 ? `${uid}-tab-${tab}` : undefined}
    >
      {shown.map((m) => {
        const kind = kindOf(m);
        return (
          <figure key={m.id} data-kind={kind}>
            <MediaFrame
              media={m.media}
              kind={layout.kind}
              small
              corners={false}
              title={m.title}
              sizes={layout.sizes}
            >
              {m.play && <MediaOpen play={m.play} />}
            </MediaFrame>
            {m.instagramLink && (
              <a
                className="ig-link"
                href={m.instagramLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Instagram ↗
              </a>
            )}
          </figure>
        );
      })}
    </div>
  );

  return (
    <div className="fg">
      {present.length > 1 && (
        <Tabs
          label={label}
          idPrefix={uid}
          options={present.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
          value={tab}
          onChange={setTab}
        />
      )}
      {variant === "window" ? (
        <Window key={tab} rows={layout.rows ?? 2} peek={layout.peek}>
          {grid}
        </Window>
      ) : (
        grid
      )}
    </div>
  );
}

/**
 * A fixed-height window onto a grid: `rows` full rows and a faded sliver of the next. "See more"
 * turns on scrolling inside the window. Grids of that many rows or fewer show in full.
 */
function Window({
  rows,
  peek,
  children,
}: {
  rows: number;
  peek?: number;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [fade, setFade] = useState(44);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = box.current;
    const grid = el?.firstElementChild as HTMLElement | null;
    if (!el || !grid) return;
    const measure = () => {
      const cards = Array.from(grid.children) as HTMLElement[];
      const tops = [...new Set(cards.map((c) => c.offsetTop))].sort((a, b) => a - b);
      if (tops.length <= rows) return setHeight(null);
      const next = cards.find((c) => c.offsetTop === tops[rows])!;
      const sliver = peek ? next.offsetHeight * peek : Math.min(44, next.offsetHeight * 0.25);
      setFade(Math.round(sliver));
      setHeight(Math.round(tops[rows] - tops[0] + sliver));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [rows, peek]);

  const windowed = height !== null;
  return (
    <div className="fg-win-wrap">
      <div
        ref={box}
        className={windowed ? (more ? "fg-win more" : "fg-win") : undefined}
        style={windowed ? ({ height, "--fade": `${fade}px` } as CSSProperties) : undefined}
        tabIndex={windowed && more ? 0 : undefined}
      >
        {children}
      </div>
      {windowed && !more && (
        <button type="button" className="btn btn-g fg-more" onClick={() => setMore(true)}>
          See more
        </button>
      )}
    </div>
  );
}
