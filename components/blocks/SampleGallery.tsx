"use client";

import { useId, useState } from "react";
import type { PortfolioItem } from "@/content/types";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { Tabs } from "@/components/ui/Tabs";

type Tab = "photo" | "video" | "360";

const TABS: { value: Tab; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "360", label: "360° tour" },
];

/** Up to five items per tab: one large frame and four small ones. */
const MAX = 5;

/**
 * Property shoots "What you'll get.": Photo · Video · 360° tour tabs over a fixed-ratio stage, so
 * switching tabs never changes the section's height. All panels are rendered stacked and crossfade
 * (the global reduced-motion rule turns the fade off). Tabs without items are hidden.
 */
export function SampleGallery({ items }: { items: Record<Tab, PortfolioItem[]> }) {
  const uid = useId();
  const tabs = TABS.filter((t) => items[t.value].length);
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? "photo");
  if (!tabs.length) return null;

  return (
    <>
      <Tabs label="Sample type" idPrefix={uid} options={tabs} value={tab} onChange={setTab} />
      <div className="gal-stage">
        {tabs.map((t) => {
          const shown = items[t.value].slice(0, MAX);
          const active = t.value === tab;
          return (
            <div
              key={t.value}
              className={`gal n${shown.length}`}
              role="tabpanel"
              id={active ? `${uid}-panel` : undefined}
              aria-labelledby={`${uid}-tab-${t.value}`}
              aria-hidden={!active}
              inert={!active}
            >
              {shown.map((m, i) => (
                <ViewfinderFrame
                  key={m.id}
                  media={m.media}
                  small
                  corners={false}
                  tag={i === 0 ? m.tag : undefined}
                  play={t.value === "video" ? "icon" : undefined}
                  sizes={
                    i === 0 ? "(max-width: 760px) 100vw, 50vw" : "(max-width: 760px) 50vw, 25vw"
                  }
                />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
