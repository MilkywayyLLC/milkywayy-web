"use client";

import { useState } from "react";
import type { PortfolioCategory, PortfolioItem } from "@/content/types";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";

type Filter = "all" | PortfolioCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "property", label: "Property" },
  { value: "brand", label: "Brand" },
  { value: "ai-avatar", label: "AI avatar" },
  { value: "editing", label: "Editing" },
];

/** Horizontal 9:16 reels with scroll-snap and filter chips. Chips only show categories in use. */
export function ReelStrip({
  items,
  eyebrow,
  title,
}: {
  items: PortfolioItem[];
  eyebrow: string;
  title: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const present = new Set(items.map((i) => i.category));
  const options = FILTERS.filter((f) => f.value === "all" || present.has(f.value));
  const shown = filter === "all" ? items : items.filter((i) => i.category === filter);

  return (
    <>
      <div className="head">
        <div className="stack">
          <span className="eb">{eyebrow}</span>
          <h2 className="d h2">{title}</h2>
        </div>
        <ChipGroup label="Filter work" options={options} value={filter} onChange={setFilter} />
      </div>
      <div className="reels" tabIndex={0} role="region" aria-label="Work reels, scroll sideways">
        {shown.map((r) => (
          <figure className="reel" key={r.id}>
            <ViewfinderFrame
              media={r.media}
              small
              corners={false}
              clean={r.category === "ai-avatar"}
              play={r.format === "reel" && r.category !== "ai-avatar" ? "icon" : undefined}
              tag={r.duration ? "Reel" : undefined}
              tagRight={r.duration}
              sizes="(max-width: 860px) 60vw, 20vw"
            />
            <figcaption>
              {r.title} <span>{r.meta}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
