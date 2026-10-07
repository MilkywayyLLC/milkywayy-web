"use client";

import { useId, useState } from "react";
import { MediaFrame } from "@/components/media/MediaFrame";
import { MediaOpen } from "@/components/media/MediaOpen";
import { Tabs } from "@/components/ui/Tabs";
import { kindOf, photosOf, type MediaKind } from "@/lib/media-config";
import type { Shown } from "@/lib/playable";
import { inTab, TAB_LABEL, type GalleryTab } from "@/lib/used-on";

export type { GalleryTab };

/**
 * Work in uniform grids, one tab per format, so a row never mixes ratios (lib/media-config).
 * Photos: one 3:2 card per property ("24 photos") that opens the lightbox. Reels and AI avatars:
 * a sideways strip at 9:16 that opens the 9:16 player. Long-form and 360: two columns at 16:9,
 * opening the 16:9 player or the tour. Tabs without items are hidden.
 */
const LAYOUT: Record<GalleryTab, { kind: MediaKind; grid: string; sizes: string }> = {
  photo: {
    kind: "photo",
    grid: "cols-3",
    sizes: "(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw",
  },
  reel: { kind: "reel", grid: "strip", sizes: "(max-width: 760px) 62vw, 260px" },
  "ai-avatar": { kind: "ai-avatar", grid: "strip", sizes: "(max-width: 760px) 62vw, 260px" },
  "long-form": { kind: "long-form", grid: "cols-2", sizes: "(max-width: 760px) 100vw, 50vw" },
  "360": { kind: "360", grid: "cols-2", sizes: "(max-width: 760px) 100vw, 50vw" },
};

export function FormatGallery({
  items,
  tabs = ["photo", "reel", "long-form", "ai-avatar"],
  label = "Work by format",
  captions = true,
}: {
  items: Shown[];
  tabs?: GalleryTab[];
  label?: string;
  captions?: boolean;
}) {
  const uid = useId();
  const present = tabs.filter((t) => items.some((i) => inTab(t, i)));
  const [tab, setTab] = useState<GalleryTab>(present[0] ?? "photo");
  if (!present.length) return null;
  const shown = items.filter((i) => inTab(tab, i));
  const layout = LAYOUT[tab];
  const strip = layout.grid === "strip";

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
      <div
        className={`fg-grid ${layout.grid}`}
        role={present.length > 1 ? "tabpanel" : undefined}
        id={`${uid}-panel`}
        aria-labelledby={present.length > 1 ? `${uid}-tab-${tab}` : undefined}
        tabIndex={strip ? 0 : undefined}
        aria-label={strip ? `${TAB_LABEL[tab]}, scroll sideways` : undefined}
      >
        {shown.map((m) => {
          const kind = kindOf(m);
          const count = kind === "photo" ? photosOf(m.media).length : 0;
          return (
            <figure key={m.id} data-kind={kind}>
              <MediaFrame
                media={m.media}
                kind={layout.kind}
                small
                corners={false}
                clean={kind === "ai-avatar" ? true : undefined}
                badge={count > 1 ? `${count} photos` : kind === "360" ? "360°" : undefined}
                sizes={layout.sizes}
              >
                {m.play && <MediaOpen play={m.play} preview={kind === "reel"} />}
              </MediaFrame>
              {captions && (
                <figcaption>
                  {m.title}
                  {(m.meta || m.duration) && (
                    <span>{[m.meta, m.duration].filter(Boolean).join(" · ")}</span>
                  )}
                </figcaption>
              )}
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
    </div>
  );
}
