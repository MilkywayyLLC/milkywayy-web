"use client";

import { useId, useState } from "react";
import type { PortfolioItem } from "@/content/types";
import { ViewfinderFrame } from "@/components/media/ViewfinderFrame";
import { Tabs } from "@/components/ui/Tabs";

type Tab = "photo" | "video" | "360";

/** Property shoots "What you'll get.": Photo · Video · 360° tour tabs over a gallery grid. */
export function SampleGallery({ items }: { items: Record<Tab, PortfolioItem[]> }) {
  const tabs = (
    [
      { value: "photo", label: "Photo" },
      { value: "video", label: "Video" },
      { value: "360", label: "360° tour" },
    ] as const
  ).filter((t) => items[t.value].length);
  const uid = useId();
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? "photo");
  if (!tabs.length) return null;
  const shown = items[tab];

  return (
    <>
      <Tabs label="Sample type" idPrefix={uid} options={[...tabs]} value={tab} onChange={setTab} />
      <div
        className="gal"
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${tab}`}
      >
        {shown.map((m, i) => (
          <ViewfinderFrame
            key={m.id}
            media={m.media}
            small
            corners={false}
            className={i === 0 ? "big" : undefined}
            tag={i === 0 ? (m.tag ?? m.title) : undefined}
            play={tab === "video" ? "icon" : undefined}
            sizes={i === 0 ? "(max-width: 760px) 100vw, 50vw" : "(max-width: 760px) 50vw, 25vw"}
          />
        ))}
      </div>
    </>
  );
}
