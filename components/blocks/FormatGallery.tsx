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
};

/**
 * Work in uniform grids, one tab per format, so a row never mixes ratios (lib/media-config).
 * Every card shows its title; photos open the lightbox, videos play in the card (shared player),
 * 360 tours load in the card. No horizontal scrolling. Two column sets:
 * - "page" (/work, Post-production): photos 2 per row, reels and AI avatars 4 (2 on phones),
 *   long-form 2, 360 tours one large card per row.
 * - "window" (Property shoots): a symmetrical grid inside a fixed-height window showing two rows
 *   and the third half-faded, with "See more" to scroll inside it; the page doesn't grow.
 * Tabs without items are hidden.
 */
const LAYOUTS: Record<"page" | "window", Record<GalleryTab, Layout>> = {
  page: {
    photo: { kind: "photo", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
    reel: { kind: "reel", cols: [4, 3, 2], sizes: "(max-width: 900px) 33vw, 280px" },
    "ai-avatar": { kind: "reel", cols: [4, 3, 2], sizes: "(max-width: 900px) 33vw, 280px" },
    "long-form": { kind: "long-form", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
    "360": { kind: "360", cols: [1, 1, 1], sizes: "(max-width: 1200px) 100vw, 1200px" },
  },
  window: {
    photo: { kind: "photo", cols: [3, 2, 1], sizes: "(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw" },
    reel: { kind: "reel", cols: [4, 3, 2], sizes: "(max-width: 900px) 33vw, 280px" },
    "ai-avatar": { kind: "reel", cols: [4, 3, 2], sizes: "(max-width: 900px) 33vw, 280px" },
    "long-form": { kind: "long-form", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
    "360": { kind: "360", cols: [2, 2, 1], sizes: "(max-width: 560px) 100vw, 50vw" },
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
      {variant === "window" ? <Window key={tab}>{grid}</Window> : grid}
    </div>
  );
}

/**
 * A fixed-height window onto a grid: two full rows plus half of the third, faded out. "See more"
 * turns on scrolling inside the window. Grids of two rows or fewer show in full.
 */
function Window({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = box.current;
    const grid = el?.firstElementChild as HTMLElement | null;
    if (!el || !grid) return;
    const measure = () => {
      const cards = Array.from(grid.children) as HTMLElement[];
      const tops = [...new Set(cards.map((c) => c.offsetTop))].sort((a, b) => a - b);
      if (tops.length <= 2) return setHeight(null);
      const third = cards.find((c) => c.offsetTop === tops[2])!;
      setHeight(Math.round(tops[2] - tops[0] + third.offsetHeight * 0.5));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, []);

  const windowed = height !== null;
  return (
    <div className="fg-win-wrap">
      <div
        ref={box}
        className={windowed ? (more ? "fg-win more" : "fg-win") : undefined}
        style={windowed ? { height } : undefined}
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
