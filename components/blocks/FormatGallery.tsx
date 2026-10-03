"use client";

import { useId, useState } from "react";
import type { PortfolioFormat, PortfolioItem } from "@/content/types";
import { LiteVideo } from "@/components/media/LiteVideo";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { Tabs } from "@/components/ui/Tabs";

/**
 * Mixed work in uniform grids (site-refine, 3 Oct 2026): one tab per format, so a row never mixes
 * ratios. Photos: 3 columns at 3:2. Reels: a sideways strip at 9:16. Long-form and 360: 2 columns
 * at 16:9. AI avatars: their own tab, laid out by their format. Tabs without items are hidden.
 */
export type GalleryTab = "photo" | "reel" | "long-form" | "360" | "ai-avatar";

const LABEL: Record<GalleryTab, string> = {
  photo: "Photos",
  reel: "Reels",
  "long-form": "Long-form",
  "360": "360° tours",
  "ai-avatar": "AI avatars",
};

const inTab = (tab: GalleryTab, i: PortfolioItem) =>
  tab === "ai-avatar" ? i.category === "ai-avatar" : i.category !== "ai-avatar" && i.format === tab;

/** The layout a tab uses: the format of most of its items. */
function layoutOf(items: PortfolioItem[]): PortfolioFormat {
  const n = (f: PortfolioFormat) => items.filter((i) => i.format === f).length;
  return (["reel", "photo", "long-form", "360"] as const).reduce((a, b) => (n(b) > n(a) ? b : a));
}

export function FormatGallery({
  items,
  tabs = ["photo", "reel", "long-form", "ai-avatar"],
  label = "Work by format",
  captions = true,
}: {
  items: PortfolioItem[];
  tabs?: GalleryTab[];
  label?: string;
  captions?: boolean;
}) {
  const uid = useId();
  const present = tabs.filter((t) => items.some((i) => inTab(t, i)));
  const [tab, setTab] = useState<GalleryTab>(present[0] ?? "photo");
  if (!present.length) return null;
  const shown = items.filter((i) => inTab(tab, i));
  const layout = layoutOf(shown);
  const kind = layout === "reel" ? "strip" : layout === "photo" ? "cols-3" : "cols-2";

  return (
    <div className="fg">
      {present.length > 1 && (
        <Tabs
          label={label}
          idPrefix={uid}
          options={present.map((t) => ({ value: t, label: LABEL[t] }))}
          value={tab}
          onChange={setTab}
        />
      )}
      <div
        className={`fg-grid ${kind}`}
        role={present.length > 1 ? "tabpanel" : undefined}
        id={`${uid}-panel`}
        aria-labelledby={present.length > 1 ? `${uid}-tab-${tab}` : undefined}
        tabIndex={kind === "strip" ? 0 : undefined}
        aria-label={kind === "strip" ? `${LABEL[tab]}, scroll sideways` : undefined}
      >
        {shown.map((m) => (
          <figure key={m.id}>
            <ViewfinderFrame
              media={m.media}
              small
              corners={false}
              format={layout}
              clean={m.category === "ai-avatar" ? true : undefined}
              sizes={
                kind === "strip"
                  ? "(max-width: 760px) 60vw, 22vw"
                  : kind === "cols-3"
                    ? "(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw"
                    : "(max-width: 760px) 100vw, 50vw"
              }
            >
              {(m.format === "reel" || m.format === "long-form") && (
                <LiteVideo video={m.media.video} title={m.title} />
              )}
            </ViewfinderFrame>
            {captions && (
              <figcaption>
                {m.title}
                {(m.meta || m.duration) && (
                  <span>{[m.meta, m.duration].filter(Boolean).join(" · ")}</span>
                )}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
