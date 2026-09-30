"use client";

import { useState } from "react";
import type { PortfolioCategory, PortfolioFormat, PortfolioItem } from "@/content/types";
import { LiteVideo } from "@/components/media/LiteVideo";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { ChipGroup } from "@/components/ui/ChipGroup";

type Filter = "all" | PortfolioCategory | PortfolioFormat;

/** Work page filters (guide §6.7): categories, then formats. Only chips with items are shown. */
const FILTERS: { value: Filter; label: string; test: (i: PortfolioItem) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "property", label: "Property", test: (i) => i.category === "property" },
  { value: "brand", label: "Brand", test: (i) => i.category === "brand" },
  { value: "ai-avatar", label: "AI avatar", test: (i) => i.category === "ai-avatar" },
  { value: "editing", label: "Editing", test: (i) => i.category === "editing" },
  { value: "reel", label: "Short-form", test: (i) => i.format === "reel" },
  { value: "long-form", label: "Long-form", test: (i) => i.format === "long-form" },
  { value: "photo", label: "Photo", test: (i) => i.format === "photo" },
];

const FORMAT_LABEL: Record<PortfolioFormat, string> = {
  photo: "Photo",
  reel: "Reel",
  "long-form": "Long-form",
  "360": "360° tour",
};

export function WorkGrid({ items }: { items: PortfolioItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const options = FILTERS.filter((f) => f.value === "all" || items.some(f.test));
  const active = FILTERS.find((f) => f.value === filter) ?? FILTERS[0];
  const shown = items.filter(active.test);

  return (
    <>
      <ChipGroup
        label="Filter work"
        options={options.map(({ value, label }) => ({ value, label }))}
        value={filter}
        onChange={setFilter}
      />
      <p className="sr" aria-live="polite">
        {shown.length} {shown.length === 1 ? "project" : "projects"} shown
      </p>
      <div className="work-grid">
        {shown.map((m) => (
          <figure key={m.id}>
            <ViewfinderFrame
              media={m.media}
              small
              corners={false}
              sizes="(max-width: 560px) 100vw, (max-width: 900px) 50vw, 33vw"
            >
              {(m.format === "reel" || m.format === "long-form") && (
                <LiteVideo video={m.media.video} title={m.title} />
              )}
            </ViewfinderFrame>
            <figcaption>
              {m.title}
              <span>
                {[m.category === "ai-avatar" ? "AI avatar" : FORMAT_LABEL[m.format], m.duration]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}
